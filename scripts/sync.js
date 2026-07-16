#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8')
      .split('\n')
      .forEach((line) => {
        const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
      });
  }
}
loadEnv();

if (typeof fetch === 'undefined') {
  console.error('需要 Node 18+（内置 fetch）');
  process.exit(1);
}

const TMDB_TOKEN = process.env.TMDB_ACCESS_TOKEN;
const TMDB_BASE = process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3';
const LANG = process.env.TMDB_LANG || 'zh-CN';

// 可选：配置了 GITEE_* 环境变量时，额外镜像一份到 Gitee（前端读取的是 GitHub 同源 data/anime.json）
const GITEE_TOKEN = process.env.GITEE_ACCESS_TOKEN;
const GITEE_OWNER = process.env.GITEE_OWNER;
const GITEE_REPO = process.env.GITEE_REPO;
const GITEE_BRANCH = process.env.GITEE_BRANCH || 'master';

const { matchPlatforms } = require('./platformSeed');

// 固定追踪的 TMDB 剧集数字 ID：discover 热度榜覆盖不到、但用户在「追番」里已添加（经 /api/tmdb 名称搜索加入）的剧。
// 例：遮天(224839)、眷思量(127473) 命中 ID 不在 discover 前 N 页，致主库 anime.json 缺它、
// 前端永远回退到追番里的 meta 死数据、不随 TMDB 刷新。这里显式 /tv/{id} 拉取并入主库，
// 使其集数/更新频率随每日同步自动更新（卡片走 animeDb，更新页走 update-log）。
// 自动固定追踪：从 data/watchlist.json（CI 中由 Gitee 拉取的真实追番）识别每个 tmdbId，
// 把 discover 热度榜覆盖不到、但用户在追番的剧显式拉进主库，使其随每日同步自动更新。
// 因此「搜索加入的剧」无需手动登记即可自动纳入——这是真正自动的机制，替代手写 PINNED 名单。
function collectTrackedIdsFromWatchlist() {
  const ids = new Set();
  const f = path.join(__dirname, '..', 'data', 'watchlist.json');
  if (!fs.existsSync(f)) return ids;
  try {
    const list = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!Array.isArray(list)) return ids;
    for (const w of list) {
      const id = w && w.tmdbId;
      // 只认数字 TMDB id，跳过本地假 id（如 'local-xxx'），避免脏数据污染主库
      if (typeof id === 'number' && Number.isFinite(id)) ids.add(id);
      else if (typeof id === 'string' && /^\d+$/.test(id)) ids.add(Number(id));
    }
  } catch (e) {
    console.warn('[自动固定] 读取 watchlist 失败，跳过自动固定:', e.message);
  }
  return ids;
}

// 本地补充番剧（TMDB discover 未覆盖、且也不在用户追番里的手工剧）。
// 每日同步会把 data/anime.json 整体覆盖，因此在这里追加可长期稳定存在。
// 字段与 normalize() 输出保持一致；tmdbId 用本地字符串（不与 TMDB 数字 id 冲突，前端按 String() 比较）。
// 搜索加入、但不在 discover 热度榜的剧，现由 collectTrackedIdsFromWatchlist() 自动纳入，无需在此登记。
const LOCAL_EXTRA_ANIME = [];

if (!TMDB_TOKEN) {
  console.error('缺少 TMDB_ACCESS_TOKEN');
  process.exit(1);
}

async function tmdbGet(p, params = {}) {
  const url = new URL(`${TMDB_BASE}${p}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${TMDB_TOKEN}`, Accept: 'application/json' },
  });
  const body = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, body };
}

// TMDB 无"更新频率"字段，按是否有下一集粗略推断
function inferUpdateFrequency(detail) {
  return detail.next_episode_to_air ? '周更' : '已完结';
}

