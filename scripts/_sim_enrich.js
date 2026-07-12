// 仿真：搜索结果 -> addToList 构造的 watchlist 条目 -> enrichWatchlistItem 取出 cover
const https = require('https');

function fetchJSON(url) {
  return new Promise((res, rej) => {
    https.get(url, (r) => {
      let s = ''; r.on('data', (d) => (s += d)); r.on('end', () => res(JSON.parse(s)));
    }).on('error', rej);
  });
}

(async () => {
  const q = process.argv[2] || '间谍过家家';
  // 1) 拿真实搜索结果（模拟 liveResults 中的一项）
  const j = await fetchJSON(`https://anime-coze-cyy.pages.dev/api/tmdb?q=${encodeURIComponent(q)}`);
  const a = (j.results || [])[0];
  if (!a) { console.log('搜索无结果'); return; }
  console.log('搜索结果条目:', { tmdbId: a.tmdbId, name: a.name, cover: a.cover || '(空)', hasPoster: !!(a.cover && a.cover.startsWith('http')) });

  // 2) 模拟 addToList 写入 watchlist 的 meta（与 index.html 同结构）
  const entry = {
    tmdbId: a.tmdbId,
    name: a.name || a.displayName || '',
    platforms: (a.platforms || []).map((p, i) => ({ platform: p.platform, name: p.name || p.platform, url: p.url || '', isPrimary: p.isPrimary || i === 0 })),
    platform: a.platforms && a.platforms[0] ? a.platforms[0].platform : '',
    meta: {
      tmdbId: a.tmdbId, name: a.name || a.displayName || '', cover: a.cover || '',
      category: a.category || 'anime', latestSeason: a.latestSeason || 1, latestEpisode: a.latestEpisode || 0,
      seasonEpisodeCounts: a.seasonEpisodeCounts || {}, totalEpisodes: a.totalEpisodes || 0,
      platforms: a.platforms || [], overview: a.overview || '', firstAirDate: a.firstAirDate || '',
      voteAverage: a.voteAverage || 0, originCountry: a.originCountry || '', nextAirDate: a.nextAirDate || '',
      updateFrequency: a.updateFrequency || '',
    },
  };

  // 3) 模拟 enrichWatchlistItem（animeDb 不含该剧 -> 走 w.meta 回退）
  const animeDb = []; // 模拟该剧不在每日库
  let aa = animeDb.find((x) => String(x.tmdbId) === String(entry.tmdbId));
  if (!aa && entry.meta) aa = entry.meta;
  const cover = aa ? aa.cover : '';
  const hasCover = !!(aa && aa.cover && (aa.cover.startsWith('http') || aa.cover.startsWith('data:')));
  console.log('enrich 后 cover =', cover || '(空)', '| hasCover =', hasCover);
  console.log('结论：', hasCover ? '数据路径正常，封面应能显示（问题在图片网络可达性 image.tmdb.org）' : '数据路径丢失封面（poster_path 为空或 meta 未保存）');
})();
