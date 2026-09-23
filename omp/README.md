# OMP 설정

이 디렉터리는 기존 `~/.omp/agent/config.yml`의 모델 역할·UI 등 개인화 값과 OMP 전역 `AGENTS.md` 지침을 보관합니다. 지침은 Pi의 공통 원칙을 **복제한 별도 파일**로, 이후 하네스별로 독립 수정합니다. 인증·DB·세션·확장 런타임은 로컬에 남겨 둡니다. OMP 버전과 프로필에 따라 설정 경로가 다르면 먼저 실제 사용 경로를 확인하세요.

## 설치

```bash
cd ~/src/agent_setting
bash omp/install.sh
readlink ~/.omp/agent/config.yml
readlink ~/.omp/agent/AGENTS.md
```

없는 파일은 새 링크를 만들고, 있는 파일은 저장소 원본과 동일한 경우에만 링크로 전환합니다. 다르면 덮어쓰지 않고 중단하므로 변경사항을 비교해 병합합니다. OMP를 재시작해 적용을 확인하세요. 다른 프로필은 `OMP_AGENT_DIR=/절대/경로 bash omp/install.sh`로 개별 설치할 수 있습니다.

## 모델 역할과 effort

`config.yml`의 역할은 모두 `openai-codex`의 GPT-6 계열을 사용합니다. 기본 작업은 Sol `xhigh`, 설계·정밀 검토는 Astra, 보조 작업은 Sol에 배치합니다. Luna를 사용하는 `tiny`·`judge`는 모두 `max`로 설정합니다. 이는 사용자 선호를 반영한 배치이며 성능 벤치마크 결과는 아닙니다.

| Role | 모델 | Effort | 사용 시점 |
| --- | --- | --- | --- |
| `default` | GPT-6 Sol | `xhigh` | 별도 모델을 지정하지 않은 새 세션의 기본 작업 |
| `smol` | GPT-6 Sol | `low` | 경량 호출, 기본 `scout`·`sonic`의 모델 선택 |
| `slow` | GPT-6 Astra | `xhigh` | 정밀 추론 호출, 기본 `reviewer`의 모델 선택 |
| `plan` | GPT-6 Astra | `high` | 계획 모드 |
| `task` | GPT-6 Sol | `high` | 기본 범용 `task` 서브에이전트의 모델 선택 |
| `vision` | GPT-6 Astra | `medium` | `read`의 이미지 `?q=질문` 위임 분석 |
| `commit` | GPT-6 Sol | `low` | `omp commit`의 커밋 메시지 생성 |
| `tiny` | GPT-6 Luna | `max` | 세션 제목 등 경량 백그라운드 호출 |
| `memory` | GPT-6 Sol | `medium` | 메모리 기능의 모델 호출. 현재 `memory.backend: "off"`이므로 비활성 |
| `advisor` | GPT-6 Sol | `high` | advisor를 켠 세션의 별도 검토 |
| `judge` | GPT-6 Luna | `max` | Eval의 `judge()`·`judge_batch()` 판단 호출 |

### 작동 방법

