// Historical functions only; no users, credentials or production database.
// Reviewed 112-v15 baseline, with hashes checked by deploy-care-inline.cjs.
// This fixture is extracted by tests, never launched as an API server.

function emptyAccountData() {
  return {
    turtles: [],
    keptSpecies: [],
    customSpecies: [],
    memos: [],
    ledgerRecords: [],
    breedingRecords: [],
    satisfactionRating: 5,
    satisfactionReviews: [],
    feedbackItems: [],
    marketFavoriteIds: [],
    marketHistoryIds: [],
    pinnedConversationPhones: [],
    hiddenConversationPhones: [],
    turtlePools: [],
    syncEnabled: true,
    subscriptionPlan: "free",
    subscriptionCycle: "",
    subscriptionStartedAt: "",
    subscriptionExpiresAt: "",
    professionalOutput: "",
    activityLogs: [],
    themeColor: "teal"
  };
}

function normalizeAccountData(data = {}) {
  // Loss accounting migration belongs to the newer client. 1.0.7 removes
  // lost turtles and keeps user-entered ledger amounts; migrating here would
  // silently change its archives, costs and reminders on both load and save.
  // Preserve newer clients' loss metadata through the same JSON API.
  const next = { ...emptyAccountData(), ...(data || {}) };
  return {
    turtles: Array.isArray(next.turtles) ? next.turtles : [],
    keptSpecies: Array.isArray(next.keptSpecies) ? next.keptSpecies : [],
    customSpecies: normalizeCustomSpecies(next.customSpecies),
    memos: Array.isArray(next.memos) ? next.memos : [],
    ledgerRecords: Array.isArray(next.ledgerRecords) ? next.ledgerRecords : [],
    breedingRecords: Array.isArray(next.breedingRecords) ? next.breedingRecords : [],
    satisfactionRating: Number(next.satisfactionRating || 5),
    satisfactionReviews: Array.isArray(next.satisfactionReviews) ? next.satisfactionReviews : [],
    feedbackItems: Array.isArray(next.feedbackItems) ? next.feedbackItems : [],
    marketFavoriteIds: Array.isArray(next.marketFavoriteIds) ? next.marketFavoriteIds.map(String).slice(0, 500) : [],
    marketHistoryIds: Array.isArray(next.marketHistoryIds) ? next.marketHistoryIds.map(String).slice(0, 100) : [],
    pinnedConversationPhones: Array.isArray(next.pinnedConversationPhones) ? next.pinnedConversationPhones.map(String).slice(0, 200) : [],
    hiddenConversationPhones: Array.isArray(next.hiddenConversationPhones) ? next.hiddenConversationPhones.map(String).slice(0, 200) : [],
    turtlePools: Array.isArray(next.turtlePools) ? next.turtlePools.slice(0, 200).map(pool => ({
      ...pool,
      id: String(pool?.id || crypto.randomUUID()),
      name: String(pool?.name || "").trim().slice(0, 24),
      type: ["hatchling", "juvenile", "breeder"].includes(pool?.type) ? pool.type : "",
      length: String(pool?.length ?? "").slice(0, 16),
      width: String(pool?.width ?? "").slice(0, 16),
      height: String(pool?.height ?? "").slice(0, 16),
      count: Math.max(0, Math.floor(Number.isFinite(Number(pool?.count)) ? Number(pool.count) : 0)),
      note: String(pool?.note || "").trim().slice(0, 200),
      createdAt: String(pool?.createdAt || ""),
      updatedAt: String(pool?.updatedAt || "")
    })).filter(pool => pool.name && pool.type) : [],
    syncEnabled: Boolean(next.syncEnabled),
    subscriptionPlan: ["free", "member", "pro"].includes(next.subscriptionPlan) ? next.subscriptionPlan : "free",
    subscriptionCycle: next.subscriptionCycle || "",
    subscriptionStartedAt: next.subscriptionStartedAt || "",
    subscriptionExpiresAt: next.subscriptionExpiresAt || "",
    professionalOutput: next.professionalOutput || "",
    activityLogs: Array.isArray(next.activityLogs) ? next.activityLogs : [],
    themeColor: next.themeColor || "teal"
  };
}

function accountDataHasContent(data = {}) {
  const account = normalizeAccountData(data);
  return [
    account.turtles,
    account.keptSpecies,
    account.customSpecies,
    account.memos,
    account.ledgerRecords,
    account.breedingRecords,
    account.satisfactionReviews,
    account.feedbackItems,
    account.marketFavoriteIds,
    account.marketHistoryIds,
    account.turtlePools,
    account.activityLogs
  ].some(items => Array.isArray(items) && items.length > 0);
}

