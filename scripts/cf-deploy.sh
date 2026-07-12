#!/usr/bin/env bash
# 部署 index.html 到 Cloudflare Pages (anime-coze-cyy)
# 依赖：scripts/.cf.json 含 { "apiToken": "...", "accountId": "..." }
# 用法：bash scripts/cf-deploy.sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CF="$ROOT/scripts/.cf.json"
PY=/Users/chenying/.workbuddy/binaries/python/versions/3.13.12/bin/python3
WRANGLER=/Users/chenying/.workbuddy/binaries/node/workspace/node_modules/.bin/wrangler

if [ ! -f "$CF" ]; then echo "❌ 缺少 $CF"; exit 1; fi
if [ ! -x "$WRANGLER" ]; then echo "❌ 未找到 wrangler，请先安装"; exit 1; fi

TOKEN=$("$PY" -c "import json,sys;print(json.load(open('$CF')).get('apiToken',''))")
ACCOUNT=$("$PY" -c "import json,sys;print(json.load(open('$CF')).get('accountId',''))")
PLACEHOLDER="在此粘贴你的 Cloudflare"
if [ -z "$TOKEN" ] || [ "$TOKEN" = "$PLACEHOLDER" ] || [ -z "$ACCOUNT" ]; then
  echo "❌ 请在 $CF 填入 apiToken 和 accountId"; exit 1
fi

# 只部署 index.html + data/ 到临时目录，避免把 .git/.workbuddy 等传上去
# 番剧库 data/anime.json 随站点一起部署（同源 ./data/anime.json），浏览器无需直连 GitHub，国内可达
DIST=/tmp/cf-dist
rm -rf "$DIST" && mkdir -p "$DIST"
cp "$ROOT/index.html" "$DIST/index.html"
cp -r "$ROOT/data" "$DIST/data"
if [ -d "$ROOT/functions" ]; then cp -r "$ROOT/functions" "$DIST/functions"; fi
# PWA 图标 & manifest（iOS 桌面图标 / Android 主屏入口）
for f in apple-touch-icon.png favicon.png icon-192.png icon-512.png manifest.webmanifest; do
  [ -f "$ROOT/$f" ] && cp "$ROOT/$f" "$DIST/$f"
done

export CLOUDFLARE_API_TOKEN="$TOKEN"
export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT"
export CI=1
export WRANGLER_SEND_METRICS=false

echo "=== 部署 index.html 到 Cloudflare Pages: anime-coze-cyy ==="
"$WRANGLER" pages deploy "$DIST" --project-name=anime-coze-cyy --branch main --commit-dirty
echo ""
echo "✅ 部署已提交，稍后访问 https://anime-coze-cyy.pages.dev （约 1-3 分钟生效）"
