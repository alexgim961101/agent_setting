# 프로젝트 전용 지침

이 파일은 `~/src/agent_setting` 저장소에만 적용한다. 전역 지침을 대체하지 않는다.

## 저장소 구조

- `pi/`: Pi 전역 지침·설정·확장·테마·보고서 agent 정의. `pi/package.json`을 Pi 로컬 패키지로 등록한다.
- `claude-code/`: Claude Code 전역 `CLAUDE.md`와 설치 안내.
- `codex/`: Codex 전역 `AGENTS.md`와 설치 안내.
- `omp/`: OMP 사용자 `AGENTS.md`, `config.yml`과 설치 안내.
- `scripts/link-files.sh`: 동일한 파일은 링크로 전환하되 서로 다른 사용자 파일은 보존하는 공통 설치 유틸리티.
- 각 하네스의 `README.md`: 설치 위치·절차 및 외부 skills 저장소 사용법. 스킬 본문은 이 저장소에 넣지 않는다.

## 변경·적용 원칙

- 사용자 설정(`settings.json`, 인증·토큰·세션·로그·DB 등)을 저장소로 옮기지 않는다. 새 설정을 추가하기 전 비밀 정보와 하네스 런타임의 자동 수정 여부를 확인한다.
- 공통 지침을 하네스마다 복제해도 된다. 단, 서로 다른 하네스의 설정 파일을 서로 링크하지 않는다.
- 기존 설치 파일과 내용이 다르면 덮어쓰지 않는다. 차이를 검토하고 수동 병합을 안내한다.
- 설치 절차와 경로를 바꾸면 루트와 해당 하네스 `README.md`, 관련 `pi/docs/`를 갱신한다.
- Pi 확장·테마는 `pi install ~/src/agent_setting/pi`로 저장소에서 직접 로드한다. 설정·지침·agent 정의·MCP는 `pi/scripts/install.sh`로 링크한다. Pi가 자체 관리하는 `~/.pi/agent/settings.json`은 링크하지 않는다.
- Claude Code·Codex·OMP 설치는 각각의 `install.sh`를 사용한다. 스킬은 `~/skills` 또는 검토한 외부 원본에서 별도로 설치한다.

## 검증

- 설치 스크립트 변경 시 `bash pi/tests/install.sh`와 `bash tests/install-harnesses.sh` (임시 디렉터리만 사용)를 실행한다.
- Agent Hub 변경 시 `node --test pi/tests/agent-hub-rpc.test.ts pi/tests/agent-hub-manager.test.ts`를 실행한다. fake child와 실제 provider 검증을 구분한다.
- Pi 확장·테마 변경 시 로컬 패키지 설치 후 Pi에서 `/settings`, `/ui`, `/agents`, `/reload`로 확인한다. 실제 실행 검증 범위는 `pi/docs/subagent.md`를 따른다.
