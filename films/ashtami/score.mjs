// Ashtami — score for the supplied 46.4 s Durga Puja reel (Prabin Agarwal). Synthesized, no samples,
// seeded noise only. Palette from the pandal: dhak (two drums), kasor, ghanta, temple bell, tanpura,
// bansuri in Raga Durga (S R M P D) on Sa = D, and a shankh for the conch shot.
// Grid: 100 bpm, beat k at 0.59 + 0.6k, so the cuts at 10.79 (anjali), 17.99 (conch) and the title
// write-on at 20.99 land on beats. The voiceover (1.0-4.85, 6.2-9.85, 18.0-19.6) gets the drone only,
// ducked; melody and drums play in the gaps. Writes score.wav (48 kHz stereo 16-bit, 46.42 s).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SR = 48000, DUR = 46.4167, N = Math.ceil(SR * DUR);
const L = new Float32Array(N), R = new Float32Array(N);       // dry bus
const VL = new Float32Array(N), VR = new Float32Array(N);     // reverb send

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(41541);
const NB = new Float32Array(SR * 6).map(() => rnd() * 2 - 1);
const noise = i => NB[((i % NB.length) + NB.length) % NB.length];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const TAU = Math.PI * 2;
function put(i, v, pan = 0, send = 0.25) {
  if (i < 0 || i >= N) return;
  const l = v * Math.min(1, 1 - pan), r = v * Math.min(1, 1 + pan);
  L[i] += l; R[i] += r; VL[i] += l * send; VR[i] += r * send;
}
const sec = t => Math.round(t * SR);
const B0 = 0.59, BEAT = 0.6, S16 = BEAT / 4;
const b = k => B0 + k * BEAT;                                   // beat k on the grid
function svf(fc, q) { // Chamberlin state-variable band-pass
  const f = 2 * Math.sin(Math.PI * Math.min(fc, SR / 6) / SR); let lo = 0, bp = 0;
  return x => { lo += f * bp; const hi = x - lo - q * bp; bp += f * hi; return bp; };
}

