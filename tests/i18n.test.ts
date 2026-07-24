import { describe, it, expect } from 'vitest';
import { LOCALES, type Locale } from '../src/i18n/keys';
import { zhHans } from '../src/i18n/zh-Hans';
import {
  MESSAGES, resolveLocale, pickLocale, getLocale, setLocale, fontKai, fontHud, tf,
} from '../src/i18n';
import { langMenuHit, langMenuRowCenter } from '../src/render/ui';
import { WORLD_H } from '../src/game/constants';
import { clientToWorld, worldToClient } from '../src/render/viewport';

describe('文案完整性', () => {
  const keys = Object.keys(zhHans) as (keyof typeof zhHans)[];

  it('key 数量合理', () => {
    expect(keys.length).toBeGreaterThan(70);
  });

  it('LOCALES 五语种且 id 唯一', () => {
    expect(LOCALES.length).toBe(5);
    expect(new Set(LOCALES.map(l => l.id)).size).toBe(5);
    expect(LOCALES[0].id).toBe('zh-Hans'); // 首项为默认语种
  });

  for (const { id } of LOCALES) {
    it(`${id} 覆盖全部 key 且无空值`, () => {
      const table = MESSAGES[id];
      const missing = keys.filter(k => typeof table[k] !== 'string');
      expect(missing, `缺失: ${missing.join(', ')}`).toEqual([]);
      // .src（出处行）允许空串表示「无出处」，其余不得为空
      const blank = keys.filter(k => !String(k).endsWith('.src') && table[k].trim() === '');
      expect(blank, `空文案: ${blank.join(', ')}`).toEqual([]);
    });
  }
});

describe('resolveLocale', () => {
  it.each([
    ['zh-TW', 'zh-Hant'], ['zh-HK', 'zh-Hant'], ['zh-MO', 'zh-Hant'], ['zh-Hant-TW', 'zh-Hant'],
    ['zh-CN', 'zh-Hans'], ['zh-SG', 'zh-Hans'], ['zh-Hans', 'zh-Hans'], ['zh', 'zh-Hans'],
    ['ja-JP', 'ja'], ['ja', 'ja'], ['ko-KR', 'ko'], ['ko', 'ko'],
    ['en-US', 'en'], ['en', 'en'],
    ['pt-BR', 'en'], ['de', 'en'], ['ar-SA', 'en'], ['', 'en'],
  ])('%s → %s', (input, want) => {
    expect(resolveLocale(input)).toBe(want);
  });

  it('大小写与下划线写法也认', () => {
    expect(resolveLocale('ZH_TW')).toBe('zh-Hant');
    expect(resolveLocale('JA_jp')).toBe('ja');
  });

  it('null / undefined 兜底 en', () => {
    expect(resolveLocale(null)).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
  });
});

describe('pickLocale 优先级', () => {
  it('query 最高', () => {
    expect(pickLocale({ query: 'ja', injected: 'en', stored: 'ko', navigator: ['zh-CN'] }))
      .toEqual({ locale: 'ja', auto: false });
  });

  it('注入的路径语种高于 localStorage —— 分享来的 /ja/ 链接是显式意图', () => {
    expect(pickLocale({ injected: 'ja', stored: 'ko', navigator: ['en'] }))
      .toEqual({ locale: 'ja', auto: false });
  });

  it('无 query / 注入时用 localStorage', () => {
    expect(pickLocale({ stored: 'ko', navigator: ['en'] }))
      .toEqual({ locale: 'ko', auto: false });
  });

  it('都没有则按 navigator 推断，并标记 auto', () => {
    expect(pickLocale({ navigator: ['fr-FR', 'en-GB'] }))
      .toEqual({ locale: 'en', auto: true });
    expect(pickLocale({ navigator: ['zh-TW'] }))
      .toEqual({ locale: 'zh-Hant', auto: true });
  });

  it('全空兜底 en 且为 auto', () => {
    expect(pickLocale({})).toEqual({ locale: 'en', auto: true });
  });

  // 审查抓到的核心场景：亲选的语种必须盖过别人分享来的路径语种，
  // 否则点一次朋友的 /ja/ 链接就把自己选的韩文永久顶掉。
  it('亲选的偏好盖过注入的路径语种', () => {
    expect(pickLocale({ injected: 'ja', stored: 'ko', pinned: true, navigator: ['en'] }))
      .toEqual({ locale: 'ko', auto: false });
  });

  it('未亲选时路径语种仍然优先（首次从 /ja/ 进来就该是日文）', () => {
    expect(pickLocale({ injected: 'ja', stored: 'ko', pinned: false, navigator: ['en'] }))
      .toEqual({ locale: 'ja', auto: false });
  });

  // 亲选必须压过 ?lang=：否则在 ?lang=ja 的链接上选了韩文，一刷新又变回
  // 日文，选择器在用户看来就是坏的。
  it('亲选压过 ?lang=', () => {
    expect(pickLocale({ query: 'ja', injected: 'en', stored: 'ko', pinned: true }))
      .toEqual({ locale: 'ko', auto: false });
  });

  it('未亲选时 ?lang= 仍最高，便于预览与排障', () => {
    expect(pickLocale({ query: 'en', injected: 'ja', stored: 'ko', pinned: false }))
      .toEqual({ locale: 'en', auto: false });
  });

  it('亲选但存的值无法识别时不生效，继续往下走', () => {
    expect(pickLocale({ stored: 'klingon', pinned: true, injected: 'ja' }))
      .toEqual({ locale: 'ja', auto: false });
  });

  it('无法识别的 query 不算数，继续往下走', () => {
    expect(pickLocale({ query: 'xx-YY', stored: 'ko' })).toEqual({ locale: 'ko', auto: false });
  });
});

