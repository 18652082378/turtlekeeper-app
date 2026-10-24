'use strict';
// Exercise the real JSON request helper with controllable, intercepted transport failures.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
let timer, timeoutMs, cleaned = 0, feedback = 0, clearedSessions = 0, calls = 0;
const ctx = { AbortController, state: { loggedInPhone: 'synthetic-owner' }, currentCloudToken: () => 'synthetic-token',
  window: { TURTLE_API_BASE_URL: 'https://resilience.invalid', TurtleUI: { beginRequest: () => () => { feedback++; } } },
  setTimeout(fn, ms) { timer = fn; timeoutMs = ms; return 1; }, clearTimeout() { cleaned++; },
  clearExpiredCloudSession() { clearedSessions++; } };
vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('async function apiPost('), source.indexOf('let appAnalyticsSessionId')), ctx);
const auth = { phone: 'synthetic-owner', token: 'synthetic-token' };
function stalled(_url, { signal }) { calls++; return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Error('aborted')))); }
(async () => {
  const cases = [
    ['/api/community/search', 30000, 'API_REQUEST_TIMEOUT'], ['/api/account/login', 30000, 'API_REQUEST_TIMEOUT'],
    ['/api/community/notifications', 30000, 'API_REQUEST_TIMEOUT'], ['/api/community/comment', 30000, 'API_REQUEST_TIMEOUT'],
    ['/api/market/confirm', 30000, 'API_REQUEST_TIMEOUT'], ['/api/admin/overview', 30000, 'API_REQUEST_TIMEOUT'],
    ['/api/account/save', 20000, 'ACCOUNT_SYNC_TIMEOUT'], ['/api/market/list', 15000, 'FEED_LOAD_TIMEOUT'],
    ['/api/community/chat/send', 15000, 'CHAT_REQUEST_TIMEOUT'], ['/api/upload/image', 120000, 'UPLOAD_TIMEOUT']
  ];
  for (const [route, expectedMs, code] of cases) {
    ctx.fetch = stalled;
    const before = calls, pending = ctx.apiPost(route, auth); assert.equal(timeoutMs, expectedMs); timer();
    await assert.rejects(pending, error => error.code === code); assert.equal(calls, before + 1, 'never silently retry a mutation');
  }
  ctx.fetch = async (_url, { signal }) => ({ ok: true, status: 200, json: () => stalled('', { signal }) });
  const hangingBody = ctx.apiPost('/api/community/search', auth); await new Promise(resolve => setImmediate(resolve)); timer();
  await assert.rejects(hangingBody, error => error.code === 'API_REQUEST_TIMEOUT');
  for (const body of [null, [], 'proxy response', 42, false, { throws: true }]) {
    ctx.fetch = async () => ({ ok: true, status: 200, json: async () => { if (body?.throws) throw SyntaxError('HTML, not JSON'); return body; } });
    await assert.rejects(ctx.apiPost('/api/community/comment', auth), error => error.code === 'INVALID_API_RESPONSE');
  }
  for (const status of [401, 405, 503]) {
    ctx.fetch = async () => ({ ok: false, status, json: async () => { throw SyntaxError('upstream error page'); } });
    await assert.rejects(ctx.apiPost('/api/community/comment', auth), error => error.status === status);
  }
  assert.equal(clearedSessions, 1, 'a malformed 401 still expires only the matching session');
  await assert.rejects(ctx.apiPost('/api/community/comment', { phone: 'previous-owner', token: 'previous-token' }));
  assert.equal(clearedSessions, 1);
  for (const body of [{ ok: true, posts: [] }, { posts: [] }]) {
    ctx.fetch = async () => ({ ok: true, status: 200, json: async () => body });
    assert.equal(await ctx.apiPost('/api/community/list', auth), body, 'retain legacy JSON objects without an ok property');
  }
  assert.equal(cleaned, cases.length + 1 + 6 + 3 + 1 + 2);
  assert.equal(feedback, cleaned, 'release busy controls after every outcome');
  console.log(`PASS: ${cleaned} request outcomes: deadlines, hanging body, malformed JSON, HTTP status, session ownership, legacy responses and busy cleanup.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
