// 站点级本地化元信息：页面 <head>、og 卡片、分享文案共用的唯一真源。
//
// 刻意用纯 JS 而非 TS：预渲染与 og 生成都是 node 脚本，不经 vite 编译。
// 语种集合与 htmlLang / ogLocale / native 必须与 src/i18n/keys.ts 保持一致，
// tests/prerender.test.ts 会同时导入两边比对，漂移即报错。

export const SITE_URL = 'https://kuafu.newzone.top';

/** 首项为默认语种（canonical，落在根路径），与 keys.ts 的 LOCALES 同序。 */
export const SITE = [
  {
    id: 'zh-Hans', htmlLang: 'zh-Hans', ogLocale: 'zh_CN', native: '简体中文',
    title: '逐光 · Chasing Light',
    description: '逐光·夸父逐日——剪影风神话跑酷：化身夸父追逐永不可及的太阳，拾日光壮行、发夸父跨步、逃长夜之追噬，看你能逐日多远。',
    ogTitle: '逐光 · 夸父逐日',
    ogDescription: '剪影风神话跑酷：化身夸父追逐永不可及的太阳，看你能逐日多远。',
    cardTitle: '逐 光',
    cardSub: '夸 父 逐 日',
    cardTagline: '剪影风神话跑酷 · 追一轮永不可及的太阳',
    cardFooter: '365 开源计划 #25',
  },
  {
    id: 'zh-Hant', htmlLang: 'zh-Hant', ogLocale: 'zh_TW', native: '繁體中文',
    title: '逐光 · Chasing Light',
    description: '逐光·夸父逐日——剪影風神話跑酷：化身夸父追逐永不可及的太陽，拾日光壯行、發夸父跨步、逃長夜之追噬，看你能逐日多遠。',
    ogTitle: '逐光 · 夸父逐日',
    ogDescription: '剪影風神話跑酷：化身夸父追逐永不可及的太陽，看你能逐日多遠。',
    cardTitle: '逐 光',
    cardSub: '夸 父 逐 日',
    cardTagline: '剪影風神話跑酷 · 追一輪永不可及的太陽',
    cardFooter: '365 開源計劃 #25',
  },
  {
    id: 'en', htmlLang: 'en', ogLocale: 'en_US', native: 'English',
    title: 'Chasing Light · Kuafu and the Sun',
    description: 'Chasing Light — a silhouette-art mythic runner. Race the sun as Kuafu of Chinese myth: gather sunlight, unleash the Stride, outrun the swallowing night. How far can you chase?',
    ogTitle: 'Chasing Light · Kuafu and the Sun',
    ogDescription: 'A silhouette-art mythic runner: race the sun that can never be caught.',
    cardTitle: 'CHASING LIGHT',
    cardSub: 'KUAFU AND THE SUN',
    cardTagline: 'A silhouette mythic runner · chase a sun you can never catch',
    cardFooter: '365 Open Source #25',
  },
  {
    id: 'ja', htmlLang: 'ja', ogLocale: 'ja_JP', native: '日本語',
    title: '逐光 · 夸父逐日',
    description: '逐光·夸父逐日——シルエット神話ランナー。中国神話の夸父となり、決して追ひつけぬ日を逐ふ。日の光を拾ひ、夸父の跨歩を放ち、長夜の追噬を逃れよ。',
    ogTitle: '逐光 · 夸父逐日',
    ogDescription: 'シルエット神話ランナー：決して追ひつけぬ太陽を逐ふ。',
    cardTitle: '逐 光',
    cardSub: '夸 父 逐 日',
    cardTagline: 'シルエット神話ランナー · 追ひつけぬ日を逐ふ',
    cardFooter: '365 オープンソース計画 #25',
  },
  {
    id: 'ko', htmlLang: 'ko', ogLocale: 'ko_KR', native: '한국어',
    title: '빛을 좇다 · 과보축일',
    description: '빛을 좇다·과보축일 —— 실루엣 신화 러너. 중국 신화의 과보가 되어 결코 닿을 수 없는 해를 좇는다. 햇빛을 거두고, 과보의 도보를 펼치며, 긴 밤의 추격을 벗어나라.',
    ogTitle: '빛을 좇다 · 과보축일',
    ogDescription: '실루엣 신화 러너: 결코 닿을 수 없는 해를 좇다.',
    cardTitle: '빛 을 좇 다',
    cardSub: '과 보 축 일',
    cardTagline: '실루엣 신화 러너 · 닿을 수 없는 해를 좇다',
    cardFooter: '365 오픈소스 계획 #25',
  },
];

export const DEFAULT_ID = SITE[0].id;

/** 该语种页面的站内路径（默认语种落在根）。 */
export function localePath(id) {
  return id === DEFAULT_ID ? '/' : `/${id}/`;
}

/** 该语种页面的绝对 URL。 */
export function localeUrl(id) {
  return `${SITE_URL}${localePath(id)}`;
}

export function localeMeta(id) {
  const m = SITE.find(s => s.id === id);
  if (!m) throw new Error(`未知语种: ${id}`);
  return m;
}
