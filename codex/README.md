# Codex 설정

이 디렉터리는 기존 전역 `~/.codex/AGENTS.md`의 지침을 보관합니다. 공통 원칙이 있어도 Pi·Claude Code 파일과 독립적으로 관리합니다. Codex가 갱신하는 `config.toml`, 인증·세션·DB는 그대로 로컬에 둡니다.

## 설치

```bash
cd ~/src/agent_setting
bash codex/install.sh
readlink ~/.codex/AGENTS.md
```

기존 파일이 저장소 원본과 동일할 때만 심볼릭 링크로 전환합니다. 다른 경우 덮어쓰지 않고 중단하므로 먼저 차이를 검토·병합합니다. 설치 스크립트는 IDE 격리 런타임이 지정할 수 있는 `CODEX_HOME`을 따르지 않고 기본 `~/.codex`에 설치합니다. 다른 사용자 경로는 `CODEX_CONFIG_DIR=/절대/경로 bash codex/install.sh`로 명시하세요. 새 세션에서 지침 적용을 확인하세요.

## 스킬 (별도 저장소)

원본: [alexgim961101/skills](https://github.com/alexgim961101/skills). 예: `learn`, `frontend-design`, `allinone-rebuild`, `panorama-heatmap-rebuild`. 필요한 항목을 선정하고 `SKILL.md`와 실행 스크립트를 검토한 뒤 설치합니다.

```bash
git clone git@github.com:alexgim961101/skills.git ~/skills  # 이미 있으면 생략
cd ~/skills
./install.sh --tool codex learn frontend-design
ls -l ~/.codex/skills/learn
```

설치 스크립트는 `~/.codex/skills/<이름>` 링크를 만듭니다. Codex의 내장 스킬·다른 원본 스킬은 지우거나 이 저장소에 복사하지 않습니다.
