type Backing = Pick<Storage, 'getItem' | 'setItem'>;

export class Store {
  private backing: Backing | null;

  constructor(backing?: Backing) {
    this.backing = backing ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  }

  private read(key: string): string | null {
    try { return this.backing?.getItem(`cl.${key}`) ?? null; } catch { return null; }
  }
  private write(key: string, v: string) {
    try { this.backing?.setItem(`cl.${key}`, v); } catch { /* 隐私模式等，忽略 */ }
  }

  get best(): number { return Number(this.read('best')) || 0; }
  set best(v: number) { this.write('best', String(v)); }

  get nickname(): string { return this.read('nickname') ?? ''; }
  set nickname(v: string) { this.write('nickname', v); }

  get muted(): boolean { return this.read('muted') === '1'; }
  set muted(v: boolean) { this.write('muted', v ? '1' : '0'); }

  get script(): 'hans' | 'hant' { return this.read('script') === 'hant' ? 'hant' : 'hans'; }
  set script(v: 'hans' | 'hant') { this.write('script', v); }
}