// --- instruments -------------------------------------------------------------
// dhak: 'D' = dhyang (open stroke, deep boom + woody body + stick crack), 'k' = kur (light stick stroke)
function dhak(t, g, pan, kind = 'D', tune = 1) {
  const D = kind === 'D', len = SR * (D ? 0.8 : 0.28), bp = svf(2900 * tune, 0.9), st = sec(t);
  const modes = [[236, 14, 0.38], [371, 19, 0.3], [585, 27, 0.2], [830, 36, 0.12]];
  let ph = 0; const mp = [0, 0, 0, 0];
  for (let i = 0; i < len; i++) {
    const x = i / SR, a = Math.min(1, x * 3000);
    ph += TAU * tune * (D ? 74 + 72 * Math.exp(-x * 30) : 96 + 60 * Math.exp(-x * 40)) / SR;
    let v = (D ? 0.8 : 0.3) * Math.sin(ph) * Math.exp(-x * (D ? 6.5 : 24));
    modes.forEach(([f, d, w], k) => { mp[k] += TAU * f * tune * (1 + 0.04 * Math.exp(-x * 50)) / SR; v += w * (D ? 1 : 0.8) * Math.sin(mp[k]) * Math.exp(-x * d * (D ? 1 : 1.5)); });
    v += (D ? 0.55 : 0.75) * bp(noise(i * 7 + st)) * Math.exp(-x * (D ? 80 : 110)) * 2.2;
    put(st + i, g * v * a, pan, D ? 0.22 : 0.15);
  }
}
const dhakA = (t, g, k) => dhak(t, g, -0.35, k, 1), dhakB = (t, g, k) => dhak(t, g, 0.4, k, 1.13);
// a bar of pattern from t: one char per sixteenth, D/k/. ; seeded humanising
function bar(t, pat, drum, g) {
  [...pat].forEach((c, i) => {
    if (c === '.') return;
    const j = (rnd() - 0.5) * 0.008, v = (c === 'D' ? 1 : 0.5) * (0.88 + rnd() * 0.24) * (i % 4 === 0 ? 1.1 : 1);
    drum(t + i * S16 + j, g * v, c === 'D' ? 'D' : 'k');
  });
}
function roll(t0, t1, g0, g1, r0, r1) { // accelerating kur roll, drums alternate, crescendo
  let t = t0, n = 0;
  while (t < t1 - 0.02) { const p = (t - t0) / (t1 - t0); (n++ % 2 ? dhakB : dhakA)(t, (g0 + (g1 - g0) * p * p) * (0.9 + rnd() * 0.2), 'k'); t += 1 / (r0 + (r1 - r0) * p); }
}
function kasor(t, g, pan = 0.15) { // bell-metal plate struck with a stick: bright inharmonic "tang"
  const f0 = 1180, P = [[1, 1, 9], [1.47, 0.7, 11], [2.09, 0.6, 13], [2.56, 0.45, 15], [3.36, 0.35, 19], [4.1, 0.25, 23], [5.2, 0.15, 27]];
  let prev = 0;
  for (let i = 0; i < SR * 0.6; i++) {
    const x = i / SR; let v = 0;
    for (const [r, a, d] of P) v += a * Math.sin(TAU * f0 * r * x) * Math.exp(-x * d);
    const n = noise(i * 3 + 91), hp = n - prev; prev = n;
    put(sec(t) + i, g * (0.22 * v + 0.6 * hp * Math.exp(-x * 160)) * Math.min(1, x * 4000), pan, 0.3);
  }
}
function ghanta(t0, t1, gf, pan = 0.5) { // aarti hand bell rung continuously
  let t = t0;
  while (t < t1) {
    const g = gf(t), f0 = 2350 * (1 + (rnd() - 0.5) * 0.004), amp = 0.6 + rnd() * 0.4, st = sec(t);
    for (let i = 0; i < SR * 0.7; i++) {
      const x = i / SR;
      const v = Math.sin(TAU * f0 * x) * Math.exp(-x * 4) + 0.5 * Math.sin(TAU * f0 * 2.72 * x) * Math.exp(-x * 7) + 0.3 * Math.sin(TAU * f0 * 4.5 * x) * Math.exp(-x * 11);
      put(st + i, g * amp * v * Math.min(1, x * 3000), pan + (rnd() - 0.5) * 0.1, 0.5);
    }
    t += 0.085 + rnd() * 0.05;
  }
}
function templeBell(t, g, f0 = mtof(62), pan = 0, dur = 6) { // big brass bell: hum, prime, tierce, quint, nominal...
  const P = [[0.5, 0.55, 0.35], [1, 1, 0.5], [1.19, 0.45, 0.7], [1.5, 0.3, 0.8], [2, 0.45, 1.0], [2.52, 0.22, 1.4], [3.01, 0.18, 1.8], [4.08, 0.1, 2.4]];
  let prev = 0;
  for (let i = 0; i < SR * dur; i++) {
    const x = i / SR; let v = 0;
    for (const [r, a, d] of P) v += a * (Math.sin(TAU * f0 * r * x) + 0.6 * Math.sin(TAU * f0 * r * 1.0015 * x)) * Math.exp(-x * d);
    const n = noise(i + 333), hp = n - prev; prev = n;
    put(sec(t) + i, g * (0.18 * v + 0.25 * hp * Math.exp(-x * 200)) * Math.min(1, x * 2000), pan, 0.6);
  }
}
function boom(t, g, len = 2.2) { // sub weight under the big strokes
  let ph = 0;
  for (let i = 0; i < SR * len; i++) { const x = i / SR; ph += TAU * (34 + 26 * Math.exp(-x * 5)) / SR; put(sec(t) + i, g * 0.7 * Math.sin(ph) * Math.exp(-x * 1.9) * Math.min(1, x * 600), 0, 0.05); }
}
function gong(t, g, f0 = 98, dur = 5.5) { // bloom: upper partials swell in after the strike
  const P = [1, 1.38, 1.92, 2.41, 2.97, 3.53, 4.21, 4.9, 5.66, 6.4, 7.3, 8.1].map((r, k) => [r * (1 + (rnd() - 0.5) * 0.01), 1 / (1 + k * 0.35), 0.5 + k * 0.12, k * 0.05]);
  for (let i = 0; i < SR * dur; i++) {
    const x = i / SR; let v = 0;
    for (const [r, a, d, bl] of P) v += a * Math.sin(TAU * f0 * r * x) * Math.exp(-x * d) * (bl ? Math.min(1, x / bl) : 1);
    put(sec(t) + i, g * 0.12 * v * Math.min(1, x * 1500), -0.1, 0.55);
  }
}
// tanpura: Pa Sa Sa Sa(low), each pluck additive with the jivari formant sweeping down the harmonics
function tanpura(t0, t1, g) {
  const seq = [57 - 12, 62 - 12, 62 - 12, 50 - 12], gap = 1.2; // A2 D3 D3 D2
  for (let t = t0, n = 0; t < t1; t += gap, n++) {
    const f = mtof(seq[n % 4]), st = sec(t), dur = 5, H = Math.min(36, Math.floor(9000 / f)), pan = [-0.25, 0.1, 0.2, -0.1][n % 4];
    const ph = new Float64Array(H + 1);
    for (let i = 0; i < SR * dur; i++) {
      const x = i / SR, c = 4 + 22 * Math.exp(-x * 0.9); let v = 0;
      for (let h = 1; h <= H; h++) { ph[h] += TAU * f * h * (1 + 0.0004 * h) / SR; v += Math.sin(ph[h]) / h ** 0.9 * (0.35 + 2.2 * Math.exp(-((h - c) ** 2) / 10)) * Math.exp(-x * (0.45 + h * 0.04)); }
      put(st + i, g(t + x) * 0.11 * v * Math.min(1, x * 400), pan, 0.4);
    }
  }
}
// harmonium: two reeds (musette detune) per note, gentle bellows swell
function harmonium(t0, t1, notes, g, att = 0.5, rel = 0.6) {
  const len = sec(t1 - t0);
  notes.forEach((m, k) => {
    const f = mtof(m), pan = (k - (notes.length - 1) / 2) * 0.3; let p1 = rnd(), p2 = rnd();
    for (let i = 0; i < len + rel * SR; i++) {
      const x = i / SR, env = Math.min(1, x / att) * (i > len ? Math.exp(-(i - len) / (rel * SR) * 5) : 1) * (1 + 0.04 * Math.sin(TAU * 0.7 * x));
      p1 += f / SR; p2 += f * 1.0035 / SR; let v = 0;
      for (let h = 1; h <= 8; h++) v += (Math.sin(TAU * p1 * h) + Math.sin(TAU * p2 * h)) * (h % 2 ? 1 : 0.55) / h;
      put(sec(t0) + i, g * 0.06 * v * env, pan, 0.45);
    }
  });
}
// bansuri: one breath per phrase; notes [beatsFromStart, lengthInBeats, midi]; meend between notes,
// late vibrato, breath noise and a soft chiff at each articulation
function bansuri(t0, notes, g, pan = -0.15, beat = BEAT) {
  const ev = notes.map(([s, d, m]) => ({ t: t0 + s * beat, e: t0 + (s + d) * beat, m }));
  const end = ev[ev.length - 1].e, st = sec(t0), len = sec(end - t0) + sec(0.3);
  const br = svf(mtof(ev[0].m) * 2, 1.4); let ph = 0, k = 0;
  for (let i = 0; i < len; i++) {
    const t = t0 + i / SR;
    while (k < ev.length - 1 && t >= ev[k + 1].t) k++;
    const e = ev[k], prevM = k ? ev[k - 1].m : e.m, into = t - e.t;
    const glide = Math.min(1, into / 0.07), m = prevM + (e.m - prevM) * (0.5 - 0.5 * Math.cos(Math.PI * glide));
    const vib = Math.min(1, Math.max(0, (into - 0.25) / 0.4)) * 0.16 * Math.sin(TAU * 5.3 * into);
    const f = mtof(m + vib); ph += TAU * f / SR;
    const tail = t > end ? Math.exp(-(t - end) / 0.08) : 1, dip = 0.72 + 0.28 * Math.min(1, into / 0.04);
    const env = Math.min(1, (t - t0) / 0.09) * tail * dip * (0.92 + 0.08 * Math.sin(TAU * 0.5 * (t - t0)));
    const tone = Math.sin(ph) + 0.2 * Math.sin(2 * ph) + 0.07 * Math.sin(3 * ph) + 0.03 * Math.sin(4 * ph);
    const breath = br(noise(i * 5 + 17)) * (0.1 + 0.25 * Math.exp(-into * 25));
    put(st + i, g * env * (0.16 * tone + 0.35 * breath), pan, 0.5);
  }
}
// shankh: brassy conch on Sa; scoops up, wavers, swells, breaks upward at the end
function shankh(t0, t1, g, pan = 0.1) {
  const len = sec(t1 - t0), f0 = mtof(62), H = 22, ph = new Float64Array(H + 1), bn = svf(1300, 0.7); let w = 0;
  for (let i = 0; i < len; i++) {
    const x = i / SR, p = i / len;
    w += ((noise(i >> 9) * 0.5) - w) * 0.0004;                                  // slow lip waver
    const scoop = -0.9 * Math.exp(-x * 9), brk = p > 0.9 ? 0.6 * ((p - 0.9) / 0.1) ** 2 : 0;
    const f = f0 * Math.pow(2, (scoop + brk + w * 0.15 + 0.05 * Math.sin(TAU * 3.7 * x)) / 12);
    const amp = Math.min(1, x / 0.22) * (0.75 + 0.25 * p) * (p > 0.93 ? Math.max(0, (1 - p) / 0.07) : 1);
    const bright = 0.5 + 0.38 * amp; let v = 0;
    for (let h = 1; h <= H; h++) {
      ph[h] += TAU * f * h / SR; const fh = f * h;
      v += Math.sin(ph[h]) * bright ** (h - 1) * (1 + 3 * Math.exp(-(((fh - 900) / 380) ** 2)) + 1.6 * Math.exp(-(((fh - 2600) / 650) ** 2)));
    }
    put(sec(t0) + i, g * amp * (0.09 * v + 0.5 * bn(noise(i * 9 + 5)) * amp), pan, 0.45);
  }
}

