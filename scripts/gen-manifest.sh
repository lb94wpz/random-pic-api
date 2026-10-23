#!/usr/bin/env bash
# 扫描 images/ 下的子目录，生成 functions/_manifest.js
# 接口只认这一份清单：目录 -> 文件名列表（构建时打包进函数）
# 新增 / 删除图片后执行一次：./scripts/gen-manifest.sh
set -euo pipefail
cd "$(dirname "$0")/.."

body=""
for dir in images/*/; do
  [ -d "$dir" ] || continue

  name=$(basename "$dir")
  mapfile -t files < <(find "$dir" -maxdepth 1 -type f \( -name '*.webp' -o -name '*.mp4' \) -printf '%f\n' | sort)

  total=${#files[@]}
  [ "$total" -gt 0 ] || continue

  items=""
  i=0
  for f in "${files[@]}"; do
    i=$((i + 1))
    item="    \"$f\""
    if [ "$i" -lt "$total" ]; then item="$item,"; fi
    items="$items$item
"
  done

  block="  \"$name\": [
${items%$'\n'}
  ]"

  if [ -z "$body" ]; then
    body="$block"
  else
    body="$body,
$block"
  fi
done

{
  echo '// 由 scripts/gen-manifest.sh 自动生成，请勿手改'
  echo 'export default {'
  printf '%s\n' "$body"
  echo '};'
} > functions/_manifest.js

echo '已生成 functions/_manifest.js:'
for dir in images/*/; do
  [ -d "$dir" ] || continue

  name=$(basename "$dir")
  total=$(find "$dir" -maxdepth 1 -type f \( -name '*.webp' -o -name '*.mp4' \) | wc -l | tr -d ' ')

  # 首页卡片按 images/folders.json 渲染，漏配的目录不会显示
  if grep -q "\"$name\"" images/folders.json 2>/dev/null; then
    echo "  $name: $total 张"
  else
    echo "  $name: $total 张  ← 未在 images/folders.json 中配置，首页不会显示"
  fi
done
