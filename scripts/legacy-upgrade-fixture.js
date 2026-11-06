const assert = require('node:assert/strict');
const vm = require('node:vm');
const crypto = require('node:crypto');
// Generate fixtures with the actual released 1.0.7 implementation, not a
// hand-written approximation of the new schema. The exact source regions are
// checked in so shallow clones and source archives need no repository history.
const released = require('./fixtures/released-1.0.7-upgrade-source.json');
const sectionNames = ['submitBatchTurtles', 'buildBreedingHatchPlan', 'normalizeAccountData'];
assert.equal(released.format, 'turtlekeeper-released-upgrade-source-v1');
assert.equal(released.version, '1.0.7');
assert.equal(released.commit, '383ac81960f237b0a1e7b268b713df94bf4f025d');
for (const name of sectionNames) assert.equal(typeof released.sections?.[name], 'string', 'Missing released source: ' + name);
const digest = crypto.createHash('sha256').update(sectionNames.map(name => released.sections[name]).join('\n\n')).digest('hex');
assert.equal(digest, 'c3a6f3ec85ad63023e76c7539336dc0ee37b31a063c3aceab8571e2a9f9a8379', 'Released 1.0.7 upgrade fixture changed');
assert.equal(released.sha256, digest, 'Released source metadata does not match its contents');
function createLegacyData(count = 500, amount = 180000) {
  const ctx = { crypto, Date, formatDate: date => date.toISOString().slice(0, 10),
    requireArchiveCapacity: () => true, speciesPhoto: () => '/assets/species/GHG.jpg',
    money: value => Number(value).toFixed(2), makeActivity: text => ({ id: crypto.randomUUID(), text }),
    activateCareReminder() {}, toast() {}, window: { setTimeout() {} },
    state: { turtles: [], ledgerRecords: [], breedingRecords: [], memos: [], keptSpecies: [], turtlePools: [{ id: 'pool', name: '旧版龟池', type: 'hatchling', count: 7 }] } };
  ctx.saveWithDeferredImages = patch => Object.assign(ctx.state, patch);
  vm.createContext(ctx);
  for (const name of ['submitBatchTurtles', 'buildBreedingHatchPlan']) {
    vm.runInContext(released.sections[name], ctx);
  }
  const fields = { batchStage: 'hatchling', batchCount: String(count), batchTotalPrice: String(amount), acquiredDate: '2026-09-01', poolId: 'pool' };
  const species = { code: 'GHG', name: '果核蛋龟' };
  ctx.submitBatchTurtles({ get: key => fields[key] ?? '' }, species);
  let nest = { id: 'legacy-nest', motherId: 'manual', motherName: '旧种母', date: '2026-09-01', poolId: 'pool', eggCount: 8, fertileCount: 8, hatchCount: 0 };
  for (const [cumulative, date] of [[3, '2026-09-09'], [5, '2026-09-10']]) {
    const plan = ctx.buildBreedingHatchPlan(nest, cumulative, species, ctx.state.turtles, ctx.state.ledgerRecords, date);
    ctx.state.turtles.push(...plan.added);
    nest = { ...nest, hatchCount: cumulative, hatchArchiveIds: plan.hatchArchiveIds };
  }
  ctx.state.breedingRecords = [nest, { id: 'legacy-count-only', motherId: 'manual', motherName: '只记录了数量的种母', date: '2026-09-01', poolId: 'pool', eggCount: 5, fertileCount: 5, hatchCount: 3 }];
  return JSON.parse(JSON.stringify(ctx.state));
}
function legacyNormalize(data) {
  const ctx = { cleanText: value => value };
  vm.createContext(ctx);
  vm.runInContext(released.sections.normalizeAccountData, ctx);
  return JSON.parse(JSON.stringify(ctx.normalizeAccountData(data)));
}
module.exports = { createLegacyData, legacyNormalize };