function normalize(it, region) {
  const name = it.name || it.original_name || '';
  // 封面走 Cloudflare 图片代理（image.tmdb.org 国内常被墙，统一经 /api/img 回源）
  const cover = it.poster_path ? `/api/img?p=/t/p/w500${it.poster_path}` : '';
  const seasonsRaw = (it.seasons || []).filter((s) => s.season_number > 0);
  const seasonEpisodeCounts = {};
  seasonsRaw.forEach((s) => {
    if (s.episode_count) seasonEpisodeCounts[s.season_number] = s.episode_count;
  });
  const totalSeasons = it.number_of_seasons || seasonsRaw.length || 1;
  const lea = it.last_episode_to_air || null;
  const nea = it.next_episode_to_air || null;

  // 分类：按 genres 是否含动画(16) 与地区推断，避免真人国产剧/韩剧被错标为"国漫/番剧"
  const genreIds = (it.genres || []).map((g) => g.id);
  const isAnimation = genreIds.includes(GENRE_ANIMATION);
  let category, regionLabel;
  if (region === 'KR') {
    category = 'kdrama';
    regionLabel = '韩剧';
  } else if (isAnimation) {
    category = 'anime';
    regionLabel = region === 'JP' ? '日漫' : region === 'CN' ? '国漫' : '动画';
  } else if (region === 'CN') {
    category = 'cdrama';
    regionLabel = '国产剧';
  } else {
    category = 'jdrama';
    regionLabel = '日剧';
  }

  return {
    tmdbId: it.id,
    name,
    displayName: name,
    cover,
    mediaType: 'tv',
    region,
    regionLabel,
    category,
    latestSeason: lea && lea.season_number ? lea.season_number : totalSeasons,
    latestEpisode: lea && lea.episode_number ? lea.episode_number : 0,
    nextAirDate: nea && nea.air_date ? nea.air_date : '',
    updateFrequency: inferUpdateFrequency(it),
    totalSeasons,
    seasonEpisodeCounts,
    totalEpisodes: it.number_of_episodes || 0,
    overview: it.overview || '',
    firstAirDate: it.first_air_date || '',
    voteAverage: it.vote_average || 0,
    originCountry: (it.origin_country || []).join(','),
    platforms: matchPlatforms(name, it.original_name || ''),
  };
}

