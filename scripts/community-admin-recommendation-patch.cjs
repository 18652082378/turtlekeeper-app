'use strict';
const crypto = require('node:crypto');
const BASE_HASH = '7f95d3d9eb80f3834f08fda052a627db20a82c29305a7363f46c22d64e03285e';
const TARGET_HASH = 'e195654474f9f271281605c841f7237201b4d1ae002829153b82ec0217097b31';
const OLD = '    if (normalizedCommunityVisibility(post.visibility) !== "public" || advertisingRisk(post)) return sendJson(res, 400, { ok: false, message: "帖子非公开或包含疑似广告、联系方式、售卖信息，不可推送" });';
const NEW = '    if (normalizedCommunityVisibility(post.visibility) !== "public") return sendJson(res, 400, { ok: false, message: "帖子非公开，不可推送" });';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function patchMain(source) {
  const digest = hash(source);
  if (digest === TARGET_HASH) return source;
  if (digest !== BASE_HASH) throw Error('Main server differs from the reviewed deployed release-120 hotfix; nothing changed');
  if (source.split(OLD).length !== 2) throw Error('Expected exactly one administrator keyword veto');
  const patched = source.replace(OLD, NEW);
  if (hash(patched) !== TARGET_HASH) throw Error('Patched main server checksum mismatch');
  return patched;
}
module.exports = { BASE_HASH, TARGET_HASH, OLD, NEW, hash, patchMain };
