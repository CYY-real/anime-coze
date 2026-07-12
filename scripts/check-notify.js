#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// ---- 环境变量 ----
const GITEE_TOKEN = process.env.GITEE_ACCESS_TOKEN;
const GITEE_OWNER = process.env.GITEE_OWNER;
const GITEE_REPO = process.env.GITEE_REPO;
const GITEE_BRANCH = process.env.GITEE_BRANCH || 'master';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const NOTIFY_THRESHOLD = parseInt(process.env.NOTIFY_THRESHOLD) || 0; // 0 表示按个人阈值

// ---- Gitee API 工具 ----
async function giteeGetJSON(relPath) {
  const encPath = relPath.split('/').map(encodeURIComponent).join('/');
  const url = `https://gitee.com/api/v5/repos/${encodeURIComponent(GITEE_OWNER)}/${encodeURIComponent(GITEE_REPO)}/contents/${encPath}?access_token=${encodeURIComponent(GITEE_TOKEN)}&ref=${encodeURIComponent(GITEE_BRANCH)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Gitee GET ${relPath} 失败: HTTP ${resp.status}`);
  const j = await resp.json();
  if (!j.content) throw new Error(`${relPath} 内容为空`);
  const bin = Buffer.from(j.content, 'base64');
  return { data: JSON.parse(bin.toString('utf8')), sha: j.sha };
}

async function giteePutJSON(relPath, content, sha) {
  const encPath = relPath.split('/').map(encodeURIComponent).join('/');
  const url = `https://gitee.com/api/v5/repos/${encodeURIComponent(GITEE_OWNER)}/${encodeURIComponent(GITEE_REPO)}/contents/${encPath}`;
  const body = {
    access_token: GITEE_TOKEN,
    content: Buffer.from(content, 'utf8').toString('base64'),
    message: `notify: update ${relPath} @ ${new Date().toISOString().slice(0, 10)}`,
    branch: GITEE_BRANCH,
    sha,
  };
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Gitee PUT ${relPath} 失败: HTTP ${resp.status} ${err.message || ''}`);
  }
  return resp.json();
}

// ---- 发通知 ----
async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    console.warn(`  ⚠️ Telegram 发送失败: ${err.description || resp.status}`);
    return false;
  }
  return true;
}

async function sendFeishu(text) {
  const url = process.env.FEISHU_WEBHOOK;
  if (!url) return false;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msg_type: 'text', content: { text } }),
  });
  if (!resp.ok) {
    console.warn(`  ⚠️ 飞书发送失败: HTTP ${resp.status}`);
    return false;
  }
  return true;
}

async function sendDingTalk(text) {
  const url = process.env.DINGTALK_WEBHOOK;
  if (!url) return false;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msgtype: 'text', text: { content: text } }),
  });
  if (!resp.ok) {
    console.warn(`  ⚠️ 钉钉发送失败: HTTP ${resp.status}`);
    return false;
  }
  return true;
}

async function notify(text) {
  let sent = false;
  if (await sendTelegram(text)) { sent = true; console.log('  📤 Telegram 已发送'); }
  if (await sendFeishu(text)) { sent = true; console.log('  📤 飞书已发送'); }
  if (await sendDingTalk(text)) { sent = true; console.log('  📤 钉钉已发送'); }
  return sent;
}

// ---- 主逻辑 ----
async function main() {
  console.log('🔍 检查番剧更新...\n');

  // 1) 读取数据
  let animeList, watchlist, watchlistSha;
  try {
    const a = await giteeGetJSON('anime.json');
    animeList = a.data;
    const w = await giteeGetJSON('watchlist.json');
    watchlist = w.data;
    watchlistSha = w.sha;
  } catch (e) {
    console.error(`❌ 读取数据失败: ${e.message}`);
    process.exit(1);
  }

  if (!Array.isArray(animeList) || !Array.isArray(watchlist)) {
    console.error('❌ 数据格式异常');
    process.exit(1);
  }

  console.log(`  番剧库: ${animeList.length} 部`);
  console.log(`  关注列表: ${watchlist.length} 部\n`);

  // 2) 建立番剧索引
  const animeMap = {};
  animeList.forEach(a => { animeMap[a.tmdbId] = a; });

  // 3) 遍历关注列表，判断更新
  const updates = [];
  const now = new Date().toISOString();

  for (const w of watchlist) {
    if (!w.notifyEnabled) continue;

    const a = animeMap[w.tmdbId];
    if (!a) continue;
    if (!a.latestEpisode || a.latestEpisode === 0) continue;

    const banked = a.latestEpisode - w.watchedEpisode;
    const threshold = NOTIFY_THRESHOLD > 0 ? NOTIFY_THRESHOLD : (w.threshold || 3);

    if (banked >= threshold && a.latestEpisode > (w.lastNotifiedEpisode || 0)) {
      updates.push({ w, a, banked });
      // 更新 lastNotifiedEpisode
      w.lastNotifiedEpisode = a.latestEpisode;
      w.lastNotifiedAt = now;
    }
  }

  if (updates.length === 0) {
    console.log('✅ 没有需要通知的更新');
    return;
  }

  // 4) 构建通知文案
  let lines = ['<b>🎬 番剧更新啦，速速追起</b>\n'];
  for (const u of updates) {
    const plat = (u.a.platforms || []).map(p => p.platform).join('/') || '未知平台';
    lines.push(
      `📺 <b>${u.w.name}</b> - ${plat}`,
      `   最新第 ${u.a.latestEpisode} 集，存了 ${u.banked} 集`,
      `   你追到第 ${u.w.watchedEpisode} 集`,
      '',
    );
  }
  // 备注
  const lowRemaining = watchlist.filter(w => {
    const a = animeMap[w.tmdbId];
    if (!a || !a.totalEpisodes) return false;
    return a.totalEpisodes - w.watchedEpisode <= 3;
  });
  if (lowRemaining.length > 0) {
    lines.push(`⚠️ 以下番剧剩余不足 3 集，记得补番：`);
    lowRemaining.forEach(w => lines.push(`   · ${w.name}`));
    lines.push('');
  }
  lines.push(`💡 配置追番列表：https://${GITEE_OWNER}.gitee.io/anime-coze/`);

  const text = lines.join('\n');
  console.log('📢 发送通知:');
  updates.forEach(u => console.log(`   + ${u.w.name}: 存了 ${u.banked} 集`));

  // 5) 发通知
  const sent = await notify(text);

  // 6) 更新 watchlist.json（推送 lastNotifiedEpisode 变化）
  if (sent) {
    try {
      await giteePutJSON('watchlist.json', JSON.stringify(watchlist, null, 2), watchlistSha);
      console.log(`✅ watchlist.json 已更新 (${updates.length} 条 lastNotifiedEpisode)`);
    } catch (e) {
      console.error(`❌ watchlist.json 更新失败: ${e.message}`);
    }
  } else {
    console.warn('⚠️ 未配置通知渠道，跳过 watchlist 更新');
  }

  console.log(`\n✅ 完成，共 ${updates.length} 部有更新`);
}

main().catch(e => { console.error(e); process.exit(1); });