// 对比新旧 anime.json，把「今天有更新的番剧」按日期累加进 data/update-log.json。
// 前端「更新」标签页读取它，按本地日期展示昨日/今日更新（仅我的追番）。
// 日期用北京时间（GMT+8），与前端本地日期筛选保持一致，避免跨零点时区错位导致匹配不上。
function updateChangeLog(newArr, dataDir) {
  const logPath = path.join(dataDir, 'update-log.json');
  const animePath = path.join(dataDir, 'anime.json');
  const newMap = {};
  newArr.forEach((a) => { newMap[String(a.tmdbId)] = a; });
  // 旧数据（上一次提交的 anime.json），用于对比出集数新增/变更
  const oldMap = {};
  if (fs.existsSync(animePath)) {
    try {
      JSON.parse(fs.readFileSync(animePath, 'utf8')).forEach((a) => { oldMap[String(a.tmdbId)] = a; });
    } catch (e) { /* 忽略损坏数据 */ }
  }
  // 北京时间日期字符串 YYYY-MM-DD
  const bj = new Date(Date.now() + 8 * 3600 * 1000);
  const today = bj.toISOString().slice(0, 10);
  let log = {};
  if (fs.existsSync(logPath)) {
    try { log = JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch (e) { log = {}; }
  }
  // 与当天已记录项做并集（同一天多次同步不重复、不丢早上记录）
  const prev = Array.isArray(log[today]) ? log[today] : [];
  const byId = new Map(prev.map((x) => [String(x.tmdbId), x]));
  for (const [id, a] of Object.entries(newMap)) {
    const old = oldMap[id];
    const oldKey = old ? `${old.latestSeason}:${old.latestEpisode}` : null;
    const newKey = `${a.latestSeason}:${a.latestEpisode}`;
    if (oldKey !== newKey) {
      byId.set(id, {
        tmdbId: id,
        name: a.name,
        latestSeason: a.latestSeason,
        latestEpisode: a.latestEpisode,
      });
    }
  }
  log[today] = [...byId.values()];
  // 仅保留最近 30 天，避免无限增长
  const keys = Object.keys(log).sort();
  while (keys.length > 30) delete log[keys.shift()];
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  console.log(`📝 更新日志：${today} 记录 ${log[today].length} 部有更新`);
}

// ---- 短期兜底数据源：6789kb（聚合站，更新通常比 TMDB 快；稳定性差，随时可能失效）----
// 映射表 data/source-6789kb.json: { "<tmdbId>": <vodId 数字，如 33453> }
// 找不到 vodId（null/缺失）或抓取失败时自动回退 TMDB，不阻断主流程。
async function fetchKbEpisode(vodId) {
  if (!vodId) return null;
  const url = `https://www.6789kb.com/vod/${vodId}.html`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        'Referer': 'https://www.6789kb.com/',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    // 取页面第一个出现的「更新至X集 / 全X集」：主状态永远排在底部推荐列表之前，
    // 故首匹配即当前番本体的最新/总集数；推荐区里的其它番数字会被自然忽略。
    const m = html.match(/(?:更新至|全)\s*(\d+)\s*集/);
    if (!m) return null;
    const ep = parseInt(m[1], 10);
    return Number.isFinite(ep) && ep > 0 ? ep : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const out = [];
  const seen = new Set();
  let skippedNoName = 0;
  let skippedDetailFail = 0;
  let skippedDup = 0;

  function ingest(preset) {
    if (!preset || !preset.tmdbId || !preset.name) { skippedNoName++; return; }
    const key = `${preset.tmdbId}-tv`;
    if (seen.has(key)) { skippedDup++; return; }
    seen.add(key);
    out.push(preset);
    const epNote = preset.latestEpisode
      ? `更新至 S${preset.latestSeason}E${preset.latestEpisode}`
      : '（尚未开播）';
    console.log(`+ ${preset.name} (${preset.regionLabel}) ${epNote}`);
  }

  // 仅从追番列表中获取需追踪的 TMDB ID，不再抓取全网番剧
  const pinnedIds = collectTrackedIdsFromWatchlist();
  console.log(`[追番同步] 识别出 ${pinnedIds.size} 个需追踪的 TMDB ID`);
  if (pinnedIds.size === 0) {
    console.log('⚠️ 追番列表为空，生成空 anime.json');
  }

  // 加载 6789kb 兜底映射（短期源；缺失/无条目则全部回退 TMDB）
  let kbMap = {};
  try {
    const kbPath = path.join(__dirname, '..', 'data', 'source-6789kb.json');
    if (fs.existsSync(kbPath)) kbMap = JSON.parse(fs.readFileSync(kbPath, 'utf8'));
  } catch (e) { console.warn('⚠️ 读取 6789kb 映射失败，全部回退 TMDB:', e.message); }

  for (const id of pinnedIds) {
    const key = `${id}-tv`;
    if (seen.has(key)) continue;
    const resp = await tmdbGet(`/tv/${id}`, { language: LANG });
    if (!resp.ok) { console.warn(`[追番同步] /tv/${id} 失败: ${resp.status}，跳过`); continue; }
    const region = (resp.body.origin_country && resp.body.origin_country[0]) || '';
    const preset = normalize(resp.body, region);
    // 优先用 6789kb 的最新集数（比 TMDB 快的短期兜底）；失败/无映射/被封则回退 TMDB
    const vodId = kbMap[String(id)];
    if (vodId) {
      const kbEp = await fetchKbEpisode(vodId);
      if (kbEp) {
        const tmdbEp = preset.latestEpisode || 0;
        let merged = Math.max(tmdbEp, kbEp);
        if (preset.totalEpisodes > 0) merged = Math.min(merged, preset.totalEpisodes);
        if (merged !== preset.latestEpisode) {
          console.log(`  ↳ 6789kb 覆盖: ${preset.name} E${tmdbEp} → E${merged}`);
          preset.latestEpisode = merged;
        } else {
          console.log(`  ↳ 6789kb 一致: ${preset.name} E${merged}`);
        }
      } else {
        console.log(`  ↳ 6789kb 未取到，沿用 TMDB: ${preset.name}`);
      }
    }
    ingest(preset);
  }

  // 追加本地补充番剧
  for (const extra of LOCAL_EXTRA_ANIME) {
    const key = `${extra.tmdbId}-tv`;
    if (seen.has(key)) continue;
    if (out.some((x) => x.name === extra.name)) {
      console.log(`- [本地补充] ${extra.name} 已被覆盖，跳过`);
      continue;
    }
    seen.add(key);
    out.push(extra);
    console.log(`+ [本地补充] ${extra.name} (${extra.regionLabel})`);
  }

  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  // 先产出更新日志（读取磁盘上的旧 anime.json 做对比），再覆盖写入新 anime.json
  updateChangeLog(out, dataDir);
  const outFile = path.join(dataDir, 'anime.json');
  const jsonContent = JSON.stringify(out, null, 2);
  fs.writeFileSync(outFile, jsonContent);
  console.log(`\n✅ 已生成 ${out.length} 部番剧 → ${outFile}`);
  console.log(`   跳过: 无名称 ${skippedNoName} / 详情失败 ${skippedDetailFail} / 重复 ${skippedDup}`);

  // 可选：镜像到 Gitee（需配置 GITEE_* 环境变量；不影响 GitHub 同源读取）
  if (GITEE_TOKEN && GITEE_OWNER && GITEE_REPO) {
    try {
      await giteeUploadJson('data/anime.json', jsonContent);
    } catch (e) {
      console.error(`❌ 镜像 Gitee 失败（不影响 GitHub）: ${e.message}`);
    }
  }
}

// ---- 可选 Gitee 镜像 ----
async function giteeUploadJson(filePath, content) {
  const encPath = String(filePath).split('/').map(encodeURIComponent).join('/');
  const apiPath = `/repos/${encodeURIComponent(GITEE_OWNER)}/${encodeURIComponent(GITEE_REPO)}/contents/${encPath}`;
  const url = new URL(`https://gitee.com/api/v5${apiPath}`);
  url.searchParams.set('access_token', GITEE_TOKEN);
  const resp = await fetch(url, { method: 'GET', headers: { Accept: 'application/json', 'User-Agent': 'tmdb-sync' } });
  const existing = resp.ok ? await resp.json().catch(() => null) : null;
  const existedBefore = !!(existing && existing.sha);
  const sha = existing && existing.sha ? existing.sha : undefined;
  const uploadUrl = new URL(`https://gitee.com/api/v5${apiPath}`);
  const commitMsg = `sync: update anime.json @ ${new Date().toISOString().slice(0, 10)}`;
  const body = {
    access_token: GITEE_TOKEN,
    content: Buffer.from(content, 'utf8').toString('base64'),
    message: commitMsg,
    branch: GITEE_BRANCH,
  };
  if (sha) body.sha = sha;
  const uploadResp = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'tmdb-sync' },
    body: JSON.stringify(body),
  });
  if (!uploadResp.ok) {
    const err = await uploadResp.json().catch(() => ({}));
    throw new Error(`Gitee 上传失败: HTTP ${uploadResp.status} ${err.message || ''}`);
  }
  const result = await uploadResp.json().catch(() => ({}));
  const bytes = Buffer.byteLength(content, 'utf8');
  const kb = (bytes / 1024).toFixed(1);
  const commitSha = result.commit && result.commit.sha ? result.commit.sha.slice(0, 7) : '-';
  const op = existedBefore ? '更新已有文件' : '新建文件';
  const repoUrl = `https://gitee.com/${GITEE_OWNER}/${GITEE_REPO}`;
  const pagesUrl = process.env.GITEE_PAGES_URL || `https://${GITEE_OWNER}.gitee.io/${GITEE_REPO}/`;
  console.log('');
  console.log('────────────────────────────────────────────────────');
  console.log('✅ 已成功镜像到 Gitee');
  console.log(`   • 仓库    : ${GITEE_OWNER}/${GITEE_REPO}  (分支 ${GITEE_BRANCH})`);
  console.log(`   • 路径    : ${filePath}`);
  console.log(`   • 操作    : ${op}`);
  console.log(`   • 大小    : ${kb} KB  (${bytes} 字节)`);
  console.log(`   • 提交    : ${commitSha}`);
  console.log(`   • 仓库地址: ${repoUrl}`);
  console.log(`   • Pages   : ${pagesUrl}`);
  console.log('────────────────────────────────────────────────────');
  return { ok: true, commitSha, op, bytes };
}

main().catch((e) => { console.error(e); process.exit(1); });
