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
const REGIONS = (process.env.TMDB_REGIONS || 'JP,CN').split(',').filter(Boolean);
const GENRE_ANIMATION = 16;
const PAGES = parseInt(process.env.TMDB_PAGES) || 2;

const GITEE_TOKEN = process.env.GITEE_ACCESS_TOKEN;
const GITEE_OWNER = process.env.GITEE_OWNER;
const GITEE_REPO = process.env.GITEE_REPO;
const GITEE_BRANCH = process.env.GITEE_BRANCH || 'master';
const COVER_DIR = process.env.COVER_DIR || 'covers';

const { matchPlatforms } = require('./platformSeed');

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

function normalize(it, region, giteeCoverUrl) {
  const name = it.name || it.original_name || '';
  const cover = giteeCoverUrl || (it.poster_path ? `https://image.tmdb.org/t/p/w500${it.poster_path}` : '');
  const seasonsRaw = (it.seasons || []).filter((s) => s.season_number > 0);
  const seasonEpisodeCounts = {};
  seasonsRaw.forEach((s) => {
    if (s.episode_count) seasonEpisodeCounts[s.season_number] = s.episode_count;
  });
  const totalSeasons = it.number_of_seasons || seasonsRaw.length || 1;
  const lea = it.last_episode_to_air || null;
  const nea = it.next_episode_to_air || null;
  return {
    tmdbId: it.id,
    name,
    displayName: name,
    cover,
    mediaType: 'tv',
    region,
    regionLabel: region === 'JP' ? '日漫' : region === 'CN' ? '国漫' : region,
    latestSeason: lea && lea.season_number ? lea.season_number : totalSeasons,
    latestEpisode: lea && lea.episode_number ? lea.episode_number : 0,
    nextAirDate: nea && nea.air_date ? nea.air_date : '',
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

// ---- Gitee API: 上传封面二进制 ----
async function giteeCoverUpload(relPath, buf) {
  const encPath = String(relPath).split('/').map(encodeURIComponent).join('/');
  const apiPath = `/repos/${encodeURIComponent(GITEE_OWNER)}/${encodeURIComponent(GITEE_REPO)}/contents/${encPath}`;
  const url = new URL(`https://gitee.com/api/v5${apiPath}`);
  url.searchParams.set('access_token', GITEE_TOKEN);

  const resp = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', 'User-Agent': 'tmdb-sync' },
  });
  const existing = resp.ok ? await resp.json().catch(() => null) : null;
  const sha = existing && existing.sha ? existing.sha : undefined;

  const uploadUrl = new URL(`https://gitee.com/api/v5${apiPath}`);
  uploadUrl.searchParams.set('access_token', GITEE_TOKEN);
  const body = {
    content: buf.toString('base64'),
    message: `cover: ${relPath}`,
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
    throw new Error(`Gitee 封面上传失败: HTTP ${uploadResp.status} ${err.message || ''}`);
  }
}

// ---- Gitee API: 上传 JSON 文件（anime.json）----
async function giteeUploadJson(filePath, content) {
  const encPath = String(filePath).split('/').map(encodeURIComponent).join('/');
  const apiPath = `/repos/${encodeURIComponent(GITEE_OWNER)}/${encodeURIComponent(GITEE_REPO)}/contents/${encPath}`;
  const url = new URL(`https://gitee.com/api/v5${apiPath}`);
  url.searchParams.set('access_token', GITEE_TOKEN);

  const resp = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', 'User-Agent': 'tmdb-sync' },
  });
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
    throw new Error(`Gitee anime.json 上传失败: HTTP ${uploadResp.status} ${err.message || ''}`);
  }
  console.log(`📤 anime.json 已推送到 Gitee (${GITEE_OWNER}/${GITEE_REPO})`);
}

async function downloadCover(posterPath) {
  if (!posterPath) return null;
  const url = `https://image.tmdb.org/t/p/w500${posterPath}`;
  try {
    const resp = await fetch(url, { headers: { 'User-Agent': 'tmdb-sync' } });
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length < 200) return null;
    return buf;
  } catch (e) {
    return null;
  }
}

async function main() {
  const out = [];
  const seen = new Set();
  let skippedNoName = 0;
  let skippedDetailFail = 0;
  let skippedDup = 0;
  let coverUploaded = 0;
  let coverFailed = 0;

  const giteeAvailable = GITEE_TOKEN && GITEE_OWNER && GITEE_REPO;

  for (const region of REGIONS) {
    for (let p = 1; p <= PAGES; p++) {
      const resp = await tmdbGet('/discover/tv', {
        language: LANG,
        page: p,
        with_genres: GENRE_ANIMATION,
        with_origin_country: region,
        sort_by: 'popularity.desc',
      });
      if (!resp.ok) {
        console.warn(`[discover] ${region} page ${p} 失败: ${resp.status}`);
        continue;
      }
      const items = (resp.body && resp.body.results) || [];
      for (const it of items) {
        if (!it || !it.id) continue;
        const detailResp = await tmdbGet(`/tv/${it.id}`, { language: LANG });
        if (!detailResp.ok) {
          skippedDetailFail++;
          continue;
        }
        const detail = detailResp.body;

        // 封面：下载后上传到 Gitee，cover 指向 Gitee raw URL
        let giteeCoverUrl = '';
        if (giteeAvailable && detail.poster_path) {
          const buf = await downloadCover(detail.poster_path);
          if (buf) {
            const coverPath = `${COVER_DIR}/${detail.id}.jpg`;
            try {
              await giteeCoverUpload(coverPath, buf);
              giteeCoverUrl = `https://gitee.com/${GITEE_OWNER}/${GITEE_REPO}/raw/${GITEE_BRANCH}/${coverPath}`;
              coverUploaded++;
            } catch (e) {
              console.warn(`  封面上传失败 [${detail.name || detail.id}]: ${e.message}`);
              coverFailed++;
            }
          }
        }

        const preset = normalize(detail, region, giteeCoverUrl);
        if (!preset.name) { skippedNoName++; continue; }
        const key = `${preset.tmdbId}-tv`;
        if (seen.has(key)) { skippedDup++; continue; }
        seen.add(key);
        out.push(preset);
        const epNote = preset.latestEpisode
          ? `更新至 S${preset.latestSeason}E${preset.latestEpisode}`
          : '（尚未开播）';
        console.log(`+ ${preset.name} (${preset.regionLabel}) ${epNote}`);
      }
    }
  }

  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const outFile = path.join(dataDir, 'anime.json');
  const jsonContent = JSON.stringify(out, null, 2);
  fs.writeFileSync(outFile, jsonContent);
  console.log(`\n✅ 已生成 ${out.length} 部番剧 → ${outFile}`);
  console.log(`   封面已上传 Gitee: ${coverUploaded} / 失败: ${coverFailed}`);
  console.log(`   跳过: 无名称 ${skippedNoName} / 详情失败 ${skippedDetailFail} / 重复 ${skippedDup}`);

  // 推送到 Gitee（国内可访问）
  if (giteeAvailable) {
    try {
      await giteeUploadJson('anime.json', jsonContent);
    } catch (e) {
      console.error(`❌ anime.json 推送 Gitee 失败: ${e.message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
