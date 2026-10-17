'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
function slice(start, end) { return source.slice(source.indexOf(start), source.indexOf(end)); }
function setup(platform, permissions) {
  const trace = [], messages = [];
  const plugin = {
    checkPermissions: async () => permissions,
    requestPermissions: async () => { trace.push('request'); return { location: 'denied', coarseLocation: 'granted' }; },
    getCurrentPosition: async () => { trace.push('locate'); return { coords: { latitude: 32, longitude: 118 } }; },
    exportImage: async () => ({ cancelled: true }), shareImage: async () => { trace.push('share'); return { opened: true }; },
  };
  const ctx = { window: { Capacitor: { isNativePlatform: () => true, getPlatform: () => platform,
    Plugins: { TurtleAndroidLocation: plugin, Geolocation: plugin, TurtleAndroidFiles: plugin, TurtleVideoCache: { resolve() {} } } } },
    state: { turtles: [{ id: 'test', code: '小龟' }], selectedTurtleId: 'test' }, toast: message => messages.push(message),
    renderGrowthCardBlob: async () => new Blob(['image'], { type: 'image/png' }), fileAsDataUrl: async () => 'data:image/png;base64,aW1hZ2U=',
    URL: { createObjectURL: () => { throw Error('Native images must not fall back to download links'); } }, navigator: {} };
  vm.createContext(ctx);
  vm.runInContext(slice('function nativeGeolocationPlugin()', '// iOS\'s WebView file input'), ctx);
  vm.runInContext(slice('function locationPermissionError(', 'async function requestMarketCityAutofill('), ctx);
  vm.runInContext(slice('function nativeVideoCachePlugin()', 'function videoCacheSizeLabel('), ctx);
  vm.runInContext(slice('async function saveGrowthCard()', 'async function downloadTextFile('), ctx);
  return { ctx, plugin, trace, messages };
}
(async () => {
  const approximate = setup('android', { location: 'denied', coarseLocation: 'granted' });
  await approximate.ctx.getMarketLocationPosition(); assert.deepEqual(approximate.trace, ['locate']);
  assert.match(approximate.ctx.locationSettingsHint(), /系统/); assert.doesNotMatch(approximate.ctx.locationSettingsHint(), /iPhone/);
  assert.equal(approximate.ctx.nativeVideoCachePlugin(), null);
  const prompt = setup('android', { location: 'prompt', coarseLocation: 'prompt' });
  await prompt.ctx.getMarketLocationPosition(); assert.deepEqual(prompt.trace, ['request', 'locate']);
  const denied = setup('android', { location: 'denied', coarseLocation: 'denied' });
  await assert.rejects(denied.ctx.getMarketLocationPosition(), /LOCATION_DENIED/); assert.equal(denied.trace.length, 0);
  const ios = setup('ios', { location: 'denied', coarseLocation: 'granted' });
  await assert.rejects(ios.ctx.getMarketLocationPosition(), /LOCATION_DENIED/); assert.match(ios.ctx.locationSettingsHint(), /iPhone/);
  assert(ios.ctx.nativeVideoCachePlugin());
  assert.equal(await approximate.ctx.saveGrowthCard(), false); assert.match(approximate.messages.at(-1), /取消/);
  approximate.plugin.exportImage = async () => ({ saved: true }); assert.equal(await approximate.ctx.saveGrowthCard(), true);
  approximate.plugin.exportImage = async () => { throw Error('存储空间不足'); }; assert.equal(await approximate.ctx.saveGrowthCard(), false);
  assert.match(approximate.messages.at(-1), /存储空间不足/);
  const count = approximate.messages.length; await approximate.ctx.shareGrowthCard(); assert.equal(approximate.trace.at(-1), 'share');
  assert.equal(approximate.messages.length, count, 'Opening Android share UI does not claim that an image has been saved');
  const android = require('./android/adapt-shared-asset.cjs')('app.js', source, { androidBuild: 20, androidVersion: '1.1.8', updateChannel: 'store' });
  for (const kind of ['photo', 'video']) {
    const input = android.match(new RegExp('<input[^>]+data-community-chat-camera-' + kind + '-input[^>]*>'))?.[0];
    assert(input); assert.match(input, kind === 'photo' ? /accept="image\/\*"/ : /accept="video\/\*"/); assert.match(input, /capture="environment"/);
  }
  assert.match(source, /accept="image\/jpeg,image\/png,image\/webp" capture="environment"/, 'Preserve existing iOS format negotiation');
  console.log('PASS Android native boundary clients: approximate/denied permissions, iOS routing, confirmed image saves/cancel/error, native image share and camera inputs.');
})().catch(error => { console.error(error); process.exitCode = 1; });
