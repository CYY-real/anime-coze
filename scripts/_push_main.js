// 经 GitHub Contents API 把多文件推送 main（防每日定时任务回退）
const https = require('https');
const fs = require('fs');
const repo = require('./.deploy.json');
const TOKEN = repo.token;
const OWNER = 'CYY-real', REPO = 'anime-coze';

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = https.request({
      hostname: 'api.github.com',
      path: `/repos/${OWNER}/${REPO}/contents/${path}`,
      method,
      headers: {
        'Authorization': `token ${TOKEN}`,
        'User-Agent': 'workbuddy-push',
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
    }, (res) => {
      let s = ''; res.on('data', (d) => (s += d));
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(s) }); } catch (e) { resolve({ status: res.statusCode, body: s }); } });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const files = [
  ['index.html', 'fix: 封面走 Cloudflare 图片代理 /api/img，国内可达'],
  ['functions/api/img.js', 'feat: 新增 TMDB 图片代理函数'],
  ['functions/api/tmdb.js', 'fix: 搜索结果封面改为 /api/img 代理 URL'],
  ['scripts/sync.js', 'fix: 每日同步封面改为 /api/img 代理 URL'],
];

(async () => {
  for (const [file, msg] of files) {
    const get = await req('GET', `${file}?ref=main`);
    let sha;
    if (get.status === 200) sha = get.body.sha;
    else if (get.status === 404) console.log('ℹ️ 新文件（无 sha）:', file);
    else { console.log('❌ GET', file, 'status', get.status, '|', JSON.stringify(get.body).slice(0, 200)); continue; }
    const content = fs.readFileSync(file).toString('base64');
    const payload = { message: msg, content, branch: 'main' };
    if (sha) payload.sha = sha;
    const put = await req('PUT', file, payload);
    if (put.body.commit) console.log('✅', file, '->', put.body.commit.sha);
    else console.log('⚠️', file, JSON.stringify(put.body).slice(0, 160));
  }
})();
