#!/usr/bin/env bash
# Explicitly invoked by the owner. Creates ONE PRIVATE repository; never overwrites one.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v gh >/dev/null || { echo 'GitHub CLI(gh)를 설치하고 gh auth login을 먼저 실행해 주세요.'; exit 1; }
gh auth status >/dev/null 2>&1 || { echo 'gh auth login으로 본인 계정을 연결해 주세요.'; exit 1; }
OWNER="$(gh api user --jq .login)"
NAME='maum-lab'
if gh repo view "$OWNER/$NAME" >/dev/null 2>&1; then
  echo "$OWNER/$NAME 저장소가 이미 있습니다. 변경하거나 덮어쓰지 않았습니다."
  exit 1
fi
if [ ! -d .git ]; then
  git init -b main
fi
if git remote get-url origin >/dev/null 2>&1; then
  echo 'origin이 이미 설정되어 있습니다. 기존 원격 저장소는 변경하지 않았습니다.'
  exit 1
fi
git var GIT_AUTHOR_IDENT >/dev/null 2>&1 || { echo 'git config user.name과 user.email을 본인 정보로 설정해 주세요.'; exit 1; }
if [ -n "$(git status --porcelain)" ]; then
  git add .
  git commit -m 'feat: scaffold Maum Lab dialogue simulator'
fi
gh repo create "$OWNER/$NAME" --private --source=. --remote=origin --push \
  --description '마음연습실 — 가상 아동과 함께하는 이해·대화 연습 시뮬레이터'
echo "완료: $OWNER/$NAME (private)"
