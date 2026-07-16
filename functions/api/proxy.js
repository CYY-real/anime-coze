// functions/api/proxy.js
// 浠ｇ悊 Gitee 浠撳簱鏂囦欢璇诲啓锛屼緵鍓嶇銆屼繚瀛樺埌 Gitee / 浠?Gitee 鍔犺浇銆嶄娇鐢ㄣ€?
// 娴忚鍣ㄥ悓婧愯皟鐢?/api/proxy锛岀敱 Cloudflare 杈圭紭杞彂鍒?Gitee API锛岄伩寮€娴忚鍣?CORS锛?
// Gitee token / 浠撳簱淇℃伅鍙瓨鍦ㄤ簬 Cloudflare Pages 鐜鍙橀噺锛屼笉杩涘墠绔簮鐮併€?
//
// 闇€鍦?Cloudflare Pages 椤圭洰(anime-coze-cyy)鐜鍙橀噺涓厤缃細
//   GITEE_TOKEN   蹇呭～锛孏itee 绉佷汉浠ょ墝(闇€ repo 鏉冮檺)
//   GITEE_OWNER   浠撳簱 owner锛岄粯璁?yingyingchen123321
//   GITEE_REPO    浠撳簱鍚嶏紝榛樿 zhuifan-data
//   GITEE_BRANCH  鍒嗘敮锛岄粯璁?master

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
      // 鍙栧綋鍓?sha锛圙itee 鏇存柊闇€瑕侊級
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
      // Gitee 璇箟锛歅OST=鍒涘缓(鏂囦欢涓嶅瓨鍦?, PUT=鏇存柊(鏂囦欢宸插瓨鍦? 闇€甯?sha)銆?
      // 涔嬪墠鎭掔敤 POST锛屽凡瀛樺湪鏂囦欢鏃惰繑鍥?400銆屾枃浠跺悕宸插瓨鍦ㄣ€嶁啋 鍐欏洖涓€鐩村け璐ャ€?
      const pr = await fetch(apiBase, {
        method: sha ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(putBody),
      });
      if (!pr.ok) {
        const err = await pr.json().catch(() => ({}));
        return json({ error: `gitee write failed: ${pr.status} ${err.message || ''}` }, pr.status, cors);
      }
      // 瑙ｆ瀽 Gitee 杩斿洖鐨勬彁浜や俊鎭紝鍥炰紶缁欏墠绔敤浜庢洿閱掔洰鐨勬垚鍔熸彁绀?
      const gj = await pr.json().catch(() => ({}));
      const commitSha = gj && gj.commit && gj.commit.sha ? String(gj.commit.sha).slice(0, 7) : null;
      let records;
      if (path === 'data/watchlist.json') {
        try { const d = JSON.parse(body); records = Array.isArray(d) ? d.length : undefined; } catch (_) { records = undefined; }
      }
      const bytes = (typeof TextEncoder !== 'undefined') ? new TextEncoder().encode(body).length : body.length;
      return json({ ok: true, repo: `${owner}/${repo}`, branch, sha: commitSha, bytes, records }, 200, cors);
    }

    return json({ error: 'method not allowed' }, 405, cors);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500, cors);
  }
}
