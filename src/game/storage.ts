import { LOCALES, type Locale } from '../i18n/keys';

type Backing = Pick<Storage, 'getItem' | 'setItem'> & Partial<Pick<Storage, 'removeItem'>>;

export class Store {
  private backing: Backing | null;

  constructor(backing?: Backing) {
    this.backing = backing ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    this.migrate();
  }

  /**
   * 一次性升级本地存储，只在构造时跑一遍。
   *
   * 关键是那个版本标记：迁移要判断的是「cl.lang 是**升级之前**写下的」，
   * 而新代码自己也会给每个人写 cl.lang。没有标记就无从分辨，于是新用户
   * 第一次访问写下 cl.lang、第二次访问就被判成「已亲选」并永久钉死，
   * 分享的 /ja/ 链接与 ?lang= 对所有人失效——那正是这个标记要防的事。
   * 标记一写，此后 cl.lang 再怎么写都不会被追认为亲选。
   */
  private migrate() {
    if (this.read('langV')) return;

    // 简/繁二元时代的 cl.script → cl.lang。新键已有值时只清旧键，不覆盖——
    // cl.lang 是更晚、更具体的偏好，旧键无权盖过它。
    const legacy = this.read('script');
    if (legacy) {
      if (!this.read('lang')) this.write('lang', legacy === 'hant' ? 'zh-Hant' : 'zh-Hans');
      this.drop('script');
    }
    // 升级前就存在的语种偏好：无从分辨是否亲选，按亲选对待——宁可让没选过的
    // 老用户继续用他一直在用的语言，也不能让真正选过的人被别人的链接顶掉。
    if (this.read('lang')) this.write('langPinned', '1');

    this.write('langV', '2');
  }

  private read(key: string): string | null {
    try { return this.backing?.getItem(`cl.${key}`) || null; } catch { return null; }
  }
  private write(key: string, v: string) {
    try { this.backing?.setItem(`cl.${key}`, v); } catch { /* 隐私模式等，忽略 */ }
  }
  private drop(key: string) {
    // removeItem 未必存在（测试替身、老环境），退而置空串——read 用 || 判空，等效于无值
    try {
      if (this.backing?.removeItem) this.backing.removeItem(`cl.${key}`);
      else this.backing?.setItem(`cl.${key}`, '');
    } catch { /* 忽略 */ }
  }

  get best(): number { return Number(this.read('best')) || 0; }
  set best(v: number) { this.write('best', String(v)); }

  get nickname(): string { return this.read('nickname') ?? ''; }
  set nickname(v: string) { this.write('nickname', v); }

  get muted(): boolean { return this.read('muted') === '1'; }
  set muted(v: boolean) { this.write('muted', v ? '1' : '0'); }

  /**
   * 用户是否**亲自**选过语种（在语言菜单里点过）。
   *
   * 要跟「碰巧存着一个语种」区分开：浏览器语言推断出来的、以及为了不重复
   * 提示而落盘的那次，都不算数。只有亲选的才有资格盖过别人分享来的
   * /ja/ 链接——否则点一次朋友的链接就会永久改掉自己的选择。
   */
  get langPinned(): boolean { return this.read('langPinned') === '1'; }
  set langPinned(v: boolean) { this.write('langPinned', v ? '1' : '0'); }

  /** 语种偏好。无偏好返回 null（上层据此去问浏览器语言）。旧键的迁移见 migrate()。 */
  get lang(): Locale | null {
    const stored = this.read('lang');
    return stored && LOCALES.some(l => l.id === stored) ? (stored as Locale) : null;
  }
  set lang(v: Locale) { this.write('lang', v); }
}