// --- arrangement --------------------------------------------------------------
const voiceWin = [[1.0, 4.85], [6.2, 9.85], [18.0, 19.6]];
const inVoice = t => voiceWin.some(([a, c]) => t > a - 0.15 && t < c + 0.15);

// 0.00  hook: dhyang + temple bell, the sound of Pujo before the first word
dhakA(0.0, 0.9, 'D'); dhakB(0.15, 0.4, 'k'); dhakB(0.3, 0.45, 'k'); dhakA(0.45, 0.7, 'D'); templeBell(0.0, 0.5, mtof(62), 0.2, 6);
// tanpura drone through the whole film, bed level drops under the voice
tanpura(0.05, 44.0, t => (t > 43 ? Math.max(0, (45.3 - t) / 2.3) : 1) * (t < 29.17 || t > 33.83 ? 1 : 0.8));
ghanta(0.6, 4.6, t => 0.012 * Math.max(0, 1 - (t - 0.6) / 4), 0.55);
// 3.04 cut (boy with the offering plate): a soft bell; 4.85-6.2 gap: bansuri answers
kasor(3.04, 0.25, 0.3);
bansuri(4.95, [[0, 0.5, 69], [0.5, 0.4, 71], [0.9, 1.3, 74]], 0.85);
// 6.21 cut (the pandal crowd): dhak enters low, half-time, under the voice
templeBell(6.21, 0.18, mtof(74), -0.3, 4);
for (let k = 10; k < 16; k++) dhakA(b(k), k % 2 ? 0.16 : 0.24, k % 2 ? 'k' : 'D');
ghanta(6.3, 10.6, t => 0.008 + 0.01 * Math.max(0, (t - 8.5) / 2), 0.5);
// 9.79 pickup out of the voice into the anjali
roll(b(15) + 0.05, b(17), 0.25, 0.75, 7, 14); kasor(b(16), 0.3); kasor(b(16.5), 0.35);

