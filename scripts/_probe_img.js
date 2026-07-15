const https = require('https');
const u = 'https://anime-coze-cyy.pages.dev/api/img?p=' + encodeURIComponent('/t/p/w500/u1VRjvvCIVwb1MUhoxSAUimhoKZ.jpg');
https.get(u, (res) => {
  const ct = res.headers['content-type'];
  const len = res.headers['content-length'];
  console.log('HTTP', res.statusCode, '| content-type=', ct, '| content-length=', len);
  res.destroy();
  if (res.statusCode === 200 && (ct || '').startsWith('image/')) {
    console.log('✅ 图片代理可用：浏览器经 /api/img 即可拿到 TMDB 封面（国内可达）');
  } else {
    console.log('⚠️ 代理返回异常');
  }
}).on('error', (e) => console.log('请求错误:', e.message));
