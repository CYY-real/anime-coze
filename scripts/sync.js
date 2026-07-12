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
const REGIONS = (process.env.TMDB_REGIONS || 'JP,CN,KR').split(',').filter(Boolean);
const GENRE_ANIMATION = 16;
const PAGES = parseInt(process.env.TMDB_PAGES) || 2;

// 可选：配置了 GITEE_* 环境变量时，额外镜像一份到 Gitee（前端读取的是 GitHub 同源 data/anime.json）
const GITEE_TOKEN = process.env.GITEE_ACCESS_TOKEN;
const GITEE_OWNER = process.env.GITEE_OWNER;
const GITEE_REPO = process.env.GITEE_REPO;
const GITEE_BRANCH = process.env.GITEE_BRANCH || 'master';

const { matchPlatforms } = require('./platformSeed');

// 本地补充番剧（TMDB discover 未覆盖 / 用户指定补充）。
// 每日同步会把 data/anime.json 整体覆盖，因此在这里追加，保证眷思量等手工剧长期稳定存在。
// 字段与 normalize() 输出保持一致；tmdbId 用本地字符串（不与 TMDB 数字 id 冲突，前端按 String() 比较）。
const LOCAL_EXTRA_ANIME = [
  {
    tmdbId: 'local-juansiliang',
    name: '眷思量',
    displayName: '眷思量',
    cover: '',
    mediaType: 'tv',
    region: 'CN',
    regionLabel: '国漫',
    category: 'anime',
    latestSeason: 2,
    latestEpisode: 13,
    nextAirDate: '',
    updateFrequency: '已完结',
    totalSeasons: 2,
    seasonEpisodeCounts: { '1': 15, '2': 13 },
    totalEpisodes: 28,
    overview:
      '国产3D古风动画。以异界仙岛「思量岛」为背景，讲述神族少年镜玄与凡人少女屠丽在岛上探寻真相、挣脱命运枷锁的成长故事。第一季2021年腾讯视频独播（15集），第二季《眷思量之风烟迭起》2024年上线（13集）。',
    firstAirDate: '2021-06-14',
    voteAverage: 8.6,
    originCountry: 'CN',
    platforms: [{ platform: 'tencent', name: '腾讯视频', url: '', isPrimary: true }],
  },
];

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
  const cover = it.poster_path ? `https://image.tmdb.org/t/p/w500${it.poster_path}` : '';
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

async function main() {
  const out = [];
  const seen = new Set();          // tmdbId 去重
  const nameIndex = new Map();     // name -> 在 out 中的下标，用于同名保留更完整的一条
  let skippedNoName = 0;
  let skippedDetailFail = 0;
  let skippedDup = 0;

  // 合并单条（含同名去重：保留 latestEpisode 更高的一条）
  function ingest(preset) {
    if (!preset || !preset.tmdbId || !preset.name) { skippedNoName++; return; }
    const key = `${preset.tmdbId}-tv`;
    if (seen.has(key)) { skippedDup++; return; }
    const nm = preset.name;
    if (nameIndex.has(nm)) {
      const idx = nameIndex.get(nm);
      if (preset.latestEpisode > out[idx].latestEpisode) {
        out[idx] = preset;   // 用更完整的替换已存的同名条目
        seen.add(key);
      }
      skippedDup++;
      return;
    }
    seen.add(key);
    nameIndex.set(nm, out.length);
    out.push(preset);
    const epNote = preset.latestEpisode
      ? `更新至 S${preset.latestSeason}E${preset.latestEpisode}`
      : '（尚未开播）';
    console.log(`+ ${preset.name} (${preset.regionLabel}) ${epNote}`);
  }

  // 双通道抓取：animationOnly=true 保留日漫/国漫完整覆盖；false 全量补充真人国产剧/韩剧/日剧
  async function fetchRegion(region, animationOnly) {
    for (let p = 1; p <= PAGES; p++) {
      const params = { language: LANG, page: p, with_origin_country: region, sort_by: 'popularity.desc' };
      if (animationOnly) params.with_genres = GENRE_ANIMATION;
      const resp = await tmdbGet('/discover/tv', params);
      if (!resp.ok) {
        console.warn(`[discover] ${region}${animationOnly ? '(动画)' : '(全量)'} page ${p} 失败: ${resp.status}`);
        continue;
      }
      const items = (resp.body && resp.body.results) || [];
      for (const it of items) {
        if (!it || !it.id) continue;
        const detailResp = await tmdbGet(`/tv/${it.id}`, { language: LANG });
        if (!detailResp.ok) { skippedDetailFail++; continue; }
        ingest(normalize(detailResp.body, region));
      }
    }
  }

  for (const region of REGIONS) {
    await fetchRegion(region, true);   // 动画通道：保日漫/国漫覆盖
    await fetchRegion(region, false);  // 全量通道：补真人国产剧/韩剧/日剧
  }

  // 追加本地补充番剧（避免被 TMDB 每日整体覆盖）
  for (const extra of LOCAL_EXTRA_ANIME) {
    const key = `${extra.tmdbId}-tv`;
    if (seen.has(key)) continue;
    // 若 TMDB 抓取已包含同名剧，优先用 TMDB 数据，跳过本地补充以免重复
    if (out.some((x) => x.name === extra.name)) {
      console.log(`- [本地补充] ${extra.name} 已被 TMDB 覆盖，跳过`);
      continue;
    }
    seen.add(key);
    out.push(extra);
    console.log(`+ [本地补充] ${extra.name} (${extra.regionLabel})`);
  }

  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
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
  const sha = existing && existing.sha ? existing.sha : undefined;
  const uploadUrl = new URL(`https://gitee.com/api/v5${apiPath}`);
  const body = {
    access_token: GITEE_TOKEN,
    content: Buffer.from(content, 'utf8').toString('base64'),
    message: `sync: update anime.json @ ${new Date().toISOString().slice(0, 10)}`,
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
  console.log(`📤 已镜像到 Gitee (${GITEE_OWNER}/${GITEE_REPO})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
