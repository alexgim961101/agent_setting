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

## 스킬 (별도 원본)

OMP에서 사용하는 Agent Skills는 별도 원본에서 관리합니다. `~/skills`의 `install.sh`는 현재 `--tool omp`를 지원하지 않으므로 이 저장소에서 임의로 실행하거나 스킬을 복사하지 않습니다. OMP가 읽는 `~/.agents/skills/` 위치에 필요한 스킬을 직접 **링크**한 후 실제 검색 여부를 확인하세요. 예: 검토를 마친 `learn` 스킬만 설치하는 경우:

```bash
git clone git@github.com:alexgim961101/skills.git ~/skills  # 이미 있으면 생략
mkdir -p ~/.agents/skills
test ! -e ~/.agents/skills/learn && test ! -L ~/.agents/skills/learn && ln -s ~/skills/learn ~/.agents/skills/learn  # 기존 항목은 유지
ls -l ~/.agents/skills/learn/SKILL.md
```

스킬마다 `SKILL.md`와 스크립트를 먼저 검토합니다. 환경의 OMP에서 이 경로가 발견되지 않으면 설치를 계속 확대하지 말고 해당 버전의 스킬 로딩 경로를 확인하세요. 기존 `~/.agents/skills` 전체를 교체하지 않습니다.
