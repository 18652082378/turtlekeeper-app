const { execFileSync } = require('node:child_process');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
// Generate fixtures with the actual released 1.0.7 implementation, not a
// hand-written approximation of the new schema. Requires repository history.
const source = execFileSync('git', ['show', '383ac81:app.js'], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
function createLegacyData(count = 500, amount = 180000) {
  const ctx = { crypto, Date, formatDate: date => date.toISOString().slice(0, 10),
    requireArchiveCapacity: () => true, speciesPhoto: () => '/assets/species/GHG.jpg',
    money: value => Number(value).toFixed(2), makeActivity: text => ({ id: crypto.randomUUID(), text }),
    activateCareReminder() {}, toast() {}, window: { setTimeout() {} },
    state: { turtles: [], ledgerRecords: [], breedingRecords: [], memos: [], keptSpecies: [], turtlePools: [{ id: 'pool', name: '旧版龟池', type: 'hatchling', count: 7 }] } };
  ctx.saveWithDeferredImages = patch => Object.assign(ctx.state, patch);
  vm.createContext(ctx);
  for (const [start, end] of [['function submitBatchTurtles(', 'function appReviewStorageKey('], ['function buildBreedingHatchPlan(', 'function confirmBreedingHatch(']]) {
    vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end)), ctx);
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
  vm.runInContext(source.slice(source.indexOf('function emptyAccountData('), source.indexOf('function syncRegisteredUsers(')), ctx);
  return JSON.parse(JSON.stringify(ctx.normalizeAccountData(data)));
}
module.exports = { createLegacyData, legacyNormalize };
