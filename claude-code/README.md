# Claude Code 설정

이 디렉터리는 기존 전역 `~/.claude/CLAUDE.md`의 지침을 보관합니다. Pi·Codex 지침과 일부 원칙은 같지만 서로 다른 파일로 관리합니다. `settings.json`, `settings.local.json`, 인증·플러그인·세션은 Claude Code가 갱신할 수 있으므로 링크/추적하지 않습니다.

## 설치

```bash
cd ~/src/agent_setting
bash claude-code/install.sh
readlink ~/.claude/CLAUDE.md
```

기존 파일의 내용이 저장소 원본과 같을 때만 심볼릭 링크로 전환합니다. 다르면 중단하므로 차이를 검토해 이 디렉터리에 반영하거나 기존 파일을 유지하세요. 수정 후에는 Claude Code를 재시작해 반영을 확인합니다.

## 스킬 (별도 저장소)

원본: [alexgim961101/skills](https://github.com/alexgim961101/skills). 예: `learn`, `frontend-design`, `allinone-rebuild`, `panorama-heatmap-rebuild`. 스킬 본문을 이 설정 저장소에 넣지 않습니다. 필요에 따라 목록을 선택하고 `SKILL.md`와 실행 스크립트를 먼저 검토합니다.

```bash
git clone git@github.com:alexgim961101/skills.git ~/skills  # 이미 있으면 생략
cd ~/skills
./install.sh --tool claude learn frontend-design
ls -l ~/.claude/skills/learn
```

설치 스크립트는 `~/.claude/skills/<이름>` 링크를 만듭니다. 다른 원본(`~/.agents/skills` 등)의 스킬은 검토 후 해당 경로에 별도 설치하세요. 기존 스킬 디렉터리를 통째로 교체하지 않습니다.
