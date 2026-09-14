# Pi 설정

Pi coding agent에서 사용하는 공통 지침과 설정을 관리하는 저장소입니다.

## 관리 파일

| 파일 | 용도 | 적용 위치 |
| --- | --- | --- |
| [AGENTS.md](AGENTS.md) | 기술 스택에 독립적인 공통 작업 지침 | `~/.pi/agent/AGENTS.md` |

공통 지침에는 한국어 응답, 목표와 근거 확인, 승인 범위 안에서의 실행, 변경 범위 관리, 검증과 결과 보고 원칙이 포함되어 있습니다.

## 설치 환경

2026-09-14 로컬에서 확인한 버전입니다. 아래 설치 명령은 버전을 고정하지 않으므로 나중에 실행하면 세부 버전이 달라질 수 있습니다.

| 항목 | 확인한 설정 |
| --- | --- |
| Node.js | `v24.12.0`, nvm 기본값 `24` |
| Pi coding agent | `0.85.1` |
| 뉴럴와트 확장 | `@aliou/pi-neuralwatt` `0.15.3` |

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

## 전역 지침 적용

저장소 루트에서 아래 명령을 실행합니다. 기존 전역 `AGENTS.md`가 있으면 저장소의 내용으로 덮어쓰므로 먼저 차이를 확인하세요.

```bash
mkdir -p ~/.pi/agent
cp AGENTS.md ~/.pi/agent/AGENTS.md
```

Pi를 다시 실행하면 적용됩니다. Pi는 전역 지침을 프로젝트의 `AGENTS.md`와 함께 읽습니다. 같은 디렉터리에 `AGENTS.override.md`가 있으면 해당 디렉터리에서는 그 파일이 우선하며, `--no-context-files` 옵션을 사용하면 지침 파일을 읽지 않습니다.

## 지침 수정

이 저장소의 `AGENTS.md`를 수정하고 위 적용 명령을 다시 실행합니다. 파일을 복사하는 방식이므로 저장소를 수정하거나 `git pull`만 실행해도 전역 파일이 자동으로 바뀌지는 않습니다.

API 키가 들어 있는 `~/.pi/agent/auth.json`과 세션 기록은 이 저장소에서 관리하지 않습니다.

## 참고

- [Pi 문서](https://pi.dev/docs/latest)
- [Pi 설치 안내](https://pi.dev/docs/latest/quickstart)
- [뉴럴와트 확장 설치 및 인증 안내](https://github.com/aliou/pi-neuralwatt#installation)
