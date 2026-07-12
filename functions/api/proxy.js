// functions/api/proxy.js
// 代理 Gitee 仓库文件读写，供前端「保存到 Gitee / 从 Gitee 加载」使用。
// 浏览器同源调用 /api/proxy，由 Cloudflare 边缘转发到 Gitee API，避开浏览器 CORS；
// Gitee token / 仓库信息只存在于 Cloudflare Pages 环境变量，不进前端源码。
//
// 需在 Cloudflare Pages 项目(anime-coze-cyy)环境变量中配置：
//   GITEE_TOKEN   必填，Gitee 私人令牌(需 repo 权限)
//   GITEE_OWNER   仓库 owner，默认 yingyingchen123321
//   GITEE_REPO    仓库名，默认 zhuifan-data
//   GITEE_BRANCH  分支，默认 master

const ALLOWED_PATHS = ['data/watchlist.json', 'data/config.json'];

const DEFAULTS = {
  GITEE_OWNER: 'yingyingchen123321',
  GITEE_REPO: 'zhuifan-data',
  GITEE_BRANCH: 'master',
};

function b64encodeUtf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function b64decodeUtf8(b64) {
  return decodeURIComponent(escape(atob(b64)));
}
function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = (url.searchParams.get('path') || '').trim();
  const method = request.method.toUpperCase();

  const owner = env.GITEE_OWNER || DEFAULTS.GITEE_OWNER;
  const repo = env.GITEE_REPO || DEFAULTS.GITEE_REPO;
  const branch = env.GITEE_BRANCH || DEFAULTS.GITEE_BRANCH;
  const token = env.GITEE_TOKEN;

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  if (!token) return json({ error: 'server misconfigured: missing GITEE_TOKEN' }, 500, cors);
  if (!ALLOWED_PATHS.includes(path)) return json({ error: 'path not allowed' }, 403, cors);

  const apiBase =
    `https://gitee.com/api/v5/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
    `/contents/${encodeURIComponent(path)}`;
  const auth = `access_token=${encodeURIComponent(token)}`;

  try {
    if (method === 'GET') {
      const r = await fetch(`${apiBase}?${auth}&ref=${encodeURIComponent(branch)}`);
      if (r.status === 404) return json({ error: 'not found', content: null }, 404, cors);
      if (!r.ok) return json({ error: `gitee ${r.status}` }, r.status, cors);
      const j = await r.json();
      const content = j.content ? b64decodeUtf8(j.content) : '';
      return new Response(content, {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    if (method === 'PUT' || method === 'POST') {
      const body = await request.text();
      // 取当前 sha（Gitee 更新需要）
      let sha = null;
      const head = await fetch(`${apiBase}?${auth}&ref=${encodeURIComponent(branch)}`);
      if (head.ok) {
        const hj = await head.json().catch(() => null);
        sha = hj && hj.sha ? hj.sha : null;
      }
      const putBody = {
        access_token: token,
        content: b64encodeUtf8(body),
        message: `sync: update ${path} @ ${new Date().toISOString()}`,
        branch,
      };
      if (sha) putBody.sha = sha;
      const pr = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(putBody),
      });
      if (!pr.ok) {
        const err = await pr.json().catch(() => ({}));
        return json({ error: `gitee write failed: ${pr.status} ${err.message || ''}` }, pr.status, cors);
      }
      return json({ ok: true }, 200, cors);
    }

    return json({ error: 'method not allowed' }, 405, cors);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500, cors);
  }
}
