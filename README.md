# anime-coze

把「追番不迷路」小程序的核心逻辑，迁移到 **GitHub + Coze** 零服务器架构。

---

## 背景

原有项目 `miniprogram-1` 是一套完整的番剧追踪小程序（云函数 + 云数据库 + 微信订阅消息）。因个人主体不能上线番剧相关小程序，现将其后端逻辑剥离，改用免费服务重新部署。

原有项目可复用代码：

| 文件 | 用途 | 新架构中角色 |
|------|------|-------------|
| `scripts/tmdb-sync/sync.js` | TMDB 数据抓取 -> Gitee 私有仓库 | 改为 GitHub Actions 定时任务，输出到公开 repo |
| `cloudfunctions/presetAnime/platformSeed.js` | 中文番名 -> 播放平台映射 | 直接复制，GitHub Actions 中引入使用 |
| `cloudfunctions/presetAnime/index.js` 中 normalize/tmdbToPreset | TMDB 数据归一化 | 合并进 GitHub Actions 脚本 |
| `cloudfunctions/checkSchedule/index.js` | 定时扫描更新 -> 推送通知 | 逻辑参考，移植到 Coze 工作流 |
| `utils/animeCalc.js` | 剩余集数计算、季度标签 | 移植到 Coze 代码节点 |

---

## 架构

```
┌──────────────────────────────────────────────────────────────────┐
│  GitHub Actions (美国 runner)                                    │
│                                                                  │
│  ┌─ fetch-tmdb.yml ──────────────────────────────────────────┐   │
│  │  每天 8:00 / 20:00 触发                                    │   │
│  │  ① 调 TMDB API → /discover/tv + /tv/{id}                  │   │
│  │  ② normalize + platformSeed 匹配平台                        │   │
│  │  ③ 封面下载 → Gitee API 上传 covers/                        │   │
│  │  ④ anime.json → Gitee API 上传                              │   │
│  │  输出: gitee.com/.../raw/master/anime.json (全量番剧库)     │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ notify.yml ─────────────────────────────────────────────┐   │
│  │  每天 9:00 触发                                           │   │
│  │  ① Gitee API 读取 anime.json + watchlist.json            │   │
│  │  ② 遍历关注列表: banked = latestEpisode - watchedEpisode  │   │
│  │     if banked >= threshold → 加入推送队列                  │   │
│  │  ③ 发送通知 (Telegram / 飞书 / 钉钉)                     │   │
│  │  ④ 更新 watchlist.json → 推回 Gitee                      │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────┬────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│  HTML 配置页 (index.html)                                        │
│  · 手机浏览器打开 / Gitee Pages 托管                             │
│  · 浏览番剧库 → 添加到关注列表 → 更新进度                       │
│  · 保存到 Gitee (watchlist.json)                                │
│  · 输入: gitee.com/.../raw/master/anime.json                    │
│  · 输出: gitee.com/.../raw/master/watchlist.json (用户关注列表) │
└──────────────────────────────────────────────────────────────────┘
```

