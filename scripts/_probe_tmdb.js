const https = require('https');
const httpsProxy = '';
const q = process.argv[2] || '凡人修仙传';
const url = `https://anime-coze-cyy.pages.dev/api/tmdb?q=${encodeURIComponent(q)}`;
https.get(url, (res) => {
  let s = '';
  res.on('data', (d) => (s += d));
  res.on('end', () => {
    try {
      const j = JSON.parse(s);
      const r = (j.results || []).slice(0, 3);
      if (r.length === 0) { console.log('结果空:', s.slice(0, 200)); return; }
      r.forEach((x) => console.log('tmdbId=', x.tmdbId, '| name=', x.name, '| cover=', x.cover || '(空)'));
    } catch (e) {
      console.log('解析失败:', s.slice(0, 200));
    }
  });
}).on('error', (e) => console.log('请求错误:', e.message));
