const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../assets/team-space.js'), 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function harness() {
  let account = { phone: 'owner', token: 'token' };
  const calls = [], notices = [];
  const context = vm.createContext({ Intl, Date, console, queueMicrotask() {}, setInterval() {}, document: { querySelectorAll: () => [], addEventListener() {} }, window: { addEventListener() {} } });
  // Expose closures in this isolated test only; production exports are unchanged.
  vm.runInContext(source.replace('  window.TurtleTeam = {', `  window.audit = {
    refresh, mutate, reset,
    setRange(value) { reportRange = value; },
    state() { return { team, error, loading, busy, saveState, species }; },
    initialize(value) { host = value; session = auth().phone + ':' + auth().token; },
    switchAccount() { session = auth().phone + ':' + auth().token; reset(); }
  };
  window.TurtleTeam = {`), context);
  const host = { auth: () => ({ ...account }), page: () => 'other', toast: value => notices.push(value), api: (url, body) => { const pending = deferred(); calls.push({ body, ...pending }); return pending.promise; } };
  const audit = context.window.audit;
  audit.initialize(host);
  return { audit, calls, notices, switchAccount(phone) { account = { phone, token: 'token' }; audit.switchAccount(); } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const list = { teams: [{ id: 'team' }], invitations: [], canCreate: false };
function snapshot(label) { return { team: { id: 'team', revision: label, permissions: {}, report: { label } } }; }
async function main() {
  const h = harness();
  const old = h.audit.refresh(); h.calls[0].resolve(list); await tick();
  assert.equal(h.calls[1].body.range.mode, 'month');
  h.audit.setRange({ mode: 'year' }); const latest = h.audit.refresh();
  assert.equal(h.calls.length, 3, 'a newer date selection must request fresh results even while loading');
  h.calls[2].resolve(list); await tick(); h.calls[3].resolve(snapshot('year')); await latest;
  h.calls[1].resolve(snapshot('month')); await old;
  assert.equal(h.audit.state().team.report.label, 'year', 'late responses must not overwrite latest filters');
  const pending = h.audit.refresh(); const oldCall = h.calls.at(-1);
  h.switchAccount('member'); const current = h.audit.refresh(); h.calls.at(-1).resolve(list); await tick();
  h.calls.at(-1).resolve(snapshot('member')); await current;
  oldCall.reject(new Error('old account timeout')); await pending;
  assert.equal(h.audit.state().team.report.label, 'member', 'old-account failures must not clear the current team');
  assert.equal(h.audit.state().error, '');
  const mutation = h.audit.mutate('ledger', { amount: 12 }); const write = h.calls.at(-1);
  h.switchAccount('owner'); const loading = h.audit.refresh();
  write.reject(new Error('old write failed')); await mutation;
  assert.equal(h.audit.state().saveState, '', 'old-account mutation must not set current save feedback');
  assert.equal(h.notices.length, 0);
  h.calls.at(-1).resolve(list); await tick(); h.calls.at(-1).resolve(snapshot('owner')); await loading;
  console.log('PASS: out-of-order date filters, stale account fetch errors and stale mutation failures.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
