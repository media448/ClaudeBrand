// Studio renderer. Every film is a pure function of time: window.seek(t) paints frame t.
//   node render.mjs [films/<name>]                 full render -> out/<name>.mp4 (H.264 yuv420p CRF 16, -14 LUFS)
//   node render.mjs [films/<name>] --contact       one frame per measured beat -> out/<name>-contact.png
//   node render.mjs [films/<name>] --frame 8.5     single frame -> out/<name>-8.5.png
// Options: --query "w=960&spp=1&variant=branded"   passed to the film's page
//          --tag <suffix>                           appended to output names
// A film may set window.FILM = { width, height, fps, duration, flipY, pixels() } (WebGL films return raw RGBA);
// otherwise it is a 2D canvas read with getImageData at 1080x1920, 30 fps.
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { resolve, basename, join, relative, extname } from 'node:path';

const args = process.argv.slice(2);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const flag = f => args.includes(f), val = f => args[args.indexOf(f) + 1];
const opts = new Set(['--frame', '--query', '--tag']);
const film = resolve(args.find((a, i) => !a.startsWith('--') && !opts.has(args[i - 1])) || 'films/brand-reveal');
const root = process.cwd(), name = basename(film) + (flag('--tag') ? '-' + val('--tag') : ''), outDir = resolve('out');
mkdirSync(outDir, { recursive: true });

// 1. score -> measured beat grid (films read beats.json, never a hard-coded tempo)
if (existsSync(join(film, 'score.mjs'))) execFileSync('node', [join(film, 'score.mjs')], { stdio: 'inherit' });
execFileSync('node', [resolve('tools/beats.mjs'), film], { stdio: 'inherit' });
const beats = JSON.parse(readFileSync(join(film, 'beats.json'), 'utf8'));

// 2. static server for the page (ES modules need http), plus a raw-frame sink
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.wav': 'audio/wav' };
let sinks = [];   // ffmpeg stdin streams that receive the next posted frame
const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/frame') {
    const chunks = []; req.on('data', c => chunks.push(c));
    req.on('end', () => { const buf = Buffer.concat(chunks); Promise.all(sinks.map(s => s.write(buf) || new Promise(r => s.once('drain', r)))).then(() => res.end('ok')); });
    return;
  }
  const f = join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(root) || !existsSync(f) || statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', MIME[extname(f)] || 'application/octet-stream'); res.end(readFileSync(f));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await page.addInitScript(b => { window.BEATS = b; }, beats);
page.on('pageerror', e => { console.error('page error:', e.message); process.exit(1); });
page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
await page.goto(`${base}/${relative(root, film)}/index.html?render${flag('--query') ? '&' + val('--query') : ''}`);
await page.evaluate(() => window.ready);
const F = await page.evaluate(() => { const f = window.FILM || {}; return { width: f.width || 1080, height: f.height || 1920, fps: f.fps || 30, duration: f.duration || window.DURATION, flipY: !!f.flipY, variants: f.variants || null, variantsFrom: f.variantsFrom ?? 0 }; });
const { width: W, height: H, fps: FPS, duration: DUR } = F;

// paint frame t in the page and stream its RGBA to the current ffmpeg sink
const grab = t => page.evaluate(async t => {
  await window.seek(t);
  let px;
  if (window.FILM && window.FILM.pixels) px = window.FILM.pixels();
  else { const c = document.querySelector('canvas'); px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; }
  await fetch('/frame', { method: 'POST', body: px });
}, t);
const rawIn = rate => ['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-framerate', String(rate), '-i', '-'];
const flip = F.flipY ? 'vflip,' : '';
function ffmpeg(argv) {
  const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: ['pipe', 'inherit', 'inherit'] });
  sinks = [p.stdin];
  return { stdin: p.stdin, done: () => new Promise((res, rej) => { p.on('exit', c => c ? rej(new Error('ffmpeg exit ' + c)) : res()); p.stdin.end(); }) };
}

if (flag('--frame')) {
  const t = parseFloat(val('--frame')), f = join(outDir, `${name}-${t}.png`);
  const ff = ffmpeg([...rawIn(1), '-vf', flip + 'format=rgb24', '-frames:v', '1', f]);
  await grab(t); await ff.done(); console.log(f);
} else if (flag('--contact')) {
  const ts = beats.beats.filter(t => t < DUR).map(t => clamp(t + 0.1, 0, DUR));   // just after each hit lands
  const cols = 6, rows = Math.ceil(ts.length / cols), cw = 480, ch = Math.round(cw * H / W), f = join(outDir, `${name}-contact.png`);
  const ff = ffmpeg([...rawIn(1), '-vf', `${flip}scale=${cw}:${ch},drawtext=text='%{eif\\:n\\:d}':x=8:y=8:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.6,tile=${cols}x${rows}:padding=6:color=0x222222`, '-frames:v', '1', f]);
  for (const t of ts) await grab(t);
  await ff.done(); console.log(f, `(${ts.length} beats; cell n = beat n)`);
} else {
  // 3. loudness: two-pass EBU R128 to -14 LUFS, -1 dBTP
  const wav = join(film, 'score.wav'), norm = join(outDir, `${name}-audio.wav`);
  const meas = execFileSync('sh', ['-c', `ffmpeg -hide_banner -i "${wav}" -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null - 2>&1`], { encoding: 'utf8' });
  const j = JSON.parse(meas.slice(meas.lastIndexOf('{'), meas.lastIndexOf('}') + 1));
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-af', `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true,aresample=48000`, '-ar', '48000', norm]);
  // 4. frames -> H.264. A film with variants (window.FILM.variants) gets one encode per variant; frames before
  //    FILM.variantsFrom are identical across variants, so they are rendered once and fanned out.
  const variants = F.variants || [null], total = Math.round(DUR * FPS), t0 = Date.now();
  const outs = variants.map(v => join(outDir, `${name}${v ? '-' + v : ''}.mp4`));
  const encs = outs.map(f => ffmpeg([...rawIn(FPS), '-i', norm, '-map', '0:v', '-map', '1:a', '-vf', flip + 'format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', f]));
  for (let i = 0; i < total; i++) {
    const t = i / FPS;
    if (variants.length === 1 || t < F.variantsFrom) { sinks = encs.map(e => e.stdin); await grab(t); }
    else for (const [k, v] of variants.entries()) { await page.evaluate(v => window.FILM.setVariant(v), v); sinks = [encs[k].stdin]; await grab(t); }
    if (i % 12 === 0) { const el = (Date.now() - t0) / 1000; process.stdout.write(`\rframe ${i}/${total}  ${el.toFixed(0)}s elapsed, ~${(el / (i + 1) * (total - i - 1) / 60).toFixed(1)} min left   `); }
  }
  await Promise.all(encs.map(e => e.done())); rmSync(norm);
  console.log('\n' + outs.join('\n'));
}
await browser.close(); server.close();
