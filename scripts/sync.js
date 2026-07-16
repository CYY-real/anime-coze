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
  console.error('闇€瑕?Node 18+锛堝唴缃?fetch锛?);
  process.exit(1);
}

const TMDB_TOKEN = process.env.TMDB_ACCESS_TOKEN;
const TMDB_BASE = process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3';
const LANG = process.env.TMDB_LANG || 'zh-CN';

// 鍙€夛細閰嶇疆浜?GITEE_* 鐜鍙橀噺鏃讹紝棰濆闀滃儚涓€浠藉埌 Gitee锛堝墠绔鍙栫殑鏄?GitHub 鍚屾簮 data/anime.json锛?
const GITEE_TOKEN = process.env.GITEE_ACCESS_TOKEN;
const GITEE_OWNER = process.env.GITEE_OWNER;
const GITEE_REPO = process.env.GITEE_REPO;
const GITEE_BRANCH = process.env.GITEE_BRANCH || 'master';

const { matchPlatforms } = require('./platformSeed');

// 鍥哄畾杩借釜鐨?TMDB 鍓ч泦鏁板瓧 ID锛歞iscover 鐑害姒滆鐩栦笉鍒般€佷絾鐢ㄦ埛鍦ㄣ€岃拷鐣€嶉噷宸叉坊鍔狅紙缁?/api/tmdb 鍚嶇О鎼滅储鍔犲叆锛夌殑鍓с€?
// 渚嬶細閬ぉ(224839)銆佺湻鎬濋噺(127473) 鍛戒腑 ID 涓嶅湪 discover 鍓?N 椤碉紝鑷翠富搴?anime.json 缂哄畠銆?
// 鍓嶇姘歌繙鍥為€€鍒拌拷鐣噷鐨?meta 姝绘暟鎹€佷笉闅?TMDB 鍒锋柊銆傝繖閲屾樉寮?/tv/{id} 鎷夊彇骞跺叆涓诲簱锛?
// 浣垮叾闆嗘暟/鏇存柊棰戠巼闅忔瘡鏃ュ悓姝ヨ嚜鍔ㄦ洿鏂帮紙鍗＄墖璧?animeDb锛屾洿鏂伴〉璧?update-log锛夈€?
// 鑷姩鍥哄畾杩借釜锛氫粠 data/watchlist.json锛圕I 涓敱 Gitee 鎷夊彇鐨勭湡瀹炶拷鐣級璇嗗埆姣忎釜 tmdbId锛?
// 鎶?discover 鐑害姒滆鐩栦笉鍒般€佷絾鐢ㄦ埛鍦ㄨ拷鐣殑鍓ф樉寮忔媺杩涗富搴擄紝浣垮叾闅忔瘡鏃ュ悓姝ヨ嚜鍔ㄦ洿鏂般€?
// 鍥犳銆屾悳绱㈠姞鍏ョ殑鍓с€嶆棤闇€鎵嬪姩鐧昏鍗冲彲鑷姩绾冲叆鈥斺€旇繖鏄湡姝ｈ嚜鍔ㄧ殑鏈哄埗锛屾浛浠ｆ墜鍐?PINNED 鍚嶅崟銆?
function collectTrackedIdsFromWatchlist() {
  const ids = new Set();
  const f = path.join(__dirname, '..', 'data', 'watchlist.json');
  if (!fs.existsSync(f)) return ids;
  try {
    const list = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!Array.isArray(list)) return ids;
    for (const w of list) {
      const id = w && w.tmdbId;
      // 鍙鏁板瓧 TMDB id锛岃烦杩囨湰鍦板亣 id锛堝 'local-xxx'锛夛紝閬垮厤鑴忔暟鎹薄鏌撲富搴?
      if (typeof id === 'number' && Number.isFinite(id)) ids.add(id);
      else if (typeof id === 'string' && /^\d+$/.test(id)) ids.add(Number(id));
    }
  } catch (e) {
    console.warn('[鑷姩鍥哄畾] 璇诲彇 watchlist 澶辫触锛岃烦杩囪嚜鍔ㄥ浐瀹?', e.message);
  }
  return ids;
}

