#!/usr/bin/env bash
# 启动本地预览：./scripts/dev.sh [端口]
set -euo pipefail
cd "$(dirname "$0")/.."
export PORT="${1:-${PORT:-8787}}"
exec node scripts/dev.mjs
