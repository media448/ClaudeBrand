// Synthesized score + SFX for the brand reveal. Pure function of the seed; no samples.
// Writes score.wav (48 kHz stereo, 16-bit). Loudness is normalised later by render.mjs.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SR = 48000, DUR = 15, BPM = 120, BEAT = 60 / BPM;
const N = Math.ceil(SR * DUR);
const L = new Float32Array(N), R = new Float32Array(N);

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(41541);
const noiseBuf = new Float32Array(SR * 4).map(() => rnd() * 2 - 1);
const noise = i => noiseBuf[i % noiseBuf.length];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const add = (i, v, pan = 0) => { if (i < 0 || i >= N) return; L[i] += v * (1 - Math.max(0, pan)); R[i] += v * (1 + Math.min(0, pan)); };

function kick(t, g = 1) {
  const s0 = Math.round(t * SR), len = SR * 0.45; let ph = 0;
  for (let i = 0; i < len; i++) {
    const x = i / SR, f = 46 + 110 * Math.exp(-x * 28);
    ph += 2 * Math.PI * f / SR;
    const env = Math.exp(-x * 7.5), click = Math.exp(-x * 400) * 0.35 * noise(i);
    add(s0 + i, g * (Math.sin(ph) * env * 0.9 + click));
  }
}
function hat(t, g = 1, pan = 0.25) {
  const s0 = Math.round(t * SR), len = SR * 0.06; let prev = 0;
  for (let i = 0; i < len; i++) { const n = noise(i * 7 + 13), hp = n - prev; prev = n; add(s0 + i, g * 0.16 * hp * Math.exp(-i / SR * 70), pan); }
}
function clap(t, g = 1) {
  const s0 = Math.round(t * SR), len = SR * 0.25; let lp = 0, prev = 0;
  for (let i = 0; i < len; i++) {
    const x = i / SR; const n = noise(i * 3 + 999); const hp = n - prev; prev = n; lp += (hp - lp) * 0.35;
    const env = (x < 0.03 ? Math.exp(-((x * 1000) % 10) / 3) : 1) * Math.exp(-x * 18);
    add(s0 + i, g * 0.42 * lp * env, -0.1); add(s0 + i, g * 0.42 * lp * env, 0.1);
  }
}
function tone(t, dur, midi, g, { type = 'sine', att = 0.005, rel = 0.2, pan = 0, cut = 1, det = 0 } = {}) {
  const s0 = Math.round(t * SR), len = Math.round((dur + rel) * SR); const f = mtof(midi);
  let lp = 0, ph1 = 0, ph2 = 0;
  for (let i = 0; i < len; i++) {
    const x = i / SR; const env = Math.min(1, x / att) * (x > dur ? Math.exp(-(x - dur) / rel * 3) : 1);
    ph1 += f * (1 + det) / SR; ph2 += f * (1 - det) / SR;
    let v;
    if (type === 'saw') v = ((ph1 % 1) * 2 - 1 + (ph2 % 1) * 2 - 1) * 0.5;
    else if (type === 'tri') v = 1 - 4 * Math.abs((ph1 % 1) - 0.5);
    else v = Math.sin(2 * Math.PI * ph1);
    lp += (v - lp) * cut; add(s0 + i, g * lp * env, pan);
  }
}
function pluck(t, midi, g, pan) { // decaying filtered saw with fast filter env
  const s0 = Math.round(t * SR), len = SR * 0.35, f = mtof(midi); let ph = 0, lp = 0;
  for (let i = 0; i < len; i++) {
    const x = i / SR; ph += f / SR; const v = (ph % 1) * 2 - 1; const c = 0.04 + 0.5 * Math.exp(-x * 30);
    lp += (v - lp) * c; add(s0 + i, g * lp * Math.exp(-x * 11), pan);
  }
}
function whoosh(t0, t1, g = 1, up = true) { // band-swept noise
  const s0 = Math.round(t0 * SR), len = Math.round((t1 - t0) * SR); let lp = 0, lp2 = 0;
  for (let i = 0; i < len; i++) {
    const p = i / len, c = up ? 0.02 + 0.5 * p * p : 0.5 - 0.48 * p;
    const n = noise(i + 4242); lp += (n - lp) * c; lp2 += (lp - lp2) * c;
    const env = Math.sin(Math.PI * Math.min(1, p * 1.15)) ** 2; add(s0 + i, g * 0.5 * (lp - lp2) * env * 3, Math.sin(p * 6) * 0.4);
  }
}
function tick(t, g = 1, midi = 91, pan = 0) { // woody snap for piece landings
  const s0 = Math.round(t * SR), len = SR * 0.12; let ph = 0;
  for (let i = 0; i < len; i++) { const x = i / SR; ph += mtof(midi) * (1 + 0.6 * Math.exp(-x * 120)) / SR; add(s0 + i, g * 0.35 * Math.sin(2 * Math.PI * ph) * Math.exp(-x * 45) + g * 0.2 * noise(i + 77) * Math.exp(-x * 600), pan); }
}
function impact(t, g = 1) {
  kick(t, 1.1 * g);
  const s0 = Math.round(t * SR), len = SR * 2.2; let lp = 0;
  for (let i = 0; i < len; i++) { const x = i / SR; lp += (noise(i + 31337) - lp) * 0.08; add(s0 + i, g * (0.5 * Math.sin(2 * Math.PI * 41 * x) * Math.exp(-x * 2.2) + 0.25 * lp * Math.exp(-x * 3)), 0); }
}

