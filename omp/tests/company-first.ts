import assert from 'node:assert/strict';
import type { AuthStorage } from '@oh-my-pi/pi-ai';
import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent';
import { routeCompanyFirst, type AccountSelector } from '../extensions/company-first';

const provider = 'openai-codex';
const model = { provider, id: 'gpt-6-astra' };
const selectors: readonly AccountSelector[] = [{ email: 'company@fixture.invalid' }, { email: 'personal@fixture.invalid' }];
type Meter = { used: number; unavailable?: boolean };

export default async function run(pi: ExtensionAPI): Promise<void> {
  const directory = process.env.OMP_ACCOUNT_TEST_DIR;
  if (!directory) throw new Error('Run with bash omp/tests/company-first.sh');
  // Dedicated subprocess: prohibit all real network requests, including host usage discovery.
  globalThis.fetch = async () => { throw new Error('Network is disabled in account-routing scenarios'); };
  let sequence = 0;
  let assertions = 0;
  const realNow = Date.now;
  async function fixture(names = ['company', 'personal', 'third']) {
    const meters: Record<string, Meter> = {
      company: { used: 99 }, personal: { used: 20 }, third: { used: 0 }, company2: { used: 10 },
    };
    const auth = await pi.pi.AuthStorage.create(`${directory}/fixture-${++sequence}.db`, {
      usageFetch: async (url, init) => {
        if (String(url).endsWith('/accounts/verified_access')) return Response.json({ programs: [] });
        assert.ok(String(url).endsWith('/wham/usage'), 'Only usage probes are permitted; no inference');
        const id = new Headers(init?.headers).get('ChatGPT-Account-Id');
        assert.ok(id && meters[id], 'Unknown fixture identity');
        const meter = meters[id];
        if (meter.unavailable) return new Response('fixture usage unavailable', { status: 503 });
        return Response.json({
          plan_type: id.startsWith('company') ? 'team' : 'prolite',
          rate_limit: {
            allowed: meter.used < 100, limit_reached: meter.used >= 100,
            primary_window: { used_percent: meter.used, limit_window_seconds: 18000, reset_after_seconds: 3600 },
            secondary_window: { used_percent: meter.used, limit_window_seconds: 604800, reset_after_seconds: 86400 },
          },
        });
      },
      refreshOAuthCredential: async () => { throw new Error('Unexpired fixture credentials must not refresh'); },
    });
    for (const name of names) {
      await auth.credentials.upsertOAuth(provider, {
        type: 'oauth', access: `fixture-access-${name}`, refresh: `fixture-refresh-${name}`,
        expires: Date.now() + 7 * 86400000, accountId: name, orgId: name,
        email: `${name === 'company2' ? 'company' : name}@fixture.invalid`,
      });
    }
    return { auth, meters };
  }
  const route = (auth: AuthStorage, sessionId = 'parent', accounts = selectors) => routeCompanyFirst({
    auth, model, sessionId, reservePct: 10, accounts,
  });
  const selected = async (auth: AuthStorage, sessionId = 'parent') =>
    (await auth.oauth.access(provider, sessionId, { modelId: model.id }))?.email;
  function pass(name: string): void { assertions++; console.log(`PASS ${name}`); }

  try {
    const { auth, meters } = await fixture();
    try {
      auth.setAccountPolicies({ accountPolicies: [
        { provider, account: { email: selectors[0].email }, reservePct: 50 },
        { provider, account: { email: selectors[1].email }, reservePct: 25 },
        { provider, account: { email: 'third@fixture.invalid' }, priority: -5, reservePct: 30 },
      ], defaultReservePct: 10 });
      await route(auth);
      assert.equal(await selected(auth), selectors[0].email);
      const health = await auth.health.model(provider, { modelId: model.id, sessionId: 'parent', reserveFraction: .1 });
      assert.equal(health.accounts.find(account => account.selected)?.state, 'healthy');
      assert.equal(auth.oauth.policy(provider, { email: selectors[1].email, accountId: 'personal', orgId: 'personal' })?.reservePct, 25);
      assert.equal(auth.oauth.policy(provider, { email: 'third@fixture.invalid' })?.priority, -5);
      assert.equal(auth.oauth.policy(provider, { email: 'third@fixture.invalid' })?.reservePct, 30);
      pass('99% company usage stays on company despite fresh third account; reserve and unrelated policies respected');

      auth.sessions.inherit('parent', 'child');
      await route(auth, 'child');
      assert.equal(await selected(auth, 'child'), selectors[0].email);
      pass('child session retains company account');

      meters.company.used = 100;
      await auth.usage.invalidate(provider);
      await route(auth);
      assert.equal(await selected(auth), selectors[1].email);
      pass('company exhaustion selects designated personal account, not fresh third account');

      const afterReset = realNow() + 86400001;
      Date.now = () => afterReset;
      meters.company.used = 0;
      await auth.usage.invalidate(provider);
      await route(auth);
      assert.equal(await selected(auth), selectors[0].email);
      pass('scheduled reset returns from personal to company');
    } finally { Date.now = realNow; auth.close(); }

    const missing = await fixture(['personal']);
    try {
      assert.equal((await route(missing.auth)).state, 'unavailable');
      assert.equal(missing.auth.sessions.get(provider, 'parent'), undefined);
      pass('missing company login does not silently pin personal');
    } finally { missing.auth.close(); }

    const companyOnly = await fixture(['company']);
    try {
      await route(companyOnly.auth);
      assert.equal(await selected(companyOnly.auth), selectors[0].email);
      companyOnly.meters.company.used = 100;
      await companyOnly.auth.usage.invalidate(provider);
      assert.equal((await route(companyOnly.auth)).state, 'unavailable');
      pass('company-only login works until exhausted and reports unavailable fallback');
    } finally { companyOnly.auth.close(); }

    const unknown = await fixture();
    try {
      unknown.meters.company.unavailable = true;
      const result = await route(unknown.auth);
      assert.equal(result.state, 'selected');
      if (result.state !== 'selected') throw new Error('Expected uncertain company pin');
      assert.equal(result.email, selectors[0].email);
      assert.equal(result.uncertain, true);
      pass('unavailable usage is not classified as quota exhaustion');
    } finally { unknown.auth.close(); }

    const duplicates = await fixture(['company', 'company2', 'personal']);
    try {
      await assert.rejects(route(duplicates.auth), /워크스페이스가 여러 개/);
      await route(duplicates.auth, 'parent', [
        { email: selectors[0].email, accountId: 'company2' }, selectors[1],
      ]);
      assert.equal((await duplicates.auth.oauth.access(provider, 'parent', { modelId: model.id }))?.accountId, 'company2');
      pass('ambiguous workspaces require accountId and respect explicit workspace');
    } finally { duplicates.auth.close(); }

    const other = await fixture();
    try {
      const result = await routeCompanyFirst({
        auth: other.auth, model: { provider: 'anthropic', id: 'fixture' }, sessionId: 'other', reservePct: 10,
      });
      assert.equal(result.state, 'ignored');
      assert.equal(other.auth.oauth.policy(provider, { email: selectors[0].email }), undefined);
      pass('unrelated providers remain untouched');
    } finally { other.auth.close(); }
    console.log(`COMPANY_FIRST_COMPLETE ${assertions} scenarios; no real credentials or inference`);
  } catch (error) {
    console.error('COMPANY_FIRST_FAILED', error);
    process.exitCode = 1;
  } finally { Date.now = realNow; }
}
