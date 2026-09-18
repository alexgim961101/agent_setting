# Pi 설정

Pi coding agent에서 사용하는 공통 지침·설정·extension·agent 등록 정의를 관리하는 저장소입니다.
범용 스킬과 역할 프롬프트·템플릿은 별도의 [skills 저장소](https://github.com/alexgim961101/skills)에서 관리합니다.

## 관리 파일

| 파일 | 용도 | 적용 위치 |
| --- | --- | --- |
| [global/AGENTS.md](global/AGENTS.md) | 기술 스택에 독립적인 공통 작업 지침 | `~/.pi/agent/AGENTS.md` |
| [AGENTS.md](AGENTS.md) | 이 저장소에서 작업할 때 적용되는 프로젝트 전용 지침 | 전역에 복사하지 않음 |
| [extensions/compact-ui.ts](extensions/compact-ui.ts) | 간결한 상태 표시줄과 전환 단축키 | 로컬 Pi 패키지로 등록 |
| [extensions/usage.ts](extensions/usage.ts) | `/usage` 명령으로 현재 provider 사용량·잔여 한도 확인 | 로컬 Pi 패키지로 등록 |
| [extensions/dangerous-command-guard.ts](extensions/dangerous-command-guard.ts) | 위험한 bash 명령 실행 전 사용자 확인 | 로컬 Pi 패키지로 등록 |
| [extensions/subagent/](extensions/subagent/) | 공식 예제 기반의 별도 agent 실행 도구 | 로컬 Pi 패키지로 등록, 전역 extension 폴더에 중복 설치하지 않음 |
| [agents/](agents/) | 보고서 조사자·검증자의 Pi 전용 등록·도구 설정 | `scripts/install-agents.sh`로 `~/.pi/agent/agents/`에 링크 |
| [themes/alex-light.json](themes/alex-light.json) | 차분한 파란색 계열의 밝은 테마 | 로컬 Pi 패키지로 등록 |
| [themes/alex-dark.json](themes/alex-dark.json) | 차분한 파란색 계열의 어두운 테마 | 로컬 Pi 패키지로 등록 |
| [config/models.json](config/models.json) | Codex GPT-6 Astra 컨텍스트 윈도우 override | `~/.pi/agent/models.json` |
| [config/web-search.json](config/web-search.json) | `pi-web-access` 검색·본문 추출 설정 | `~/.pi/agent/web-search.json` |
| [mcp/mcp.json](mcp/mcp.json) | Chrome DevTools·Atlassian Rovo MCP 서버 설정 | `~/.config/mcp/mcp.json` |

공통 지침에는 한국어 응답, 목표와 근거 확인, 승인 범위 안에서의 실행, 변경 범위 관리, 검증과 결과 보고 원칙이 포함되어 있습니다.

## 설치 환경

2026-09-14 로컬에서 확인한 버전입니다. 아래 설치 명령은 Chrome DevTools MCP를 제외하면 버전을 고정하지 않으므로 나중에 실행하면 세부 버전이 달라질 수 있습니다. 브라우저 연결을 검증한 환경은 아래 Chrome DevTools MCP 절에 별도로 기록합니다.

| 항목 | 확인한 설정 |
| --- | --- |
| Node.js | `v24.12.0`, nvm 기본값 `24` |
| Pi coding agent | `0.85.1` |
| 뉴럴와트 확장 | `@aliou/pi-neuralwatt` `0.15.3` |
| MCP 어댑터 | `pi-mcp-adapter` `2.34.0` |
| 웹 검색 확장 | `pi-web-access` `0.29.0` |

## Node.js와 Pi 설치

nvm이 설치되고 셸에 로드된 환경을 기준으로 합니다. Node.js 24를 설치하고 기본 버전으로 지정합니다. 기존에 Node.js 24가 설치되어 있다면 `nvm use 24`부터 실행하면 됩니다.

```bash
nvm install 24
nvm use 24
nvm alias default 24
```

이미 열려 있는 다른 터미널에서는 `nvm use default`를 실행합니다. 이어서 선택한 Node.js 환경에 Pi를 설치합니다.

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

`--ignore-scripts`는 의존성의 설치 스크립트 실행을 막는 옵션이며, Pi 공식 설치 안내에 따른 것입니다. nvm의 전역 npm 패키지는 Node.js 버전별로 설치되므로 다른 Node.js 버전으로 전환하면 Pi를 다시 설치해야 할 수 있습니다.

설치 결과는 다음 명령으로 확인합니다.

```bash
nvm version default
node --version
pi --version
```

## 뉴럴와트 연결

현재 사용하는 확장은 커뮤니티 패키지인 `@aliou/pi-neuralwatt`입니다. 확장이 provider와 모델 목록을 등록하므로 `models.json`을 직접 작성할 필요가 없습니다.

### 확장 설치

```bash
pi install npm:@aliou/pi-neuralwatt
pi list
```

설치된 확장은 `~/.pi/agent/npm/`에 저장되고, 패키지 등록은 `~/.pi/agent/settings.json`에 기록됩니다.

### API 키 등록

[뉴럴와트 포털](https://portal.neuralwatt.com)에서 발급한 키를 `~/.pi/agent/auth.json`에 저장합니다. 기존 인증 항목이 있으면 유지하고 `neuralwatt` 항목만 추가하거나 수정합니다.

```json
{
  "neuralwatt": {
    "type": "api_key",
    "key": "YOUR_NEURALWATT_API_KEY"
  }
}
```

`YOUR_NEURALWATT_API_KEY`를 실제 키로 바꿉니다. 이 방식에서는 `NEURALWATT_API_KEY` 환경 변수를 설정하지 않아도 됩니다.

### 모델 선택과 사용량 확인

작업할 프로젝트 폴더에서 `pi`를 실행합니다. 아래 명령은 셸이 아닌 Pi 대화창에 입력합니다.

| Pi 명령 | 용도 |
| --- | --- |
| `/model` | `neuralwatt` 모델 검색 및 선택 |
| `/neuralwatt:quota` | 사용량과 잔여 할당량 확인 |
| `/neuralwatt:settings` | 사용량 표시, 알림 등 확장 설정 |

모델 선택 화면에서 `Ctrl+S`를 누르면 선택한 모델을 시작 기본값으로 저장할 수 있습니다.

## Codex GPT-6 Astra 컨텍스트 설정

`config/models.json`은 `openai-codex/gpt-6-astra`의 `contextWindow`를 **1,050,000토큰**으로 지정합니다. 기존 모델의 인증·출력 한도·가격 정보는 유지하며, 추론 강도와 압축 설정은 바꾸지 않습니다.

저장소 루트에서 적용합니다. 기존 `models.json`에 다른 설정이 있다면 덮어쓰지 말고 해당 모델의 override만 병합하세요.

```bash
mkdir -p ~/.pi/agent
cp config/models.json ~/.pi/agent/models.json
```

Pi에서 `/model`을 열어 모델 목록을 새로 읽고 `openai-codex/gpt-6-astra`를 다시 선택하거나 Pi를 재시작합니다. `pi install`만으로는 이 파일이 복사되지 않습니다.

이 값은 Pi의 컨텍스트 관리·자동 압축 기준이며 서버의 허용량을 늘리지는 않습니다. 기본 `reserveTokens: 16384`에서는 약 1,033,616토큰을 초과하면 자동 압축합니다. 해당 계정·엔드포인트에서 장문 요청을 허용하는지는 별도 검증이 필요하며, 컨텍스트 증가로 지연과 사용량이 늘어날 수 있습니다.

## 화면 커스텀

이 저장소를 로컬 Pi 패키지로 등록합니다. 설치된 Pi가 필요한 라이브러리를 제공하므로 별도의 `npm install`은 필요하지 않습니다. Pi `0.85.1`에서 검증했습니다.

```bash
pi install ~/src/pi_setting
```

Pi를 다시 실행하고 `/settings`에서 테마를 선택합니다. 밝은 터미널 배경에는 `alex-light`, 어두운 터미널 배경에는 `alex-dark`가 어울립니다.

상태 표시줄은 기본 2줄로 표시하고, 다른 확장이 제공하는 상태가 있으면 아래에 추가합니다. 두 번째 줄에는 세션 경과 시간과 입력·출력 토큰, 캐시 토큰, 누적 비용도 표시합니다. 캐시는 provider가 캐시 사용량을 보고하는 경우에만, 비용은 가격 정보를 제공하는 경우에만 나타납니다.

```text
~/src/project · main
neuralwatt · Kimi K2.6 · high · 12m    ↑12.3k ↓4.5k cache 8.1k $0.123 · 컨텍스트 12%
```

| 조작 | 동작 |
| --- | --- |
| `/ui` 또는 `Ctrl+Alt+U` | 간결한 표시줄과 Pi 기본 표시줄 전환 |
| `/settings` | `alex-light`, `light`, `dark` 등 테마 선택 |
| `/reload` | 저장소에서 수정한 확장 다시 불러오기 |

표시줄 전환은 현재 Pi 실행 동안 유지되며, 다시 실행하거나 `/reload`하면 간결한 표시줄로 시작합니다. 단축키가 터미널에서 전달되지 않으면 `/ui`를 사용합니다. 기존 Pi 단축키는 변경하지 않습니다.

### 사용량 확인 (`/usage`)

현재 선택된 모델의 provider에 따라 사용량을 조회합니다.

- `neuralwatt`: 잔여 크레딧, 이번 달 사용량(비용·요청·토큰), 키 한도, 구독 정보를 표시합니다.
- `openai-codex`: 플랜, 주/보조 rate limit 윈도우의 남은 비율과 리셋 시각, 크레딧을 표시합니다. Codex OAuth 로그인이 필요하며, 이 엔드포인트는 codex CLI 내부용이라 응답 형식이 예고 없이 바뀔 수 있습니다.
- 그 외 provider는 지원하지 않습니다.

컨텍스트 수치를 알 수 없는 경우에는 `?`로 표시합니다. 뉴럴와트 등 다른 확장의 상태 문구가 제공되면 그대로 표시하며, 이 확장이 별도의 API 조회를 하지는 않습니다.

로컬 패키지는 파일을 복사하지 않고 이 저장소를 직접 참조합니다. 활성 테마 파일 수정은 자동 반영되며, 확장 수정 후에는 `/reload`가 필요합니다. `AGENTS.md`는 아래 방법으로 별도 적용합니다.

커스텀을 해제하려면 `/settings`에서 기본 테마 `light`를 선택한 뒤 패키지를 제거하고 Pi를 다시 실행합니다.

```bash
pi remove ~/src/pi_setting
```

## 위험 명령 실행 확인

`extensions/dangerous-command-guard.ts`는 Pi의 `tool_call` hook으로 에이전트의 `bash` 실행을 확인합니다. 기존 로컬 패키지 설치 방식으로 전역 적용합니다.

```bash
pi install ~/src/pi_setting
```

현재 세션에서는 `/reload`하세요. `/settings`, `/ui`로 기존 UI가 유지되는지도 확인합니다. 전역 extension 디렉터리에 별도로 복사하지 않습니다.

- 감지 대상: `sudo/doas`, `rm/rmdir/unlink/shred`, `chmod/chown/chgrp`, `mkfs/wipefs/dd`, Git push(일반 push 포함), reset/clean/restore, checkout의 `--`·force 옵션, branch/tag 삭제, stash drop/clear, `find -delete`, curl/wget → 셸 파이프.
- 실행 전 감지 사유·작업 경로·전체 명령을 표시합니다. 기본 선택은 **실행 취소**이며 **이번 명령 실행 허용**을 선택해야 진행합니다. 복합 명령은 bash 호출 전체를 한 번 승인합니다. 승인을 기억하지 않습니다.
- Esc·취소·UI 오류 또는 UI가 없는 print/JSON 실행에서는 차단합니다. RPC는 호스트의 선택 UI 응답이 필요합니다.
- **가벼운 문자열 감지이지 보안 샌드박스가 아닙니다.** 인용문·주석에도 확인 창이 뜰 수 있으며, 변수·별칭·스크립트 내부·일부 셸 문법은 놓칠 수 있습니다. 일반 파일 덮어쓰기, 모든 배포/DB/클라우드 명령을 포괄하지 않습니다.
- MCP·다른 도구·extension 내부 실행과 사용자가 직접 입력하는 `!`/`!!` 명령은 검사하지 않습니다. 하위 Pi 프로세스는 이 패키지를 로드한 경우에만 자체적으로 검사하며, UI가 없다면 감지된 명령을 차단합니다.

안전한 수동 확인: 에이전트에게 `git status --short` 실행을 요청하면 확인 없이 진행하고, `rm --help` 실행을 요청하면 확인 창이 표시되어야 합니다. `rm --help`는 삭제하지 않지만 `rm` 패턴에 해당합니다. 취소와 명시적 허용을 각각 확인하세요.

자동 검사는 실제 위험 명령을 실행하지 않고 감지 규칙과 hook의 승인·취소·UI 부재 처리를 검사합니다(Node.js 24).

```bash
node --test tests/dangerous-command-guard.test.ts
```

## Multi-agent: 조사자·검증자

Pi 기본 도구에는 multi-agent 실행 기능이 없어 공식 `subagent` 예제 extension을
이 패키지에 포함했습니다. `pi install ~/src/pi_setting`으로 extension이 등록됩니다.
아래 명령으로 사용자 agent 정의도 연결합니다.

```bash
cd ~/src/pi_setting
./scripts/install-agents.sh
```

- `report-investigator`: 지정 질문·로컬 원자료 조사
- `report-verifier`: 원자료 선행 판단 → 초안 대조
- 두 agent는 `read, grep, find, ls`만 사용하고 부모의 모델·추론 수준을 상속합니다.
- `debug`·`propose` 스킬은 별도 skills 저장소에서 설치합니다.
- 기존 수동 설치본은 중복 로딩되지 않도록 확인 후 자동 탐색 경로 밖으로 옮깁니다.

현재 세션은 `/reload`하거나 새로 시작합니다. 역할 프롬프트 전달, 이전 설치 전환,
권한 제한, 제거와 검증 범위는 [docs/subagent.md](docs/subagent.md)를 참고하세요.

## MCP 공통 설정

Pi 코어에는 MCP가 포함되어 있지 않으므로 `pi-mcp-adapter` 패키지로 MCP 클라이언트를 추가합니다. `mcp/mcp.json`은 Chrome DevTools와 Atlassian Rovo 두 서버를 등록합니다. 서버는 lazy 방식으로 필요할 때만 시작하므로 Chrome DevTools 패키지를 아직 설치하지 않았더라도 Atlassian만 사용할 수 있습니다.

저장소 루트에서 실행합니다. 기존 `~/.config/mcp/mcp.json`에 별도로 추가한 서버나 설정이 있다면 차이를 확인하고 병합하세요. 아래 `cp`는 기존 파일을 덮어씁니다.

```bash
pi install npm:pi-mcp-adapter
mkdir -p ~/.config/mcp
cp mcp/mcp.json ~/.config/mcp/mcp.json
```

어댑터를 처음 설치했다면 Pi를 다시 실행합니다. 이후 MCP 설정 파일만 변경했다면 Pi에서 `/reload`를 실행합니다. `mcp({ ... })` 예시는 에이전트의 도구 호출이며 셸 명령이 아닙니다.

### Atlassian Rovo

Atlassian은 원격 MCP 서버 `https://mcp.atlassian.com/v2/mcp`와 OAuth 2.1 인증을 공식 제공합니다([공식 가이드](https://support.atlassian.com/atlassian-rovo-mcp-server/docs/getting-started-with-the-atlassian-remote-mcp-server/)).

Pi에서 `/mcp-auth atlassian`을 입력하면 브라우저에서 Atlassian 계정으로 로그인합니다. 연결 확인은 `/mcp` 패널이나 `mcp({ search: "jira" })` 호출로 합니다.

MCP 호출은 조직의 Rovo 크레딧을 소비하고 로그인한 계정의 Jira·Confluence 등 권한으로 동작하므로, 조직 환경에서는 admin 승인이 필요할 수 있습니다. `pi-mcp-adapter`는 서버를 기본 lazy로 연결하고 하나의 프록시 도구로 노출해 컨텍스트 소비를 줄입니다.

## 브라우저: Chrome DevTools MCP

현재는 Chrome만 지원 대상으로 삼습니다. Google의 [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)로 기존 Chrome의 로그인된 탭에 연결해 스크린샷, DOM·접근성 스냅샷, 클릭·입력, 콘솔·네트워크 진단을 수행합니다. OS 데스크톱 캡처가 아니라 브라우저 자체의 캡처 기능을 사용합니다.

### 설치와 설정

Node.js 24가 활성화된 셸에서 검증한 버전을 설치합니다. MCP 어댑터 설치와 설정 파일 복사는 위 공통 설정을 따릅니다.

```bash
npm install -g --ignore-scripts chrome-devtools-mcp@1.9.0
command -v chrome-devtools-mcp
chrome-devtools-mcp --version
```

설정의 `command`는 `chrome-devtools-mcp`입니다. 개인 홈 디렉터리나 nvm 버전의 절대 경로를 저장소에 넣지 않습니다. Pi를 실행한 환경의 `PATH`에서 이 명령을 찾을 수 있어야 하며, nvm으로 Node.js 버전을 바꾸면 해당 버전에 다시 설치해야 할 수 있습니다. 셸의 PATH를 바꿨다면 Pi도 그 셸에서 다시 시작합니다.

| 설정 | 목적 |
| --- | --- |
| `--autoConnect` | 새 브라우저를 띄우지 않고 실행 중인 Chrome에 연결 |
| `--no-usage-statistics` | MCP 사용 통계 전송 비활성화 |
| `--no-performance-crux` | 성능 트레이스 URL을 CrUX API로 보내는 기능 비활성화 |
| `--redact-network-headers` | 도구 응답에서 일부 민감한 네트워크 헤더 가림 |
| `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1` | MCP 서버의 자동 업데이트 확인 비활성화 |
| `inheritEnv: false` | MCP 자식 프로세스에 불필요한 호스트 환경 변수를 상속하지 않음. SDK 기본 환경과 명시한 `env`는 유지 |
| `lifecycle: lazy` | 필요한 시점에만 MCP 서버 시작 |
| `requestTimeoutMs: 30000` | MCP 요청의 대기 시간을 30초로 제한 |

통계 전송 비활성화나 헤더 가림이 모든 데이터의 비공개를 보장하지는 않습니다. 캡처·페이지·콘솔·네트워크 결과는 에이전트와 모델에 전달될 수 있고, URL·본문·이미지 안의 민감한 정보는 별도로 주의해야 합니다.

### 기존 Chrome 연결 권한

`--autoConnect`는 Chrome 144 이상이 필요합니다([Google 공식 안내](https://developer.chrome.com/docs/devtools/agents/use-cases/auto-connect)). MCP 서버 초기화 성공과 실제 Chrome 연결 성공은 별개입니다.

1. 연결하려는 프로필의 Chrome에서 `chrome://inspect/#remote-debugging`을 엽니다.
2. **Allow remote debugging for this browser instance**를 활성화합니다.
3. Pi 설정을 적용한 뒤 에이전트가 `mcp({ connect: "chrome-devtools" })`로 서버를 연결합니다.
4. 에이전트가 `chrome-devtools_list_pages`를 호출하면 Chrome에 나타나는 연결 요청을 사용자가 **Allow**로 승인합니다.
5. 페이지 목록의 URL·제목으로 대상 탭을 찾고 그 `pageId`로 작업합니다. 이전 세션의 ID를 재사용하지 않습니다.

연결 권한은 특정 탭 하나에만 격리되지 않으며 선택된 프로필의 다른 창과 데이터에도 접근할 수 있습니다. 필요한 작업에만 사용하고, 상시 프론트엔드 개발에는 개인 브라우징과 분리된 개발용 프로필을 권장합니다. 로그인·MFA·CAPTCHA는 사용자가 직접 처리하며, 사이트에 대한 전송·게시·삭제는 승인된 작업에서만 실행합니다.

### 스크린샷 저장

다음은 에이전트의 MCP 호출 예시입니다. `TARGET_PAGE_ID`를 방금 조회한 대상 페이지의 숫자 ID로 바꿉니다.

```javascript
mcp({ tool: "chrome-devtools_list_pages", args: {} })
mcp({
  tool: "chrome-devtools_take_screenshot",
  args: {
    pageId: TARGET_PAGE_ID,
    format: "png",
    filePath: "/tmp/retailtrend-monitoring.png"
  }
})
```

- `filePath`를 생략하면 이미지가 도구 응답으로 전달됩니다. 사용자가 열어 볼 파일이 필요하면 경로를 명시합니다.
- 기본은 현재 뷰포트 캡처입니다. 스크롤 아래까지 포함하려면 `fullPage: true`를 추가합니다.
- 현재 설정에는 별도의 `--workspace`가 없어 파일 저장은 기본 OS 임시 디렉터리로 제한됩니다. `~/Pictures`로 직접 저장하면 `Access denied ... configured workspace roots` 오류가 납니다.
- MCP의 저장 성공을 확인한 뒤, 승인된 로컬 파일 작업으로 원하는 위치에 복사합니다. 예를 들어 다음 명령은 기존 파일을 덮어쓰지 않습니다.

```bash
mkdir -p ~/Pictures
cp -n /tmp/retailtrend-monitoring.png ~/Pictures/retailtrend-monitoring.png
file ~/Pictures/retailtrend-monitoring.png
```

PNG 생성뿐 아니라 에이전트가 이미지를 실제로 읽는지도 확인해야 합니다. 이미지 입력을 지원하는 모델과 이미지 전달 설정이 필요합니다. 인증된 업무 화면의 스크린샷은 이 저장소에 커밋하지 않습니다.

### 오류와 검증 기록

| 증상 | 확인할 사항 |
| --- | --- |
| `Server "chrome-devtools" not found` | 설정 파일 적용 위치와 Pi의 `/reload` 여부 |
| `chrome-devtools-mcp` 실행 파일을 찾지 못함 | Pi가 상속한 PATH와 현재 nvm 버전의 전역 설치 여부 |
| `Could not find DevToolsActivePort` | 대상 프로필의 Chrome 실행 여부와 위 원격 디버깅 스위치. 포트 파일을 임의로 만들지 않음 |
| Chrome 연결 요청에서 대기 | Chrome의 사용자 승인 창을 확인. 다른 프로필에 연결하려는 것은 아닌지 확인 |
| 스크린샷 경로 접근 거부 | 기본 `/tmp` 경로 사용. 이를 해결하려고 전체 파일시스템 접근을 허용하지 않음 |

2026-09-15 Ubuntu/Wayland, Node.js `24.21.0`, Chrome `150.0.7871.114`, Chrome DevTools MCP `1.9.0`에서 다음을 확인했습니다.

- MCP 초기화와 29개 도구 목록 조회 성공.
- 사용자가 원격 디버깅과 연결 요청을 승인한 뒤 기존 로그인된 Retailtrend 모니터링 탭 조회 성공.
- 뷰포트 스크린샷을 이미지 응답으로 확인하고, 별도 파일로 다시 캡처·저장 성공(PNG, 2494 × 1231).
- 당시 저장 파일: `~/Pictures/retailtrend-monitoring-20260915.png`. 로컬 검증 결과물이며 저장소에는 포함하지 않음.
- 클릭·입력, 전체 페이지 캡처, 반응형 변경, 콘솔·네트워크 진단은 아직 동작 검증하지 않음.

앞서 Orca의 외부 앱 제어(`orca-ide computer ...`)에서는 `screenshot: false`였지만 Chrome DevTools MCP 캡처는 정상 동작했습니다. Orca 내장 브라우저의 `screenshot` 명령은 또 다른 경로로, 실제 캡처는 아직 검증하지 않았습니다.

Orca 접근성 제어 점검 중에는 pyenv 기본 Python에서 `gi`를 찾지 못해 사용자의 승인으로 `pyenv global system`을 적용했습니다. 시스템 Python에는 `gi`·AT-SPI가 이미 설치되어 있었습니다. 이 변경은 **Chrome DevTools MCP의 필수 조건이 아니며**, 재설치 시 Python 설정을 변경할 필요는 없습니다. Linux에서 `/usr/bin/orca`는 GNOME 스크린리더일 수 있으므로 이번 환경에서는 Orca CLI로 `orca-ide`를 사용했습니다.

## 웹 검색: pi-web-access와 Tavily

Pi 코어에는 웹 검색 도구가 없으므로 `pi-web-access` 확장으로 검색·본문 추출·GitHub 클론·PDF 추출을 추가합니다. 검색 제공자는 Tavily를 사용합니다. Tavily는 카드 등록 없이 월 1,000 크레딧을 무료로 제공하며, 초과분은 $0.008/회입니다.

### 설치

```bash
pi install npm:pi-web-access
mkdir -p ~/.pi/agent
cp config/web-search.json ~/.pi/agent/web-search.json
```

### API 키 등록

[Tavily](https://www.tavily.com)에서 발급한 키를 셸 프로필에 환경 변수로 등록합니다. 키를 설정 파일에 직접 쓰지 않기 위한 방식입니다.

```bash
export TAVILY_API_KEY="tvly-발급받은키"
```

셸을 다시 열고 Pi를 재시작합니다. 환경 변수는 `/reload`로는 반영되지 않습니다.

```bash
echo $TAVILY_API_KEY   # 값이 보이면 정상
```

### 설정 내용

`config/web-search.json`은 Tavily만 사용하도록 고정하고, 자동 폴백에서 다른 제공자(Exa, OpenAI 등)로 넘어가는 경로를 막습니다. 검색과 본문 추출을 분리해 페이지를 읽을 때 검색 API를 다시 호출하지 않습니다.

| 설정 | 값 | 이유 |
| --- | --- | --- |
| `provider` | `tavily` | 검색 제공자 고정 |
| `webSearch.allowedProviders` | `["tavily"]` | 허용 목록 밖 제공자 차단 |
| `searchRouting.fallbackOn` | `[]` | 실패 시 임의 제공자로 전환하지 않음 |
| `fetchRouting.providers` | `http` → `jina` → `firecrawl` | 알려진 URL 본문은 직접 읽기 |
| `workflow` | `auto-summary` | 검토용 브라우저 창 없이 요약만 수신 |
| `pdf.provider` | `unpdf` | PDF를 로컬에서 추출 |
| `allowBrowserCookies` | `false` | 브라우저 쿠키 접근 차단 |
| `autoOpenBrowser` | `false` | 브라우저 창 자동 실행 차단 |

`tavilyApiKey`는 `$TAVILY_API_KEY` 참조를 사용하므로 설정 파일을 공유해도 키가 노출되지 않습니다. `summaryModel`은 설치된 모델 목록에서 `gpt-5.6-terra`를 지정했으며, `/model` 목록이 바뀌면 함께 조정합니다.

### 사용

| 도구 | 용도 |
| --- | --- |
| `web_search` | Tavily로 검색하고 출처가 붙은 답변을 받음 |
| `fetch_content` | URL 본문을 Markdown으로 읽거나 GitHub 저장소를 클론 |
| `get_search_content` | 이전 검색·조회 결과를 캐시에서 다시 읽음 |
| `source_check` | 주장에 대한 근거 문장을 수집 |

자주 쓰는 명령은 `/websearch`, `/curator`, `/search`입니다.

## 전역 지침 적용

저장소 루트에서 아래 명령을 실행합니다. 기존 전역 `AGENTS.md`가 있으면 저장소의 내용으로 덮어쓰므로 먼저 차이를 확인하세요.

```bash
mkdir -p ~/.pi/agent
cp global/AGENTS.md ~/.pi/agent/AGENTS.md
```

Pi를 다시 실행하면 적용됩니다. Pi는 전역 지침을 프로젝트의 `AGENTS.md`와 함께 읽습니다. 같은 디렉터리에 `AGENTS.override.md`가 있으면 해당 디렉터리에서는 그 파일이 우선하며, `--no-context-files` 옵션을 사용하면 지침 파일을 읽지 않습니다.

## 지침 수정

이 저장소의 `global/AGENTS.md`를 수정하고 위 적용 명령을 다시 실행합니다. 파일을 복사하는 방식이므로 저장소를 수정하거나 `git pull`만 실행해도 전역 파일이 자동으로 바뀌지는 않습니다.

API 키가 들어 있는 `~/.pi/agent/auth.json`과 세션 기록은 이 저장소에서 관리하지 않습니다.

## 참고

- [Pi 문서](https://pi.dev/docs/latest)
- [Pi 설치 안내](https://pi.dev/docs/latest/quickstart)
- [뉴럴와트 확장 설치 및 인증 안내](https://github.com/aliou/pi-neuralwatt#installation)