// 10.79 ANJALI (flowers offered): groove, kasor on every beat, main theme in Raga Durga
boom(b(17), 0.55, 1.6); dhakA(b(17), 1.0, 'D'); dhakB(b(17), 0.6, 'D'); templeBell(b(17), 0.3, mtof(62), 0.1, 5);
bar(b(17), 'D.kk.kD.D.kk.kkk', dhakA, 0.62); bar(b(17), '....k.....k...k.', dhakB, 0.4);
bar(b(21), 'D.kkD.k.D.kk.kD.', dhakA, 0.62); bar(b(21), '..k...k...k.k.kk', dhakB, 0.42);
for (let k = 17; k < 26; k++) kasor(b(k), k % 4 === 1 ? 0.42 : 0.3, 0.2);
harmonium(b(17), b(26), [50, 57, 62], 0.5);
ghanta(b(17), b(26), () => 0.016, 0.5);
bansuri(b(17), [[0, 1, 74], [1, 0.5, 76], [1.5, 0.5, 74], [2, 1, 71], [3, 1, 69], [4, 0.5, 67], [4.5, 0.5, 69], [5, 1, 71], [6, 0.5, 69], [6.5, 0.5, 67], [7, 1, 64], [7.5, 0.25, 67], [8, 1, 69]], 0.9);
// 15.59 -> 17.99: hands lift, conch passes to her: dhak roll accelerates, bansuri holds Pa and climbs
bar(b(25), 'D.kkD.kk', dhakA, 0.6);
roll(b(26), b(29) - 0.04, 0.3, 1.0, 7, 22);
for (let k = 26; k < 29; k++) { kasor(b(k), 0.3); kasor(b(k) + BEAT / 2, 0.22); }
ghanta(b(26), b(29), t => 0.016 + 0.03 * ((t - b(26)) / (3 * BEAT)) ** 2, 0.5);
harmonium(b(26), b(29), [50, 57, 62, 69], 0.42, 1.2, 0.15);
bansuri(b(26), [[0, 1.5, 69], [1.5, 0.75, 71], [2.25, 0.7, 74]], 0.8);
// 17.99 cut: she raises the shankh. One stroke, then room for the line
boom(b(29), 0.5, 1.5); dhakA(b(29), 1.0, 'D'); dhakB(b(29), 0.8, 'D'); kasor(b(29), 0.45); templeBell(b(29), 0.28, mtof(62), -0.15, 5);
// 19.6 -> 20.99: first conch blast swells into the title while the dhak builds underneath
shankh(19.62, b(34) + 0.05, 0.85);
roll(b(32), b(34) - 0.03, 0.2, 0.85, 8, 16);
harmonium(19.7, b(34), [50, 57, 62], 0.35, 1.0, 0.1);

