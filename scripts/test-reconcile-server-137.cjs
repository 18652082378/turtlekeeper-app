'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { resolveReviewed, withoutOldMarker, reviewed } = require('./reconcile-server-137.cjs');
const pairs = require('./fixtures/reviewed-server-137-conflicts.json');
const conflict = (left, right) => `<<<<<<< current\n${left}=======\n${right}>>>>>>> release\n`;
const source = pairs.map(pair => conflict(...pair)).join('');
assert.equal(resolveReviewed(source), pairs.map(pair => pair[1]).join(''));
assert.equal(resolveReviewed(source.replace(/\n/g, '\r\n')), resolveReviewed(source));
assert.throws(() => resolveReviewed(source.replace('careRecords: [], careCustomItems:', 'careRecords: [1], careCustomItems:')), /Unreviewed/);
assert.throws(() => resolveReviewed(pairs.slice(1).map(pair => conflict(...pair)).join('')), /Unreviewed|count/);
assert.throws(() => resolveReviewed(source + conflict('unknown\n', 'unknown\n')), /Unreviewed/);
assert.throws(() => resolveReviewed(source + '\n<<<<<<< stray\n'), /markers/);
assert.equal(withoutOldMarker('code\n\n// CARE_PERSISTENCE_HOTFIX_20260927\n'), 'code');
assert.notEqual(withoutOldMarker('code\nproductionFix();\n'), withoutOldMarker('code\n'));
const normalizer = 'function normalizeAccountData(data = {}) {\n  return {\n    turtles: [],\n    careRecords: TurtleCare.normalizeRecords(next.careRecords),\n    careCustomItems: TurtleCare.normalizeItems(next.careCustomItems),\n    carePlans: TurtleCare.normalizePlans(next.carePlans)\n  };\n}';
const oldFields = '    careRecords: Array.isArray(next.careRecords) ? next.careRecords : [],\n    careCustomItems: Array.isArray(next.careCustomItems) ? next.careCustomItems : [],\n    carePlans: Array.isArray(next.carePlans) ? next.carePlans : [],\n';
assert.equal(withoutOldMarker(normalizer.replace('    turtles:', oldFields + '    turtles:')), normalizer);
assert.notEqual(withoutOldMarker(normalizer.replace('    turtles:', oldFields.replace('next.careRecords : []', 'next.careRecords : [1]') + '    turtles:')), normalizer);
assert.equal(Object.keys(reviewed).length, 7);
const installer = fs.readFileSync(path.join(__dirname, 'reconcile-server-137.cjs'), 'utf8');
for (const guard of ['checkFiles();', 'withoutOldMarker(resolved)', "'Untracked file would be overwritten:", 'policy.minimumBuild === 136']) {
  assert(installer.indexOf(guard) < installer.indexOf("git(['stash', 'push'"), 'Preflight must precede source changes: ' + guard);
}
assert(!installer.includes('reset --hard') && !installer.includes("'stash', 'pop'"));
console.log('PASS: the nine supplied conflicts resolve exactly; unknown/extra/malformed conflicts and unreviewed extra code are rejected; checks precede source changes.');
