// Journey reveal — synthesized score + sound design. No samples, seeded noise only.
// Pulse at 120 bpm from 0.5 s to 11.5 s; hits at 0.5 2 4 6 8 10; 0.3 s of digital silence
// from 12.2 s; the big hit at 12.5 s. Writes score.wav (48 kHz stereo 16-bit).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SR = 48000, DUR = 15, N = SR * DUR;
const L = new Float32Array(N), R = new Float32Array(N);       // dry bus
const VL = new Float32Array(N), VR = new Float32Array(N);     // reverb send

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(41541);
const NB = new Float32Array(SR * 6).map(() => rnd() * 2 - 1);
const noise = i => NB[((i % NB.length) + NB.length) % NB.length];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const TAU = Math.PI * 2;
// add a sample: gain, pan (-1..1), reverb send
function put(i, v, pan = 0, send = 0.25) {
  if (i < 0 || i >= N) return;
  const l = v * Math.min(1, 1 - pan), r = v * Math.min(1, 1 + pan);
  L[i] += l; R[i] += r; VL[i] += l * send; VR[i] += r * send;
}
const sec = t => Math.round(t * SR);

// --- instruments -------------------------------------------------------------
function pulse(t, g) { // heartbeat / clock: soft sub thump + faint tick
  let ph = 0;
  for (let i = 0; i < SR * 0.32; i++) {
    const x = i / SR; ph += TAU * (40 + 34 * Math.exp(-x * 30)) / SR;
    put(sec(t) + i, g * Math.sin(ph) * Math.exp(-x * 13) * Math.min(1, x * 400), 0, 0.05);
  }
  let prev = 0;
  for (let i = 0; i < SR * 0.012; i++) { const n = noise(i * 13 + 7), hp = n - prev; prev = n; put(sec(t) + i, g * 0.05 * hp * Math.exp(-i / SR * 500), 0.15, 0.3); }
}
function bell(t, midi, g, pan = 0, dur = 3, ratio = 3.5, idx = 2.2) { // FM chime
  const f = mtof(midi);
  for (let i = 0; i < SR * dur; i++) {
    const x = i / SR, e = Math.exp(-x * 2.2 / dur * 3);
    const mod = Math.sin(TAU * f * ratio * x) * idx * Math.exp(-x * 4);
    put(sec(t) + i, g * Math.sin(TAU * f * x + mod) * e * Math.min(1, x * 2000), pan, 0.55);
  }
}
function pad(t0, t1, notes, g, cutoff = () => 0.04) { // airy detuned saws, gentle swell
  const len = sec(t1 - t0), att = 0.6 * SR, rel = 0.8 * SR;
  notes.forEach((m, k) => {
    const f = mtof(m); let p1 = rnd(), p2 = rnd(), p3 = rnd(), lp = 0, lp2 = 0;
    const pan = (k / Math.max(1, notes.length - 1) - 0.5) * 1.2;
    for (let i = 0; i < len + rel; i++) {
      const env = Math.min(1, i / att) * (i > len ? Math.exp(-(i - len) / rel * 4) : 1);
      p1 += f * 1.003 / SR; p2 += f * 0.997 / SR; p3 += f * 2.001 / SR;
      const v = ((p1 % 1) + (p2 % 1) + 0.4 * (p3 % 1)) - 1.2;
      const c = cutoff(t0 + i / SR); lp += (v - lp) * c; lp2 += (lp - lp2) * c;
      put(sec(t0) + i, g * lp2 * env, pan, 0.6);
    }
  });
}
function air(t0, t1, g, panRate = 0.3) { // band-limited noise bed (wind / air)
  let lp = 0, hp = 0;
  for (let i = 0; i < sec(t1 - t0); i++) {
    const x = i / SR, p = i / sec(t1 - t0), n = noise(i * 3 + 999);
    lp += (n - lp) * (0.05 + 0.04 * Math.sin(x * 1.7)); hp = lp - (hp * 0.995 + lp * 0.005);
    const env = Math.sin(Math.PI * p) ** 1.5 * (0.7 + 0.3 * Math.sin(x * 2.3));
    put(sec(t0) + i, g * hp * env, Math.sin(x * panRate * TAU) * 0.7, 0.5);
  }
}
function whoosh(t0, t1, g, up = true, pan0 = 0, pan1 = 0) {
  const len = sec(t1 - t0); let a = 0, b = 0;
  for (let i = 0; i < len; i++) {
    const p = i / len, c = up ? 0.01 + 0.35 * p * p : 0.36 - 0.35 * p;
    const n = noise(i + 4242); a += (n - a) * c; b += (a - b) * c;
    const env = up ? Math.pow(p, 2.2) : Math.pow(1 - p, 1.4) * Math.min(1, p * 30);
    put(sec(t0) + i, g * (a - b) * 4 * env, pan0 + (pan1 - pan0) * p, 0.5);
  }
}
function metal(t, g, f0, pan) { // extrusion: resonant comb on a noise swell
  const len = SR * 0.7, D = Math.round(SR / f0), buf = new Float32Array(D); let lp = 0;
  for (let i = 0; i < len; i++) {
    const x = i / SR, env = Math.min(1, x / 0.08) * Math.exp(-x * 4.5);
    lp += (noise(i * 5 + f0) - lp) * 0.2;
    const y = lp * env + buf[i % D] * 0.93; buf[i % D] = y;
    put(sec(t) + i, g * y * 0.12, pan, 0.4);
  }
}
function drop(t, g) { // water drop: fast upward pitch blip + glassy ring
  let ph = 0;
  for (let i = 0; i < SR * 0.25; i++) { const x = i / SR; ph += TAU * (700 + 1500 * (1 - Math.exp(-x * 60))) / SR; put(sec(t) + i, g * Math.sin(ph) * Math.exp(-x * 26), 0, 0.5); }
  bell(t, 93, g * 0.35, 0.1, 2.5, 2.76, 1.2);
}
function impact(t, g) { // wide hit with sub drop, crack, chord bloom and shimmer tail
  let ph = 0, a = 0;
  for (let i = 0; i < SR * 2.8; i++) {
    const x = i / SR; ph += TAU * (28 + 40 * Math.exp(-x * 6)) / SR;
    put(sec(t) + i, g * 0.95 * Math.sin(ph) * Math.exp(-x * 1.2) * Math.min(1, x * 800), 0, 0.15);
    a += (noise(i * 7 + 31) - a) * 0.5;
    put(sec(t) + i, g * 0.6 * a * Math.exp(-x * 22), -0.3, 0.6); put(sec(t) + i, g * 0.6 * noise(i * 11 + 5) * Math.exp(-x * 25), 0.3, 0.6);
  }
  [50, 57, 62, 66, 69, 74, 76, 81].forEach((m, k) => bell(t + k * 0.004, m + 12, g * 0.11, (k % 2 ? 1 : -1) * (0.2 + k * 0.08), 3.2, k % 2 ? 2.0 : 3.01, 1.4));
  for (let k = 0; k < 40; k++) { const m = 86 + Math.floor(rnd() * 14), d = 0.6 + rnd() * 1.8; ping(t + 0.05 + rnd() * 1.6, m, g * 0.05 * (1 - k / 45), (rnd() - 0.5) * 1.8, d); }
}
function ping(t, midi, g, pan, d = 0.4) { // particle shimmer grain
  const f = mtof(midi);
  for (let i = 0; i < SR * d; i++) { const x = i / SR; put(sec(t) + i, g * Math.sin(TAU * f * x) * Math.exp(-x * 5 / d) * Math.min(1, x * 3000), pan, 0.7); }
}
function riser(t0, t1, g) { // tension: rising tone pair + opening noise
  const len = sec(t1 - t0); let ph1 = 0, ph2 = 0, lp = 0;
  for (let i = 0; i < len; i++) {
    const p = i / len, f = 110 * Math.pow(2, p * 2);
    ph1 += TAU * f / SR; ph2 += TAU * f * 1.5 * 1.004 / SR; lp += (noise(i + 777) - lp) * (0.02 + 0.3 * p * p);
    const env = Math.pow(p, 1.8);
    put(sec(t0) + i, g * env * (0.4 * Math.sin(ph1) + 0.25 * Math.sin(ph2) + 0.5 * lp), Math.sin(p * 9) * 0.3, 0.5);
  }
}
function implode(t0, t1, g) { // reverse swell sucking into the point
  const len = sec(t1 - t0); let lp = 0;
  for (let i = 0; i < len; i++) {
    const p = i / len; lp += (noise(i + 2024) - lp) * (0.4 - 0.37 * p);
    put(sec(t0) + i, g * Math.pow(p, 3) * (lp * 2 + 0.5 * Math.sin(TAU * (60 - 30 * p) * i / SR)), 0, 0.2);
  }
}

