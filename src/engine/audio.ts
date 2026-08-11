export class Audio2 {
  muted = false;
  private ctx: AudioContext | null = null;
  private master: DynamicsCompressorNode | null = null;

  /**
   * 总输出限幅：所有声源都先汇到这里，再出 destination。
   *
   * 此前每个音各自直连 destination，谁也不知道别人多响。单个音都克制（0.08~0.16），
   * 但后程小怪渐密、乐床节拍也渐紧，击杀 + 拾光 + 落地 + 大招 + 死亡的短音会挤进
   * 同几帧叠加——分开听都对，加起来就糊成一团。限幅器按住峰值，混音再挤也不炸。
   *
   * 早期实测峰值只到 0.31（不削顶），所以这是给后程密集段兜底的，不是修一个
   * 已复现的削顶。
   */
  private out(): AudioNode | null {
    if (!this.ctx) return null;
    if (!this.master) {
      const c = this.ctx.createDynamicsCompressor();
      c.threshold.value = -14;
      c.knee.value = 24;
      c.ratio.value = 12;
      c.attack.value = 0.003;
      c.release.value = 0.2;
      c.connect(this.ctx.destination);
      this.master = c;
    }
    return this.master;
  }

  unlock() {
    if (!this.ctx) {
      try { this.ctx = new AudioContext(); } catch { return; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  /**
   * 起音时长。增益从 0 瞬跳到峰值会在波形头上切出一个阶跃，耳朵听到的是一记
   * 爆音（click）——音量越大、频率越低越明显，死亡音那一记「噪音特别大」有一半
   * 来自这里。6ms 短到听不出延迟，却足以把阶跃磨圆。
   *
   * 注意不能用 0 起步：exponentialRamp 碰不得零，得从一个极小值爬上去。
   */
  private static readonly ATTACK = 0.006;

  /** freq 起止频率滑音，type 波形，dur 秒，vol 峰值音量 */
  private blip(f0: number, f1: number, dur: number, type: OscillatorType, vol = 0.15) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const atk = Math.min(Audio2.ATTACK, dur * 0.4);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + atk);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const out = this.out();
    if (!out) return;
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + dur);
  }

  jump() { this.blip(300, 600, 0.12, 'square', 0.08); }
  dash() { this.blip(700, 200, 0.18, 'sawtooth', 0.1); }
  mote() { this.blip(900, 1400, 0.1, 'sine', 0.12); }
  crystal() { this.blip(500, 1000, 0.2, 'triangle', 0.12); }
  /**
   * 死亡的一记闷响。
   *
   * 原来是 sawtooth 220→40Hz @0.15：锯齿含全部谐波，又一路扫到 40Hz——手机喇叭
   * 推不出那么低，只会把它还成失真，听感就是「噪音特别大」。改三角波（谐波少得
   * 多）、止步于 55Hz、音量压到 0.10。冲击力本来就有震屏 0.9 与顿帧 0.09 扛着，
   * 不必靠音量硬撑；后面还有 knell() 那记落幕音收尾。
   */
  death() { this.blip(200, 55, 0.45, 'triangle', 0.10); }
  kill() { this.blip(600, 150, 0.15, 'square', 0.12); }
  stride() { this.blip(180, 900, 0.35, 'sawtooth', 0.16); this.blip(90, 300, 0.4, 'triangle', 0.12); }
  charged() { this.blip(700, 1300, 0.18, 'sine', 0.1); } // 神力充满提示

  /**
   * 长夜逼近的心跳。`v` 0..1 = 危险度，只调音量不调音高——
   * 心跳该是越来越急（间隔由调用方缩短）、越来越重，而不是越来越尖。
   * 压得比其它音效低一档：它是持续的底噪，抢过拾取/跳跃就成了噪音。
   */
  heartbeat(v: number) { this.blip(66, 38, 0.15, 'sine', 0.04 + 0.09 * v); }

  /**
   * 死亡收束的落幕音：黑场转入结局图那一刻敲一记。
   * 低而长、尾巴拖得开，与开局的清脆拾取音正好相反——听感上是「合上」而非「触发」。
   * 没有它，四拍收束是纯视觉的：画面已经沉进黑里，耳朵却还停在上一秒。
   */
  knell() {
    this.blip(120, 44, 1.1, 'sine', 0.13);
    this.blip(61, 30, 1.5, 'triangle', 0.09);
  }

  // ——— 环境乐床·逐日（纯古筝式事件音，绝无持续音、绝不嗡鸣）———
  // 驱动型五声固定音型（稳定跑动 = 奔逐推进）+ 疏落旋律短句。每音皆为拨弦、
  // 各自衰减，杜绝任何恒定嗡鸣；仅一条总线做缓入缓出与音色塑形。
  private ambientOn = false;
  private bus: { g: GainNode; filt: BiquadFilterNode } | null = null;
  private nextBeat = 0;   // 固定音型时钟
  private beatIdx = 0;
  private nextPhrase = 0; // 旋律短句时钟
  private static readonly PENTA = [0, 2, 4, 7, 9]; // 五声（D 宫：D E #F A B）
  private static readonly ROOT = 73.42;            // D2
  // 驱动固定音型：低-中五声跑动 + 末拍休止（0），三音一顿、留出律动呼吸，不密集连打
  private static readonly OSTINATO = [146.83, 220.0, 293.66, 0]; // D3 A3 D4 (休)
  // 疏落旋律短句（度数，D4 起两个八度），偶奏其上
  private static readonly MOTIFS = [
    [0, 2, 4], [5, 4, 2, 0], [2, 4, 5, 4], [0, 1, 3], [4, 3, 1, 0],
  ];

  private noteFreq(deg: number): number {
    const n = Audio2.PENTA.length;
    const semis = Audio2.PENTA[deg % n] + 12 * Math.floor(deg / n);
    return Audio2.ROOT * 4 * Math.pow(2, semis / 12); // ROOT*4 = D4 起
  }

  private startAmbient() {
    if (!this.ctx || this.ambientOn) return;
    const t = this.ctx.currentTime;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 2000; filt.Q.value = 0.3; // 仅柔化泛音，非发声
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.9, t + 1.5); // 总线缓入；实际音量在各拨弦内控制
    const out = this.out();
    if (!out) return;
    filt.connect(g).connect(out);
    this.bus = { g, filt };
    this.ambientOn = true;
    this.nextBeat = t + 0.3;
    this.beatIdx = 0;
    this.nextPhrase = t + 3.5;
  }

  /** HMR / 页面卸载时释放：关闭音频上下文。 */
  dispose() {
    this.ambientOn = false;
    this.bus = null;
    this.master = null;
    if (this.ctx) { this.ctx.close().catch(() => {}); this.ctx = null; }
  }

  private stopAmbient() {
    if (!this.ctx || !this.bus) return;
    const t = this.ctx.currentTime;
    const { g, filt } = this.bus;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0.0001, t + 0.4); // 缓出后余音自然收
    this.bus = null;
    this.ambientOn = false;
    // 缓出结束后把这条旧总线摘下来。原先只是把引用置空，节点仍挂在图上——
    // 每死一次泄一对 gain+filter，玩十几局就有几十条常驻支路一直参与混音渲染，
    // 音频线程越来越吃力，正是「玩着玩着声音开始发毛」的那种脏。
    setTimeout(() => { try { g.disconnect(); filt.disconnect(); } catch { /* 已关闭 */ } }, 700);
  }

  /** 古筝拨弦：三角基音 + 八度正弦泛音提亮，快起慢落；at 延时、dur 时值。 */
  private pluck(f: number, vol: number, at = 0, dur = 1.1) {
    if (!this.ctx || !this.bus) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const h = this.ctx.createOscillator(); h.type = 'sine'; h.frequency.value = f * 2;
    const hg = this.ctx.createGain(); hg.gain.value = 0.25;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.bus.filt);
    h.connect(hg).connect(g);
    o.start(t); o.stop(t + dur + 0.05);
    h.start(t); h.stop(t + dur + 0.05);
  }

  /** 每帧调用：active 时维持乐床；驱动音型 + 疏落旋律，纯拨弦无持续音。 */
  ambient(prog: number, active: boolean) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (active && !this.muted) {
      if (!this.ambientOn) this.startAmbient();
    } else {
      if (this.ambientOn) this.stopAmbient();
      return;
    }
    if (!this.bus) return;
    const t = this.ctx.currentTime;
    // 滤波随旅程渐开（拂晓温润 → 后程明亮）；仅塑形，不产生持续声
    this.bus.filt.frequency.setTargetAtTime(1800 + prog * 1400, t, 0.6);
    // 驱动固定音型：稳定跑动赋予"奔逐"推进，随旅程渐紧、首拍加重；末拍休止留呼吸
    if (t >= this.nextBeat) {
      const i = this.beatIdx % Audio2.OSTINATO.length;
      const f = Audio2.OSTINATO[i];
      if (f > 0) this.pluck(f, i === 0 ? 0.05 : 0.03, 0, i === 0 ? 0.55 : 0.42); // 0 = 休止
      this.beatIdx++;
      this.nextBeat = t + (0.42 - prog * 0.09); // 起步阔步 → 后程渐紧，整体比先前稀疏
    }
    // 疏落旋律短句：在驱动之上偶奏一句，句间大留白
    if (t >= this.nextPhrase) {
      const m = Audio2.MOTIFS[(Math.random() * Audio2.MOTIFS.length) | 0];
      const step = 0.26 + Math.random() * 0.08;
      m.forEach((deg, i) => this.pluck(this.noteFreq(deg), 0.036, i * step, 1.2));
      this.nextPhrase = t + m.length * step + 4 + Math.random() * 4;
    }
  }
}
