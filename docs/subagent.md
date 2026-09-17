# Pi 보고서 에이전트

## 저장소 역할

- 이 저장소: Pi 전용 extension 소스, agent 등록 정의, 설치·실행 절차
- [skills 저장소](https://github.com/alexgim961101/skills): `debug`·`propose` 절차, 범용 역할 프롬프트, 템플릿, 근거 양식, 스킬 평가 사례

Pi 실행 설정과 범용 스킬은 별도로 관리한다. 이 저장소의 `agents/*.md`는 task로 받은
스킬 역할 파일을 읽도록 연결한다. 스킬의 설치 경로나 저장소 위치를 고정하지 않는다.

## 설치

Pi 0.85.1의 공식 subagent 예제를 `extensions/subagent/`에 수정 없이 보관한다.
출처·해시는 [SOURCE.md](../extensions/subagent/SOURCE.md), 라이선스는
[LICENSE](../extensions/subagent/LICENSE)를 참고한다. Pi 업데이트만으로 이 복사본은
갱신되지 않으므로 버전 변경 시 호환성을 확인한다.

```bash
pi install ~/src/pi_setting
cd ~/src/pi_setting
./scripts/install-agents.sh
```

extension은 `package.json`을 통해 이 저장소에서 직접 로드한다. 별도로
`~/.pi/agent/extensions/subagent/`에 복사하거나 링크하지 않는다. Agent 정의는
Pi 패키지 manifest의 기본 리소스가 아니므로 위 스크립트로 별도 링크한다.

```text
~/src/pi_setting/
├── extensions/subagent/          # 공식 실행 도구
├── agents/report-investigator.md # Pi 전용 조사자 설정
└── agents/report-verifier.md     # Pi 전용 검증자 설정

~/.pi/agent/agents/
├── report-investigator.md -> ~/src/pi_setting/agents/report-investigator.md
└── report-verifier.md     -> ~/src/pi_setting/agents/report-verifier.md
```

`PI_CODING_AGENT_DIR`가 있으면 해당 절대 경로를 사용한다. 기존 파일이나 다른 링크가
있으면 설치 스크립트는 덮어쓰지 않고 중단한다. 같은 대상 링크는 그대로 둔다.
`~/skills/install.sh`는 스킬만 연결하며 extension·agent 정의는 설치하지 않는다.

설치 후 현재 Pi 세션에서 `/reload`하거나 새 세션을 시작한다. `subagent` 도구가
노출되는지 확인한다. 스킬도 별도로 설치해야 한다.

```bash
cd ~/skills
./install.sh --tool pi debug propose
```

### 이전 수동 설치에서 전환

예전 `~/.pi/agent/extensions/subagent/` 복사본과 패키지 등록을 함께 두면 도구가
중복 등록될 수 있다. 공식 예제와 동일한 파일인지 확인한 후 기존 디렉토리를
extension 자동 탐색 경로 밖의 백업 디렉토리로 이동한다. 개인 수정이 있으면 먼저
차이를 검토한다. 기존 `~/skills/adapters/pi/agents/`를 가리키는 두 링크도 대상을
확인한 후 새 저장소의 정의로 교체한다. 다른 사용자 파일·링크는 지우지 않는다.

### 제거

먼저 두 agent 링크가 이 저장소의 `agents/`를 가리키는지 확인하고 그 링크만 제거한다.
패키지를 제거하면 UI·테마를 포함한 이 저장소 전체가 비활성화된다. subagent만 끄려면
`pi config`의 이 패키지 리소스 선택에서 해당 extension을 비활성화한다.

## 권한과 모델

두 agent는 `read, grep, find, ls`만 허용한다. `write`, `edit`, `bash`, `subagent`,
MCP·웹 도구는 비활성화한다. 셸·외부 조회는 주 에이전트가 승인 범위에서 수행하고
파일로 저장한 자료와 출처를 전달한다. 검증자는 전달된 자료에 한정된 검증임을 명시한다.

모델 미지정으로 부모의 모델과 추론 수준을 상속한다. 도구 제한은 OS sandbox가 아니며
하위 프로세스는 일반 Pi 설정·extension을 로드한다. 파일 접근 전체를 격리하지 않는다.

## 호출 계약

스킬의 `references/agent-workflow.md`에 따라 작업 ID·질문·범위·원자료·제약·종료 조건,
역할 파일·근거 양식·체크리스트의 **실제 절대 경로**를 task에 전달한다.
`agentScope: "user"`로 프로젝트 정의가 같은 이름의 agent를 대체하지 않게 한다.

```json
{
  "agent": "report-investigator",
  "agentScope": "user",
  "cwd": "/absolute/project",
  "task": "작업 ID Q1. 역할 파일 /absolute/skills/debug/agents/investigator.md를 먼저 읽는다. 근거 양식 /absolute/skills/debug/templates/evidence.md. 질문: ... 원자료: ... 범위·제약: ... 종료 조건: ..."
}
```

- 조사 병렬화: `tasks`에 하위 조사자 최대 2개(주 에이전트 포함 3명).
- 검증 1단계: `report-verifier`에 역할·체크리스트·질문·원자료만 전달.
- 검증 2단계: 새 호출에 **1단계 반환 원문**과 초안·근거 기록을 전달.
- `propose`는 해당 스킬의 역할·양식·체크리스트 경로를 사용.

매 호출은 `--no-session`인 새 프로세스다. 이전 판단을 자동 기억하지 않는다.
추적에는 부모의 toolCallId, task 작업 ID, `details.results`의 agent·exitCode·stopReason을
사용한다. 모든 하위 오류가 바깥 tool error flag에 반영된다고 가정하지 않고 각 결과를
확인한다. 도구 자체에는 작업 timeout 인자가 없으므로 실행 예산·취소는 호출 측이 관리한다.

## 검증

```bash
bash tests/install-agents.sh
```

위 회귀 검사는 임시 디렉토리에서 링크 설치, 재실행, 사용자 파일·깨진 링크 보존,
기본/사용자 지정 경로와 잘못된 입력을 검사한다. 실제 홈이나 모델 API를 사용하지 않는다.

Pi 0.85.1 / openai-codex/gpt-6-astra에서 합성 자료로 다음 설치·연결 smoke test도 수행했다.

- 조사자와 검증자 선행 판단을 병렬 실행한 뒤 검증자 초안 대조를 별도 호출
- 세 하위 실행 모두 exitCode=0, stopReason=stop
- 원자료 read 확인, 선행 판단에서 초안 미열람, 읽기 전용 도구 외 호출 없음
- 캐시 HIT 10건만으로 Redis 전체 정상을 단정하지 않음
- 종료일 제외 2020-12-01~2021-01-01을 31일로 계산하고 초안의 1년 주장을 교정

전체 스킬 평가 사례, 실제 운영 조사, 강제 취소·timeout·대용량 출력은 아직 시험하지 않았다.
합성 시험의 로컬 실행 로그나 사용자 세션·인증 정보는 저장소에 포함하지 않는다.
