// ============================================================
// Pen Fight — synthesized SFX via WebAudio (no audio assets)
// ============================================================

import { STORAGE } from './constants';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(STORAGE.muted) === '1';
    } catch {
      this.muted = false;
    }
  }

  private ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      return this.ctx;
    } catch {
      return null;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    try {
      localStorage.setItem(STORAGE.muted, m ? '1' : '0');
    } catch { /* ignore */ }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.02);
    }
  }

  /** call on first user gesture */
  unlock(): void {
    this.ensure();
  }

  private noiseBuffer(ctx: AudioContext, dur: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private whoosh(dur: number, from: number, to: number, vol: number, delay = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx, dur + 0.1);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.1;
    f.frequency.setValueAtTime(from, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.1);
  }

  // ---------- game sounds ----------

  flick(power: number): void {
    this.whoosh(0.22 + power * 0.1, 500, 2200 + power * 1600, 0.22 + power * 0.2);
    this.tone(340 + power * 200, 0.1, 'sine', 0.06, 600 + power * 500);
  }

  clack(intensity: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const v = Math.min(1, intensity / 5);
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx, 0.05);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.24 + v * 0.5, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.07);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + 0.08);
    this.tone(1900 + v * 900, 0.06, 'triangle', 0.12 + v * 0.12, 900);
  }

  thud(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx, 0.16);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 320;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + 0.2);
    this.tone(110, 0.16, 'sine', 0.3, 55);
  }

  fallWhistle(): void {
    this.tone(1500, 0.5, 'sine', 0.1, 300);
  }

  score(): void {
    this.tone(660, 0.14, 'triangle', 0.3);
    this.tone(880, 0.2, 'triangle', 0.3, undefined, 0.09);
    this.tone(1320, 0.3, 'sine', 0.2, undefined, 0.18);
  }

  streak(n: number): void {
    const base = 520 + Math.min(n, 6) * 60;
    this.tone(base, 0.1, 'square', 0.12);
    this.tone(base * 1.5, 0.16, 'triangle', 0.18, undefined, 0.07);
  }

  turn(): void {
    this.tone(440, 0.08, 'sine', 0.14, 520);
  }

  win(): void {
    const seq = [523, 659, 784, 1047, 1319];
    seq.forEach((f, i) => this.tone(f, 0.34, 'triangle', 0.26, undefined, i * 0.11));
    this.whoosh(0.7, 800, 3200, 0.12, 0.2);
  }

  lose(): void {
    const seq = [392, 330, 262, 196];
    seq.forEach((f, i) => this.tone(f, 0.34, 'sawtooth', 0.12, undefined, i * 0.16));
  }

  uiClick(): void {
    this.tone(700, 0.06, 'triangle', 0.16, 900);
  }

  uiHover(): void {
    this.tone(500, 0.04, 'sine', 0.07, 560);
  }

  deny(): void {
    this.tone(220, 0.12, 'square', 0.1, 160);
  }

  chargeTick(p: number): void {
    this.tone(380 + p * 620, 0.03, 'sine', 0.05);
  }
}