// --- arrangement --------------------------------------------------------------
const BEAT = 0.5;
// pulse: strict, beats 1..23 (0.5 s .. 11.5 s)
for (let b = 1; b <= 23; b++) pulse(b * BEAT, b === 1 ? 0.85 : 0.6 + 0.012 * b);
// harmony: D major, quietly widening; low-pass dips with the line (6.0-7.3 s)
const lineCut = t => { const d = t < 6 ? 0 : t < 6.35 ? (t - 6) / 0.35 : t < 6.85 ? 1 : t < 7.3 ? 1 - (t - 6.85) / 0.45 : 0; return 0.05 - 0.035 * d; };
pad(0.5, 4.0, [50, 57, 62, 64, 69], 0.035, () => 0.03);
pad(4.0, 8.0, [47, 54, 59, 62, 66, 69], 0.035, lineCut);
pad(8.0, 10.0, [43, 50, 57, 62, 66, 71], 0.04, () => 0.06);
pad(10.0, 11.8, [45, 52, 57, 61, 64, 69, 76], 0.045, t => 0.04 + 0.05 * (t - 10) / 1.8);
pad(12.5, 15.0, [38, 50, 57, 62, 66, 69, 74], 0.05, () => 0.05);
// drone under the whole journey
(() => { let ph = 0; for (let i = sec(0.5); i < sec(11.8); i++) { const x = i / SR - 0.5; ph += TAU * 36.7 / SR; put(i, 0.12 * Math.sin(ph) * Math.min(1, x / 1.5), 0, 0); } })();

