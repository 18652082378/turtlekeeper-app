const { randomUUID } = require('node:crypto');
const DAY = 86400000;
const text = value => String(value || '').trim().toLowerCase();
const number = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const time = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;

function normalizeMarketRankOptions(body = {}) {
  return {
    keyword: text(body.keyword).slice(0, 80),
    stage: ['hatchling', 'juvenile', 'adult'].includes(body.stage) ? body.stage : 'all',
    regionCities: [...new Set((Array.isArray(body.regionCities) ? body.regionCities : []).map(x => String(x).trim().slice(0, 24)).filter(Boolean))].sort().slice(0, 60),
    delivery: ['可快递', '仅自提', '可面交'].includes(body.delivery) ? body.delivery : '',
    freshOnly: body.freshOnly === true,
    sort: ['latest', 'popular'].includes(body.sort) ? body.sort : 'comprehensive',
    priceOrder: ['asc', 'desc'].includes(body.priceOrder) ? body.priceOrder : ''
  };
}

function relevance(item, keyword) {
  if (!keyword) return 1;
  const title = text(item.title), species = text(item.speciesName);
  if (title === keyword || species === keyword || text(item.speciesCode) === keyword) return 4;
  if (`${title} ${species}`.includes(keyword)) return 3;
  const full = `${title} ${species} ${text(item.description)} ${text(item.city)}`;
  if (full.includes(keyword)) return 2;
  const words = keyword.split(/\s+/).filter(Boolean);
  return words.length > 1 && words.every(word => full.includes(word)) ? 1 : 0;
}

function matches(item, opts, now) {
  if (item.status !== 'active') return false;
  if (opts.stage !== 'all' && item.stage !== opts.stage) return false;
  if (opts.regionCities.length && !opts.regionCities.includes(String(item.city || '').trim())) return false;
  if (opts.delivery && item.delivery !== opts.delivery) return false;
  if (opts.freshOnly && time(item.createdAt) < now - 7 * DAY) return false;
  return relevance(item, opts.keyword) > 0;
}

// Inspired by Xianyu's public principles, NOT its undisclosed model/weights.
// Only existing first-party history/favorites are used; no new tracking.
function rankMarketListings(listings, options = {}, account = {}, now = Date.now()) {
  const opts = normalizeMarketRankOptions(options);
  const byId = new Map(listings.map(item => [String(item.id), item]));
  const interests = new Map();
  for (const [ids, weight, cap] of [[account.marketFavoriteIds, 3, 50], [account.marketHistoryIds, 1, 30]]) {
    [...new Set(Array.isArray(ids) ? ids.map(String) : [])].slice(0, cap).forEach((id, index) => {
      const species = byId.get(id)?.speciesCode;
      if (species) interests.set(species, (interests.get(species) || 0) + weight / (1 + index / 10));
    });
  }
  const candidates = listings.filter(item => matches(item, opts, now)).map(item => {
    const age = Math.max(0, now - time(item.createdAt));
    const refreshAge = Math.max(0, now - time(item.refreshedAt || item.createdAt));
    const media = (item.mediaItems || []).some(m => m.url) || item.photoUrl;
    const completeness = (media ? 5 : 0) + (text(item.description).length >= 12 ? 2 : 0) + (item.speciesCode ? 1 : 0) + (item.city ? 1 : 0) + (item.delivery ? 1 : 0);
    // Bounded engagement avoids lifetime counts monopolizing the feed.
    const engagement = Math.min(8, Math.log1p(number(item.wantCount)) * 2) + Math.min(2, Math.log1p(number(item.viewCount)) / 4);
    const interest = Math.min(12, (interests.get(item.speciesCode) || 0) * 2);
    const score = 16 * Math.exp(-age / (3 * DAY)) + 4 * Math.exp(-refreshAge / DAY) + completeness + engagement + interest;
    return { item, tier: relevance(item, opts.keyword), score };
  });
  const tie = (a, b) => time(b.item.createdAt) - time(a.item.createdAt) || String(a.item.id).localeCompare(String(b.item.id));
  candidates.sort((a, b) => {
    if (opts.priceOrder) return (number(a.item.price) - number(b.item.price)) * (opts.priceOrder === 'asc' ? 1 : -1) || tie(a, b);
    if (opts.sort === 'latest') return tie(a, b);
    if (opts.sort === 'popular') return number(b.item.wantCount) - number(a.item.wantCount) || tie(a, b);
    return b.tier - a.tier || b.score - a.score || tie(a, b);
  });
  if (opts.priceOrder || opts.sort !== 'comprehensive') return candidates.map(x => x.item);
  // A bounded look-ahead diversifies within the same relevance tier. Never
  // demote a strong keyword match beneath a weak match merely for diversity.
  const result = [], pending = [];
  let cursor = 0;
  while (cursor < candidates.length || pending.length) {
    while (cursor < candidates.length && pending.length < 12) pending.push(candidates[cursor++]);
    const previous = result.at(-1), before = result.at(-2);
    let best = 0, bestScore = -Infinity;
    pending.forEach((candidate, index) => {
      if (candidate.tier !== pending[0].tier) return;
      const sameSeller = previous?.sellerId && previous.sellerId === candidate.item.sellerId;
      const repeatedSpecies = previous?.speciesCode && previous.speciesCode === before?.speciesCode && previous.speciesCode === candidate.item.speciesCode;
      const score = candidate.score - (sameSeller ? 14 : 0) - (repeatedSpecies ? 8 : 0);
      if (score > bestScore) { best = index; bestScore = score; }
    });
    result.push(pending.splice(best, 1)[0].item);
  }
  return result;
}