describe('字体栈按语种切换', () => {
  const after = <T>(l: Locale, fn: () => T): T => {
    const prev = getLocale();
    setLocale(l);
    try { return fn(); } finally { setLocale(prev); }
  };

  it('每个语种都给出非空字体栈，且以 serif 兜底', () => {
    for (const { id } of LOCALES) {
      for (const f of [after(id, fontKai), after(id, fontHud)]) {
        expect(f.length, id).toBeGreaterThan(0);
        expect(f.endsWith('serif'), `${id}: ${f}`).toBe(true);
      }
    }
  });

  it('中文用楷体，英文用衬线西文，日文用明朝，韩文用明朝体', () => {
    expect(after('zh-Hans', fontKai)).toContain('楷体');
    expect(after('zh-Hant', fontKai)).toContain('楷体');
    expect(after('en', fontKai)).toContain('Georgia');
    expect(after('ja', fontKai)).toContain('Mincho');
    expect(after('ko', fontKai)).toMatch(/Myeongjo|Batang/);
  });

  it('日韩栈都补了同语种黑体兜底（Windows 默认不装明朝/明朝体，宁可退化也不能出豆腐块）', () => {
    expect(after('ja', fontKai)).toContain('Yu Gothic');
    expect(after('ko', fontKai)).toContain('Malgun Gothic');
  });
});

/**
 * 模拟一个真实视口，并**调用生产代码里那份** clientToWorld / worldToClient
 * （src/render/viewport.ts，Renderer 绘制与命中同样走它）。
 *
 * 上一版这里手写了一份逆运算，恰好是绘制式的代数逆，offX/offY/scale/dpr
 * 全部抵消，等于把 langMenuRowCenter(i) 原样喂回 langMenuHit——对任何实现
 * 都不会失败。现在改为走真实实现，坐标系一错就必然红。
 */
function viewport(cssW: number, cssH: number, dpr = 2, stretchY = 1) {
  // backing store 按 innerWidth/innerHeight*dpr 设，而 CSS 盒按 100vw/100vh，
  // stretchY 模拟移动端 100vh ≠ innerHeight 时的纵向拉伸
  const canvasW = cssW * dpr, canvasH = cssH * dpr;
  const rect = { left: 0, top: 0, width: cssW, height: cssH * stretchY };
  const vw = Math.max(820, Math.min(1400, WORLD_H * canvasW / canvasH));
  return {
    vw,
    toClient: (fx: number, fy: number) =>
      worldToClient(fx * vw, fy * WORLD_H, rect, canvasW, canvasH, vw),
    toWorld: (clientX: number, clientY: number) => {
      const w = clientToWorld({ clientX, clientY, rect, canvasW, canvasH, vw });
      return { fx: w.x / vw, fy: w.y / WORLD_H };
    },
  };
}

