// Measures the beat grid from score.wav: kick-band onset detection, then a least-squares
// tempo/phase fit so the grid extends across bars without drums. Writes beats.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const buf = readFileSync(join(here, 'score.wav'));
const SR = buf.readUInt32LE(24), n = (buf.length - 44) / 4;
const HOP = 240, WIN = 960; // 5 ms hop
let lp = 0; const mono = new Float32Array(n);
for (let i = 0; i < n; i++) { const v = (buf.readInt16LE(44 + i * 4) + buf.readInt16LE(46 + i * 4)) / 65536; lp += (v - lp) * 0.012; mono[i] = lp; } // ~90 Hz low-pass
const env = []; for (let i = 0; i + WIN < n; i += HOP) { let e = 0; for (let j = 0; j < WIN; j++) e += mono[i + j] ** 2; env.push(Math.sqrt(e / WIN)); }
const db = env.map(e => 20 * Math.log10(e + 1e-5)); // relative (dB) rise is level-independent
const flux = db.map((e, i) => Math.max(0, e - (i >= 4 ? db[i - 4] : -100)));
// tempo: autocorrelation of the onset envelope over 86-180 bpm (avoids half-time)
const fps = SR / HOP; let best = 0, lag = 0;
for (let l = Math.round(fps * 0.333); l <= Math.round(fps * 0.7); l++) { let s = 0; for (let i = 0; i + l < flux.length; i++) s += Math.min(flux[i], 30) * Math.min(flux[i + l], 30); s /= flux.length - l; if (s > best) best = s, lag = l; }
// phase: comb that best explains the envelope
let bp = 0, phase = 0; for (let p = 0; p < lag; p++) { let s = 0; for (let i = p; i < flux.length; i += lag) s += Math.min(flux[i], 30); if (s > bp) bp = s, phase = p; }
// refine: peak onsets within 40 ms of the comb, then least-squares t = offset + k*period
const onsets = [];
for (let c = phase; c < flux.length; c += lag) { let bi = -1, bv = 6; for (let i = Math.max(0, c - 8); i <= Math.min(flux.length - 1, c + 8); i++) if (flux[i] > bv) bv = flux[i], bi = i; if (bi >= 0) onsets.push(bi * HOP / SR); }
const p0 = lag / fps, ks = onsets.map(t => Math.round((t - phase / fps) / p0));
const mk = ks.reduce((a, b) => a + b) / ks.length, mt = onsets.reduce((a, b) => a + b) / onsets.length;
const period = ks.reduce((s, k, i) => s + (k - mk) * (onsets[i] - mt), 0) / ks.reduce((s, k) => s + (k - mk) ** 2, 0);
let offset = mt - period * mk; while (offset - period > -0.01) offset -= period;
const resid = Math.max(...onsets.map(t => { const k = Math.round((t - offset) / period); return Math.abs(t - offset - k * period); }));
const dur = n / SR, beats = []; for (let t = offset; t < dur; t += period) beats.push(+t.toFixed(4));
writeFileSync(join(here, 'beats.json'), JSON.stringify({ bpm: +(60 / period).toFixed(2), offset: +offset.toFixed(4), onsets: onsets.map(t => +t.toFixed(4)), beats }, null, 1));
console.log(`beats.json: ${onsets.length} onsets, ${(60 / period).toFixed(2)} bpm, offset ${offset.toFixed(3)}s, max residual ${(resid * 1000).toFixed(1)} ms`);