// 20.99 TITLE "অষ্টমী" writes on: the big stroke, then full puja groove to 28.79
boom(b(34), 1.0, 2.6); gong(b(34), 0.8); templeBell(b(34), 0.45, mtof(62), 0, 6);
dhakA(b(34), 1.2, 'D'); dhakB(b(34) + 0.012, 0.9, 'D'); kasor(b(34), 0.6);
const climA = ['D.kk.kD.D.kk.kkk', 'D.kkD.k.D.kkDkkk', 'D.kk.kD.D.kk.kkk', 'D.k.'];
const climB = ['..D.k.kk..D.kkk.', '..k.kkk...D.k.kk', '..D.k.kk..D.kkkk', '....'];
climA.forEach((p, i) => bar(b(34 + 4 * i), p, dhakA, 0.75)); climB.forEach((p, i) => bar(b(34 + 4 * i), p, dhakB, 0.55));
for (let k = 34; k < 47; k++) { kasor(b(k), k % 4 === 2 ? 0.45 : 0.36, 0.2); kasor(b(k) + BEAT / 2, 0.24, 0.2); }
ghanta(b(34), b(47), () => 0.02, 0.45);
harmonium(b(34), b(47), [50, 57, 62, 69], 0.55);
bansuri(b(34), [[0, 1, 81], [1, 0.5, 83], [1.5, 0.5, 81], [2, 1, 79], [3, 1, 76], [4, 0.5, 74], [4.5, 0.5, 76], [5, 1, 79], [6, 0.5, 76], [6.5, 0.5, 74], [7, 1, 71],
  [8, 1, 74], [9, 0.5, 76], [9.5, 0.5, 79], [10, 1, 81], [11, 0.5, 83], [11.5, 0.5, 81], [12, 0.25, 79], [12.25, 0.25, 81], [12.5, 0.5, 79], [13, 1.3, 74]], 0.85);
