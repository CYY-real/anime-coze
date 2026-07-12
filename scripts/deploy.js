#!/usr/bin/env node
'use strict';

// LCS 对齐的逐行 diff，避免行号错位产生的"假差异"噪声
function diffLines(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push('  ' + a[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push('- ' + a[i]); i++; }
    else { out.push('+ ' + b[j]); j++; }
  }
  while (i < n) { out.push('- ' + a[i]); i++; }
  while (j < m) { out.push('+ ' + b[j]); j++; }
  return out;
}

// deploy.js — 将本地 index.html 同步到 GitHub 仓库（Contents API PUT），触发 Cloudflare Pages 自动重新部署。
// 约定: 走 REST API，不用本地 git push（避免 502 / 代理问题）。
// 用法:
//   预览差异(只读):  node scripts/deploy.js --dry-run
//   真正部署:        GH_DEPLOY_TOKEN=xxx node scripts/deploy.js
//                   或把 {"token":"xxx"} 写入 scripts/.deploy.json（已被 .gitignore 忽略，不会提交）
const fs = require('fs');
const path = require('path');

const DEFAULT = { owner: 'CYY-real', repo: 'anime-coze', branch: 'main', filePath: 'index.html' };

function parseArgs(argv) {
  const o = { dryRun: false };
  for (const a of argv) {
    if (a === '--dry-run') o.dryRun = true;
    else if (a.startsWith('--owner=')) o.owner = a.slice(8);
    else if (a.startsWith('--repo=')) o.repo = a.slice(7);
    else if (a.startsWith('--branch=')) o.branch = a.slice(9);
  }
  return o;
}

function loadToken() {
  if (process.env.GH_DEPLOY_TOKEN) return process.env.GH_DEPLOY_TOKEN.trim();
  const f = path.join(__dirname, '.deploy.json');
  if (fs.existsSync(f)) {
    try {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (j && j.token) return String(j.token).trim();
    } catch (e) { /* ignore */ }
  }
  return null;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const owner = args.owner || DEFAULT.owner;
  const repo = args.repo || DEFAULT.repo;
  const branch = args.branch || DEFAULT.branch;
  const filePath = DEFAULT.filePath;
  const token = loadToken();

  if (!token && !args.dryRun) {
    console.error('❌ 未找到部署用 GitHub Token。');
    console.error('   设置环境变量: GH_DEPLOY_TOKEN=xxx node scripts/deploy.js');
    console.error('   或写入本地文件: scripts/.deploy.json -> {"token":"xxx"} （该文件已被 .gitignore 忽略，不会提交）');
    process.exit(1);
  }

  const localPath = path.join(__dirname, '..', filePath);
  const localContent = fs.readFileSync(localPath, 'utf8');
  const localB64 = Buffer.from(localContent, 'utf8').toString('base64');

  const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  const headers = token
    ? { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
    : { Accept: 'application/vnd.github+json' };

  console.log(`🔍 获取远端 ${owner}/${repo}/${branch}/${filePath} ...`);
  const getResp = await fetch(apiBase + `?ref=${branch}`, { headers });
  let sha = null, remoteB64 = null;
  if (getResp.ok) {
    const j = await getResp.json();
    sha = j.sha;
    remoteB64 = j.content;
  } else if (getResp.status === 404) {
    console.log('⚠️ 远端无此文件（将创建）。');
  } else {
    console.error('❌ 获取远端失败:', getResp.status, (await getResp.text()).slice(0, 200));
    process.exit(1);
  }

  if (remoteB64) {
    const norm = remoteB64.replace(/\s+/g, '');
    if (norm === localB64) {
      console.log('✅ 本地与远端一致，无需部署。');
      console.log('🌐 线上:', 'https://anime-coze-cyy.pages.dev');
      return;
    }
  }

  console.log('📝 检测到差异，' + (args.dryRun ? '进入 [dry-run] 比对（不会写入）:' : '准备部署...'));

  if (args.dryRun) {
    const remoteText = remoteB64 ? Buffer.from(remoteB64.replace(/\s+/g, ''), 'base64').toString('utf8') : '';
    const a = remoteText.split('\n'), b = localContent.split('\n');
    const dl = diffLines(a, b);
    const changed = dl.filter(l => l[0] !== ' ').length;
    dl.filter(l => l[0] !== ' ').slice(0, 80).forEach(l => console.log(l.slice(0, 160)));
    if (changed > 80) console.log(`  … 其余 ${changed - 80} 行省略`);
    console.log(`\n[dry-run] 共 ${changed} 处变更行。确认无误后，去掉 --dry-run 并配置 GH_DEPLOY_TOKEN 重新运行以真正部署。`);
    return;
  }

  const putBody = JSON.stringify({
    message: `deploy: sync index.html @ ${new Date().toISOString()}`,
    content: localB64,
    sha: sha || undefined,
    branch: branch,
  });
  const putResp = await fetch(apiBase, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: putBody });
  if (!putResp.ok) {
    console.error('❌ 部署失败:', putResp.status, (await putResp.text()).slice(0, 200));
    process.exit(1);
  }
  console.log('✅ 已推送到 GitHub，Cloudflare Pages 将自动重新部署。');
  console.log('🌐 线上:', 'https://anime-coze-cyy.pages.dev');
})();
