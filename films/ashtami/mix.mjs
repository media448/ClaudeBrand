// Lays the Ashtami score under the supplied reel's voiceover and muxes it back onto the picture.
//   node films/ashtami/mix.mjs <reel.mp4> [out/ashtami.mp4]
// Picture is stream-copied untouched. Voice + score are summed (score already ducks itself under the
// voice windows), then two-pass EBU R128 to -14 LUFS / -1 dBTP like render.mjs, AAC 320k.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [src, dst = resolve('out/ashtami.mp4')] = process.argv.slice(2);
if (!src) { console.error('usage: node films/ashtami/mix.mjs <reel.mp4> [out.mp4]'); process.exit(1); }
mkdirSync(dirname(dst), { recursive: true });
const score = join(here, 'score.wav');
if (!existsSync(score)) execFileSync('node', [join(here, 'score.mjs')], { stdio: 'inherit' });

const SCORE_DB = 1; // score level against the voice: bed sits ~20 dB under the lines, climax level with them
const mixWav = dst.replace(/\.mp4$/, '-mix.wav'), normWav = dst.replace(/\.mp4$/, '-audio.wav');
const ff = a => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a]);
ff(['-i', src, '-i', score, '-filter_complex',
  `[0:a]aresample=48000,aformat=channel_layouts=stereo[v];[1:a]volume=${SCORE_DB}dB[m];[v][m]amix=inputs=2:normalize=0:duration=first`,
  '-c:a', 'pcm_f32le', mixWav]);
const meas = execFileSync('sh', ['-c', `ffmpeg -hide_banner -i "${mixWav}" -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null - 2>&1`], { encoding: 'utf8' });
const j = JSON.parse(meas.slice(meas.lastIndexOf('{')));
ff(['-i', mixWav, '-af', `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true,aresample=48000`, '-ar', '48000', normWav]);
ff(['-i', src, '-i', normWav, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', dst]);
unlinkSync(mixWav);
console.log(dst, `(mix measured ${j.input_i} LUFS -> -14)`);
