// Studio renderer. Every film is a pure function of time: window.seek(t) paints frame t.
//   node render.mjs [films/<name>]            full render -> out/<name>.mp4 (H.264 yuv420p CRF 16, -14 LUFS)
//   node render.mjs [films/<name>] --contact  one frame per measured beat -> out/<name>-contact.png
//   node render.mjs [films/<name>] --frame 8.5 single frame -> out/<name>-8.5.png
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve, basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const film = resolve(args.find(a => !a.startsWith('--') && !/^[\d.]+$/.test(a)) || 'films/brand-reveal');
const name = basename(film), outDir = resolve('out'), FPS = 30;
const flag = f => args.includes(f), val = f => args[args.indexOf(f) + 1];
mkdirSync(outDir, { recursive: true });

// 1. score -> measured beat grid (the film reads beats.json, never a hard-coded tempo)
if (existsSync(join(film, 'score.mjs'))) execFileSync('node', [join(film, 'score.mjs')], { stdio: 'inherit' });
if (existsSync(join(film, 'beats.mjs'))) execFileSync('node', [join(film, 'beats.mjs')], { stdio: 'inherit' });
const beats = JSON.parse(readFileSync(join(film, 'beats.json'), 'utf8'));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.addInitScript(b => { window.BEATS = b; }, beats);
page.on('pageerror', e => { console.error('page error:', e.message); process.exit(1); });
await page.goto(pathToFileURL(join(film, 'index.html')).href + '?render');
await page.evaluate(() => window.ready);
const W = 1080, H = 1920, DUR = await page.evaluate(() => window.DURATION);
const shot = async t => { await page.evaluate(t => window.seek(t), t); return page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H } }); };

function ffmpeg(argv, input) {
  return new Promise((res, rej) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: [input ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
    p.on('exit', c => c ? rej(new Error('ffmpeg exit ' + c)) : res()); if (input) input(p.stdin);
  });
}

if (flag('--frame')) {
  const t = parseFloat(val('--frame')), f = join(outDir, `${name}-${t}.png`);
  await ffmpeg(['-f', 'png_pipe', '-i', '-', f], async s => { s.end(await shot(t)); });
  console.log(f);
} else if (flag('--contact')) {
  const ts = beats.beats.filter(t => t < DUR).map(t => t + 0.12);   // just after each hit lands
  const cols = 8, rows = Math.ceil(ts.length / cols), f = join(outDir, `${name}-contact.png`);
  await ffmpeg(['-f', 'png_pipe', '-framerate', '1', '-i', '-', '-vf',
    `scale=270:480,drawtext=text='%{eif\\:n\\:d}':x=8:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6,tile=${cols}x${rows}:padding=6:color=0x222222`, '-frames:v', '1', f],
    async s => { for (const t of ts) s.write(await shot(t)); s.end(); });
  console.log(f, `(${ts.length} beats; cell n = beat n)`);
} else {
  // 2. loudness: two-pass EBU R128 normalise to -14 LUFS, -1 dBTP
  const wav = join(film, 'score.wav'), norm = join(outDir, `${name}-audio.wav`);
  const m = execFileSync('ffmpeg', ['-hide_banner', '-i', wav, '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const j = JSON.parse((m.match(/\{[\s\S]*\}/) || [])[0] || execFileSync('sh', ['-c', `ffmpeg -hide_banner -i "${wav}" -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null - 2>&1`], { encoding: 'utf8' }).match(/\{[\s\S]*\}/)[0]);
  await ffmpeg(['-i', wav, '-af', `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true,aresample=48000`, '-ar', '48000', norm]);
  // 3. frames -> H.264
  const f = join(outDir, `${name}.mp4`), total = Math.round(DUR * FPS);
  await ffmpeg(['-f', 'png_pipe', '-framerate', String(FPS), '-i', '-', '-i', norm, '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', f],
    async s => { for (let i = 0; i < total; i++) { s.write(await shot(i / FPS)); if (i % 60 === 0) process.stdout.write(`\rframe ${i}/${total}`); } s.end(); });
  rmSync(norm);
  console.log(`\n${f}`);
}
await browser.close();
