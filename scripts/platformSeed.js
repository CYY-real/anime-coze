const PLATFORM_KEYS = ['bilibili', 'tencent', 'iqiyi', 'youku'];

const NAME_MAP = {
  bilibili: '哔哩哔哩',
  tencent: '腾讯视频',
  iqiyi: '爱奇艺',
  youku: '优酷',
};

const SEED = {
  '葬送的芙莉莲': ['bilibili'],
  '咒术回战': ['bilibili'],
  '鬼灭之刃': ['bilibili'],
  '进击的巨人': ['bilibili'],
  '间谍过家家': ['bilibili'],
  '链锯人': ['bilibili'],
  '我的英雄学院': ['bilibili'],
  '一拳超人': ['bilibili'],
  '灵能百分百': ['bilibili'],
  '齐木楠雄的灾难': ['bilibili'],
  're从零开始的异世界生活': ['bilibili'],
  '幼女战记': ['bilibili'],
  '珈百璃的堕落': ['bilibili'],
  '干物妹小埋': ['bilibili'],
  '租借女友': ['bilibili'],
  '总之就是非常可爱': ['bilibili'],
  '辉夜大小姐想让我告白': ['bilibili'],
  '轻音少女': ['bilibili'],
  '命运零话': ['bilibili'],
  '凉宫春日的忧郁': ['bilibili'],
  '小林家的龙女仆': ['bilibili'],
  '为美好的世界献上祝福': ['bilibili'],
  '碧蓝之海': ['bilibili'],
  '孤独摇滚': ['bilibili'],
  '更衣人偶坠入爱河': ['bilibili'],
  '派对浪客诸葛孔明': ['bilibili'],
  '工作细胞': ['bilibili'],
  '名侦探柯南': ['bilibili'],
  '蜡笔小新': ['bilibili'],
  '樱桃小丸子': ['bilibili'],
  '路人超能100': ['bilibili'],
  '凡人修仙传': ['bilibili'],
  '刺客伍六七': ['bilibili'],
  '罗小黑战记': ['bilibili'],
  '时光代理人': ['bilibili'],
  '天官赐福': ['bilibili'],
  '雾山五行': ['bilibili'],
  '镇魂街': ['bilibili'],
  '百妖谱': ['bilibili'],
  '魔道祖师': ['tencent'],
  '斗罗大陆': ['tencent'],
  '斗破苍穹': ['tencent'],
  '完美世界': ['tencent'],
  '吞噬星空': ['tencent'],
  '仙逆': ['tencent'],
  '遮天': ['tencent'],
  '一念永恒': ['tencent'],
  '雪中悍刀行': ['tencent'],
  '庆余年': ['tencent'],
  '紫川': ['tencent'],
  '狐妖小红娘': ['tencent'],
  '全职高手': ['tencent'],
  '画江湖之不良人': ['tencent'],
  '秦时明月': ['youku'],
  '少年歌行': ['youku'],
  '暗河传': ['youku'],
  '师兄啊师兄': ['youku'],
  '诛仙': ['youku'],
  '剑域风云': ['iqiyi'],
  '百炼成神': ['iqiyi'],
  '灵剑尊': ['iqiyi'],
  '逆天邪神': ['iqiyi'],
  '绝世唐门': ['iqiyi'],
  '万界仙踪': ['iqiyi'],
  '一人之下': ['bilibili', 'tencent'],
  '伍六七': ['bilibili', 'tencent'],
  '无职转生': ['bilibili'],
  '哆啦A梦': ['bilibili'],
  '航海王': ['bilibili'],
  '海贼王': ['bilibili'],
  '怪兽8号': ['bilibili'],
  '王者天下': ['bilibili'],
  '药屋少女': ['bilibili'],
  '药屋少女的呢喃': ['bilibili'],
  'jojo的奇妙冒险': ['bilibili'],
  '火影忍者': ['bilibili'],
  '死神': ['bilibili'],
  '境·界': ['bilibili'],
  '龙珠': ['bilibili'],
  '龙珠超': ['bilibili'],
  '犬夜叉': ['bilibili'],
  '钢之炼金术师': ['bilibili'],
  '银魂': ['bilibili'],
  '青春猪头少年': ['bilibili'],
  '堀与宫村': ['bilibili'],
  '圣斗士星矢': ['bilibili'],
  '数码宝贝': ['bilibili'],
  '精灵宝可梦': ['bilibili'],
  '神奇宝贝': ['bilibili'],
  '诡秘之主': ['tencent'],
  '全职法师': ['tencent'],
  '剑来': ['tencent'],
};

function norm(s) {
  if (!s) return '';
  return String(s)
    .toLowerCase()
    .replace(/[\s　·•:：\-_'’",，。、()（）！!?？]/g, '');
}

const NORM_SEED = {};
Object.keys(SEED).forEach((k) => {
  NORM_SEED[norm(k)] = SEED[k].filter((p) => PLATFORM_KEYS.includes(p));
});

const ALIAS = {
  frieren: ['bilibili'],
  jujutsukaisen: ['bilibili'],
  demonslayer: ['bilibili'],
  attackontitan: ['bilibili'],
  spyxfamily: ['bilibili'],
  chainsawman: ['bilibili'],
  myheroacademia: ['bilibili'],
  onepunchman: ['bilibili'],
  rezero: ['bilibili'],
};

function matchPlatforms(name, originalName) {
  const candidates = [norm(name), norm(originalName)].filter(Boolean);
  for (const c of candidates) {
    const hit = NORM_SEED[c] || ALIAS[c];
    if (hit && hit.length) {
      return hit.map((platform) => ({ platform, name: NAME_MAP[platform] || platform, url: '' }));
    }
  }
  const SEED_KEYS = Object.keys(NORM_SEED);
  for (const c of candidates) {
    if (c.length < 2) continue;
    for (const sk of SEED_KEYS) {
      if (c.includes(sk) || sk.includes(c)) {
        const hit = NORM_SEED[sk];
        if (hit && hit.length) return hit.map((platform) => ({ platform, name: NAME_MAP[platform] || platform, url: '' }));
      }
    }
  }
  return [];
}

module.exports = { matchPlatforms, SEED, PLATFORM_KEYS, NAME_MAP };