// 鏈湴琛ュ厖鐣墽锛圱MDB discover 鏈鐩栥€佷笖涔熶笉鍦ㄧ敤鎴疯拷鐣噷鐨勬墜宸ュ墽锛夈€?
// 姣忔棩鍚屾浼氭妸 data/anime.json 鏁翠綋瑕嗙洊锛屽洜姝ゅ湪杩欓噷杩藉姞鍙暱鏈熺ǔ瀹氬瓨鍦ㄣ€?
// 瀛楁涓?normalize() 杈撳嚭淇濇寔涓€鑷达紱tmdbId 鐢ㄦ湰鍦板瓧绗︿覆锛堜笉涓?TMDB 鏁板瓧 id 鍐茬獊锛屽墠绔寜 String() 姣旇緝锛夈€?
// 鎼滅储鍔犲叆銆佷絾涓嶅湪 discover 鐑害姒滅殑鍓э紝鐜扮敱 collectTrackedIdsFromWatchlist() 鑷姩绾冲叆锛屾棤闇€鍦ㄦ鐧昏銆?
const LOCAL_EXTRA_ANIME = [];

if (!TMDB_TOKEN) {
  console.error('缂哄皯 TMDB_ACCESS_TOKEN');
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

// TMDB 鏃?鏇存柊棰戠巼"瀛楁锛屾寜鏄惁鏈変笅涓€闆嗙矖鐣ユ帹鏂?
function inferUpdateFrequency(detail) {
  return detail.next_episode_to_air ? '鍛ㄦ洿' : '宸插畬缁?;
}

function normalize(it, region) {
  const name = it.name || it.original_name || '';
  // 灏侀潰璧?Cloudflare 鍥剧墖浠ｇ悊锛坕mage.tmdb.org 鍥藉唴甯歌澧欙紝缁熶竴缁?/api/img 鍥炴簮锛?
  const cover = it.poster_path ? `/api/img?p=/t/p/w500${it.poster_path}` : '';
  const seasonsRaw = (it.seasons || []).filter((s) => s.season_number > 0);
  const seasonEpisodeCounts = {};
  seasonsRaw.forEach((s) => {
    if (s.episode_count) seasonEpisodeCounts[s.season_number] = s.episode_count;
  });
  const totalSeasons = it.number_of_seasons || seasonsRaw.length || 1;
  const lea = it.last_episode_to_air || null;
  const nea = it.next_episode_to_air || null;

  // 鍒嗙被锛氭寜 genres 鏄惁鍚姩鐢?16) 涓庡湴鍖烘帹鏂紝閬垮厤鐪熶汉鍥戒骇鍓?闊╁墽琚敊鏍囦负"鍥芥极/鐣墽"
  const genreIds = (it.genres || []).map((g) => g.id);
  const isAnimation = genreIds.includes(GENRE_ANIMATION);
  let category, regionLabel;
  if (region === 'KR') {
    category = 'kdrama';
    regionLabel = '闊╁墽';
  } else if (isAnimation) {
    category = 'anime';
    regionLabel = region === 'JP' ? '鏃ユ极' : region === 'CN' ? '鍥芥极' : '鍔ㄧ敾';
  } else if (region === 'CN') {
    category = 'cdrama';
    regionLabel = '鍥戒骇鍓?;
  } else {
    category = 'jdrama';
    regionLabel = '鏃ュ墽';
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

// 瀵规瘮鏂版棫 anime.json锛屾妸銆屼粖澶╂湁鏇存柊鐨勭暘鍓с€嶆寜鏃ユ湡绱姞杩?data/update-log.json銆?
// 鍓嶇銆屾洿鏂般€嶆爣绛鹃〉璇诲彇瀹冿紝鎸夋湰鍦版棩鏈熷睍绀烘槰鏃?浠婃棩鏇存柊锛堜粎鎴戠殑杩界暘锛夈€?
// 鏃ユ湡鐢ㄥ寳浜椂闂达紙GMT+8锛夛紝涓庡墠绔湰鍦版棩鏈熺瓫閫変繚鎸佷竴鑷达紝閬垮厤璺ㄩ浂鐐规椂鍖洪敊浣嶅鑷村尮閰嶄笉涓娿€?
function updateChangeLog(newArr, dataDir) {
  const logPath = path.join(dataDir, 'update-log.json');
  const animePath = path.join(dataDir, 'anime.json');
  const newMap = {};
  newArr.forEach((a) => { newMap[String(a.tmdbId)] = a; });
  // 鏃ф暟鎹紙涓婁竴娆℃彁浜ょ殑 anime.json锛夛紝鐢ㄤ簬瀵规瘮鍑洪泦鏁版柊澧?鍙樻洿
  const oldMap = {};
  if (fs.existsSync(animePath)) {
    try {
      JSON.parse(fs.readFileSync(animePath, 'utf8')).forEach((a) => { oldMap[String(a.tmdbId)] = a; });
    } catch (e) { /* 蹇界暐鎹熷潖鏁版嵁 */ }
  }
  // 鍖椾含鏃堕棿鏃ユ湡瀛楃涓?YYYY-MM-DD
  const bj = new Date(Date.now() + 8 * 3600 * 1000);
  const today = bj.toISOString().slice(0, 10);
  let log = {};
  if (fs.existsSync(logPath)) {
    try { log = JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch (e) { log = {}; }
  }
  // 涓庡綋澶╁凡璁板綍椤瑰仛骞堕泦锛堝悓涓€澶╁娆″悓姝ヤ笉閲嶅銆佷笉涓㈡棭涓婅褰曪級
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
  // 浠呬繚鐣欐渶杩?30 澶╋紝閬垮厤鏃犻檺澧為暱
  const keys = Object.keys(log).sort();
  while (keys.length > 30) delete log[keys.shift()];
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  console.log(`馃摑 鏇存柊鏃ュ織锛?{today} 璁板綍 ${log[today].length} 閮ㄦ湁鏇存柊`);
}

// ---- 鐭湡鍏滃簳鏁版嵁婧愶細6789kb锛堣仛鍚堢珯锛屾洿鏂伴€氬父姣?TMDB 蹇紱绋冲畾鎬у樊锛岄殢鏃跺彲鑳藉け鏁堬級----
// 鏄犲皠琛?data/source-6789kb.json: { "<tmdbId>": <vodId 鏁板瓧锛屽 33453> }
// 鎵句笉鍒?vodId锛坣ull/缂哄け锛夋垨鎶撳彇澶辫触鏃惰嚜鍔ㄥ洖閫€ TMDB锛屼笉闃绘柇涓绘祦绋嬨€?
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
    // 鍙栭〉闈㈢涓€涓嚭鐜扮殑銆屾洿鏂拌嚦X闆?/ 鍏╔闆嗐€嶏細涓荤姸鎬佹案杩滄帓鍦ㄥ簳閮ㄦ帹鑽愬垪琛ㄤ箣鍓嶏紝
    // 鏁呴鍖归厤鍗冲綋鍓嶇暘鏈綋鐨勬渶鏂?鎬婚泦鏁帮紱鎺ㄨ崘鍖洪噷鐨勫叾瀹冪暘鏁板瓧浼氳鑷劧蹇界暐銆?
    const m = html.match(/(?:鏇存柊鑷硘鍏?\s*(\d+)\s*闆?);
    if (!m) return null;
    const ep = parseInt(m[1], 10);
    return Number.isFinite(ep) && ep > 0 ? ep : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---- 6789kb 鑷姩寤烘槧灏勶細鐢?TMDB 鍓у悕鍙嶆煡 vodId锛坢accms ajax 鎼滅储鎺ュ彛锛?---
// 鐩殑锛氭柊鐣彧闇€鍐欒繘 watchlist锛孋I 璺?sync.js 鏃惰嚜鍔ㄧ敤 TMDB 鍓у悕鍘?6789kb 鎼滃嚭 vodId锛?
//       鍐欏洖 data/source-6789kb.json 缂撳瓨锛屽悗缁洿鎺ュ鐢紝鏃犻渶浜哄伐鐧昏銆?
const KB_SEARCH_URL = 'https://www.6789kb.com/index.php/ajax/suggest?mid=1&wd=';
const KB_UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  Referer: 'https://www.6789kb.com/',
};
// 杞爣璁帮細鍛戒腑鍚庨檷浣庡尮閰嶄紭鍏堢骇锛堜粛鏄鐗囷紝濡傘€岀X瀛ｃ€嶃€屾渶缁堝銆嶏級
const SUB_MARK = /(澶栦紶|oad|鍓у満鐗坾鐗瑰埆绡噟鎬婚泦|缂栧勾鍙瞸鐪熶汉鐗坾瀹岀粨绡噟鍓嶇瘒|鍚庣瘒|鏈€缁堝|鏈€缁坾part|绡噟瀛?/i;
// 纭帓闄わ細鍗充娇鍚嶅瓧寰堝儚涔熺粷涓嶈嚜鍔ㄩ噰鐢紝閬垮厤鍏滃簳鍒?OAD/鍓у満鐗?澶栦紶绛夊瓙鏉＄洰
const HARD_BAD = /(澶栦紶|oad|鍓у満鐗坾鐗瑰埆绡噟鎬婚泦绡噟缂栧勾鍙瞸鐪熶汉鐗坾瀹岀粨绡噟鍓嶇瘒|鍚庣瘒|part)/i;

function normTitle(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[锛?路鈥兓鈥?`]/g, '')
    .replace(/绗琜涓€浜屼笁鍥涗簲鍏竷鍏節鍗乗d]+瀛?g, '')
    .replace(/season\s*\d+/gi, '')
    .replace(/\bpart\.?\s*\d+/gi, '')
    .replace(/[\(锛圿.*?[\)锛塢/g, '');
}

async function searchKbVodId(name) {
  if (!name) return [];
  const url = KB_SEARCH_URL + encodeURIComponent(name);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const resp = await fetch(url, { headers: KB_UA, signal: controller.signal });
    if (!resp.ok) return [];
    const json = await resp.json().catch(() => null);
    if (!json || json.code !== 1 || !Array.isArray(json.list)) return [];
    return json.list.map((it) => ({ id: Number(it.id), name: String(it.name || '') }));
  } catch (e) {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function pickKbVod(tmdbName, cands) {
  if (!cands || !cands.length) return null;
  const base = normTitle(tmdbName);
  if (!base) return null;
  let best = null;
  let bestScore = -1;
  for (const c of cands) {
    const cn = normTitle(c.name);
    if (!cn) continue;
    const isSub = SUB_MARK.test(c.name);
    let score = 0;
    if (cn === base) score = isSub ? 80 : 100;
    else if (cn.startsWith(base) && !isSub) score = 95;
    else if (cn.startsWith(base) && isSub) score = 82;
    else if (cn.includes(base)) score = isSub ? 55 : 80;
    if (HARD_BAD.test(c.name)) continue; // 纭帓闄ゅ瓙鏉＄洰锛堝浼?OAD/鍓у満鐗堢瓑锛夌粷涓嶅弬涓庣珵閫?
    if (score > bestScore) { bestScore = score; best = c; }
  }
  if (!best) return null;
  // 楂樺垎涓旈潪纭帓闄ゅ瓙鏉＄洰 鈫?閲囩敤锛涙垨鍑犱箮绮剧‘鍖归厤锛?=90锛夊嵆渚垮亸闂ㄤ篃閲囩敤
  if (bestScore >= 80 && !HARD_BAD.test(best.name)) return best.id;
  if (bestScore >= 90) return best.id;
  return null;
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
      ? `鏇存柊鑷?S${preset.latestSeason}E${preset.latestEpisode}`
      : '锛堝皻鏈紑鎾級';
    console.log(`+ ${preset.name} (${preset.regionLabel}) ${epNote}`);
  }

  // 浠呬粠杩界暘鍒楄〃涓幏鍙栭渶杩借釜鐨?TMDB ID锛屼笉鍐嶆姄鍙栧叏缃戠暘鍓?
  const pinnedIds = collectTrackedIdsFromWatchlist();
  console.log(`[杩界暘鍚屾] 璇嗗埆鍑?${pinnedIds.size} 涓渶杩借釜鐨?TMDB ID`);
  if (pinnedIds.size === 0) {
    console.log('鈿狅笍 杩界暘鍒楄〃涓虹┖锛岀敓鎴愮┖ anime.json');
  }

  // 鍔犺浇 6789kb 鍏滃簳鏄犲皠锛堢煭鏈熸簮锛涚己澶?鏃犳潯鐩垯鍏ㄩ儴鍥為€€ TMDB锛?
  let kbMap = {};
  try {
    const kbPath = path.join(__dirname, '..', 'data', 'source-6789kb.json');
    if (fs.existsSync(kbPath)) kbMap = JSON.parse(fs.readFileSync(kbPath, 'utf8'));
  } catch (e) { console.warn('鈿狅笍 璇诲彇 6789kb 鏄犲皠澶辫触锛屽叏閮ㄥ洖閫€ TMDB:', e.message); }
  let kbDirty = false; // 鏈鏄惁鑷姩鏂板尮閰嶅埌鏄犲皠锛岄渶鍐欏洖浠撳簱
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  for (const id of pinnedIds) {
    const key = `${id}-tv`;
    if (seen.has(key)) continue;
    const resp = await tmdbGet(`/tv/${id}`, { language: LANG });
    if (!resp.ok) { console.warn(`[杩界暘鍚屾] /tv/${id} 澶辫触: ${resp.status}锛岃烦杩嘸); continue; }
    const region = (resp.body.origin_country && resp.body.origin_country[0]) || '';
    const preset = normalize(resp.body, region);
    // 浼樺厛鐢?6789kb 鐨勬渶鏂伴泦鏁帮紙姣?TMDB 蹇殑鐭湡鍏滃簳锛夛紱澶辫触/鏃犳槧灏?琚皝鍒欏洖閫€ TMDB
    let vodId = kbMap[String(id)];
    if (!vodId) {
      // 鏄犲皠缂哄け锛氱敤 TMDB 鍓у悕鍙嶆煡 6789kb vodId锛岃嚜鍔ㄥ缓鏄犲皠骞剁紦瀛?
      await sleep(300); // 闄愭祦锛岄伩鍏嶈Е鍙戠珯鐐归鎺?
      const cands = await searchKbVodId(preset.name);
      const picked = pickKbVod(preset.name, cands);
      if (picked) {
        vodId = picked;
        kbMap[String(id)] = picked;
        kbDirty = true;
        console.log(`  鈫?鑷姩鍖归厤 6789kb: ${preset.name} 鈫?vodId ${picked}`);
      } else {
        console.log(`  鈫?6789kb 鏈尮閰嶏紝娌跨敤 TMDB: ${preset.name}`);
      }
    }
    if (vodId) {
      const kbEp = await fetchKbEpisode(vodId);
      if (kbEp) {
        const tmdbEp = preset.latestEpisode || 0;
        let merged = Math.max(tmdbEp, kbEp);
        if (preset.totalEpisodes > 0) merged = Math.min(merged, preset.totalEpisodes);
        if (merged !== preset.latestEpisode) {
          console.log(`  鈫?6789kb 瑕嗙洊: ${preset.name} E${tmdbEp} 鈫?E${merged}`);
          preset.latestEpisode = merged;
        } else {
          console.log(`  鈫?6789kb 涓€鑷? ${preset.name} E${merged}`);
        }
      } else {
        console.log(`  鈫?6789kb 鏈彇鍒帮紝娌跨敤 TMDB: ${preset.name}`);
      }
    }
    ingest(preset);
  }

  // 杩藉姞鏈湴琛ュ厖鐣墽
  for (const extra of LOCAL_EXTRA_ANIME) {
    const key = `${extra.tmdbId}-tv`;
    if (seen.has(key)) continue;
    if (out.some((x) => x.name === extra.name)) {
      console.log(`- [鏈湴琛ュ厖] ${extra.name} 宸茶瑕嗙洊锛岃烦杩嘸);
      continue;
    }
    seen.add(key);
    out.push(extra);
    console.log(`+ [鏈湴琛ュ厖] ${extra.name} (${extra.regionLabel})`);
  }

  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  // 鍏堜骇鍑烘洿鏂版棩蹇楋紙璇诲彇纾佺洏涓婄殑鏃?anime.json 鍋氬姣旓級锛屽啀瑕嗙洊鍐欏叆鏂?anime.json
  updateChangeLog(out, dataDir);
  const outFile = path.join(dataDir, 'anime.json');
  const jsonContent = JSON.stringify(out, null, 2);
  fs.writeFileSync(outFile, jsonContent);
  console.log(`\n鉁?宸茬敓鎴?${out.length} 閮ㄧ暘鍓?鈫?${outFile}`);
  console.log(`   璺宠繃: 鏃犲悕绉?${skippedNoName} / 璇︽儏澶辫触 ${skippedDetailFail} / 閲嶅 ${skippedDup}`);

  // 鎶婃湰娆¤嚜鍔ㄦ柊鍖归厤鐨?6789kb 鏄犲皠鍐欏洖浠撳簱锛岄伩鍏嶆瘡娆?CI 閲嶅鎼滅储锛堜汉宸ヤ篃鍙洿鎺ョ紪杈戞鏂囦欢瑕嗙洊锛?
  if (kbDirty) {
    try {
      const kbPath = path.join(__dirname, '..', 'data', 'source-6789kb.json');
      fs.writeFileSync(kbPath, JSON.stringify(kbMap, null, 2));
      console.log(`馃捑 宸茬紦瀛?${Object.keys(kbMap).length} 鏉?6789kb 鏄犲皠 鈫?${kbPath}`);
    } catch (e) {
      console.warn('鈿狅笍 鍐欏洖 6789kb 鏄犲皠澶辫触锛堜笉褰卞搷鏈鍚屾锛?', e.message);
    }
  }


  // 鍙€夛細闀滃儚鍒?Gitee锛堥渶閰嶇疆 GITEE_* 鐜鍙橀噺锛涗笉褰卞搷 GitHub 鍚屾簮璇诲彇锛?
  if (GITEE_TOKEN && GITEE_OWNER && GITEE_REPO) {
    try {
      await giteeUploadJson('data/anime.json', jsonContent);
    } catch (e) {
      console.error(`鉂?闀滃儚 Gitee 澶辫触锛堜笉褰卞搷 GitHub锛? ${e.message}`);
    }
  }
}

// ---- 鍙€?Gitee 闀滃儚 ----
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
    throw new Error(`Gitee 涓婁紶澶辫触: HTTP ${uploadResp.status} ${err.message || ''}`);
  }
  const result = await uploadResp.json().catch(() => ({}));
  const bytes = Buffer.byteLength(content, 'utf8');
  const kb = (bytes / 1024).toFixed(1);
  const commitSha = result.commit && result.commit.sha ? result.commit.sha.slice(0, 7) : '-';
  const op = existedBefore ? '鏇存柊宸叉湁鏂囦欢' : '鏂板缓鏂囦欢';
  const repoUrl = `https://gitee.com/${GITEE_OWNER}/${GITEE_REPO}`;
  const pagesUrl = process.env.GITEE_PAGES_URL || `https://${GITEE_OWNER}.gitee.io/${GITEE_REPO}/`;
  console.log('');
  console.log('鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€');
  console.log('鉁?宸叉垚鍔熼暅鍍忓埌 Gitee');
  console.log(`   鈥?浠撳簱    : ${GITEE_OWNER}/${GITEE_REPO}  (鍒嗘敮 ${GITEE_BRANCH})`);
  console.log(`   鈥?璺緞    : ${filePath}`);
  console.log(`   鈥?鎿嶄綔    : ${op}`);
  console.log(`   鈥?澶у皬    : ${kb} KB  (${bytes} 瀛楄妭)`);
  console.log(`   鈥?鎻愪氦    : ${commitSha}`);
  console.log(`   鈥?浠撳簱鍦板潃: ${repoUrl}`);
  console.log(`   鈥?Pages   : ${pagesUrl}`);
  console.log('鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€');
  return { ok: true, commitSha, op, bytes };
}

main().catch((e) => { console.error(e); process.exit(1); });
