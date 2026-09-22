# Agent Hub

Agent Hub는 별도 `pi --mode rpc --no-session` 프로세스로 읽기 전용 agent를 실행하고 부모 Pi에서 상태·결과·취소를 관리하는 extension이다. OMP 코드를 이식한 것이 아니라 Pi 0.87 공개 RPC/TUI API로 구현했다.

## 설치와 적용

```bash
cd ~/src/pi_setting
pi install ~/src/pi_setting
./scripts/install-agents.sh
install -m 600 config/agent-hub.json ~/.pi/agent/agent-hub.json
```

현재 Pi에서 `/reload`하거나 새로 시작한다. 패키지에는 `subagent`, `worker` 도구와 `/agents`, `Alt+A`가 등록된다. 기존 공식 예제는 `extensions/subagent/`에 원본 보관하지만 manifest에서는 Agent Hub만 로드해 같은 이름의 도구를 중복 등록하지 않는다.

## 사용 방식

### 기존 foreground 호출

기존 `subagent` 입력을 유지한다.

```json
{
  "agent": "report-investigator",
  "agentScope": "user",
  "cwd": "/absolute/project",
  "task": "역할 파일 ...을 먼저 읽는다. 질문: ... 원자료: ... 종료 조건: ..."
}
```

부모는 worker가 `agent_settled` 상태가 될 때까지 기다린 뒤 결과를 받는다. 병렬 `tasks`, 순차 `chain`과 `{previous}` 치환도 지원한다.

### background 호출

```json
{
  "tasks": [
    { "agent": "report-investigator", "task": "질문 Q1 ..." },
    { "agent": "report-investigator", "task": "질문 Q2 ..." }
  ],
  "background": true,
  "agentScope": "user"
}
```

즉시 worker ID를 반환한다. 완료되면 부모 context에는 전체 로그가 아니라 ID와 상태만 한 번 전달된다. 상세 결과는 `worker` 도구로 읽는다.

| action | 필수 입력 | 동작 |
| --- | --- | --- |
| `list` | 없음 | 현재 세션 worker 목록 |
| `status` | `workerId` | 상태·마지막 활동·usage |
| `result` | `workerId` | bounded 결과. `offset`, `limit` 지원 |
| `wait` | `workerId` 또는 `workerIds` | 최대 60초 대기. timeout은 worker를 취소하지 않음 |
| `steer` | `workerId`, `message` | 실행 중 worker의 다음 턴에 추가 지시 |
| `cancel` | `workerId` | 해당 worker만 취소 |

`/agents` 또는 `Alt+A`는 현재 세션의 Hub overlay를 연다. 목록에서 worker를 선택해 상태/결과 확인, 추가 지시, 개별 취소를 할 수 있다. TUI가 아닌 RPC/print/JSON에서는 `worker` 도구를 사용한다.

## 실행·권한 계약

- v1 worker는 `read`, `grep`, `find`, `ls`만 허용한다. agent 정의가 `bash`, `edit`, `write`, MCP, LSP, `subagent` 등을 요청하면 실행 전에 실패한다.
- 도구가 없는 정의는 read-only 네 도구를 기본으로 사용한다. 이는 OS sandbox가 아니며 extension host code의 권한과 별개다.
- 기본 scope는 사용자 agent만이다. 프로젝트 agent는 신뢰된 프로젝트에서 명시적으로 scope를 열고 기본 확인을 통과해야 한다.
- 부모 대화 전체를 전달하지 않는다. agent system prompt와 지정 task만 전달한다.
- `report-verifier`의 선행 판단과 초안 대조는 서로 다른 worker로 실행한다.
- child에는 `PI_AGENT_HUB_CHILD=1`을 전달해 Agent Hub 자체의 재귀 등록을 막는다.
- 완료 판정은 `agent_end`가 아닌 `agent_settled`다. retry·compaction·queued follow-up이 끝나기 전에는 완료로 표시하지 않는다.

RPC child가 extension 승인 dialog를 요청하면 부모 UI로 전달한다. UI 부재·취소·오류에서는 거절한다. 현재 read-only agent는 보통 dialog를 만들지 않지만 이 중계가 위험 명령의 자동 승인을 뜻하지 않는다.

## 설정

원본은 `config/agent-hub.json`, 적용 위치는 `~/.pi/agent/agent-hub.json`이다. 기존 파일이 있으면 덮어쓰지 말고 병합한다.

```json
{
  "version": 1,
  "maxConcurrent": 2,
  "maxQueued": 8,
  "startupTimeoutMs": 30000,
  "rpcTimeoutMs": 10000,
  "taskTimeoutMs": 600000,
  "cancelGraceMs": 5000,
  "roles": {},
  "agentRoles": {}
}
```

역할 모델을 쓰려면 concrete model selector를 명시한다.

```json
{
  "roles": {
    "fast": { "model": "provider/model-id", "thinkingLevel": "low" }
  },
  "agentRoles": {
    "report-investigator": "fast"
  }
}
```

모델 선택 우선순위는 agent frontmatter `model` → `agentRoles` → 부모 모델 snapshot이다. 알 수 없는 역할·모델로 자동 fallback하지 않는다. 설정 변경 후 `/reload`한다.

## 데이터와 비용

완료 metadata와 bounded transcript는 `~/.pi/agent/agent-hub/<session-id>/<worker-id>/result.json`에 0600으로 저장된다. 저장소에는 쓰지 않는다. 재시작 후 실행 프로세스를 복구하지 않으며 stale 실행 기록은 자동 worker로 간주하지 않는다.

foreground usage는 subagent tool result usage로 부모 세션 합계에 포함된다. background usage는 Hub 카드와 결과에 표시하지만 Pi 기본 footer 합계에는 자동 합산되지 않는다. 여러 worker는 경과 시간을 줄일 수 있지만 총 토큰·비용은 늘 수 있다.

## 종료와 제한

- tool abort는 해당 foreground worker를 취소한다.
- `/reload`, `/new`, `/resume`, `/fork`, `/tree`, Pi 종료 시 현재 세션 worker를 취소한다.
- 취소는 queue 정리 → RPC abort → SIGTERM → grace 초과 시 SIGKILL 순서다.
- Linux에서 자식 process group까지 종료한다. Windows의 하위 프로세스 정리는 동일 수준으로 검증하지 않았다.
- writer agent, worktree, 자동 병합, 구조화된 결과 schema, worker 재개, agent 간 통신은 포함하지 않는다.

## 검증

```bash
node --test tests/agent-hub-rpc.test.ts tests/agent-hub-manager.test.ts
bash tests/install-agents.sh
node --test tests/dangerous-command-guard.test.ts
```

fake RPC 검사는 JSONL/U+2028, invalid JSON, request timeout, 승인 중계, settled 완료, 취소, 권한 fail-closed, task timeout과 artifact 저장을 검사한다. 실제 provider smoke test와 TUI overlay 시각 검증은 별도로 수행하고 오프라인 테스트와 구분한다.