所有数据存储在 Gitee 私有仓库，国内网络可达。无需 Coze，零服务器。`

---

## 数据模型 (anime.json 每条记录)

来自原有项目的 `normalize()` 函数输出：

```json
{
  "tmdbId": 12345,
  "name": "葬送的芙莉莲",
  "displayName": "葬送的芙莉莲",
  "cover": "https://image.tmdb.org/t/p/w500/xxx.jpg",
  "mediaType": "tv",
  "region": "JP",
  "regionLabel": "日漫",
  "latestSeason": 1,
  "latestEpisode": 24,
  "nextAirDate": "",
  "totalSeasons": 1,
  "seasonEpisodeCounts": { "1": 28 },
  "totalEpisodes": 28,
  "overview": "...",
  "firstAirDate": "2023-09-29",
  "voteAverage": 8.8,
  "platforms": [
    { "platform": "bilibili", "url": "" }
  ]
}
```

---

## 用户关注列表 (存 Coze 变量)

每个用户/会话自己有独立的关注列表：

```json
[
  {
    "tmdbId": 12345,
    "name": "葬送的芙莉莲",
    "watchedSeason": 1,
    "watchedEpisode": 20,
    "threshold": 3,
    "notifyEnabled": true,
    "lastNotifiedAt": "2026-07-11T09:00:00Z",
    "lastNotifiedEpisode": 22
  }
]
```

---

## 通知文案

来自原有项目的 checkSchedule，直接复用：

- **标题**: `番剧更新啦，速速追起`
- **内容**: `番名-平台` `/` `最新第 X 集，存了 Y 集` `/` `你追到第 Z 集`
- **备注**: 剩余次数 <= 3 时提示补充

---

## 目录结构

```
anime-coze/
├── README.md                  # 本文件
├── .github/
│   └── workflows/
│       └── fetch-tmdb.yml     # GitHub Actions: 定时拉 TMDB → 更新 anime.json
├── scripts/
│   ├── sync.js                # 拉 TMDB → 生成 anime.json + 封面上传 Gitee
│   └── platformSeed.js        # 番名→播放平台 种子映射
├── data/
│   ├── anime.json             # GitHub Actions 输出 (全量番剧库，封面走 Gitee raw)
│   └── tables/                # 本地数据表（参考原项目 DB 结构，含示例数据）
│       ├── anime.json         # 番剧主数据（用户已添加的番剧）
│       ├── user_anime.json    # 用户追番记录
│       ├── preset_anime.json  # TMDB 同步预设库（同 anime.json）
│       ├── user_settings.json # 用户全局设置
│       ├── update_confirmations.json  # 更新确认记录
│       ├── notes.json         # 用户笔记/精彩瞬间
│       ├── admin_users.json   # 管理员白名单
│       ├── feedback.json      # 用户反馈
│       ├── sync_log.json      # 同步日志
│       ├── app_config.json    # 应用配置
│       └── users.json         # 用户信息
├── .github/
│   └── workflows/
│       ├── fetch-tmdb.yml     # 定时拉 TMDB → 推送 Gitee
│       └── notify.yml         # 定时检查更新 → 发送通知
├── scripts/
│   ├── sync.js                # TMDB 抓取 + Gitee 推送
│   ├── check-notify.js        # 更新检查 + 通知发送
│   └── platformSeed.js        # 番名→平台映射
├── data/
│   ├── anime.json             # 番剧库（GitHub Actions 推送到 Gitee）
│   └── tables/                # 本地数据表参考
├── index.html                 # 追番配置页（手机浏览器/Gitee Pages）
└── .gitignore
```

---

## 工作流说明

### 1. fetch-tmdb.yml — 定时拉取 TMDB 数据

- **触发**: 每天 8:00 / 20:00 (UTC+8)
- **Runner**: ubuntu-latest (美国节点，直连 TMDB)
- **步骤**:
  1. 调 TMDB `/discover/tv` 拉 JP+CN 动画列表
  2. 调 `/tv/{id}` 获取每部番的 latestEpisode
  3. `normalize()` → 匹配播放平台 (platformSeed)
  4. 下载封面 → Gitee API 上传 `covers/<tmdbId>.jpg`
  5. 生成 `anime.json` → Gitee API 推送
- **输出**: `https://gitee.com/.../raw/master/anime.json`

### 2. notify.yml — 定时检查更新 + 通知推送

- **触发**: 每天 9:00 (UTC+8)
- **步骤**:
  1. Gitee API 读取 `anime.json` + `watchlist.json`
  2. 遍历关注列表，判断 `banked = latestEpisode - watchedEpisode`
  3. 当 `banked >= threshold` 且 `lastNotifiedEpisode` 未记录过 → 加入推送队列
  4. 发送通知 (Telegram / 飞书 / 钉钉，按配置自动选择)
  5. 更新 `watchlist.json` 中的 `lastNotifiedEpisode` → 推回 Gitee

### 3. 配置管理 (index.html)

手机浏览器打开 `index.html`（或 Gitee Pages 托管）：

- **浏览** — 加载番剧库，搜索/筛选，添加到关注列表
- **我的追番** — 更新看到第几集、阈值、通知开关
- **保存** — 通过 Gitee API 将关注列表写入 `watchlist.json`

---

## 与原项目差异

| 维度 | 原项目 | 新架构 |
|------|--------|--------|
| 服务器 | 腾讯云 CloudBase (付费) | 无服务器 (全免费) |
| 推送 | 微信订阅消息 (限25次/用户) | Telegram/飞书/钉钉 (无限) |
| 前端 | 微信小程序 (个人不可发布) | HTML 配置页 (手机浏览器) |
| 数据存储 | 云数据库 | Gitee 私有仓库 (JSON) |
| 配置管理 | 小程序页面 | HTML 页面 → Gitee API |
| 番剧范围 | 仅动画 (genre=16) | 可扩展到所有电视剧/综艺 |
| 费用 | 云函数 + 云存储 | 0 元 |
