# 프로젝트 전용 지침

이 파일은 `~/src/pi_setting` 저장소에서 작업할 때만 적용되는 프로젝트 지침이다. 전역 지침(`~/.pi/agent/AGENTS.md`)에는 포함하지 않는다.

## 저장소 목적

- 이 저장소는 Pi coding agent의 전역 지침·확장·테마·agent 등록 정의를 관리하는 설정 저장소다. 범용 스킬·역할 프롬프트·템플릿은 별도 `~/skills` 저장소에서 관리한다.
- `global/AGENTS.md`는 `~/.pi/agent/AGENTS.md`로 복사되는 전역 지침의 원본이다. 편집 후 `cp global/AGENTS.md ~/.pi/agent/AGENTS.md`를 실행해야 적용된다.

## 파일별 역할

- `global/AGENTS.md`: 전역 지침 원본. 기술 스택에 독립적인 내용만 유지한다.
- `extensions/workspace-ui.ts`: Pi 기본 footer/editor를 유지하는 OMP-inspired header·indicator. 수정 후 `/reload`가 필요하다.
- `extensions/agent-hub/`: 현재 로드되는 read-only RPC subagent·worker·Agent Hub 구현.
- `extensions/subagent/`: 공식 subagent 예제의 고정 원본. 출처·라이선스를 보존하고 manifest에서 로드하지 않는다.
- `agents/`: Pi 전용 조사자·검증자 등록 정의. `scripts/install-agents.sh`로 사용자 agent 디렉토리에 링크한다.
- `docs/subagent.md`, `docs/agent-hub.md`: agent 설치·호출·권한·실행·검증 절차.
- `themes/alex-light.json`: 밝은 터미널 배경 기준의 테마. 수정 시 자동 반영된다.
- `config/models.json`: 모델별 컨텍스트 override. `~/.pi/agent/models.json`으로 복사하며, 기존 설정이 있으면 병합한다.
- `config/web-search.json`: `pi-web-access`의 검색·본문 추출 설정. `~/.pi/agent/web-search.json`으로 복사한다.
- `config/lsp.json`: `pi-lsp-adapter` 설정 원본. `~/.pi/agent/lsp.json`으로 복사한다.
- `config/agent-hub.json`: Agent Hub 동시 실행·timeout·모델 역할 설정. `~/.pi/agent/agent-hub.json`으로 복사한다.
- `mcp/mcp.json`: MCP 서버 설정. `~/.config/mcp/mcp.json`으로 복사한다.
- `package.json`: `pi` 필드로 확장·테마를 등록하는 로컬 Pi 패키지 정의.

## 작업 규칙

- 설치·적용 절차(`pi install ~/src/pi_setting`, `pi remove`, 전역 지침 복사 명령)를 바꾸는 변경이면 README.md도 함께 갱신한다.
- `config/`, `mcp/` 아래 파일은 저장소가 원본이다. 수정하면 해당 적용 위치로 복사해야 반영된다.
- API 키, `auth.json`, 세션 기록 등 비밀 정보는 이 저장소에 커밋하지 않는다. 설정 파일에는 키를 직접 쓰지 않고 `$환경변수` 참조를 사용한다.
- agent 설치 스크립트 변경 시 `bash tests/install-agents.sh`를 실행한다. 이 검사는 임시 디렉토리만 사용한다.
- Agent Hub 변경 시 `node --test tests/agent-hub-rpc.test.ts tests/agent-hub-manager.test.ts`를 실행한다. fake child 검사와 실제 provider 실행 검증을 구분한다.
- 확장·테마 변경은 `pi install ~/src/pi_setting` 후 `/settings`, `/ui`, `/agents`, `/reload`로 확인한다. subagent 실행 검증은 `docs/subagent.md`의 범위를 따른다.
