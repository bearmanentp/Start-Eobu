#!/usr/bin/env sh
set -eu
if ! command -v ollama >/dev/null 2>&1; then
  case "$(uname -s)" in
    Darwin) echo '설치 명령: brew install ollama' ;;
    *) echo '설치 명령: curl -fsSL https://ollama.com/install.sh | sh' ;;
  esac
  exit 1
fi
export OLLAMA_ORIGINS='*'
if ! ollama list >/dev/null 2>&1; then
  ollama serve >"${TMPDIR:-/tmp}/start-eobu-ollama.log" 2>&1 &
  count=0
  until ollama list >/dev/null 2>&1; do
    count=$((count+1))
    [ "$count" -lt 30 ] || exit 1
    sleep 1
  done
fi
ollama pull exaone3.5:7.8b
ollama pull qwen3:8b
echo '준비되었습니다. 스타어부를 새로 고쳐 주세요.'

