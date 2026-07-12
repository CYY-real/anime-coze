import re

PATH = '/Users/chenying/anime-coze/index.html'
with open(PATH, 'r', encoding='utf-8') as f:
    html = f.read()

NEW_SEED = """    watchlist = [
      { tmdbId: 106449, name: '凡人修仙传', watchedSeason: 1, watchedEpisode: 180, latestSeason: 1, latestEpisode: 96, threshold: 5, notifyEnabled: true, lastNotifiedAt: '', lastNotifiedEpisode: 0, platforms: [{platform:'bilibili',name:'哔哩哔哩',url:'https://v.qq.com/x/cover/mzc00200r8j8vut.html',isPrimary:true}], updateFrequency: '周更' },
      { tmdbId: 223911, name: '仙逆', watchedSeason: 1, watchedEpisode: 130, latestSeason: 1, latestEpisode: 26, threshold: 3, notifyEnabled: true, lastNotifiedAt: '', lastNotifiedEpisode: 0, platforms: [{platform:'tencent',name:'腾讯视频',url:'',isPrimary:true}], updateFrequency: '周更' },
      { tmdbId: 91097, name: '灵笼', watchedSeason: 1, watchedEpisode: 16, latestSeason: 1, latestEpisode: 16, threshold: 3, notifyEnabled: false, lastNotifiedAt: '', lastNotifiedEpisode: 0, status: 'dropped', platforms: [{platform:'bilibili',name:'哔哩哔哩',url:'',isPrimary:true}], updateFrequency: '已完结' },
      { tmdbId: 124003, name: '完美世界', watchedSeason: 1, watchedEpisode: 241, latestSeason: 1, latestEpisode: 277, threshold: 0, notifyEnabled: true, lastNotifiedAt: '', lastNotifiedEpisode: 0, platforms: [{platform:'tencent',name:'腾讯视频',url:'',isPrimary:true}], platform: 'tencent', updateFrequency: '' },
      { tmdbId: 224839, name: '遮天', watchedSeason: 1, watchedEpisode: 146, latestSeason: 1, latestEpisode: 170, threshold: 0, notifyEnabled: true, lastNotifiedAt: '', lastNotifiedEpisode: 0, platforms: [{platform:'tencent',name:'腾讯视频',url:'',isPrimary:true}], platform: 'tencent', updateFrequency: '' },
      { tmdbId: 229192, name: '沧元图', watchedSeason: 1, watchedEpisode: 49, latestSeason: 1, latestEpisode: 85, threshold: 0, notifyEnabled: true, lastNotifiedAt: '', lastNotifiedEpisode: 0, platforms: [], platform: '', updateFrequency: '' },
      { tmdbId: 228429, name: '斗罗大陆Ⅱ绝世唐门', watchedSeason: 1, watchedEpisode: 0, latestSeason: 1, latestEpisode: 161, threshold: 0, notifyEnabled: true, lastNotifiedAt: '', lastNotifiedEpisode: 0, platforms: [{platform:'tencent',name:'腾讯视频',url:'',isPrimary:true}], platform: 'tencent', updateFrequency: '' },
      { tmdbId: 218642, name: '师兄啊师兄', watchedSeason: 1, watchedEpisode: 129, latestSeason: 1, latestEpisode: 149, threshold: 0, notifyEnabled: true, lastNotifiedAt: '', lastNotifiedEpisode: 0, platforms: [{platform:'youku',name:'优酷',url:'',isPrimary:true}], platform: 'youku', updateFrequency: '' },
      { tmdbId: 259537, name: '剑来', watchedSeason: 1, watchedEpisode: 0, latestSeason: 2, latestEpisode: 27, threshold: 0, notifyEnabled: true, lastNotifiedAt: '', lastNotifiedEpisode: 0, platforms: [{platform:'tencent',name:'腾讯视频',url:'',isPrimary:true}], platform: 'tencent', updateFrequency: '' },
    ];"""

# 只替换「兜底注入」那一段：从 "    watchlist = [" 起，到下一个行首为4空格的 "    ];" 止
pattern = re.compile(r"    watchlist = \[.*?\n    \];", re.DOTALL)
matches = pattern.findall(html)
print(f'找到 watchlist = [ ... ]; 段数: {len(matches)}')
if len(matches) != 1:
    print('❌ 匹配不唯一，中止以免误改')
    raise SystemExit(1)

new_html, n = pattern.subn(NEW_SEED, html, count=1)
if n != 1:
    print('❌ 替换失败')
    raise SystemExit(1)

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(new_html)
print('✅ 已用 9 条真实数据替换硬编码种子')
