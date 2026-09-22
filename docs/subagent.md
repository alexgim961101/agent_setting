# Pi 보고서 에이전트

## 구성

- `extensions/agent-hub/`: 현재 로드되는 RPC 기반 subagent/worker/Agent Hub 구현
- `extensions/subagent/`: Pi 공식 예제의 고정 원본. 출처 비교용이며 manifest에서 로드하지 않음
- `agents/report-investigator.md`: 지정 질문·로컬 원자료 조사
- `agents/report-verifier.md`: 원자료 선행 판단 및 별도 초안 대조
- [Agent Hub 상세 문서](agent-hub.md): background·steer·cancel·UI·설정·장애 처리
- [skills 저장소](https://github.com/alexgim961101/skills): `debug`·`propose` 절차와 역할·근거 양식

## 설치

```bash
cd ~/src/pi_setting
pi install ~/src/pi_setting
./scripts/install-agents.sh
install -m 600 config/agent-hub.json ~/.pi/agent/agent-hub.json
```

agent 정의는 `~/.pi/agent/agents/`에 링크된다. 같은 대상 링크는 유지하고 기존 파일·다른 링크·깨진 링크는 덮어쓰지 않는다. extension은 package manifest로 저장소에서 직접 로드하므로 전역 extension 디렉터리에 복사하지 않는다.

스킬은 별도 저장소에서 설치한다.

```bash
cd ~/skills
./install.sh --tool pi debug propose
```

설치 후 `/reload`하거나 새 Pi를 시작한다. `subagent`, `worker` 도구와 `/agents` 명령이 노출되는지 확인한다.

## 권한과 모델

두 보고서 agent는 `read, grep, find, ls`만 사용한다. Agent Hub v1도 이 네 도구만 허용하며 agent 정의가 더 넓은 도구를 요청하면 실행 전에 거절한다. 셸·외부 조회·파일 수정은 부모가 승인된 범위에서 수행하고 원자료를 전달한다.

기본은 부모 모델·추론 수준 snapshot을 상속한다. `~/.pi/agent/agent-hub.json`의 역할 mapping 또는 agent frontmatter로 concrete model을 지정할 수 있다. 도구 제한은 OS sandbox가 아니다.

## 호출 계약

스킬의 `references/agent-workflow.md`에 따라 작업 ID·질문·범위·원자료·제약·종료 조건, 역할 파일·근거 양식·체크리스트의 **실제 절대 경로**를 task에 전달한다. 기본 `agentScope: "user"`를 유지한다.

```json
{
  "agent": "report-investigator",
  "agentScope": "user",
  "cwd": "/absolute/project",
  "task": "작업 ID Q1. 역할 파일 /absolute/skills/debug/agents/investigator.md를 먼저 읽는다. 근거 양식 /absolute/skills/debug/templates/evidence.md. 질문: ... 원자료: ... 범위·제약: ... 종료 조건: ..."
}
```

- 조사 병렬화: `tasks`에 하위 조사자 최대 2개를 기본으로 사용한다.
- foreground: 기존처럼 부모가 결과를 기다린다.
- background: `"background": true`로 ID를 받고 부모가 다른 작업을 계속한다. `worker` 도구로 wait/result/steer/cancel한다.
- 검증 1단계: 새 `report-verifier`에 역할·체크리스트·질문·원자료만 전달한다. 초안을 전달하지 않는다.
- 검증 2단계: **새 worker**에 1단계 반환 원문과 초안·근거 기록을 전달한다.
- `propose`는 해당 스킬의 역할·양식·체크리스트 경로를 사용한다.

호출마다 `--no-session`인 새 child Pi이므로 이전 판단을 자동 기억하지 않는다. 추적에는 부모 toolCallId/작업 ID와 worker ID, status, stopReason, exitCode를 사용한다. tool outer error만 믿지 말고 개별 상태를 확인한다.

## 프로젝트 agent

기본 scope에서는 프로젝트 agent를 읽지 않는다. `project`/`both`를 요청해도 프로젝트가 Pi에서 신뢰되지 않았으면 거절한다. 신뢰된 프로젝트에서도 기본적으로 실행 agent와 원본 경로를 사용자에게 확인한다. repo가 제공한 agent prompt는 사용자 승인으로 취급하지 않는다.

## 이전 설치에서 전환

- `extensions/subagent/` 원본은 삭제하지 않지만 package manifest에서 로드하지 않는다.
- 예전 `~/.pi/agent/extensions/subagent/` 수동 복사본이 있으면 공식 예제와 동일한지 확인한 후 자동 탐색 경로 밖으로 이동한다.
- 기존 `~/skills/adapters/pi/agents/` 링크는 대상을 확인한 뒤 이 저장소의 정의로 교체한다.
- 다른 사용자 파일·링크는 삭제하지 않는다.

## 제거·롤백

Agent Hub만 끄려면 `pi config`에서 이 패키지의 해당 extension을 비활성화한다. 패키지 전체 제거는 UI·usage·guard·테마도 함께 제거한다.

```bash
pi remove ~/src/pi_setting
```

코드 롤백 시 package manifest의 Agent Hub entry를 `extensions/subagent/index.ts`로 되돌린다. 같은 `subagent` 도구를 둘 다 로드하지 않는다. runtime artifact와 사용자 설정은 자동 삭제하지 않는다.

## 검증

```bash
bash tests/install-agents.sh
node --test tests/agent-hub-rpc.test.ts tests/agent-hub-manager.test.ts
```

설치 검사는 임시 디렉터리만 사용한다. Agent Hub 오프라인 검사는 fake child만 사용해 실제 모델 비용이 없다. 실제 provider·TUI·강제 종료 smoke test는 [Agent Hub 문서](agent-hub.md)의 범위에 따라 별도로 기록한다.
