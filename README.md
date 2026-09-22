# Agent settings

Claude Code, Codex, Pi, OMP의 **하네스별 설정**을 관리합니다. 이 저장소의 원격 이름은 [`agent_setting`](https://github.com/alexgim961101/agent_setting)입니다.

| 하네스 | 관리 항목 | 설치 안내 |
| --- | --- | --- |
| [Claude Code](claude-code/) | 전역 `CLAUDE.md` | [claude-code/README.md](claude-code/README.md) |
| [Codex](codex/) | 전역 `AGENTS.md` | [codex/README.md](codex/README.md) |
| [Pi](pi/) | 지침, 확장, 테마, agent 정의, 안전하게 공유 가능한 설정 | [pi/README.md](pi/README.md) |
| [OMP](omp/) | 사용자 `AGENTS.md`, `config.yml` | [omp/README.md](omp/README.md) |

공통 지침도 하네스별 파일로 **복제**합니다. 한 하네스의 변경이 다른 하네스에 의도치 않게 적용되지 않도록 하며, 공통 변경이 필요하면 각 파일을 검토해 별도로 반영합니다. `AGENTS.md`(저장소 루트)는 이 저장소 작업에만 적용합니다.

## 설치

```bash
git clone git@github.com:alexgim961101/agent_setting.git ~/src/agent_setting
cd ~/src/agent_setting
bash claude-code/install.sh
bash codex/install.sh
pi install ~/src/agent_setting/pi
bash pi/scripts/install.sh
bash omp/install.sh
```

각 `install.sh`는 저장소의 설정 파일을 사용자 설정 위치로 **심볼릭 링크**합니다. 기존 파일이 원본과 동일하면 링크로 전환하고, 내용이 다르거나 다른 링크면 덮어쓰지 않고 중단합니다. Pi `web-search.json`만 충돌 시 나머지를 링크한 후 오류로 종료합니다. 차이는 먼저 검토·병합하세요. Pi 로컬 패키지는 복사가 아니라 디렉터리 직접 참조이며, **`pi install`만으로 개별 설정 파일을 링크하지는 않습니다.** 재시작하거나 Pi에서 `/reload`해 적용하세요.

Pi·Claude Code·Codex·OMP가 런타임에 쓰는 설정/인증/세션 파일은 통째로 저장소에 링크하지 않습니다. Pi의 `settings.json`은 패키지 등록 등으로 자동 수정되므로 로컬로 유지합니다. 저장소 경로를 다시 옮기면 링크가 끊기므로 새 경로에서 설치 스크립트를 다시 실행해야 합니다. 실제 홈 환경에 적용하기 전 각 하네스 안내를 확인하세요.

## 스킬 정책

스킬 본문·스크립트는 여기서 관리하지 않습니다. 각 하네스별 README에 설치 위치, 설치 명령, 검증 방법을 기록해 두고 필요할 때 에이전트가 원본을 **검토한 뒤** 선택적으로 설치하도록 합니다. 별도 [skills 저장소](https://github.com/alexgim961101/skills)의 스킬은 해당 저장소의 `install.sh`를 이용합니다. 설치 대상과 스킬별 지시문은 신뢰 여부를 먼저 확인하세요.

## 검증

```bash
bash pi/tests/install.sh
bash tests/install-harnesses.sh
cd pi && node --test tests/*.test.ts
```