describe('语言菜单命中区', () => {
  it('五项各自的中心点命中对应语种，顺序与 LOCALES 一致', () => {
    LOCALES.forEach(({ id }, i) => {
      const { fy } = langMenuRowCenter(i);
      expect(langMenuHit(0.5, fy), id).toBe(id);
    });
  });

  // 这几档覆盖了会触发信箱化的视口：竖屏手机、4:3 平板、超宽屏。
  // 命中若还用屏幕坐标，竖屏那档会整体错行——正是审查抓到的那个 bug。
  it.each([
    ['竖屏手机 390x844', 390, 844, 1],
    ['4:3 平板 1024x768', 1024, 768, 1],
    ['方屏 800x800', 800, 800, 1],
    ['16:9 桌面 1920x1080', 1920, 1080, 1],
    ['超宽 2560x1080', 2560, 1080, 1],
    // 移动端 100vh 大于 innerHeight（地址栏可见）时画布被纵向拉伸
    ['手机横屏 + 15% 纵向拉伸', 844, 390, 1.15],
    ['手机竖屏 + 12% 纵向拉伸', 390, 844, 1.12],
  ])('%s：点到哪一行就选中哪一行', (_label, cssW, cssH, stretchY) => {
    const vp = viewport(cssW, cssH, 2, stretchY);
    LOCALES.forEach(({ id }, i) => {
      const { fx, fy } = langMenuRowCenter(i);
      const pt = vp.toClient(fx, fy);          // 该行真正画到屏幕上的像素
      const w = vp.toWorld(pt.clientX, pt.clientY); // 走真实 clientToWorld
      expect(langMenuHit(w.fx, w.fy), `${_label} 第 ${i} 行(${id})`).toBe(id);
    });
  });

  // 自证：若像旧代码那样直接把**屏幕**比例喂给命中函数，竖屏下必然错行。
  // 这条一旦变绿，说明上面那组视口用例已经失去意义。
  it('直接用屏幕比例（旧写法）在竖屏下确实会选错——故必须先换算', () => {
    const vp = viewport(390, 844);
    const { fx, fy } = langMenuRowCenter(0);           // 第 0 行：简体中文
    const pt = vp.toClient(fx, fy);
    expect(langMenuHit(pt.clientX / 390, pt.clientY / 844)).not.toBe('zh-Hans');
  });

  it('竖屏下最后一行用旧写法根本点不到', () => {
    const vp = viewport(390, 844);
    const last = LOCALES.length - 1;
    const { fx, fy } = langMenuRowCenter(last);
    const pt = vp.toClient(fx, fy);
    expect(langMenuHit(pt.clientX / 390, pt.clientY / 844)).not.toBe(LOCALES[last].id);
  });

  it('点在面板左右之外不命中', () => {
    const { fy } = langMenuRowCenter(0);
    expect(langMenuHit(0.05, fy)).toBeNull();
    expect(langMenuHit(0.95, fy)).toBeNull();
  });

  it('点在面板上下之外不命中（用于「点面板外关闭」）', () => {
    expect(langMenuHit(0.5, 0.02)).toBeNull();
    expect(langMenuHit(0.5, 0.98)).toBeNull();
  });

  it('相邻两项的命中区不重叠', () => {
    const seen = LOCALES.map((_, i) => langMenuHit(0.5, langMenuRowCenter(i).fy));
    expect(new Set(seen).size).toBe(LOCALES.length);
  });
});

describe('首次自动推荐提示', () => {
  it('tf 把 {lang} 换成语种自称', () => {
    setLocale('en');
    const s = tf('lang.autoPicked', { lang: 'English' });
    expect(s).toContain('English');
    expect(s).not.toContain('{lang}');
    setLocale('zh-Hans');
  });

  it('漏传占位符时原样保留，好让测试发现', () => {
    setLocale('en');
    expect(tf('lang.autoPicked', {})).toContain('{lang}');
    setLocale('zh-Hans');
  });

  it('五个语种的提示都带 {lang} 占位符', () => {
    for (const { id } of LOCALES) {
      expect(MESSAGES[id]['lang.autoPicked'], id).toContain('{lang}');
    }
  });
});

describe('语言菜单的标题与关闭提示', () => {
  it('5 语种齐全且非空', () => {
    for (const { id } of LOCALES) {
      for (const k of ['lang.title', 'lang.close', 'lang.close.touch']) {
        expect(MESSAGES[id][k as keyof typeof zhHans], `${id} ${k}`).toBeTruthy();
      }
    }
  });

  it('触屏变体不提键位（触屏没有 T 键）', () => {
    for (const { id } of LOCALES) {
      expect(MESSAGES[id]['lang.close.touch' as keyof typeof zhHans], id).not.toMatch(/\bT\b/);
    }
  });
});

describe('被牌子取代的旧键', () => {
  it('已从所有语种移除，不留死文案', () => {
    const dead = ['title.lang', 'title.lang.touch', 'help.open', 'help.open.touch'];
    const left: string[] = [];
    for (const { id } of LOCALES) {
      for (const k of dead) {
        if (k in MESSAGES[id]) left.push(`${id} 残留 ${k}`);
      }
    }
    expect(left, left.join('; ')).toEqual([]);
  });
});
