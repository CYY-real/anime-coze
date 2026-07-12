// functions/api/tmdb.js
// 代理 TMDB 搜索，供前端「添加剧集」页实时搜索任意剧集（日/国/韩/美，动画或真人）。
// 浏览器同源调用 /api/tmdb，由 Cloudflare 边缘转发到 TMDB，避开浏览器 CORS 与令牌暴露；
// TMDB 令牌只存在于 Cloudflare Pages 环境变量(TMDB_ACCESS_TOKEN)，不进前端源码。
//
// 需在 Cloudflare Pages 项目(anime-coze-cyy)环境变量中配置：
//   TMDB_ACCESS_TOKEN  必填，TMDB v4 read-access token(Bearer)
//
// 归一化结构与 scripts/sync.js 的 normalize() 输出保持一致，前端可统一处理。

const TMDB_BASE = 'https://api.themoviedb.org/3';

const CATEGORY_BY_COUNTRY = { JP: 'anime', CN: 'cdrama', KR: 'kdrama' };
const REGION_LABEL = { JP: '日漫', CN: '国漫', KR: '韩剧' };

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// 轻量平台匹配（函数内独立实现，避免引入前端/Node 依赖；按剧名关键字粗匹配）
function matchPlatforms(name, originalName) {
  const text = ((name || '') + ' ' + (originalName || '')).toLowerCase();
  const map = [
    ['bilibili', ['哔哩哔哩', 'bilibili', 'b站', 'bilibili']],
    ['tencent', ['腾讯视频', '腾讯', 'tencent', 'wetv', 'weTV', 'we tv']],
    ['iqiyi', ['爱奇艺', 'iqiyi', 'iqiy']],
    ['youku', ['优酷', 'youku']],
    ['migu', ['咪咕', 'migu']],
  ];
  const found = map.filter(([k, kws]) => kws.some((kw) => text.includes(kw)));
  if (found.length === 0) return [];
  return found.map(([k], i) => ({ platform: k, name: k, url: '', isPrimary: i === 0 }));
}

function normalizeShow(detail, region) {
  const name = detail.name || detail.original_name || '';
  const cover = detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : '';
  const seasonsRaw = (detail.seasons || []).filter((s) => s.season_number > 0);
  const seasonEpisodeCounts = {};
  seasonsRaw.forEach((s) => { if (s.episode_count) seasonEpisodeCounts[s.season_number] = s.episode_count; });
  const totalSeasons = detail.number_of_seasons || seasonsRaw.length || 1;
  const lea = detail.last_episode_to_air || null;
  const nea = detail.next_episode_to_air || null;
  const cat = (region && CATEGORY_BY_COUNTRY[region]) || 'tv';
  const regionLabel = (region && REGION_LABEL[region]) || (detail.origin_country && detail.origin_country[0]) || '';
  const platforms = matchPlatforms(name, detail.original_name || '');
  return {
    tmdbId: detail.id,
    name,
    displayName: name,
    cover,
    mediaType: 'tv',
    region: region || '',
    regionLabel,
    category: cat,
    latestSeason: lea && lea.season_number ? lea.season_number : totalSeasons,
    latestEpisode: lea && lea.episode_number ? lea.episode_number : 0,
    nextAirDate: nea && nea.air_date ? nea.air_date : '',
    updateFrequency: nea ? '周更' : '已完结',
    totalSeasons,
    seasonEpisodeCounts,
    totalEpisodes: detail.number_of_episodes || 0,
    overview: detail.overview || '',
    firstAirDate: detail.first_air_date || '',
    voteAverage: detail.vote_average || 0,
    originCountry: (detail.origin_country || []).join(','),
    platforms,
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const page = parseInt(url.searchParams.get('page') || '1', 10) || 1;

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405, cors);
  if (!q) return json({ error: 'missing q' }, 400, cors);

  const token = env.TMDB_ACCESS_TOKEN;
  if (!token) return json({ error: 'server misconfigured: missing TMDB_ACCESS_TOKEN' }, 500, cors);

  try {
    // 1) 搜索（不过滤类型/地区，覆盖动画+真人、日/国/韩/美）
    const searchUrl = `${TMDB_BASE}/search/tv?query=${encodeURIComponent(q)}&language=zh-CN&page=${page}&include_adult=false`;
    const sResp = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!sResp.ok) return json({ error: `tmdb ${sResp.status}` }, sResp.status, cors);
    const sJson = await sResp.json();
    const results = (sJson.results || []).slice(0, 12);
    if (results.length === 0) return json({ results: [] }, 200, cors);

    // 2) 并行抓取前 8 个详情，拿到最新集数(last_episode_to_air)，让"追更"有意义
    const top = results.slice(0, 8);
    const details = await Promise.all(
      top.map((r) =>
        fetch(`${TMDB_BASE}/tv/${r.id}?language=zh-CN`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        })
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null)
      )
    );
    const detailById = {};
    details.forEach((d) => { if (d && d.id) detailById[d.id] = d; });

    const out = results.map((r) => {
      const d = detailById[r.id] || r;
      const region = (d.origin_country && d.origin_country[0]) || (r.origin_country && r.origin_country[0]) || '';
      return normalizeShow(d, region);
    });
    return json({ results: out, page, total_results: sJson.total_results || out.length }, 200, cors);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500, cors);
  }
}