- 역할을 설정하는 것만으로 모든 모델이 실행되지는 않습니다. 해당 기능이나 에이전트를 호출해야 사용됩니다.
- 일반 작업: 새로 `omp`를 실행합니다. 특정 역할로 시작하려면 `omp --model slow` 또는 `omp --model smol`을 사용합니다. 이는 모델 선택이며 계획 모드나 advisor 활성화와는 다릅니다.
- 역할 확인·변경: 세션에서 `/model` → **Roles** 또는 `Alt+M`. CLI에서는 `omp config get modelRoles --json`으로 유효 설정을 확인합니다.
- 계획 모드: 기본 단축키 `Alt+Shift+P`로 전환합니다. 단순히 프롬프트에 “계획해줘”라고 쓰는 것과 다릅니다.
- 서브에이전트: “scout으로 구조를 조사해줘”, “reviewer로 변경을 검토해줘”, “독립 작업을 서브에이전트로 나눠줘”처럼 요청합니다. 실제 task/Eval 에이전트 호출이 발생해야 역할이 적용됩니다. `Alt+A`에서 실행 모델과 상태를 확인합니다.
- Advisor: `/advisor on` 또는 시작 시 `omp --advisor`; `/advisor status`로 확인하고 `/advisor off`로 끕니다. 역할만 지정해 두어서는 활성화되지 않으며, 활성화하면 별도 모델 호출이 발생합니다.
- 이미지 첨부를 현재 모델이 직접 보는 경우에는 `vision`으로 전환되지 않습니다. `vision`은 위임 분석 경로에서 사용됩니다.
- 커밋: 대화에서 “커밋해줘”라고 요청하는 것만으로 `commit` 역할로 자동 전환되지는 않습니다. 현재 에이전트가 직접 `git commit`을 수행하면 현재 모델을 그대로 사용합니다. `commit` 역할을 사용하는 전용 경로는 `omp commit`이며, `--model`로 별도 모델을 지정할 수도 있습니다. 이 경로를 원하면 “`omp commit`으로 커밋해줘”라고 명시합니다.

`provider/model:effort`의 접미사는 해당 역할의 추론 수준입니다. 높일수록 더 많은 추론을 허용하지만 지연·토큰 사용이 늘 수 있습니다. 현재 Luna 역할에는 사용자 선호에 따라 `max`를 적용합니다. `hideThinkingBlock: true`는 표시만 숨기며 effort를 끄지 않습니다.

**에이전트별 설정은 별개입니다.** 설치된 기본 정의는 `scout`·`sonic`에 `medium`, `task`에 `auto`를 지정합니다. 따라서 위 표의 역할 effort가 모든 서브에이전트의 최종 effort를 강제하는 것은 아닙니다. `task.agentModelOverrides`, 사용자·프로젝트 에이전트 정의, CLI·프로젝트 설정도 선택에 영향을 줍니다. 기본 `security-reviewer`는 모델 역할을 명시하지 않아 부모 모델을 상속합니다.

전역 설정은 설치 링크를 통해 적용됩니다. 확실한 기본 모델 적용은 OMP를 재시작해 새 세션에서 확인하세요. 기존 세션을 재개하면 저장된 모델 선택이 복원될 수 있습니다. `image`, `web`, `speech`, `dictation`은 별도 기능용 역할이므로 일반 GPT-6 채팅 모델로 덮어쓰지 않습니다.

근거: OMP 내장 문서 `omp://settings.md`, `omp://models.md`, `omp://task-agent-discovery.md`, `omp://advisor-watchdog.md`, `omp://cli-reference.md`. 현재 지원 모델과 effort는 `omp models find openai-codex/gpt-6 --json`으로 확인할 수 있습니다.

## 스킬 (별도 원본)

OMP에서 사용하는 Agent Skills는 별도 원본에서 관리합니다. `~/skills`의 `install.sh`는 현재 `--tool omp`를 지원하지 않으므로 이 저장소에서 임의로 실행하거나 스킬을 복사하지 않습니다. OMP가 읽는 `~/.agents/skills/` 위치에 필요한 스킬을 직접 **링크**한 후 실제 검색 여부를 확인하세요. 예: 검토를 마친 `learn` 스킬만 설치하는 경우:

```bash
git clone git@github.com:alexgim961101/skills.git ~/skills  # 이미 있으면 생략
mkdir -p ~/.agents/skills
test ! -e ~/.agents/skills/learn && test ! -L ~/.agents/skills/learn && ln -s ~/skills/learn ~/.agents/skills/learn  # 기존 항목은 유지
ls -l ~/.agents/skills/learn/SKILL.md
```

스킬마다 `SKILL.md`와 스크립트를 먼저 검토합니다. 환경의 OMP에서 이 경로가 발견되지 않으면 설치를 계속 확대하지 말고 해당 버전의 스킬 로딩 경로를 확인하세요. 기존 `~/.agents/skills` 전체를 교체하지 않습니다.
