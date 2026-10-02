'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { engine, launchBrowser } = require('./browser-test-engine.cjs');
const { createPosterService } = require('../server/video-poster');
const root = path.resolve(__dirname, '..'), binary = process.env.FFMPEG_PATH || 'ffmpeg';
(async () => {
  assert.equal(engine, 'chromium', 'This real local-video decode test uses Chromium; WebKit cover display is tested separately.');
  const parent = path.join(root, 'output/chat-product-cover-qa'); fs.mkdirSync(parent, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(parent, 'first-frame-'));
  let browser;
  try {
    const uploads = path.join(fixture, '2026/10'); fs.mkdirSync(uploads, { recursive: true });
    const source = path.join(uploads, 'two-colors.mp4');
    // One red frame, followed by blue frames: seeking to the former 0.16 s
    // position would produce the wrong blue cover.
    execFileSync(binary, ['-nostdin', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=160x120:r=25:d=0.04',
      '-f', 'lavfi', '-i', 'color=c=blue:s=160x120:r=25:d=0.36', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0', '-pix_fmt', 'yuv420p', source], { windowsHide: true });
    const posterService = createPosterService({ uploadRoot: fixture, binary, publish: async file => file });
    const poster = await posterService('/uploads/2026/10/two-colors.mp4'); assert.ok(poster);
    const pixel = execFileSync(binary, ['-nostdin', '-loglevel', 'error', '-i', poster, '-vf', 'scale=1:1', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { windowsHide: true });
    assert.ok(pixel[0] > 200 && pixel[1] < 60 && pixel[2] < 60, 'server cover must be the first red frame');
    browser = await launchBrowser(); const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'first-frame.test') return route.abort();
      if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="https://first-frame.test";' });
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, minimumBuild: 0, latestBuild: 0, posts: [], friends: [], notifications: [], listings: [], items: [] } });
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('https://first-frame.test/?skipIntro=1');
    const actual = await page.evaluate(async bytes => {
      const cover = await createVideoPoster(new File([new Uint8Array(bytes)], 'two-colors.mp4', { type: 'video/mp4' }));
      if (!cover) throw Error('Local cover did not decode');
      try {
        const img = new Image(); await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = cover.previewUrl; });
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, 1, 1);
        return { pixel: [...ctx.getImageData(0, 0, 1, 1).data], type: cover.file.type };
      } finally { URL.revokeObjectURL(cover.previewUrl); }
    }, [...fs.readFileSync(source)]);
    assert.ok(actual.pixel[0] > 200 && actual.pixel[1] < 60 && actual.pixel[2] < 60, 'local upload cover must also be the first red frame');
    assert.equal(actual.type, 'image/jpeg'); assert.deepEqual(errors, []);
    const report = { pass: true, nativeDevice: false, serverPixel: [...pixel], localPixel: actual.pixel };
    fs.writeFileSync(path.join(parent, 'real-first-frame.json'), JSON.stringify(report, null, 2));
    console.log('PASS: real two-color video generates the first red frame on both the server and local upload; the later blue frame is not used. Chromium, not native iPhone.');
  } finally {
    if (browser) await browser.close();
    assert.equal(path.dirname(fixture), parent); assert.ok(path.basename(fixture).startsWith('first-frame-'));
    fs.rmSync(fixture, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