// HIT 1 — drop lands
drop(0.5, 0.6); bell(0.5, 81, 0.12, -0.2);
for (let k = 0; k < 5; k++) ping(0.55 + k * 0.14, 88 - k * 2, 0.03, (k - 2) * 0.3, 0.6);     // five rings
// HIT 2 — rings extrude into skyline: a metal swell per ring
bell(2.0, 83, 0.12, 0.2);
for (let k = 0; k < 5; k++) { metal(2.0 + k * 0.3, 0.55, 140 + k * 35, (k - 2) * 0.35); whoosh(2.0 + k * 0.3, 2.0 + k * 0.3 + 0.5, 0.12, true, -0.4, 0.4); }
// HIT 3 — towers melt into the ribbon
bell(4.0, 86, 0.12, -0.15); whoosh(4.0, 5.2, 0.22, false, -0.6, 0.6); air(4.0, 6.5, 0.05, 0.15);
// HIT 4 — the line dips, holds, recovers
bell(6.0, 88, 0.11, 0.15); bell(7.3, 90, 0.05, 0.3, 2);
// HIT 5 — sunrise on the ridge: shimmer swell into the flare, then wind
whoosh(7.0, 8.0, 0.2, true, 0, 0); bell(8.0, 90, 0.13, 0); bell(8.0, 93, 0.07, 0.4); air(6.5, 10.2, 0.11, 0.08);
for (let k = 0; k < 26; k++) ping(7.8 + rnd() * 2.2, 84 + Math.floor(rnd() * 12), 0.018, (rnd() - 0.5) * 1.6, 0.5);
// HIT 6 — arch closes over the home
bell(10.0, 86, 0.13, -0.1); bell(10.0, 74, 0.08, 0.1, 3.5, 2.0, 0.8);
// tension 10 -> 11.8, implosion 11.8 -> 12.2
riser(10.0, 11.8, 0.16); implode(11.8, 12.2, 0.4);
// BIG HIT 12.5, snap 13.0, light sweep 13.05 -> 13.55 (pans left to right with the light)
impact(12.5, 1.0); bell(13.0, 86, 0.06, 0, 2, 3.01, 0.6); whoosh(13.05, 13.6, 0.08, true, -0.8, 0.8);

// --- reverb (Schroeder/Freeverb-style, per channel) ----------------------------
function reverb(inp, seed) {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116].map(d => Math.round((d + seed) * SR / 44100 * 1.25));
  const aps = [556, 441, 341, 225].map(d => Math.round((d + seed) * SR / 44100));
  const out = new Float32Array(N);
  for (const D of combs) { const b = new Float32Array(D); let f = 0; for (let i = 0; i < N; i++) { const y = b[i % D]; f = y * 0.75 + f * 0.25; b[i % D] = inp[i] + f * 0.86; out[i] += y / combs.length; } }
  for (const D of aps) { const b = new Float32Array(D); for (let i = 0; i < N; i++) { const bo = b[i % D], y = -out[i] + bo; b[i % D] = out[i] + bo * 0.5; out[i] = y; } }
  return out;
}
const WL = reverb(VL, 0), WR = reverb(VR, 23);

// --- master: mix, soft clip, hard silence 12.2-12.5, write -------------------------
const mixL = new Float32Array(N), mixR = new Float32Array(N); let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR; let g = 1;
  if (t < 0.5) g = 0;                                   // opening silence
  else if (t >= 12.2 && t < 12.5) g = 0;                // total silence before the big hit
  else if (t > 14.5) g = Math.max(0, (15 - t) / 0.5);   // tail out on the locked frame
  mixL[i] = (L[i] + WL[i] * 0.9) * g; mixR[i] = (R[i] + WR[i] * 0.9) * g;
  peak = Math.max(peak, Math.abs(mixL[i]), Math.abs(mixR[i]));
}
const out = Buffer.alloc(44 + N * 4), sat = x => Math.tanh(x * 1.1) / Math.tanh(1.1);
out.write('RIFF', 0); out.writeUInt32LE(36 + N * 4, 4); out.write('WAVEfmt ', 8); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { out.writeInt16LE(Math.round(sat(mixL[i] / peak * 0.92) * 32000), 44 + i * 4); out.writeInt16LE(Math.round(sat(mixR[i] / peak * 0.92) * 32000), 46 + i * 4); }
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'score.wav'), out);
console.log('score.wav', DUR + 's');