// Harmony: one chord per bar (2 s). D minor -> Bb -> Gm -> C -> resolve to F at the reveal.
const B = n => n * BEAT;
const chords = [[50, 53, 57, 62], [46, 50, 53, 58], [43, 50, 55, 58], [48, 52, 55, 60], [41, 53, 57, 60, 65], [46, 53, 58, 62], [41, 53, 57, 60, 64], [41, 53, 57, 60, 65]];
chords.forEach((c, bar) => {
  const t = B(bar * 4), root = c[0];
  // bass: 8th pulse, root an octave down
  for (let k = 0; k < 8; k++) { if (bar >= 6 && k > 0) break; tone(t + k * BEAT / 2, BEAT / 2 * 0.8, root - 12 + (k % 4 === 3 ? 12 : 0), 0.22, { type: 'tri', rel: 0.05, cut: 0.2 }); }
  // pad from bar 1, full from the reveal
  if (bar >= 1) c.forEach((m, j) => tone(t, bar === 7 ? 2.2 : 2.0, m + 12, bar >= 4 ? 0.055 : 0.04, { type: 'saw', att: 0.15, rel: bar >= 6 ? 1.2 : 0.3, det: 0.004, cut: 0.05, pan: (j % 2 ? 0.4 : -0.4) }));
});
// Hook scene (bars 0-1): restless 16th arps = "markets move"
const order = [0, 2, 3, 1, 3, 2, 1, 3];
for (let k = 0; k < 40; k++) { const c = chords[k < 16 ? 0 : 1]; pluck(B(k / 4), c[order[k % 8]] + 24 + (rnd() < 0.2 ? 12 : 0), 0.13, k % 2 ? 0.35 : -0.35); }
// Calm 8th plucks once the plan arrives (bars 2-5)
for (let b = 10; b < 22; b++) { const c = chords[Math.floor(b / 4)]; pluck(B(b), c[(b % 3) + 1] + 24, 0.1, b % 2 ? 0.3 : -0.3); pluck(B(b + 0.5), c[((b + 1) % 3) + 1] + 24, 0.06, b % 2 ? -0.3 : 0.3); }

// Drums: kick on every beat 0-23; hats on off-beats; claps on 2 and 4 from bar 1.
for (let b = 0; b < 24; b++) { if (b !== 16) kick(B(b), b === 0 ? 1.15 : 0.95); }
for (let b = 0; b < 24; b++) hat(B(b + 0.5), b < 10 ? 1.2 : 0.9, b % 2 ? 0.3 : -0.3);
for (let b = 0; b < 10; b++) hat(B(b + 0.25), 0.5, -0.2), hat(B(b + 0.75), 0.5, 0.2);
for (let b = 5; b < 24; b += 2) clap(B(b), 0.9);

// SFX on the grid
impact(0, 0.8);                       // hook hit, frame 0
whoosh(B(4), B(5) + 0.05, 1.1);        // diagonal wipe lands on beat 5
for (let i = 0; i < 6; i++) tick(B(10 + i), 1, 88 + i * 2, [-0.4, 0.4, -0.2, 0.2, -0.3, 0.3][i]); // six pieces lock in
whoosh(B(13), B(16), 0.8);            // riser into the reveal
impact(B(16), 1.15);                  // wordmark reveal
for (let i = 0; i < 6; i++) tick(B(16.5 + i * 0.25), 0.45, 96, (i / 5 - 0.5) * 0.8); // PRABIN letters
whoosh(B(18) - 0.05, B(19), 0.5, false); // AGARWAL tracks in
[77, 81, 84, 89].forEach((m, i) => tone(B(20) + i * 0.06, 1.4, m, 0.07, { type: 'sine', att: 0.002, rel: 1.5, pan: (i - 1.5) * 0.3 })); // tagline chime
tick(B(22), 0.6, 84); tick(B(24), 0.5, 86);   // compliance lines

// master: gentle soft-clip + end fade, write wav
const out = Buffer.alloc(44 + N * 4); let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const sat = x => Math.tanh(x * 1.2) / Math.tanh(1.2);
out.write('RIFF', 0); out.writeUInt32LE(36 + N * 4, 4); out.write('WAVEfmt ', 8); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  const x = i / SR, fade = x > DUR - 0.6 ? Math.max(0, (DUR - x) / 0.6) : 1;
  out.writeInt16LE(Math.round(sat(L[i] / peak * 0.9) * fade * 32000), 44 + i * 4);
  out.writeInt16LE(Math.round(sat(R[i] / peak * 0.9) * fade * 32000), 46 + i * 4);
}
const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, 'score.wav'), out);
console.log('score.wav', DUR + 's', BPM + ' bpm');