function createMarketRankPager({ ttl = 30 * 60000, maxSessions = 200, now = Date.now } = {}) {
  const sessions = new Map();
  return function page({ listings, body, owner = '', account = {} }) {
    const clock = now(), options = normalizeMarketRankOptions(body);
    for (const [key, value] of sessions) if (value.expires <= clock) sessions.delete(key);
    const fingerprint = JSON.stringify([owner, options]);
    const offset = Math.floor(number(body.offset));
    const limit = Math.min(200, Math.max(1, Math.floor(number(body.limit) || 8)));
    let token = String(body.rankingSession || ''), session = sessions.get(token);
    if (offset > 0 && (!session || session.fingerprint !== fingerprint)) {
      return { listings: [], nextOffset: 0, hasMore: true, total: 0, rankingReset: true, rankingSession: '' };
    }
    if (offset === 0) {
      token = randomUUID();
      session = { fingerprint, expires: clock + ttl, ids: rankMarketListings(listings, options, account, clock).map(item => String(item.id)) };
      sessions.set(token, session);
      let totalIds = [...sessions.values()].reduce((sum, item) => sum + item.ids.length, 0);
      while (sessions.size > maxSessions || (totalIds > 250000 && sessions.size > 1)) {
        const first = sessions.keys().next().value;
        totalIds -= sessions.get(first).ids.length;
        sessions.delete(first);
      }
    }
    // Recheck current visibility on every page; offsets advance across removed
    // IDs so an unavailable item cannot cause repeats or skip its neighbours.
    const current = new Map(listings.filter(item => matches(item, options, clock)).map(item => [String(item.id), item]));
    const selected = [];
    let nextOffset = Math.min(offset, session.ids.length);
    while (nextOffset < session.ids.length && selected.length < limit) {
      const item = current.get(session.ids[nextOffset++]);
      if (item) selected.push(item);
    }
    return { listings: selected, nextOffset, total: session.ids.length, hasMore: nextOffset < session.ids.length, rankingSession: token, rankingReset: false };
  };
}

module.exports = { rankMarketListings, createMarketRankPager, normalizeMarketRankOptions };
