#!/usr/bin/env bash
# 扫描 images/ 下的子目录，生成接口使用的 images/manifest.json
# 新增 / 删除图片后执行一次：./scripts/gen-manifest.sh
set -euo pipefail
cd "$(dirname "$0")/.."

entries=""
for dir in images/*/; do
  [ -d "$dir" ] || continue

  name=$(basename "$dir")
  count=$(find "$dir" -maxdepth 1 -type f -name '*.webp' | wc -l | tr -d ' ')

  [ "$count" -gt 0 ] || continue

  item="  \"$name\": $count"
  if [ -z "$entries" ]; then
    entries="$item"
  else
    entries="$entries,
$item"
  fi
done

printf '{\n%s\n}\n' "$entries" > images/manifest.json
echo "已生成 images/manifest.json:"
cat images/manifest.json