shankh(b(38), b(40) + 0.3, 0.6, 0.2);                  // second blast
shankh(b(43), b(46) - 0.1, 0.6, 0.05);                 // third blast
// 28.79 final stroke, everything stops, the gong carries the cut to white
boom(b(47), 0.9, 2.4); dhakA(b(47), 1.15, 'D'); dhakB(b(47) + 0.01, 0.9, 'D'); kasor(b(47), 0.55); gong(b(47), 0.55, 98, 5);

// 29.17 disclaimer card: one quiet bell over the drone
templeBell(29.17, 0.22, mtof(74), 0.2, 5);
bansuri(31.3, [[0, 2.2, 67], [2.2, 1.5, 69]], 0.45, 0.1, 1);       // breath of Ma -> Pa leaning into the end card
// 33.83 end card: soft dhyang + bell, then the bansuri walks home to Sa
dhakA(33.83, 0.4, 'D'); templeBell(33.83, 0.3, mtof(62), -0.1, 6); kasor(33.83, 0.2);
bansuri(34.1, [[0, 2, 69], [2, 1.2, 71], [3.2, 3.2, 74], [6.4, 1, 71], [7.4, 1, 69], [8.4, 1.6, 67], [10, 1.2, 64], [11.2, 4.8, 62]], 1.0, -0.1);
dhakA(37.97, 0.22, 'D'); dhakA(40.37, 0.2, 'D');
ghanta(38.0, 42.0, t => 0.008 * Math.max(0, 1 - (t - 38) / 4), 0.5);
templeBell(41.6, 0.2, mtof(62), 0.15, 4);

// --- reverb (Schroeder/Freeverb-style, per channel) ----------------------------
function reverb(inp, seed) {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116].map(d => Math.round((d + seed) * SR / 44100 * 1.35));
  const aps = [556, 441, 341, 225].map(d => Math.round((d + seed) * SR / 44100));
  const out = new Float32Array(N);
  for (const D of combs) { const bf = new Float32Array(D); let f = 0; for (let i = 0; i < N; i++) { const y = bf[i % D]; f = y * 0.7 + f * 0.3; bf[i % D] = inp[i] + f * 0.84; out[i] += y / combs.length; } }
  for (const D of aps) { const bf = new Float32Array(D); for (let i = 0; i < N; i++) { const bo = bf[i % D], y = -out[i] + bo; bf[i % D] = out[i] + bo * 0.5; out[i] = y; } }
  return out;
}
const WL = reverb(VL, 0), WR = reverb(VR, 23);

// --- master: duck under the voiceover, tail out before black at 45.5, write -----------
const mixL = new Float32Array(N), mixR = new Float32Array(N); let peak = 0, duck = 1, hl = 0, hr = 0;
const hpk = Math.exp(-TAU * 30 / SR);                     // 30 Hz high-pass: keep the boom, drop the rumble
for (let i = 0; i < N; i++) {
  const t = i / SR, target = inVoice(t) ? 0.5 : 1;          // about -6 dB under the voice
  duck += (target - duck) * (target < duck ? 0.0006 : 0.00012);
  const g = duck * (t > 44.6 ? Math.max(0, (45.45 - t) / 0.85) : 1);
  const l = (L[i] + WL[i] * 0.85) * g, r = (R[i] + WR[i] * 0.85) * g;
  hl = hl * hpk + l * (1 - hpk); hr = hr * hpk + r * (1 - hpk);
  mixL[i] = l - hl; mixR[i] = r - hr;
  peak = Math.max(peak, Math.abs(mixL[i]), Math.abs(mixR[i]));
}
const out = Buffer.alloc(44 + N * 4), sat = x => Math.tanh(x * 1.1) / Math.tanh(1.1);
out.write('RIFF', 0); out.writeUInt32LE(36 + N * 4, 4); out.write('WAVEfmt ', 8); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { out.writeInt16LE(Math.round(sat(mixL[i] / peak * 0.92) * 32000), 44 + i * 4); out.writeInt16LE(Math.round(sat(mixR[i] / peak * 0.92) * 32000), 46 + i * 4); }
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'score.wav'), out);
console.log('score.wav', DUR + 's');