function accountRecordCounts(data = {}) {
  const account = normalizeAccountData(data);
  const fields = ["turtles", "keptSpecies", "memos", "ledgerRecords", "breedingRecords", "turtlePools"];
  return Object.fromEntries(fields.map(field => [field, Array.isArray(account[field]) ? account[field].length : 0]));
}

async function handleSaveAccount(req, res) {
  const body = await readJson(req);
  const phone = String(body.phone || "").trim();
  const token = String(body.token || "");
  const db = readDatabase();
  const user = authenticate(db, phone, token);
  if (!user) return sendJson(res, 401, { ok: false, message: "登录已过期，请重新登录" });
  const incomingData = normalizeAccountData(body.data || {});
  if (user.teamSpace && typeof body.baseDataRevision !== 'string') {
    return sendJson(res, 409, { ok: false, message: '团队共享已启用，请更新客户端并刷新云端数据后再保存' });
  }
  // New clients identify the cloud snapshot they edited. Legacy 1.0.7 does
  // not send this field, so its existing request contract remains supported.
  const staleAccount = typeof body.baseDataRevision === "string"
    ? body.baseDataRevision !== accountDataRevision(user)
    : typeof body.baseUpdatedAt === "string" && body.baseUpdatedAt !== String(user.updatedAt || "");
  if (staleAccount) {
    return sendJson(res, 409, { ok: false, code: "ACCOUNT_DATA_CONFLICT", message: "其他设备已更新云端，本次保存未覆盖云端数据，请保留本机备份后核对" });
  }
  const incomingHasContent = accountDataHasContent(incomingData);
  const existingData = normalizeAccountData(user.data || {});
  // Older clients and stale devices must not erase private catalogue entries.
  incomingData.customSpecies = normalizeCustomSpecies([...new Map([
    ...existingData.customSpecies, ...incomingData.customSpecies
  ].map(item => [item.code, item])).values()]);
  // Never allow a cold-start client shell (all empty arrays) to erase an
  // account that already has real data. This is deliberately server-side so
  // older app builds are protected too.
  if (accountDataHasContent(existingData) && !incomingHasContent) {
    return sendJson(res, 409, {
      ok: false,
      message: "检测到空数据写入请求，已保护云端数据；请重新打开应用后再试"
    });
  }
  if (isSuspiciousAccountDataLoss(existingData, incomingData)) {
    return sendJson(res, 409, {
      ok: false,
      message: "检测到异常的大幅数据减少，已停止保存以保护档案和账本；请重新打开应用后再试"
    });
  }
  if (nestedGrowthHistoryWasReduced(existingData, incomingData)) {
    return sendJson(res, 409, {
      ok: false,
      code: "GROWTH_HISTORY_CONFLICT",
      message: "检测到本机成长记录早于云端，已停止保存以保护最新更新；请刷新数据后再修改"
    });
  }
  if (accountDataWasReduced(existingData, incomingData)) {
    try {
      createAccountRecoverySnapshot(user);
    } catch (error) {
      // A backup failure must never turn into a destructive write. Refuse the
      // save so the existing server data remains the source of truth.
      console.error("账户恢复快照创建失败：", error.message);
      return sendJson(res, 503, { ok: false, message: "数据保护备份暂不可用，未保存本次修改，请稍后重试" });
    }
  }
  try {
    user.accountName = accountNameForPhone(body.accountName, phone, user.accountName || maskPhone(phone));
  } catch (error) {
    return sendJson(res, 400, { ok: false, message: error.message || "昵称不可使用" });
  }
  user.accountAvatar = String(body.accountAvatar || "");
  recordAccountChange(user, existingData, incomingData);
  user.data = incomingData;
  user.updatedAt = new Date(Math.max(Date.now(), (Date.parse(user.updatedAt) || 0) + 1)).toISOString();
  writeDatabase(db);
  // A legacy client does not send termsVersion when saving. Return the same
  // compatible version as /account/load so its background auto-save cannot
  // reintroduce a newer agreement version into local state.
  return sendJson(res, 200, { ok: true, user: publicUserForPolicyClient(user, token, db, body) });
}

function careReminderDue(memo, clock) {
  if (!memo || !/^\d{2}:\d{2}$/.test(String(memo.remindTime || ""))) return false;
  if (String(memo.remindTime) !== clock.time) return false;
  if (memo.dueDate && String(memo.dueDate) !== clock.date) return false;
  if (!memo.repeat) return true;
  const weekdays = Array.isArray(memo.weekdays) ? memo.weekdays.map(String) : [];
  return !weekdays.length || weekdays.includes(clock.weekday);
}
