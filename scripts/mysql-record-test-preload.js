// Explicit API test preload only; no network/database credentials are used.
if (process.env.TURTLE_TEST_RECORD_DRIVER !== '1') throw new Error('Test driver requires explicit opt-in');
const Module = require('node:module');
const originalLoad = Module._load;
const storage = require('../server/mysql-record-store');
const { Driver } = require('./mysql-record-test-driver');
const fs = require('node:fs');
const database = process.env.TURTLE_TEST_DURABLE_FILE && fs.existsSync(process.env.TURTLE_TEST_DURABLE_FILE)
  ? JSON.parse(fs.readFileSync(process.env.TURTLE_TEST_DURABLE_FILE, 'utf8')) : { users: {}, reviews: [], feedbacks: [], communityPosts: [], communityNotifications: [], marketListings: [],
  friendships: [], messages: [], follows: [], reports: [], systemAnnouncements: [], communityDailyDeliveries: {}, careReminderDeliveries: {},
  appAnalytics: { days: {} }, adminAuditLogs: [] };
const connection = new Driver(database);
const commit = connection.commit.bind(connection);
connection.commit = async () => {
  if (process.env.TURTLE_TEST_COMMIT_DELAY) await new Promise(resolve => setTimeout(resolve, Number(process.env.TURTLE_TEST_COMMIT_DELAY)));
  if (process.env.TURTLE_TEST_FAIL_FILE && fs.existsSync(process.env.TURTLE_TEST_FAIL_FILE)) throw new Error('injected database commit failure');
  await commit();
  if (process.env.TURTLE_TEST_DURABLE_FILE) fs.writeFileSync(process.env.TURTLE_TEST_DURABLE_FILE, JSON.stringify((await storage.load(connection)).database));
};
const ready = storage.migrate(connection, database);
Module._load = function (name, parent, main) {
  if (name !== 'mysql2/promise') return originalLoad.call(this, name, parent, main);
  return { createPool: () => ({ getConnection: async () => { await ready; return connection; },
    query: async (...args) => { await ready; return connection.query(...args); }, end: async () => {} }) };
};
