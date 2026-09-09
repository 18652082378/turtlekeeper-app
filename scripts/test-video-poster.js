const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const vm = require('node:vm');
const { createPosterService } = require('../server/video-poster');

(async () => {
  const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  const context = { defaultPhoto: '/placeholder.svg' };
  vm.createContext(context);
  vm.runInContext(app.slice(app.indexOf('function marketVideoPosterUrl('), app.indexOf('const marketPosterRepairs')), context);
  assert.equal(context.marketVideoPosterUrl({ posterUrl: 'blob:temporary' }), '/placeholder.svg');
  assert.equal(context.marketVideoPosterUrl({ posterUrl: '/uploads/cover.jpg' }), '/uploads/cover.jpg');
  assert.equal(context.marketVideoPosterUrl({ posterUrl: 'https://media.example/cover.jpg' }), 'https://media.example/cover.jpg');
  assert.equal(context.persistentVideoPosterUrl('data:image/jpeg;base64,abc'), '');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'turtle-poster-'));
  const binary = process.env.FFMPEG_PATH || 'ffmpeg';
  try {
    const folder = path.join(root, '2026', '09');
    fs.mkdirSync(folder, { recursive: true });
    execFileSync(binary, ['-nostdin', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=green:s=160x120:d=0.2', '-pix_fmt', 'yuv420p', path.join(folder, 'test.mp4')], { windowsHide: true });
    let published = 0;
    const poster = createPosterService({ uploadRoot: root, binary, publish: async (file, year, month, name) => {
      assert.ok(fs.statSync(file).size > 0);
      assert.equal(year, '2026'); assert.equal(month, '09');
      published++;
      return `/uploads/${year}/${month}/${name}`;
    } });
    const results = await Promise.all([poster('/uploads/2026/09/test.mp4'), poster('/uploads/2026/09/test.mp4')]);
    assert.equal(results[0], results[1]);
    assert.match(results[0], /poster-.*\.jpg$/);
    assert.equal(published, 1);
    const jpeg = path.join(root, results[0].slice('/uploads/'.length));
    const mtime = fs.statSync(jpeg).mtimeMs;
    await poster('/uploads/2026/09/test.mp4');
    assert.equal(fs.statSync(jpeg).mtimeMs, mtime);
    assert.equal(await poster('/uploads/%2e%2e/secret.mp4'), '');
    assert.equal(await poster('https://example.com/video.mp4'), '');
    assert.equal(await poster('/uploads/2026/09/missing.mp4'), '');
    fs.writeFileSync(path.join(folder, 'broken.mp4'), 'broken');
    assert.equal(await poster('/uploads/2026/09/broken.mp4'), '');
    assert.ok(!fs.readdirSync(folder).some(name => name.endsWith('.tmp.jpg')));
    const original=path.join(folder,'large.jpg');
    execFileSync(binary,['-nostdin','-loglevel','error','-f','lavfi','-i','testsrc2=size=2400x1800','-frames:v','1',original],{windowsHide:true});
    const thumbnail=createPosterService({uploadRoot:root,binary,thumbnail:true,publish:async file=>file});
    const small=await thumbnail('/uploads/2026/09/large.jpg');
    assert.match(small,/thumb600-/);
    assert.ok(fs.statSync(small).size < fs.statSync(original).size);
    assert.equal(await thumbnail('/uploads/2026/09/test.mp4'),'');
    console.log('Thumbnail bytes:',fs.statSync(original).size,'->',fs.statSync(small).size);
    console.log('Video poster checks passed: real decode, deduplication, cache, invalid paths, corrupt media');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
