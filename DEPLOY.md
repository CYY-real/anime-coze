# 追番备忘录 · 部署说明

> 线上地址：https://anime-coze-cyy.pages.dev
> 代码仓库：GitHub `CYY-real/anime-coze`（main 分支）
> 部署目标：Cloudflare Pages 项目 `anime-coze-cyy`

---

## 1. 部署架构

本项目 **不通过本地 `wrangler` 登录部署**，而是由 GitHub Actions 工作流统一负责：

```
本地改代码
   │  push 到 main 分支（命中 paths）
   ▼
.github/workflows/fetch-tmdb.yml   （名称：Daily Sync & Deploy）
   │  1. Checkout
   │  2. 从 Gitee 拉用户配置 → data/watchlist.json
   │  3. 运行 TMDB 同步 → data/anime.json 等
   │  4. 把数据 commit 回 main
   │  5. wrangler pages deploy dist-cf → Cloudflare Pages
   ▼
Cloudflare Pages 项目 anime-coze-cyy  ← https://anime-coze-cyy.pages.dev
```

也就是说：**你只需把代码推到 GitHub，剩下的部署由 Actions 自动完成。**

---

## 2. 工作流触发方式（共 3 种）

| 触发方式 | 配置 | 说明 |
|---------|------|------|
| push | `branches: [main]` + `paths` 限定 | 改了相关文件并 push 到 main 即自动部署 |
| schedule | 每天 UTC 22:00（北京 06:00）、UTC 04:00（北京 12:00） | 定时跑 TMDB 同步 + 部署 |
| workflow_dispatch | GitHub 网页手动点 | 随时手动触发一次完整部署 |

`push` 的 `paths` 限制（只有改这些文件才会触发）：

```
index.html
data/**
functions/**
scripts/**
.github/workflows/fetch-tmdb.yml
```

> ⚠️ 若你改了 **不在上述列表** 的文件（例如 `wrangler.toml`、新增的 `.md` 文档），
> push 不会触发部署。这种情况请去 GitHub → Actions → *Daily Sync & Deploy* → **Run workflow** 手动强制部署。

---

## 3. 本地如何部署

### 方式 A：用 `scripts/deploy.js`（推荐，走 API，不改 git 历史）

准备一个对仓库有 `contents:write` 权限的 GitHub Token（Fine-grained 或 Classic 均可）。

```bash
# 预览差异（只读，不写入）
node scripts/deploy.js --dry-run

# 真正部署（环境变量传 token）
GH_DEPLOY_TOKEN=xxx node scripts/deploy.js
```

或者用本地文件存 token（已被 `.gitignore` 忽略，不会提交）：

```bash
echo '{"token":"xxx"}' > scripts/.deploy.json
node scripts/deploy.js
```

`deploy.js` 只通过 GitHub **Contents API 把 `index.html` PUT 到仓库**；因为 `index.html`
在 `push` 的 `paths` 列表里，这一步等价于一次 push，会自动触发工作流把整个站点（含 `data/`、`functions/`）重新部署。

### 方式 B：直接 git push

本地用 git 提交并 push 到 main，只要命中 `paths` 即自动部署。

---

## 4. 工作流所需的 GitHub Secrets

仓库 `Settings → Secrets and variables → Actions` 中需配置：

| Secret | 用途 |
|--------|------|
| `GITEE_TOKEN` | 从 Gitee 拉取用户配置（watchlist.json） |
| `TMDB_ACCESS_TOKEN` | TMDB API 同步番剧库 |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Pages 部署（需 Pages 编辑权限） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID |

可选（有默认值，通常无需改）：`GITEE_OWNER`、`GITEE_REPO`、`GITEE_BRANCH`。

---

## 5. 部署产物说明

工作流在部署前会把以下内容打包进 `dist-cf/` 再 `wrangler pages deploy`：

```
dist-cf/
├── index.html            # 前端页面（核心）
├── data/                 # 番剧库、追番列表、更新日志等
└── functions/            # Cloudflare Pages Functions（如 /api/proxy）
```

---

## 6. 踩坑 / 排障记录（Troubleshooting）

1. **push 了代码但线上没更新**
   工作流以前只配了 `schedule` + `workflow_dispatch`，**没有 `push` 触发**，
   所以单纯 push 不会部署。现已加入 `push` + `paths` 触发。
   若仍不更新，先检查改的文件是否在 `paths` 列表内，否则手动 Run workflow。

2. **“改了 CSS 还是不生效” —— 真凶往往是 HTML 结构**
   曾出现更新列表卡片横向并排：`buildUpdateCard` 返回的 HTML **缺失外层 `</div>` 闭合标签**，
   浏览器把第二个卡片修正为第一个卡片的子元素，导致两个 flex 卡片被塞进同一个容器里横排。
   遇到“改 CSS 不生效”时，**先用浏览器开发者工具看 DOM 结构和 computed style**，
   别一直纠结构式本身。

3. **验证线上是否真的更新**
   用**浏览器隐身窗口**打开（绕过 CDN 缓存），或直接抓取线上 HTML/CSS 与本地比对，
   确认差异已上线，而不是只看本地文件。

4. **强制重新部署**
   GitHub 仓库 → Actions → *Daily Sync & Deploy* → **Run workflow**。
```

