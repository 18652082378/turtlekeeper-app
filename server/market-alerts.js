'use strict';
const crypto = require('node:crypto');
const isActive = item => item && !['已死亡', '已转让'].includes(item.status) && !item.lossRecordId;
const CONSENT_VERSION = 'market-alerts-20261107';
const WINDOW_MS = 24 * 3600000, BATCH_DELAY_MS = 10 * 60000;
const dayKey = now => new Date(now + 8 * 3600000).toISOString().slice(0, 10);
const hour = now => new Date(now + 8 * 3600000).getUTCHours();
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const deviceKey = device => hash((device.platform === 'android' ? 'android:' : '') + device.token);
const check = (ok, message, status = 400) => { if (!ok) throw Object.assign(Error(message), { status }); };
const clean = (value, max) => Array.from(String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, max).join('');
function settings(user) {
  const value = user.marketAlertSettings || {};
  return { enabled: value.enabled === true && value.consentVersion === CONSENT_VERSION,
    speciesCodes: Array.isArray(value.speciesCodes) ? value.speciesCodes : [], revision: Number.isSafeInteger(value.revision) ? value.revision : 0,
    since: value.since && typeof value.since === 'object' ? value.since : {}, consentVersion: value.consentVersion || '' };
}
function quotaAvailable(db, user, day, campaign, devices = []) {
  const quota = user.recommendationQuota;
  if (quota?.day === day) return quota.campaign === campaign;
  const legacy = db.communityDailyDeliveries?.[day];
  if (legacy && devices.some(device => legacy.attempted?.[deviceKey(device)])) return campaign === `community:${day}:${legacy.postId}`;
  return true;
}
function reserveQuota(user, day, campaign) { user.recommendationQuota = { day, campaign }; }
function payload(speciesName, items, receiptId, speciesCode) {
  if (!items.length) return null;
  const latest = [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id))[0];
  const title = clean(latest.title, 80) || clean(speciesName + '商品', 80);
  return { aps: { alert: { title: `你关注的${clean(speciesName, 24)}有新上架`, body: `新增${items.length}条商品，${title}` }, sound: 'default' },
    route: 'marketAlerts', receiptId, speciesCode };
}
function createMarketAlerts({ read, write, catalog, allowed, devices = () => [], send = async () => ({ skipped: true }), configured = () => false,
  canView = () => true, publicListing = (_db, item) => ({ id: item.id, title: item.title, speciesCode: item.speciesCode, speciesName: item.speciesName, status: item.status }), invalidDevice = () => {}, now = () => Date.now() }) {
  const byCode = new Map(catalog.map(item => [item.code, item]));
  const legal = code => byCode.has(code) && allowed(byCode.get(code));
  function available(db, item, user) {
    return item && item.status === 'active' && legal(item.speciesCode) && db.users?.[item.sellerPhoneRaw]
      && item.sellerPhoneRaw !== user.phone && canView(db, item, user);
  }
  function preference(user, body = {}) {
    const previous = settings(user), timestamp = now(); let changed = false;
    if (typeof body.enabled === 'boolean') {
      check(Number.isSafeInteger(body.revision) && body.revision === previous.revision, '提醒设置已更新，请重新读取后再保存', 409);
      check(Array.isArray(body.speciesCodes) && body.speciesCodes.length <= 30 && body.speciesCodes.every(code => typeof code === 'string' && legal(code)), '请选择有效的品种，最多30个');
      const codes = [...new Set(body.speciesCodes)];
      if (body.enabled) check(codes.length && body.confirmed === true && body.consentVersion === CONSENT_VERSION, '请确认开启所选品种的上新推荐通知');
      const since = Object.fromEntries(codes.map(code => [code, previous.enabled && previous.speciesCodes.includes(code) && Number.isFinite(Date.parse(previous.since[code])) ? previous.since[code] : new Date(timestamp).toISOString()]));
      user.marketAlertSettings = { enabled: body.enabled, speciesCodes: codes, since, consentVersion: body.enabled ? CONSENT_VERSION : previous.consentVersion,
        consentAt: body.enabled ? new Date(timestamp).toISOString() : user.marketAlertSettings?.consentAt || '', revision: previous.revision + 1 };
      changed = true;
    }
    const value = settings(user);
    const suggested = [...new Set((Array.isArray(user.data?.turtles) ? user.data.turtles : []).filter(isActive).map(item => item.speciesCode).filter(legal))];
    return { changed, settings: { enabled: value.enabled, speciesCodes: value.speciesCodes.filter(legal), revision: value.revision },
      suggestedSpeciesCodes: suggested, consentVersion: CONSENT_VERSION, pushConfigured: configured(), hasPushDevice: devices(user).length > 0 };
  }
  function receiptItems(db, user, receipt) {
    const ids = new Set(receipt.listingIds);
    return (db.marketListings || []).filter(item => ids.has(item.id) && item.speciesCode === receipt.speciesCode && available(db, item, user));
  }
  function open(db, user, body) {
    check(typeof body.receiptId === 'string' && body.receiptId.length <= 100, '提醒标识无效');
    const receipt = (user.marketAlertReceipts || []).find(item => item.id === body.receiptId);
    check(receipt, '提醒已过期或不属于当前账号', 404);
    const changed = !receipt.openedAt;
    if (changed) receipt.openedAt = new Date(now()).toISOString();
    const items = receiptItems(db, user, receipt).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
    return { changed, speciesCode: receipt.speciesCode, speciesName: byCode.get(receipt.speciesCode)?.name || '', originalCount: receipt.listingIds.length,
      listings: items.map(item => publicListing(db, item, user)) };
  }
  function canSend(db, user, data) {
    const value = settings(user), receipt = (user.marketAlertReceipts || []).find(item => item.id === data.receiptId);
    return Boolean(value.enabled && receipt && value.speciesCodes.includes(receipt.speciesCode) && receipt.createdAt >= value.since[receipt.speciesCode]
      && receipt.day === dayKey(now()) && hour(now()) >= 9 && hour(now()) < 21 && receiptItems(db, user, receipt).length);
  }
  let running = false;
  async function dispatch() {
    if (running || !configured()) return;
    running = true;
    try {
      const timestamp = now(), day = dayKey(timestamp);
      if (hour(timestamp) < 9 || hour(timestamp) >= 21) return;
      let db = read();
      const fresh = new Map();
      for (const item of db.marketListings || []) {
        const published = Date.parse(item.marketAlertPublishedAt);
        if (!Number.isFinite(published) || published > timestamp - BATCH_DELAY_MS || published < timestamp - WINDOW_MS || item.status !== 'active') continue;
        if (!fresh.has(item.speciesCode)) fresh.set(item.speciesCode, []);
        fresh.get(item.speciesCode).push(item);
      }
      for (const phone of Object.keys(db.users || {})) {
        if (dayKey(now()) !== day || hour(now()) >= 21) break;
        db = read(); let user = db.users[phone], value = user && settings(user);
        if (!value?.enabled || !devices(user).length) continue;
        let receipt = (user.marketAlertReceipts || []).find(item => item.day === day && !item.complete);
        if (!receipt) {
          if (!quotaAvailable(db, user, day, '', devices(user))) continue;
          const seen = new Set((user.marketAlertReceipts || []).flatMap(item => item.listingIds));
          const currentItems = new Map((db.marketListings || []).map(item => [item.id, item]));
          const candidates = value.speciesCodes.map(code => ({ code, items: (fresh.get(code) || []).map(item => currentItems.get(item.id)).filter(item => item && item.speciesCode === code && !seen.has(item.id) && Date.parse(item.marketAlertPublishedAt) > Date.parse(value.since[code]) && available(db, item, user)) }))
            .filter(group => group.items.length).sort((a, b) => b.items.length - a.items.length || a.code.localeCompare(b.code));
          if (!candidates.length) continue;
          const group = candidates[0], id = crypto.randomUUID();
          receipt = { id, day, speciesCode: group.code, listingIds: group.items.map(item => item.id), attempted: {}, acceptedDevices: 0, createdAt: new Date(timestamp).toISOString(), complete: false };
          user.marketAlertReceipts = [receipt, ...(user.marketAlertReceipts || []).filter(item => Date.parse(item.createdAt) >= timestamp - 30 * WINDOW_MS)].slice(0, 30);
          reserveQuota(user, day, id);
          await write(db); // Claim durably before any provider request.
        }
        const id = receipt.id;
        db = read(); user = db.users[phone];
        if (!user) continue;
        for (const device of devices(user)) {
          db = read(); user = db.users[phone]; receipt = user?.marketAlertReceipts?.find(item => item.id === id);
          if (!receipt || !canSend(db, user, { receiptId: id })) break;
          const key = deviceKey(device);
          if (receipt.attempted[key]) continue;
          receipt.attempted[key] = new Date(now()).toISOString(); await write(db);
          db = read(); user = db.users[phone]; receipt = user?.marketAlertReceipts?.find(item => item.id === id);
          if (!receipt || !canSend(db, user, { receiptId: id }) || !devices(user).some(current => current.platform === device.platform && current.token === device.token && current.sessionHash === device.sessionHash)) continue;
          const data = payload(byCode.get(receipt.speciesCode)?.name || '', receiptItems(db, user, receipt), id, receipt.speciesCode);
          const result = await send(device, data);
          db = read(); user = db.users[phone]; receipt = user?.marketAlertReceipts?.find(item => item.id === id);
          if (result?.invalid) invalidDevice(phone, device.token, device.platform);
          if (receipt && result?.ok) { receipt.acceptedDevices++; await write(db); }
        }
        db = read(); receipt = db.users[phone]?.marketAlertReceipts?.find(item => item.id === id);
        if (receipt) { receipt.complete = true; await write(db); }
      }
    } finally { running = false; }
  }
  return { preference, open, canSend, dispatch };
}
module.exports = { createMarketAlerts, CONSENT_VERSION, payload, settings, quotaAvailable, reserveQuota, deviceKey };
