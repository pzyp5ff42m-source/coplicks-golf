/**
 * Sound effects synthesised with the Web Audio API (no audio files).
 */
import { game } from "./state.js";

// ================= AUDIO =================
export let AC = null,
  master = null,
  windNode = null;
export function audioInit() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain();
    master.gain.value = game.sound ? 0.8 : 0;
    master.connect(AC.destination);
    const nb = noiseBuf(2);
    const s = AC.createBufferSource();
    s.buffer = nb;
    s.loop = true;
    const f = AC.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 380;
    windNode = AC.createGain();
    windNode.gain.value = 0.03;
    s.connect(f).connect(windNode).connect(master);
    s.start();
  } catch (e) {
    AC = null;
  }
}
function noiseBuf(sec) {
  const b = AC.createBuffer(1, AC.sampleRate * sec, AC.sampleRate),
    d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function env(g, t, a, peak, dec) {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}
function noiseHit(t, freq, q, peak, dec, type = "bandpass") {
  const s = AC.createBufferSource();
  s.buffer = noiseBuf(Math.max(0.1, dec + 0.05));
  const f = AC.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = AC.createGain();
  env(g, t, 0.002, peak, dec);
  s.connect(f).connect(g).connect(master);
  s.start(t);
  s.stop(t + dec + 0.1);
  return f;
}
function tone(t, f0, f1, dur, peak, type = "sine") {
  const o = AC.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = AC.createGain();
  env(g, t, 0.004, peak, dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}
export const SFX = {
  hit(p, putt) {
    if (!AC) return;
    const t = AC.currentTime;
    if (putt) {
      tone(t, 900, 600, 0.06, 0.25, "triangle");
      noiseHit(t, 2500, 2, 0.15, 0.05);
      return;
    }
    noiseHit(t, 3200, 1.2, 0.9 * p + 0.2, 0.09);
    tone(t, 1500, 380, 0.12, 0.35 * p + 0.1, "triangle");
    noiseHit(t + 0.01, 600, 0.8, 0.25, 0.25, "lowpass");
    const f = noiseHit(t + 0.05, 1800, 0.6, 0.12 * p, 0.9);
    f.frequency.exponentialRampToValueAtTime(400, t + 0.95);
  },
  land(soft) {
    if (!AC) return;
    noiseHit(AC.currentTime, soft ? 500 : 900, 1, soft ? 0.12 : 0.25, 0.12, "lowpass");
  },
  sand() {
    if (!AC) return;
    noiseHit(AC.currentTime, 1400, 0.5, 0.4, 0.35);
  },
  tree() {
    if (!AC) return;
    const t = AC.currentTime;
    for (let i = 0; i < 5; i++) noiseHit(t + i * 0.05, 2500 + Math.random() * 2000, 1.5, 0.18, 0.15);
    tone(t, 300, 200, 0.08, 0.2, "square");
  },
  splash() {
    if (!AC) return;
    const t = AC.currentTime;
    const f = noiseHit(t, 1800, 0.7, 0.7, 0.8, "lowpass");
    f.frequency.exponentialRampToValueAtTime(250, t + 0.8);
    for (let i = 0; i < 6; i++)
      tone(t + 0.05 + Math.random() * 0.4, 600 + Math.random() * 900, 200, 0.08, 0.12);
  },
  cup() {
    if (!AC) return;
    const t = AC.currentTime;
    [0, 0.09, 0.16, 0.21, 0.25].forEach((d, i) =>
      tone(t + d, 1300 - i * 120, 700, 0.05, 0.3 - i * 0.04, "triangle"),
    );
    tone(t + 0.3, 180, 90, 0.15, 0.3);
  },
  clap(n = 1) {
    if (!AC) return;
    const t = AC.currentTime;
    for (let i = 0; i < 120 * n; i++) {
      const d = Math.random() * 2.4 * Math.sqrt(n);
      noiseHit(t + d, 1200 + Math.random() * 1500, 1.2, 0.12 * (1 - d / (3 * n)), 0.04);
    }
    for (let i = 0; i < 4; i++)
      tone(t + 0.3 + i * 0.5, 500 + Math.random() * 300, 900, 0.25, 0.04, "sawtooth");
  },
  bird() {
    if (!AC) return;
    const t = AC.currentTime,
      f = 2200 + Math.random() * 1800,
      n = 2 + ((Math.random() * 4) | 0);
    for (let i = 0; i < n; i++) tone(t + i * 0.13, f, f * (1.2 + Math.random() * 0.4), 0.08, 0.06);
  },
  tick() {
    if (!AC) return;
    tone(AC.currentTime, 1800, 1700, 0.03, 0.08, "square");
  },
};
