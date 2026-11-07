/* =========================================================
   صوت كله متولّد في الوقت الحقيقي (WebAudio) — من غير ملفات
   ========================================================= */
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.engineOn = false;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    this.master.connect(ctx.destination);

    // ---- المحرك ----
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 900;
    this.engFilter.Q.value = 1.1;
    this.engGain.connect(this.engFilter);
    this.engFilter.connect(this.master);

    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc1.frequency.value = 60;
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    this.osc2.frequency.value = 90;
    const o2g = ctx.createGain();
    o2g.gain.value = 0.35;
    this.osc1.connect(this.engGain);
    this.osc2.connect(o2g);
    o2g.connect(this.engGain);
    this.osc1.start();
    this.osc2.start();

    // ---- ضوضاء (كاوتش/رياح/خبطات) ----
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    const skidF = ctx.createBiquadFilter();
    skidF.type = 'bandpass';
    skidF.frequency.value = 2200;
    skidF.Q.value = 1.6;
    const skidSrc = ctx.createBufferSource();
    skidSrc.buffer = buf;
    skidSrc.loop = true;
    skidSrc.connect(skidF);
    skidF.connect(this.skidGain);
    this.skidGain.connect(this.master);
    skidSrc.start();

    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    const windF = ctx.createBiquadFilter();
    windF.type = 'lowpass';
    windF.frequency.value = 700;
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = buf;
    windSrc.loop = true;
    windSrc.connect(windF);
    windF.connect(this.windGain);
    this.windGain.connect(this.master);
    windSrc.start();
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.9 : 0;
  }

  engine(active) {
    this.engineOn = active;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engGain.gain.cancelScheduledValues(t);
    this.engGain.gain.linearRampToValueAtTime(active ? 0.13 : 0, t + 0.25);
  }

  /** rpm 0..1 · load 0..1 */
  setEngine(rpm, load) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 42 + rpm * 165;
    this.osc1.frequency.setTargetAtTime(f, t, 0.06);
    this.osc2.frequency.setTargetAtTime(f * 1.51, t, 0.06);
    this.engFilter.frequency.setTargetAtTime(520 + rpm * 2200 + load * 900, t, 0.08);
    this.engGain.gain.setTargetAtTime(this.engineOn ? 0.09 + load * 0.11 : 0, t, 0.1);
  }

  setSkid(amount) {
    if (!this.ctx) return;
    this.skidGain.gain.setTargetAtTime(Math.min(0.16, amount * 0.16), this.ctx.currentTime, 0.08);
  }

  setWind(amount) {
    if (!this.ctx) return;
    this.windGain.gain.setTargetAtTime(Math.min(0.13, amount * 0.13), this.ctx.currentTime, 0.15);
  }

  _noise(dur, filterType, freq, gain, q = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.7 + Math.random() * 0.8;
    const f = ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  crash(strength = 1) {
    if (!this.ctx) return;
    const s = Math.min(1.6, 0.35 + strength);
    this._noise(0.28 + s * 0.22, 'lowpass', 380 + s * 700, 0.42 * s, 0.7);
    this._noise(0.12, 'highpass', 2600, 0.16 * s, 0.9);
    // دمّة
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.24);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.34 * s, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.32);
  }

  glass() {
    this._noise(0.45, 'highpass', 4200, 0.2, 1.4);
    this._noise(0.2, 'bandpass', 6500, 0.12, 2.2);
  }

  beep(high = false) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = high ? 1180 : 760;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.07, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.18);
  }

  horn(on) {
    if (!this.ctx) return;
    if (on && !this.hornNodes) {
      const ctx = this.ctx;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.1, ctx.currentTime, 0.02);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 2600;
      const o1 = ctx.createOscillator(); o1.type = 'square'; o1.frequency.value = 349;
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 440;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
      o1.start(); o2.start();
      this.hornNodes = { g, o1, o2 };
    } else if (!on && this.hornNodes) {
      const { g, o1, o2 } = this.hornNodes;
      g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
      const t = this.ctx.currentTime + 0.12;
      o1.stop(t); o2.stop(t);
      this.hornNodes = null;
    }
  }

  click() { this.beep(true); }
}
