import type { AuthStorage } from '@oh-my-pi/pi-ai';
import type { ExtensionAPI, ExtensionContext } from '@oh-my-pi/pi-coding-agent';
import { lookup } from '@oh-my-pi/pi-coding-agent/config/registry';

// Public identities only. Each machine/profile keeps its own OAuth credentials.
export const ACCOUNT_ORDER: readonly AccountSelector[] = [
  { email: 'alex.kim@udptechnology.com' },
  { email: 'alexgim961101@gmail.com' },
];

export type AccountSelector = { email: string; accountId?: string };
type Account = {
  credentialId: number;
  email?: string;
  accountId?: string;
  projectId?: string;
  orgId?: string;
};
type Policy = {
  provider: string;
  account: Omit<Account, 'credentialId'>;
  priority?: number;
  reservePct?: number;
};
type RouteOptions = {
  auth: AuthStorage;
  model: { provider: string; id: string; baseUrl?: string };
  sessionId: string;
  reservePct: number;
  accounts?: readonly AccountSelector[];
};
type RouteResult =
  | { state: 'ignored' }
  | { state: 'unavailable'; message: string }
  | { state: 'selected'; email: string; uncertain: boolean };

function matchAccount(accounts: Account[], selector: AccountSelector): Account | undefined {
  const matches = accounts.filter(account =>
    account.email?.toLowerCase() === selector.email.toLowerCase() &&
    (selector.accountId === undefined || account.accountId === selector.accountId),
  );
  if (matches.length > 1) {
    throw new Error(`${selector.email}: 로그인된 워크스페이스가 여러 개입니다. ACCOUNT_ORDER에 accountId를 지정하세요.`);
  }
  return matches[0];
}

function applyPolicies(auth: AuthStorage, accounts: Account[], reservePct: number): void {
  const replacements = new Map<Policy, Policy>();
  const added: Policy[] = [];
  for (const [index, account] of accounts.entries()) {
    const current = auth.oauth.policy('openai-codex', account);
    const next: Policy = {
      ...current,
      provider: 'openai-codex',
      account: {
        email: account.email,
        accountId: account.accountId,
        projectId: account.projectId,
        orgId: account.orgId,
      },
      priority: index === 0 ? 100 : 10,
      // A nonzero company reserve lets model preflight release an explicit pin.
      ...(index === 0 ? { reservePct: 0 } : {}),
    };
    if (current) replacements.set(current, next);
    else added.push(next);
  }
  const policies = new Set<Policy>();
  for (const provider of auth.credentials.providers()) {
    for (const account of auth.oauth.accounts(provider)) {
      const policy = auth.oauth.policy(provider, account);
      if (policy) policies.add(replacements.get(policy) ?? policy);
    }
  }
  auth.setAccountPolicies({ accountPolicies: [...policies, ...added], defaultReservePct: reservePct });
}

/** Uses OMP's actual quota health and explicit session affinity, not bearer replacement. */
export async function routeCompanyFirst(options: RouteOptions): Promise<RouteResult> {
  const { auth, model, sessionId, reservePct } = options;
  if (model.provider !== 'openai-codex') return { state: 'ignored' };
  const selectors = options.accounts ?? ACCOUNT_ORDER;
  if (selectors.length !== 2) throw new Error('ACCOUNT_ORDER에는 회사, 개인 계정 두 개를 지정하세요.');
  await auth.credentials.adoptExternalChanges();
  const stored = auth.oauth.accounts(model.provider, sessionId);
  const company = matchAccount(stored, selectors[0]);
  const personal = matchAccount(stored, selectors[1]);
  if (!company) {
    return { state: 'unavailable', message: `회사 계정 ${selectors[0].email} 로그인이 없습니다. 기존 OMP 선택을 유지합니다.` };
  }
  if (company.credentialId === personal?.credentialId) {
    throw new Error('회사 계정과 개인 계정은 서로 달라야 합니다.');
  }
  applyPolicies(auth, personal ? [company, personal] : [company], reservePct);
  const health = await auth.health.model(model.provider, {
    modelId: model.id,
    baseUrl: model.baseUrl,
    sessionId,
    reserveFraction: reservePct / 100,
  });
  const companyHealth = health.accounts.find(account => account.credentialId === company.credentialId);
  // Missing health can mean a plan-gated model. Do not force an ineligible account.
  if (!companyHealth) {
    return { state: 'unavailable', message: '이 모델의 회사 계정 사용 가능 여부를 확인할 수 없어 기존 OMP 선택을 유지합니다.' };
  }
  let target = company;
  let targetHealth = companyHealth;
  if (companyHealth.state === 'depleted') {
    const personalHealth = health.accounts.find(account => account.credentialId === personal?.credentialId);
    if (!personal || !personalHealth || personalHealth.state === 'depleted') {
      return { state: 'unavailable', message: '회사 한도가 소진됐고 지정한 개인 계정도 사용할 수 없습니다. 기존 OMP 오류·대체 처리를 유지합니다.' };
    }
    target = personal;
    targetHealth = personalHealth;
  }
  const affinity = auth.sessions.get(model.provider, sessionId);
  if (affinity?.credentialId !== target.credentialId || !affinity.explicit) {
    if (!auth.sessions.pin(model.provider, sessionId, target.credentialId)) {
      throw new Error('선택한 계정이 더 이상 로그인 목록에 없습니다.');
    }
  }
  return { state: 'selected', email: target.email ?? selectors[0].email, uncertain: targetHealth.state === 'unknown' };
}

export default function companyFirst(pi: ExtensionAPI): void {
  let lastNotice: string | undefined;
  const apply = async (ctx: ExtensionContext): Promise<void> => {
    if (!ctx.model || ctx.model.provider !== 'openai-codex') return;
    try {
      const reservePct = lookup('retry.usageReservePct')?.get(pi.pi.settings);
      if (typeof reservePct !== 'number' || !Number.isFinite(reservePct)) {
        throw new Error('OMP retry.usageReservePct 설정을 읽을 수 없습니다.');
      }
      const result = await routeCompanyFirst({
        auth: ctx.modelRegistry.authStorage,
        model: ctx.model,
        sessionId: ctx.sessionManager.getSessionId(),
        reservePct,
      });
      if (result.state === 'ignored') return;
      const notice = result.state === 'selected'
        ? `회사 우선: ${result.email}${result.uncertain ? ' (사용량 미확인; 한도 소진으로 간주하지 않음)' : ''}`
        : result.message;
      if (notice !== lastNotice) {
        ctx.ui.notify(notice, result.state === 'selected' && !result.uncertain ? 'info' : 'warning');
        lastNotice = notice;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '알 수 없는 오류';
      const notice = `회사 우선 계정 선택 실패: ${message}`;
      if (notice !== lastNotice) ctx.ui.notify(notice, 'warning');
      lastNotice = notice;
    }
  };
  // input runs before automatic title generation; before_agent_start also covers subagents.
  pi.on('session_start', async (_event, ctx) => apply(ctx));
  pi.on('session_switch', async (_event, ctx) => apply(ctx));
  pi.on('input', async (_event, ctx) => { await apply(ctx); });
  pi.on('before_agent_start', async (_event, ctx) => { await apply(ctx); });
}
