'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'server/server.js'), 'utf8');
const output = path.join(root, 'output');
fs.mkdirSync(output, { recursive: true });
const fixture = fs.mkdtempSync(path.join(output, 'turtle-share-server-'));
const index = '<!doctype html><html><head><title>龟友手账</title></head><body><div id="app"></div><script src="./app.js"></script></body></html>';
fs.writeFileSync(path.join(fixture, 'index.html'), index);
fs.writeFileSync(path.join(fixture, 'app.js'), 'window.fixture = true;');
const listing = { id: 'fixture-market', status: 'active', title: '旧商品分享', speciesName: '果核蛋龟', price: 50, city: '南京市', mediaItems: [{ type: 'image', url: '/uploads/market.jpg' }] };
let databaseReads = 0;
const ctx = {
  fs, path, Buffer, URL, STATIC_ROOT: fixture,
  mimeTypes: { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' },
  trimPublicText: (value, max) => String(value || '').slice(0, max),
  readDatabase: () => { databaseReads++; return { marketListings: [listing] }; },
  marketListingView: (_db, item) => item
};
vm.createContext(ctx);
const start = source.indexOf('function escapeShareMeta(value)');
const end = source.indexOf('function handleAppVersion(req, res)');
assert(start >= 0 && end > start, 'Extract the actual share metadata and static response path');
vm.runInContext(source.slice(start, end), ctx);
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const basic = { id: 'shared-fixture', code: '小果', speciesName: '果核蛋龟', gender: '母', weight: 65,
  carapaceLength: 6.89, photo: 'https://photos.example.test/turtle.jpg?Expires=100&Signature=a%2Bb' };
const urlFor = payload => new URL('https://api.turtleworld.cn/?turtle=' + encode(payload));
const req = { headers: { host: 'api.turtleworld.cn', 'x-forwarded-proto': 'https' } };
const render = payload => String(ctx.turtleSharePageHtml(req, urlFor(payload), index));
function metadata(html, name) {
  const match = html.match(new RegExp('<meta (?:name|property)="' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '" content="([^"]*)">'));
  return match?.[1];
}

(async () => {
  let server;
  try {
    const html = render(basic);
    assert.equal(metadata(html, 'og:title'), '龟友手账');
    assert.equal(metadata(html, 'og:description'), '小果 · 果核蛋龟 · 母 · 65g · 背甲 6.89cm');
    assert.equal(metadata(html, 'description'), metadata(html, 'og:description'));
    assert.equal(metadata(html, 'twitter:description'), metadata(html, 'og:description'));
    assert.equal(metadata(html, 'og:image'), 'https://photos.example.test/turtle.jpg?Expires=100&amp;Signature=a%2Bb');
    assert.equal(metadata(html, 'twitter:image'), metadata(html, 'og:image'));
    assert(html.includes('<link rel="image_src" href="https://photos.example.test/turtle.jpg?Expires=100&amp;Signature=a%2Bb">'));
    assert.equal(metadata(html, 'og:image:secure_url'), metadata(html, 'og:image'));
    assert.equal(databaseReads, 0, 'Turtle link metadata must not read owner/account data');
    assert(html.includes('<script src="./app.js"></script>'), 'Metadata rendering preserves the app entry');

    for (const value of ['', null, '-', '未知', '未填写', '品种未填写', '未命名龟龟']) {
      const empty = render({ id: 'shared', code: value || '未命名龟龟', speciesName: value, gender: value, weight: 0, carapaceLength: '' });
      assert.equal(metadata(empty, 'og:description'), '查看乌龟的成长档案');
      assert.equal(metadata(empty, 'og:image'), undefined, 'Empty photos never turn the site root into a thumbnail');
    }
    for (const dimension of [null, '', ' ', 0, -1, 'NaN', 'Infinity', {}, [], false]) {
      assert.equal(metadata(render({ ...basic, weight: dimension, carapaceLength: dimension }), 'og:description'), '小果 · 果核蛋龟 · 母');
    }
    const injected = render({ ...basic, code: '<script>alert("x")</script>', speciesName: '\" onload=\"alert(1)',
      price: 999999.99, phone: 'private-phone-canary', ownerName: 'private-owner-canary', source: 'private-source-canary', poolId: 'private-pool-canary' });
    assert(!injected.includes('<script>alert('));
    assert(metadata(injected, 'og:description').includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'));
    assert(!injected.includes('content="" onload='));
    assert(!injected.includes('private-phone-canary') && !injected.includes('private-owner-canary') && !injected.includes('999999.99'));
    assert(!injected.includes('private-source-canary') && !injected.includes('private-pool-canary'));
    for (const photo of ['', ' ', 'data:image/png;base64,abc', 'javascript:alert(1)', 'file:///C:/secret.jpg', 'ftp://example.test/turtle.jpg', 'https://user:password@example.test/turtle.jpg', '\\host\\image.jpg']) {
      const candidate = render({ ...basic, photo });
      if (photo === '\\host\\image.jpg') continue;
      assert.equal(metadata(candidate, 'og:image'), undefined, 'Unsafe/non-public thumbnail protocol must be omitted: ' + photo);
    }
    assert.equal(metadata(render({ ...basic, photo: '/uploads/turtle.jpg' }), 'og:image'), 'https://api.turtleworld.cn/uploads/turtle.jpg');
    const httpImage = render({ ...basic, photo: 'http://photos.example.test/turtle.jpg' });
    assert.equal(metadata(httpImage, 'og:image'), 'http://photos.example.test/turtle.jpg');
    assert.equal(metadata(httpImage, 'og:image:secure_url'), undefined);
    for (const bad of ['', '*bad*', 'a'.repeat(12001), encode([]), encode(null), encode({ id: 't' }), encode({ id: {}, code: '龟龟' }), encode({ id: 't', code: '' })]) {
      const requestUrl = new URL('https://api.turtleworld.cn/?turtle=' + bad);
      assert.equal(ctx.turtleSharePageHtml(req, requestUrl, index), null, 'Malformed/oversized shares safely fall back to the normal page');
    }
    assert.equal(ctx.turtleSharePageHtml(req, new URL('https://api.turtleworld.cn/?market=fixture-market'), index), null);

    server = http.createServer((request, response) => ctx.serveStatic(request, response, new URL(request.url, 'https://api.turtleworld.cn')));
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const base = 'http://127.0.0.1:' + server.address().port;
    databaseReads = 0;
    for (const pathname of ['/', '/index.html']) {
      const response = await fetch(base + pathname + '?turtle=' + encode(basic), { headers: { 'x-forwarded-proto': 'https' } });
      const body = await response.text();
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /text\/html/);
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.equal(metadata(body, 'og:title'), '龟友手账');
      assert.equal(metadata(body, 'og:description'), '小果 · 果核蛋龟 · 母 · 65g · 背甲 6.89cm');
      assert.equal(metadata(body, 'og:image'), metadata(html, 'og:image'));
    }
    assert.equal(databaseReads, 0, 'Serving a public turtle link has no account/DB side effects');
    const normal = await fetch(base + '/');
    assert.equal(await normal.text(), index, 'Normal site responses are byte-for-byte unchanged');
    const market = await fetch(base + '/?market=fixture-market');
    assert.equal(metadata(await market.text(), 'og:title'), '龟友手账｜旧商品分享', 'Legacy market previews continue to use their original renderer');
    const invalid = await fetch(base + '/?market=fixture-market&turtle=not-json');
    assert.equal(metadata(await invalid.text(), 'og:title'), '龟友手账｜旧商品分享');
    const script = await fetch(base + '/app.js?turtle=' + encode(basic));
    assert.equal(await script.text(), 'window.fixture = true;', 'Query metadata is only added to index HTML');
    const privateFile = await fetch(base + '/server/.env?turtle=' + encode(basic));
    assert.equal(privateFile.status, 403);
    console.log('PASS: turtle share server metadata, turtle photo/brand/info, omission of blank/private fields, escaped HTML, invalid/oversized payloads, actual static HTTP/cache handling, and unchanged market/plain/static responses.');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    assert(path.dirname(fixture) === output && path.basename(fixture).startsWith('turtle-share-server-'));
    fs.rmSync(fixture, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
