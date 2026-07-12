// functions/api/img.js
// 代理 TMDB 图片（image.tmdb.org），让中国大陆用户无需直连被墙的 TMDB 图床。
// 浏览器只访问 anime-coze-cyy.pages.dev（国内可达），由 Cloudflare 边缘回源拉图。
// 用法：
//   /api/img?u=<encodeURIComponent 后的完整 TMDB 图片 URL>
//   /api/img?p=<poster_path，如 /t/p/w500/xxxx.jpg>（自动拼 image.tmdb.org）
const TMDB_IMG = 'https://image.tmdb.org';

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const u = (url.searchParams.get('u') || '').trim();
  const p = (url.searchParams.get('p') || '').trim();

  let target = '';
  if (u) {
    // 仅允许代理 image.tmdb.org 的图，避免本函数被当成通用开放代理
    try {
      const t = new URL(u);
      if (t.hostname === 'image.tmdb.org') target = u;
    } catch (_) { /* ignore */ }
  } else if (p) {
    target = TMDB_IMG + (p.startsWith('/') ? p : '/' + p);
  }

  const cors = { 'Access-Control-Allow-Origin': '*' };
  if (!target) return json({ error: 'invalid url' }, 400, cors);

  try {
    const upstream = await fetch(target, {
      cf: { cacheTtl: 86400, cacheEverything: true },
    });
    if (!upstream.ok) {
      return new Response('not found', { status: upstream.status, headers: cors });
    }
    const buf = await upstream.arrayBuffer();
    const ct = upstream.headers.get('content-type') || 'image/jpeg';
    return new Response(buf, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': ct,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch (e) {
    return new Response('proxy error', { status: 502, headers: cors });
  }
}
