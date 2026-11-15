'use strict';
const { isIP } = require('node:net');

function requestAddress(req, trustLocalProxy = false) {
  const peer = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  if (trustLocalProxy && (peer === '127.0.0.1' || peer === '::1')) {
    const address = String(req.headers['x-real-ip'] || '').replace(/^::ffff:/, '');
    if (isIP(address)) return address;
  }
  return peer;
}

function createRequestBudget({ capacity = 50000, now = Date.now } = {}) {
  const entries = new Map();
  let cleanupAt = 0;
  return {
    take(key, max, windowMs) {
      const time = now();
      if (time >= cleanupAt) {
        for (const [id, entry] of entries) if (entry.until <= time) entries.delete(id);
        cleanupAt = time + 10000;
      }
      let entry = entries.get(key);
      if (!entry || entry.until <= time) {
        if (!entry && entries.size >= capacity) return false;
        entry = { count: 0, until: time + windowMs };
        entries.set(key, entry);
      }
      if (entry.count >= max) return false;
      entry.count++;
      return true;
    },
    clear(key) { entries.delete(key); }
  };
}

module.exports = { requestAddress, createRequestBudget };
