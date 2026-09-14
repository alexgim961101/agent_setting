# 프로젝트 전용 지침

이 파일은 `~/src/pi_setting` 저장소에서 작업할 때만 적용되는 프로젝트 지침이다. 전역 지침(`~/.pi/agent/AGENTS.md`)에는 포함하지 않는다.

## 저장소 목적

- 이 저장소는 Pi coding agent의 전역 지침·확장·테마를 관리하는 설정 저장소다.
- `global/AGENTS.md`는 `~/.pi/agent/AGENTS.md`로 복사되는 전역 지침의 원본이다. 편집 후 `cp global/AGENTS.md ~/.pi/agent/AGENTS.md`를 실행해야 적용된다.

## 파일별 역할

- `global/AGENTS.md`: 전역 지침 원본. 기술 스택에 독립적인 내용만 유지한다.
- `extensions/compact-ui.ts`: 상태 표시줄 확장. 수정 후 Pi 세션에서 `/reload`가 필요하다.
- `themes/alex-light.json`: 밝은 터미널 배경 기준의 테마. 수정 시 자동 반영된다.
- `package.json`: `pi` 필드로 확장·테마를 등록하는 로컬 Pi 패키지 정의.

## 작업 규칙

- 설치·적용 절차(`pi install ~/src/pi_setting`, `pi remove`, 전역 지침 복사 명령)를 바꾸는 변경이면 README.md도 함께 갱신한다.
- API 키, `auth.json`, 세션 기록 등 비밀 정보는 이 저장소에 커밋하지 않는다.
- 자동화 테스트는 없다. 확장·테마 변경은 `pi install ~/src/pi_setting` 후 `/settings`, `/ui`, `/reload`로 확인한다.
