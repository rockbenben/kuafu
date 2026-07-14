export class Audio2 {
  muted = false;
  private ctx: AudioContext | null = null;

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

  /** freq 起止频率滑音，type 波形，dur 秒，vol 峰值音量 */
  private blip(f0: number, f1: number, dur: number, type: OscillatorType, vol = 0.15) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  jump() { this.blip(300, 600, 0.12, 'square', 0.08); }
  dash() { this.blip(700, 200, 0.18, 'sawtooth', 0.1); }
  mote() { this.blip(900, 1400, 0.1, 'sine', 0.12); }
  crystal() { this.blip(500, 1000, 0.2, 'triangle', 0.12); }
  death() { this.blip(220, 40, 0.4, 'sawtooth', 0.15); }
  kill() { this.blip(600, 150, 0.15, 'square', 0.12); }
  stride() { this.blip(180, 900, 0.35, 'sawtooth', 0.16); this.blip(90, 300, 0.4, 'triangle', 0.12); }
  charged() { this.blip(700, 1300, 0.18, 'sine', 0.1); } // 神力充满提示

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
    filt.connect(g).connect(this.ctx.destination);
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
    if (this.ctx) { this.ctx.close().catch(() => {}); this.ctx = null; }
  }

  private stopAmbient() {
    if (!this.ctx || !this.bus) return;
    const t = this.ctx.currentTime;
    this.bus.g.gain.cancelScheduledValues(t);
    this.bus.g.gain.setValueAtTime(this.bus.g.gain.value, t);
    this.bus.g.gain.linearRampToValueAtTime(0.0001, t + 0.4); // 缓出后余音自然收
    this.bus = null;
    this.ambientOn = false;
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
