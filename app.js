const $app = document.querySelector("#app");
const STORAGE = "turtlekeeper-state-v1";
const AUTH_TOKEN_STORAGE = "turtlekeeper-cloud-auth-v1";
const PENDING_CLOUD_DATA_STORAGE = "turtlekeeper-pending-cloud-data-v1";
const SERVER_SMS_CODE = "__SERVER_SMS__";
const CONFIGURED_SMS_BACKEND = Boolean(window.TURTLE_API_BASE_URL);
const CLOUD_SYNC_DEBOUNCE_MS = 900;
const CHINA_TIME_ZONE = "Asia/Shanghai";
const REVIEW_ADMIN_PHONE = "18652082378";
const DEFAULT_ACCOUNT_AVATARS = Array.from({ length: 10 }, (_, index) => `/assets/default-avatars/avatar-${index + 1}.png`);
// Keep this in sync with the server so accepted users are never trapped
// behind a stale consent overlay.
const POLICY_VERSION = "2026-08-12";
const APP_BUILD = Math.max(0, Number.parseInt(String(window.TURTLE_APP_BUILD || "0"), 10) || 0);
const APP_STORE_URL = String(window.TURTLE_APP_STORE_URL || "https://apps.apple.com/app/id6783481335");
let forceUpdateState = { required: false, checking: false, minimumBuild: 0, latestBuild: 0, message: "", appStoreUrl: "" };
// 龟集市的购买咨询统一由平台客服承接；修改此处即可同步更新商品页和“关于”页。
const PLATFORM_SERVICE_WECHAT = "keyousz001";
const defaultPhoto = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
  <rect width="240" height="240" rx="28" fill="#edf7f1"/>
  <circle cx="120" cy="118" r="54" fill="#2fa77f"/>
  <circle cx="120" cy="118" r="34" fill="#22735b"/>
  <circle cx="68" cy="118" r="17" fill="#2fa77f"/>
  <circle cx="188" cy="118" r="17" fill="#2fa77f"/>
  <circle cx="120" cy="63" r="18" fill="#2fa77f"/>
  <circle cx="114" cy="58" r="3" fill="#1f2a33"/>
  <circle cx="126" cy="58" r="3" fill="#1f2a33"/>
</svg>`);

const speciesList = window.TURTLE_SPECIES || [];

// 与 server/server.js 中的 MARKET_PROHIBITED_SPECIES_CODES 保持一致。
// 前端用于即时提示；服务器仍会强制校验，避免任何绕过发布。
const MARKET_PROHIBITED_SPECIES_CODES = new Set([
  "ABQ", "ALD", "ANG", "BWG", "CBQ", "CSG", "DBG", "DHG", "EBQ", "GBG", "GJG", "HBQ", "HET", "HJG", "HNT", "HYG",
  "JDG", "JQG", "JTG", "JYG", "KBT", "KNG", "LHG", "LJG", "LKG", "MBG", "MDG", "MJG", "MLG", "MNG", "PDG", "PGG", "PHG",
  "PTG", "QBT", "QYG", "RTG", "SBQ", "SDG", "SGG", "SHG", "SLG", "SSG", "STG", "XGG", "XPG", "YBG", "YHG", "YLG", "YNT",
  "YSG", "YTG", "ZRG"
]);
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const SPECIES_IMAGE_CACHE = "turtlekeeper-species-image-cache-v1";
// Relative rather than `/assets/...`: this works both in Capacitor and when
// index.html is opened directly from the project folder for local testing.
const BUNDLED_SPECIES_IMAGE_ROOT = "assets/species";
let speciesImageObserver = null;
let speciesImageCache = loadSpeciesImageCache();
const WEEKDAY_OPTIONS = [
  { value: "1", label: "一" },
  { value: "2", label: "二" },
  { value: "3", label: "三" },
  { value: "4", label: "四" },
  { value: "5", label: "五" },
  { value: "6", label: "六" },
  { value: "0", label: "日" }
];
const BOTTOM_NAV_ROOT_PAGES = new Set(["home", "ledger", "market", "messages", "mine"]);
const PULL_REFRESH_THRESHOLD = 72;
const PULL_REFRESH_MAX_OFFSET = 96;
let pullRefreshState = { tracking: false, refreshing: false, startX: 0, startY: 0, distance: 0, ready: false, direction: "" };
let pullRefreshAnimationFrame = 0;
let pullRefreshPendingState = null;
let pullRefreshIndicatorElement = null;
let pullRefreshIndicatorLabel = null;
let pullRefreshVisualState = "";
let communityChatMessageMenuElement = null;
let communityChatMessageMenuDismiss = null;
let dashboardTurtleDragSuppressUntil = 0;

const initialState = {
  page: "home",
  search: "",
  turtleFilter: "all",
  turtlePoolFilter: "all",
  turtleSort: "default",
  memoTab: "all",
  memoDraftOpen: false,
  memoEditingId: "",
  ledgerTab: "all",
  ledgerDraftType: "",
  ledgerDraftPhoto: "",
  ledgerDraftTurtleId: "",
  ledgerDraftForm: {},
  ledgerPurchaseGender: "未知",
  ledgerDateFrom: "",
  ledgerDateTo: "",
  ledgerDatePreset: "all",
  breedingDraftPhoto: "",
  breedingMotherMode: "archive",
  breedingMotherValue: "",
  breedingPoolId: "",
  breedingDraftDate: "",
  breedingManualMother: "",
  breedingEggCount: "",
  breedingFertileCount: "",
  breedingHatchCount: "",
  breedingNote: "",
  selectedTurtleId: "",
  selectedLedgerId: "",
  selectedBreedingId: "",
  selectedFeedbackId: "",
  selectedSpeciesCode: "",
  speciesPickerForAdd: false,
  openTurtleMenuId: "",
  openLedgerMenuId: "",
  openBreedingMenuId: "",
  openFeedbackMenuId: "",
  updatingTurtleId: "",
  turtleDetailDraftId: "",
  turtleDetailDraft: null,
  updateDraftPhoto: "",
  breedingEditPhoto: "",
  formPhoto: "",
  formGender: "未知",
  formDraft: {},
  themeColor: "teal",
  turtles: [],
  keptSpecies: [],
  memos: [],
  ledgerRecords: [],
  breedingRecords: [],
  satisfactionRating: 5,
  satisfactionReviews: [],
  publicReviews: [],
  publicFeedbackItems: [],
  communityPosts: [],
  communityFeedInitialized: false,
  communityFeedNextOffset: 0,
  communityFeedHasMore: true,
  communityFeedLoadingMore: false,
  communityProfileStats: { receivedLikes: 0, followerCount: 0 },
  contentReports: [],
  systemAnnouncements: [],
  adminSystemAnnouncements: [],
  blockedUsers: [],
  isCommunityAdmin: false,
  communityFriends: [],
  communityFollowingUsers: [],
  communityFollowingPosts: [],
  communityFollowingListings: [],
  selectedFollowingUserId: "",
  selectedCommunityUserId: "",
  selectedCommunityUser: null,
  communityUserPosts: [],
  communityUserListings: [],
  profileContentTab: "posts",
  communityChatMessages: [],
  communityChatListing: null,
  communityChatToolsOpen: false,
  messageUnreadCount: 0,
  selectedCommunityFriendId: "",
  selectedCommunityFriend: null,
  selectedCommunityPostId: "",
  openCommunityActionId: "",
  communityCommentPostId: "",
  marketListings: [],
  myMarketListings: [],
  marketSearch: "",
  marketStage: "all",
  marketSort: "comprehensive",
  marketPriceOrder: "",
  marketFreshOnly: false,
  marketRegion: "",
  marketSearchLocationCity: "",
  marketSearchLocationStatus: "idle",
  marketDelivery: "",
  marketAssistMenu: "",
  marketMyTab: "active",
  selectedMarketListingId: "",
  selectedMarketSellerId: "",
  selectedMarketSeller: null,
  marketFeedInitialized: false,
  marketFeedNextOffset: 0,
  marketFeedHasMore: true,
  marketFeedLoadingMore: false,
  marketDraftPhoto: "",
  marketDraftMedia: [],
  marketDraftTurtleId: "",
  marketDraftCity: "",
  marketDraftLatitude: "",
  marketDraftLongitude: "",
  marketDraftDescription: "",
  marketDraftDescriptionTemplate: "",
  marketLocationStatus: "idle",
  editingMarketListingId: "",
  marketFavoriteIds: [],
  marketHistoryIds: [],
  turtlePools: [],
  editingTurtlePoolId: "",
  feedbackItems: [],
  accountName: "未登录用户",
  accountAvatar: "",
  accountMode: "login",
  accountDraftPhone: "",
  accountDraftPassword: "",
  accountDraftConfirmPassword: "",
  loggedInPhone: "",
  registeredUsers: [],
  cloudToken: "",
  pendingAuthCode: "",
  pendingAuthPhone: "",
  authCodeExpiresAt: "",
  accountCodeCooldownUntil: "",
  policyConsentRequired: false,
  syncEnabled: false,
  professionalOutput: "",
  activityLogs: []
};

const TURTLE_FORM_DRAFT_FIELDS = [
  "speciesCode",
  "poolId",
  "code",
  "weight",
  "carapaceLength",
  "carapaceWidth",
  "shellHeight",
  "plastronLength",
  "status",
  "health",
  "acquiredDate",
  "source",
  "price",
  "note"
];

const LEDGER_FORM_DRAFT_FIELDS = [
  "turtleId",
  "poolId",
  "purchaseSpeciesCode",
  "purchaseCode",
  "purchaseGender",
  "weight",
  "carapaceLength",
  "carapaceWidth",
  "shellHeight",
  "plastronLength",
  "purchaseStatus",
  "purchaseHealth",
  "otherCategory",
  "otherTitle",
  "recordDate",
  "amount",
  "note"
];

function emptyAccountData() {
  return {
    turtles: [],
    keptSpecies: [],
    memos: [],
    ledgerRecords: [],
    breedingRecords: [],
    satisfactionRating: 5,
    satisfactionReviews: [],
    feedbackItems: [],
    marketFavoriteIds: [],
    marketHistoryIds: [],
    turtlePools: [],
    syncEnabled: true,
    professionalOutput: "",
    activityLogs: [],
    themeColor: "teal"
  };
}

function normalizeAccountData(data = {}) {
  const next = { ...emptyAccountData(), ...(data || {}) };
  return {
    turtles: Array.isArray(next.turtles) ? next.turtles : [],
    keptSpecies: Array.isArray(next.keptSpecies) ? next.keptSpecies : [],
    memos: Array.isArray(next.memos) ? next.memos : [],
    ledgerRecords: Array.isArray(next.ledgerRecords) ? next.ledgerRecords : [],
    breedingRecords: Array.isArray(next.breedingRecords) ? next.breedingRecords : [],
    satisfactionRating: Number(next.satisfactionRating || 5),
    satisfactionReviews: Array.isArray(next.satisfactionReviews) ? next.satisfactionReviews : [],
    feedbackItems: Array.isArray(next.feedbackItems) ? next.feedbackItems : [],
    marketFavoriteIds: Array.isArray(next.marketFavoriteIds) ? next.marketFavoriteIds.map(String).slice(0, 500) : [],
    marketHistoryIds: Array.isArray(next.marketHistoryIds) ? next.marketHistoryIds.map(String).slice(0, 100) : [],
    turtlePools: Array.isArray(next.turtlePools) ? next.turtlePools.map(pool => ({
      ...pool,
      name: cleanText(String(pool?.name || "")),
      type: cleanText(String(pool?.type || "")),
      length: String(pool?.length ?? ""),
      width: String(pool?.width ?? ""),
      height: String(pool?.height ?? ""),
      count: Math.max(0, Number(pool?.count || 0)),
      note: cleanText(String(pool?.note || ""))
    })) : [],
    syncEnabled: next.syncEnabled !== false,
    professionalOutput: next.professionalOutput || "",
    activityLogs: Array.isArray(next.activityLogs) ? next.activityLogs : [],
    themeColor: next.themeColor || "teal"
  };
}

function accountDataSnapshot(source = state) {
  return normalizeAccountData({
    turtles: source.turtles,
    keptSpecies: source.keptSpecies,
    memos: source.memos,
    ledgerRecords: source.ledgerRecords,
    breedingRecords: source.breedingRecords,
    satisfactionRating: source.satisfactionRating,
    satisfactionReviews: source.satisfactionReviews,
    feedbackItems: source.feedbackItems,
    marketFavoriteIds: source.marketFavoriteIds,
    marketHistoryIds: source.marketHistoryIds,
    turtlePools: source.turtlePools,
    syncEnabled: source.syncEnabled,
    professionalOutput: source.professionalOutput,
    activityLogs: source.activityLogs,
    themeColor: source.themeColor
  });
}

function syncRegisteredUsers(source = state) {
  const users = (source.registeredUsers || []).map(user => ({
    ...user,
    data: normalizeAccountData(user.data || {})
  }));
  if (!source.loggedInPhone) return users;
  return users.map(user => user.phone === source.loggedInPhone ? {
    ...user,
    accountName: source.accountName || user.accountName || maskPhone(source.loggedInPhone),
    accountAvatar: source.accountAvatar || "",
    cloudToken: source.cloudToken || user.cloudToken || "",
    data: accountDataSnapshot(source)
  } : user);
}

let state = loadState();
let accountCooldownTimer = null;
let cloudSyncTimer = null;
let cloudSyncInFlight = false;
let cloudSyncQueued = false;
let cloudHydrationStarted = false;
// A cloud-backed account initially boots from a deliberately lightweight
// local shell. Until /api/account/load has supplied the real account data,
// that shell must never be allowed to overwrite the cloud with empty arrays.
let cloudHydrationComplete = false;
let cloudImageMigrationInFlight = false;
let cloudImageMigrationTimer = null;
let cloudImageMigrationQueued = false;
let accountSubmitInFlight = false;
let lastToastText = "";
let lastToastAt = 0;
let publicReviewsLoading = false;
let publicReviewsLastLoadedAt = 0;
let publicFeedbackLoading = false;
let publicFeedbackLastLoadedAt = 0;
let communityLoading = false;
let communityLastLoadedAt = 0;
let communityLoadObserver = null;
let communityChatLoading = false;
let communityChatLoadedKey = "";
// A notification can arrive while an existing chat request is still in
// flight. Remember it so the just-finished (possibly older) response can
// never be the last refresh the open conversation receives.
let communityChatRefreshPending = false;
let communityVideoLoadObserver = null;
let followingLoading = false;
let followingLastLoadedAt = 0;
let communityUserProfileLoading = false;
let communityUserProfileLoadedKey = "";
let messageUnreadLoading = false;
let messageUnreadLastLoadedAt = 0;
let restoredSnapshotRenderHoldUntil = 0;
// A messages page handed back by the interactive back gesture already owns
// the exact DOM the user was looking at before opening a chat.  Background
// polling must be allowed to refresh state, but must not replace that DOM
// with a newly rendered list while the hand-off is visible.
let preservedMessageSnapshotActive = false;
let contentReportsLoading = false;
let contentReportsLastLoadedAt = 0;
let systemAnnouncementsLoading = false;
let systemAnnouncementsLastLoadedAt = 0;
let marketNetworkType = "unknown";
let marketNetworkMonitoringStarted = false;
let messageUnreadTimer = null;
let communityDraftMedia = "";
let communityDraftMediaType = "";
let communityDraftMediaFile = null;
let communityDraftMediaDuration = 0;
let communityDraftMediaItems = [];
let communityDraftText = "";
let marketLoading = false;
let marketLastLoadedAt = 0;
let marketLoadObserver = null;
let marketChatDraft = "";
// A publish can involve several large uploads.  Keep one operation alive until
// the server has answered so repeated taps cannot start parallel listings.
let marketPublishInFlight = false;
let marketPublishFingerprint = "";
let marketPublishSubmissionId = "";
// Publishing continues after leaving the form, so progress must not depend on
// the page DOM that is about to be replaced.
let marketPublishProgress = { active: false, current: 0, total: 0, stage: "" };
let communityChatMediaUploadProgress = { active: false, current: 0, total: 0, percent: 0, stage: "" };
let pendingCommunityChatLatestScroll = false;
let communityChatOpening = false;
let pendingPageEnterMotion = false;
let pendingCommunityChatEnterMotion = false;
let pageEnterMotionTimer = null;
let pendingPageScrollReset = false;
let edgeBackSnapshots = [];
let messageListRefreshDeferred = false;
let messageListRefreshFlushTimer = 0;
// Keep a conversation action isolated from the list's background refreshes.
// A refresh arriving while the action rail is open used to replace the row
// before the tap reached its button, making pin/delete appear unresponsive.
const communityConversationActionPending = new Set();
let nativePushListenersAttached = false;
let nativePushSetupInFlight = false;
let nativePushDeviceToken = "";
// iOS can deliver an interaction with a notification before the saved cloud
// session has finished hydrating. Keep that route until it can really open
// the conversation instead of silently leaving the user on the messages tab.
let pendingNativePushAction = null;
let messageUnreadRenderRequested = false;
let nativeMediaPickerOpening = false;
// Do not open a preview from the synthetic click at the end of a carousel drag.
let marketGalleryPreviewSuppressUntil = 0;
// A market URL can arrive from a browser query string, or from iOS through
// Capacitor's App plugin after an Associated Domains (Universal Link) launch.
// Keep the requested id separately so the detail page can show a stable
// loading state until the public market list finishes its first request.
let incomingMarketShareListingId = "";
let incomingMarketShareLoading = false;
let nativeMarketShareLinksBound = false;

if (CONFIGURED_SMS_BACKEND && state.pendingAuthCode && state.pendingAuthCode !== SERVER_SMS_CODE) {
  state = { ...state, pendingAuthCode: "", pendingAuthPhone: "", authCodeExpiresAt: "" };
  saveState();
}

function loadCloudAuthTokens() {
  try {
    const saved = JSON.parse(localStorage.getItem(AUTH_TOKEN_STORAGE));
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

function readSavedCloudToken(phone) {
  if (!phone) return "";
  const tokens = loadCloudAuthTokens();
  return typeof tokens[phone] === "string" ? tokens[phone] : "";
}

function rememberCloudToken(phone, token) {
  if (!phone || !token) return;
  try {
    localStorage.setItem(AUTH_TOKEN_STORAGE, JSON.stringify({
      ...loadCloudAuthTokens(),
      [phone]: token
    }));
  } catch (error) {
    console.warn("保存云端登录凭证失败", error);
  }
}

function forgetCloudToken(phone) {
  if (!phone) return;
  try {
    const tokens = loadCloudAuthTokens();
    delete tokens[phone];
    localStorage.setItem(AUTH_TOKEN_STORAGE, JSON.stringify(tokens));
  } catch (error) {
    console.warn("清理云端登录凭证失败", error);
  }
}

// A server-side 401 means the saved credential can no longer be used.  Clear
// every local copy in one place so background polling stops immediately.  The
// account's current data deliberately stays in `state`: saveState() writes it
// as an offline recovery copy until the person signs in again, rather than
// discarding edits merely because a token expired.
function clearExpiredCloudSession() {
  const phone = state.loggedInPhone;
  if (!phone) return;
  forgetCloudToken(phone);
  cloudHydrationComplete = false;
  state = {
    ...state,
    cloudToken: "",
    registeredUsers: (state.registeredUsers || []).map(user => (
      user.phone === phone ? { ...user, cloudToken: "" } : user
    ))
  };
  saveState({ skipCloud: true });
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE));
    // The app always cold-starts on the dashboard. Older releases stored the
    // last route in localStorage, which could reopen the "空间" tab instead.
    return saved ? normalizeState({ ...initialState, ...saved, page: "home" }) : { ...initialState };
  } catch {
    return { ...initialState };
  }
}

function readPendingCloudData() {
  try {
    const pending = JSON.parse(localStorage.getItem(PENDING_CLOUD_DATA_STORAGE));
    return pending && typeof pending === "object" && !Array.isArray(pending) ? pending : null;
  } catch {
    return null;
  }
}

function persistPendingCloudData(source = state) {
  if (!source.loggedInPhone || !currentCloudToken()) return false;
  try {
    localStorage.setItem(PENDING_CLOUD_DATA_STORAGE, JSON.stringify({
      phone: source.loggedInPhone,
      accountName: source.accountName,
      accountAvatar: source.accountAvatar || "",
      data: accountDataSnapshot(source),
      updatedAt: new Date().toISOString()
    }));
    return true;
  } catch (error) {
    console.warn("保存待同步数据失败", error);
    return false;
  }
}

function clearPendingCloudData(phone = state.loggedInPhone) {
  const pending = readPendingCloudData();
  if (!pending || !phone || pending.phone !== phone) return;
  try {
    localStorage.removeItem(PENDING_CLOUD_DATA_STORAGE);
  } catch (error) {
    console.warn("清理待同步数据失败", error);
  }
}

function restorePendingCloudData() {
  const pending = readPendingCloudData();
  if (!pending || pending.phone !== state.loggedInPhone || !currentCloudToken()) return false;
  state = {
    ...state,
    ...normalizeAccountData(pending.data || {}),
    accountName: pending.accountName || state.accountName,
    accountAvatar: pending.accountAvatar || state.accountAvatar
  };
  return true;
}

function pendingCloudDataIsNewerThan(serverUpdatedAt, pending = readPendingCloudData()) {
  if (!pending || pending.phone !== state.loggedInPhone) return false;
  const pendingTime = Date.parse(pending.updatedAt || "");
  const serverTime = Date.parse(serverUpdatedAt || "");
  if (!Number.isFinite(pendingTime)) return false;
  return !Number.isFinite(serverTime) || pendingTime > serverTime;
}

function cleanText(value) {
  const map = {
    "鏈煡": "未知",
    "姝ｅ父楗插吇": "正常饲养",
    "宸茶浆璁?": "已转让",
    "宸叉浜?": "已死亡",
    "鍋ュ悍": "健康",
    "鐢熺梾": "生病",
    "璐拱": "购买",
    "瀛靛寲": "孵化",
    "鍏朵粬": "其他",
    "鏋滄牳铔嬮緹": "果核蛋龟"
  };
  return typeof value === "string" ? (map[value] || value) : value;
}

function normalizeState(next) {
  const registeredUsers = (next.registeredUsers || []).map(user => ({
    ...user,
    data: normalizeAccountData(user.data || {})
  }));
  const savedCloudToken = readSavedCloudToken(next.loggedInPhone);
  const loggedInPhone = next.loggedInPhone && (registeredUsers.some(user => user.phone === next.loggedInPhone) || savedCloudToken)
    ? next.loggedInPhone
    : "";
  const activeUser = registeredUsers.find(user => user.phone === loggedInPhone);
  const serverAccountData = normalizeAccountData(activeUser?.data || {});
  // When a cloud token is missing or has expired, saveState stores the active
  // account data at the root as a local recovery copy.  Do not throw that copy
  // away on the next launch just because the lightweight account record has no
  // embedded data.  Cloud-backed sessions still prefer the authoritative user
  // record, while an offline recovery copy is used only when it actually has
  // account content that the lightweight record does not.
  const recoveryAccountData = normalizeAccountData(next || {});
  const accountData = loggedInPhone
    ? (accountHasContent(serverAccountData) || !accountHasContent(recoveryAccountData)
      ? serverAccountData
      : recoveryAccountData)
    : emptyAccountData();
  const base = {
    ...next,
    ...accountData,
    registeredUsers,
    loggedInPhone,
    cloudToken: loggedInPhone ? (next.cloudToken || activeUser?.cloudToken || savedCloudToken || "") : "",
    accountName: loggedInPhone ? (activeUser?.accountName || next.accountName || maskPhone(loggedInPhone)) : "未登录用户",
    accountAvatar: loggedInPhone ? (activeUser?.accountAvatar || next.accountAvatar || "") : ""
  };
  return {
    ...base,
    publicReviews: Array.isArray(base.publicReviews) ? base.publicReviews : [],
    publicFeedbackItems: Array.isArray(base.publicFeedbackItems) ? base.publicFeedbackItems : [],
    communityPosts: Array.isArray(base.communityPosts) ? base.communityPosts : [],
    communityFeedInitialized: Boolean(base.communityFeedInitialized),
    communityFeedNextOffset: Math.max(0, Number(base.communityFeedNextOffset || 0)),
    communityFeedHasMore: base.communityFeedHasMore !== false,
    communityFeedLoadingMore: false,
    communityProfileStats: {
      receivedLikes: Math.max(0, Number(base.communityProfileStats?.receivedLikes || 0)),
      followerCount: Math.max(0, Number(base.communityProfileStats?.followerCount || 0))
    },
    contentReports: Array.isArray(base.contentReports) ? base.contentReports : [],
    systemAnnouncements: Array.isArray(base.systemAnnouncements) ? base.systemAnnouncements : [],
    adminSystemAnnouncements: Array.isArray(base.adminSystemAnnouncements) ? base.adminSystemAnnouncements : [],
    blockedUsers: Array.isArray(base.blockedUsers) ? base.blockedUsers : [],
    isCommunityAdmin: Boolean(base.isCommunityAdmin),
    communityFriends: Array.isArray(base.communityFriends) ? base.communityFriends : [],
    communityFollowingUsers: Array.isArray(base.communityFollowingUsers) ? base.communityFollowingUsers : [],
    communityFollowingPosts: Array.isArray(base.communityFollowingPosts) ? base.communityFollowingPosts : [],
    communityFollowingListings: Array.isArray(base.communityFollowingListings) ? base.communityFollowingListings : [],
    marketListings: Array.isArray(base.marketListings) ? base.marketListings : [],
    growthFilter: ["all", "measure", "breeding", "pool"].includes(base.growthFilter) ? base.growthFilter : "all",
    formGender: cleanText(base.formGender),
    turtles: (base.turtles || []).map(t => ({
      ...t,
      measureHistory: Array.isArray(t.measureHistory) ? t.measureHistory : [],
      speciesName: cleanText(t.speciesName),
      gender: cleanText(t.gender),
      status: cleanText(t.status),
      health: cleanText(t.health),
      source: cleanText(t.source)
    })),
    breedingRecords: (base.breedingRecords || []).map(item => ({
      ...item,
      hatchCount: Number(item.hatchCount || 0),
      motherName: cleanText(item.motherName),
      editHistory: Array.isArray(item.editHistory) ? item.editHistory : []
    })),
    ledgerRecords: (base.ledgerRecords || []).map(item => ({
      ...item,
      title: cleanText(item.title),
      saleMethod: cleanText(item.saleMethod),
      photo: item.photo ? apiAssetUrl(item.photo) : "",
      turtleSnapshot: item.turtleSnapshot ? {
        ...item.turtleSnapshot,
        photo: item.turtleSnapshot.photo ? apiAssetUrl(item.turtleSnapshot.photo) : "",
        speciesName: cleanText(item.turtleSnapshot.speciesName),
        gender: cleanText(item.turtleSnapshot.gender),
        status: cleanText(item.turtleSnapshot.status),
        health: cleanText(item.turtleSnapshot.health),
        source: cleanText(item.turtleSnapshot.source)
      } : item.turtleSnapshot
    }))
  };
}

function hasCloudSession() {
  return Boolean(CONFIGURED_SMS_BACKEND && state.loggedInPhone && currentCloudToken());
}

function lightAccountUser(user) {
  return {
    id: user.id,
    phone: user.phone,
    accountName: user.accountName,
    accountAvatar: user.accountAvatar || "",
    cloudToken: user.cloudToken || "",
    createdAt: user.createdAt,
    data: emptyAccountData()
  };
}

function accountHasContent(source = state) {
  return Boolean(
    (source.turtles || []).length ||
    (source.keptSpecies || []).length ||
    (source.memos || []).length ||
    (source.ledgerRecords || []).length ||
    (source.breedingRecords || []).length ||
    (source.satisfactionReviews || []).length ||
    (source.feedbackItems || []).length ||
    (source.marketFavoriteIds || []).length ||
    (source.marketHistoryIds || []).length ||
    (source.turtlePools || []).length ||
    (source.activityLogs || []).length
  );
}

function turtleHasEmbeddedImages(turtle) {
  return Boolean(
    isMigratableImage(turtle?.photo) ||
    (turtle?.measureHistory || []).some(item =>
      isMigratableImage(item.photo) ||
      isMigratableImage(item.oldPhoto) ||
      isMigratableImage(item.newPhoto)
    )
  );
}

function accountHasEmbeddedImages(source = state) {
  return Boolean(
    isMigratableImage(source.accountAvatar) ||
    (source.turtles || []).some(turtleHasEmbeddedImages) ||
    (source.ledgerRecords || []).some(item =>
      isMigratableImage(item.photo) || turtleHasEmbeddedImages(item.turtleSnapshot)
    ) ||
    (source.breedingRecords || []).some(item =>
      isMigratableImage(item.photo) ||
      (item.editHistory || []).some(history =>
        isMigratableImage(history.photo) ||
        isMigratableImage(history.oldPhoto) ||
        isMigratableImage(history.newPhoto)
      )
    )
  );
}

function saveState(options = {}) {
  const registeredUsers = syncRegisteredUsers(state);
  const cloudSession = hasCloudSession();
  // The device copy is a recovery mirror, not merely an offline fallback.
  // Keeping it for every signed-in account means a temporary network loss,
  // expired token, or interrupted background sync can never erase a user's
  // turtles, ledger records, photos, or reminders before the next launch.
  const accountData = state.loggedInPhone ? accountDataSnapshot(state) : emptyAccountData();
  const storageUsers = cloudSession || CONFIGURED_SMS_BACKEND
    ? registeredUsers.map(lightAccountUser)
    : registeredUsers;
  const activeCloudToken = state.cloudToken || registeredUsers.find(user => user.phone === state.loggedInPhone)?.cloudToken || readSavedCloudToken(state.loggedInPhone);
  if (state.loggedInPhone && activeCloudToken) rememberCloudToken(state.loggedInPhone, activeCloudToken);
  state.registeredUsers = registeredUsers;
  try {
    localStorage.setItem(STORAGE, JSON.stringify({
      ...accountData,
      accountName: state.accountName,
      accountAvatar: state.accountAvatar,
      accountMode: state.accountMode,
      loggedInPhone: state.loggedInPhone,
      cloudToken: activeCloudToken,
      registeredUsers: storageUsers,
      pendingAuthCode: state.pendingAuthCode,
      pendingAuthPhone: state.pendingAuthPhone,
      authCodeExpiresAt: state.authCodeExpiresAt,
      accountCodeCooldownUntil: state.accountCodeCooldownUntil,
      communityPosts: state.communityPosts || [],
      communityFriends: state.communityFriends || [],
      communityFollowingUsers: state.communityFollowingUsers || [],
      messageUnreadCount: Number(state.messageUnreadCount || 0),
      marketListings: state.marketListings || [],
      themeColor: state.themeColor || accountData.themeColor
    }));
  } catch (error) {
    console.warn("保存本地数据失败", error);
    toast("本地登录状态保存失败，请清理浏览器缓存后重试");
  }
  // Write-ahead journal: the cloud sync may be delayed or interrupted after
  // this local save. It is cleared only after /api/account/save succeeds.
  if (cloudSession && !options.skipCloud) persistPendingCloudData();
  if (!options.skipCloud) queueCloudSave();
}

function setState(patch, options = {}) {
  const pageChanged = Object.prototype.hasOwnProperty.call(patch, "page") && patch.page && patch.page !== state.page;
  if (pageChanged) {
    // A preserved list is only valid for its current messages page. Any
    // normal navigation will build the destination page from current state.
    preservedMessageSnapshotActive = false;
    // A completed interactive edge-back keeps the frozen previous page visible
    // for one frame while its real DOM is rendered underneath it. Clearing it
    // earlier creates the familiar white flash / jump on the destination page.
    if (!options.keepEdgeBackPreview) clearEdgeBackPreview();
    $app.style.transition = "";
    $app.style.transform = "";
    $app.classList.remove("edge-back-dragging");
    if (!options.skipEdgeSnapshot && !BOTTOM_NAV_ROOT_PAGES.has(patch.page) && $app?.innerHTML) {
      // Keep the actual page nodes for a real back-navigation hand-off. An
      // HTML string remains only as a recovery fallback; replacing innerHTML
      // after an edge swipe was the source of the visible previous-page jump.
      cleanNavigationSnapshotDom($app);
      const pageHtml = cleanNavigationSnapshotHtml($app.innerHTML);
      const liveSnapshot = detachNavigationSnapshotDom();
      edgeBackSnapshots.push({
        page: state.page,
        html: pageHtml,
        previewHtml: buildEdgeBackPreviewHtml(pageHtml),
        liveDom: liveSnapshot.dom,
        bottomNavHtml: liveSnapshot.bottomNavHtml,
        scrollY: window.scrollY || 0
      });
      // A user only needs the most recent navigation levels. Keeping a long
      // chain of media-heavy pages is wasteful on an iPhone WebView.
      edgeBackSnapshots = edgeBackSnapshots.slice(-3);
    } else if (BOTTOM_NAV_ROOT_PAGES.has(patch.page)) {
      edgeBackSnapshots = [];
    }
    pendingCommunityChatEnterMotion = options.pageMotion === "chat";
    // Bottom tabs switch immediately and keep their fixed navigation stable.
    // Every secondary module gets a short, unobtrusive entry transition unless
    // it is a gesture-driven return or a dedicated chat transition.
    pendingPageEnterMotion = options.pageMotion === "enter" || (
      options.pageMotion === undefined && !BOTTOM_NAV_ROOT_PAGES.has(patch.page)
    );
    pendingPageScrollReset = options.pageScroll !== "preserve";
    if (!pendingPageEnterMotion) {
      if (pageEnterMotionTimer) window.clearTimeout(pageEnterMotionTimer);
      pageEnterMotionTimer = null;
      $app.classList.remove("page-enter-motion");
    }
    if (!pendingCommunityChatEnterMotion) $app.classList.remove("community-chat-enter-motion");
  }
  state = { ...state, ...patch };
  saveState(options);
  if (!pageChanged && !options.forceRender && state.page === "messages" && preservedMessageSnapshotActive) {
    // Keep the previously visible message list completely still on return
    // from chat. The state (including unread counts) is still current, and
    // the persistent bottom tab can update without rebuilding the list.
    syncPersistentBottomNav($app.querySelector(":scope > .bottom-nav"));
    return;
  }
  // The visible page may be the exact DOM that was just handed back from an
  // edge-swipe preview. Let that hand-off settle before a late unread/polling
  // response replaces it with a freshly rendered copy.
  if (!pageChanged && !options.forceRender && Date.now() < restoredSnapshotRenderHoldUntil) return;
  render();
  refreshCareReminderTimers();
}

function cleanNavigationSnapshotDom(root) {
  root?.querySelectorAll?.(".message-friend-swipe").forEach(row => {
    row.classList.remove("is-open", "is-dragging", "is-native-scrolling");
    row.scrollLeft = 0;
    const foreground = row.querySelector(".message-friend-row");
    foreground?.style.removeProperty("transform");
    foreground?.style.removeProperty("will-change");
  });
}

function cleanNavigationSnapshotHtml(html = "") {
  const template = document.createElement("template");
  template.innerHTML = html;
  cleanNavigationSnapshotDom(template.content);
  return template.innerHTML;
}

function detachNavigationSnapshotDom() {
  const dom = document.createDocumentFragment();
  // The bottom tab bar is intentionally kept as one physical node across
  // routes. It remains in #app while the source page content is detached and
  // is placed beside that same content again on return.
  const persistentBottomNav = $app.querySelector(":scope > .bottom-nav");
  const bottomNavHtml = persistentBottomNav?.outerHTML || "";
  persistentBottomNav?.remove();
  while ($app.firstChild) dom.appendChild($app.firstChild);
  if (persistentBottomNav) $app.appendChild(persistentBottomNav);
  return { dom, bottomNavHtml };
}

function requireLogin() {
  if (state.loggedInPhone) return true;
  toast("请先登录账号");
  return false;
}

function forceUpdatePage() {
  const latestBuild = Number(forceUpdateState.latestBuild || forceUpdateState.minimumBuild || 0);
  const message = forceUpdateState.message || "为了保障数据安全与使用体验，请先更新到最新版本后再继续使用。";
  return `
    <main class="force-update-screen" role="alertdialog" aria-modal="true" aria-labelledby="forceUpdateTitle">
      <div class="force-update-mark" aria-hidden="true">⇧</div>
      <p class="force-update-eyebrow">壳友手账有新版本</p>
      <h1 id="forceUpdateTitle">需要更新后才能继续使用</h1>
      <p class="force-update-copy">${escapeHtml(message)}</p>
      <div class="force-update-version"><span>当前构建 ${APP_BUILD || "-"}</span>${latestBuild ? `<i></i><strong>最新构建 ${latestBuild}</strong>` : ""}</div>
      <button class="primary force-update-primary" type="button" data-open-app-store-update>前往 App Store 更新</button>
      <button class="force-update-recheck" type="button" data-recheck-app-update>更新完成后，点击重新检查</button>
    </main>
  `;
}

function bindForceUpdateActions() {
  $app.querySelector("[data-open-app-store-update]")?.addEventListener("click", () => {
    window.location.href = forceUpdateState.appStoreUrl || APP_STORE_URL;
  });
  $app.querySelector("[data-recheck-app-update]")?.addEventListener("click", () => {
    checkRequiredAppUpdate(true);
  });
}

async function checkRequiredAppUpdate(showFeedback = false) {
  if (!CONFIGURED_SMS_BACKEND || forceUpdateState.checking) return;
  forceUpdateState.checking = true;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);
  try {
    const base = window.TURTLE_API_BASE_URL || "";
    const response = await fetch(`${base}/api/app/version?build=${encodeURIComponent(APP_BUILD)}&t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) throw new Error(result.message || "检查更新失败");
    const minimumBuild = Math.max(0, Number.parseInt(String(result.minimumBuild || 0), 10) || 0);
    const latestBuild = Math.max(minimumBuild, Number.parseInt(String(result.latestBuild || 0), 10) || 0);
    const mustUpdate = minimumBuild > 0 && APP_BUILD > 0 && APP_BUILD < minimumBuild;
    if (mustUpdate) {
      forceUpdateState = {
        required: true,
        checking: false,
        minimumBuild,
        latestBuild,
        message: String(result.message || ""),
        appStoreUrl: String(result.appStoreUrl || "")
      };
      render();
      return;
    }
    if (forceUpdateState.required) {
      forceUpdateState = { required: false, checking: false, minimumBuild: 0, latestBuild: 0, message: "", appStoreUrl: "" };
      render();
    }
    if (showFeedback) toast("已是最新版本");
  } catch (error) {
    if (showFeedback) toast("暂时无法连接更新服务，请检查网络后重试");
  } finally {
    window.clearTimeout(timeout);
    forceUpdateState.checking = false;
  }
}

function requireArchiveCapacity(extra = 1) {
  return requireLogin();
}

function ledgerMoneyStats(records = state.ledgerRecords) {
  return records.reduce((sum, item) => {
    const amount = Number(item.amount || 0);
    if (item.type === "purchase") sum.purchase += amount;
    if (item.type === "sold") sum.sold += amount;
    if (item.type === "loss") sum.loss += amount;
    return sum;
  }, { purchase: 0, sold: 0, loss: 0 });
}

function breedingStats() {
  return (state.breedingRecords || []).reduce((sum, item) => {
    sum.egg += Number(item.eggCount || 0);
    sum.fertile += Number(item.fertileCount || 0);
    sum.hatch += Number(item.hatchCount || 0);
    return sum;
  }, { egg: 0, fertile: 0, hatch: 0 });
}

function applyTheme() {
  const themes = {
    teal: {
      green: "#22735b", green2: "#2fa77f", ink: "#24435a", text: "#22272f", muted: "#858b96",
      mint: "#edf7f1", bg: "#f4f2ee", surface: "#fffdf8", surface2: "#f7fbfa", night: "#1f2a33", aqua: "#2fa77f", sea: "#246b7a",
      bodyBg: "radial-gradient(circle at 10% 0%, rgba(47, 167, 127, .16), transparent 28%), radial-gradient(circle at 90% 8%, rgba(36, 107, 122, .16), transparent 30%), #e8e5df",
      phoneBg: "linear-gradient(180deg, #fbfaf7 0%, #f1eee8 42%, #f6f5f0 100%)",
      topbarBg: "rgba(251, 250, 247, .92)", cardBg: "rgba(255, 255, 255, .92)", cardBorder: "rgba(31, 42, 51, .08)",
      pageBg: "#f4f2ee", sectionBg: "#ffffff", rowBg: "#ffffff", raisedBg: "#f7fbfa", divider: "rgba(31, 42, 51, .08)", accent: "#2fa77f", navMuted: "rgba(36, 67, 90, .56)"
    },
    forest: {
      green: "#2d6846", green2: "#6aa84f", ink: "#26352b", text: "#243026", muted: "#7d897f",
      mint: "#eef7eb", bg: "#f1f4ec", surface: "#fffdf8", surface2: "#f6fbf2", night: "#26352b", aqua: "#6aa84f", sea: "#3d7653",
      bodyBg: "radial-gradient(circle at 14% 0%, rgba(106, 168, 79, .18), transparent 28%), radial-gradient(circle at 92% 12%, rgba(45, 104, 70, .14), transparent 30%), #e5e8df",
      phoneBg: "linear-gradient(180deg, #fbfbf5 0%, #eef3e8 46%, #f7f7f0 100%)",
      topbarBg: "rgba(251, 251, 245, .92)", cardBg: "rgba(255, 255, 250, .92)", cardBorder: "rgba(38, 53, 43, .08)",
      pageBg: "#f1f4ec", sectionBg: "#fffffa", rowBg: "#ffffff", raisedBg: "#f6fbf2", divider: "rgba(38, 53, 43, .08)", accent: "#6aa84f", navMuted: "rgba(38, 53, 43, .56)"
    },
    ocean: {
      green: "#246b7a", green2: "#3aa5b5", ink: "#203a4a", text: "#202c36", muted: "#788895",
      mint: "#eaf6f8", bg: "#f0f5f6", surface: "#fbfefe", surface2: "#f1fafb", night: "#203a4a", aqua: "#3aa5b5", sea: "#246b7a",
      bodyBg: "radial-gradient(circle at 12% 0%, rgba(58, 165, 181, .17), transparent 28%), radial-gradient(circle at 88% 10%, rgba(36, 107, 122, .16), transparent 30%), #e2e7e8",
      phoneBg: "linear-gradient(180deg, #fbfefe 0%, #edf5f6 44%, #f6f8f8 100%)",
      topbarBg: "rgba(251, 254, 254, .92)", cardBg: "rgba(255, 255, 255, .92)", cardBorder: "rgba(32, 58, 74, .08)",
      pageBg: "#f0f5f6", sectionBg: "#ffffff", rowBg: "#ffffff", raisedBg: "#f1fafb", divider: "rgba(32, 58, 74, .08)", accent: "#3aa5b5", navMuted: "rgba(32, 58, 74, .56)"
    },
    plum: {
      green: "#6b4b74", green2: "#a678b5", ink: "#3b3042", text: "#2c2630", muted: "#8d8293",
      mint: "#f5eff7", bg: "#f5f1f5", surface: "#fffafd", surface2: "#fbf5fc", night: "#3b3042", aqua: "#a678b5", sea: "#6b4b74",
      bodyBg: "radial-gradient(circle at 12% 0%, rgba(166, 120, 181, .17), transparent 28%), radial-gradient(circle at 90% 10%, rgba(107, 75, 116, .14), transparent 30%), #e8e3e9",
      phoneBg: "linear-gradient(180deg, #fffafd 0%, #f3edf5 44%, #faf6fa 100%)",
      topbarBg: "rgba(255, 250, 253, .92)", cardBg: "rgba(255, 255, 255, .92)", cardBorder: "rgba(59, 48, 66, .08)",
      pageBg: "#f5f1f5", sectionBg: "#ffffff", rowBg: "#ffffff", raisedBg: "#fbf5fc", divider: "rgba(59, 48, 66, .08)", accent: "#a678b5", navMuted: "rgba(59, 48, 66, .56)"
    },
    dark: {
      green: "#07c160", green2: "#07c160", ink: "#f2f2f2", text: "#e7e7e7", muted: "#8c8c8c",
      mint: "#202020", bg: "#111111", surface: "#181818", surface2: "#202020", night: "#111111", aqua: "#07c160", sea: "#3a3a3a",
      bodyBg: "#0b0b0b",
      phoneBg: "#111111",
      topbarBg: "#181818", cardBg: "#181818", cardBorder: "#242424",
      pageBg: "#111111", sectionBg: "#181818", rowBg: "#181818", raisedBg: "#3a3a3a", divider: "#242424", accent: "#07c160", navMuted: "rgba(231, 231, 231, .58)"
    }
  };
  const theme = themes[state.themeColor] || themes.teal;
  document.documentElement.dataset.themeColor = state.themeColor;
  Object.entries({
    "--green": theme.green,
    "--green-2": theme.green2,
    "--ink": theme.ink,
    "--text": theme.text,
    "--muted": theme.muted,
    "--mint": theme.mint,
    "--bg": theme.bg,
    "--surface": theme.surface,
    "--surface-2": theme.surface2,
    "--night": theme.night,
    "--aqua": theme.aqua,
    "--sea": theme.sea,
    "--body-bg": theme.bodyBg,
    "--phone-bg": theme.phoneBg,
    "--topbar-bg": theme.topbarBg,
    "--card-bg": theme.cardBg,
    "--card-border": theme.cardBorder,
    "--page-bg": theme.pageBg,
    "--section-bg": theme.sectionBg,
    "--row-bg": theme.rowBg,
    "--raised-bg": theme.raisedBg,
    "--divider": theme.divider,
    "--accent": theme.accent,
    "--nav-muted": theme.navMuted
  }).forEach(([key, value]) => document.documentElement.style.setProperty(key, value));
}

function speciesByCode(code) {
  return speciesList.find(item => item.code === code);
}

function isMarketProhibitedSpecies(speciesOrCode) {
  const code = typeof speciesOrCode === "object"
    ? speciesOrCode?.code
    : speciesOrCode;
  return MARKET_PROHIBITED_SPECIES_CODES.has(String(code || "").trim().toUpperCase());
}

function marketSpeciesRestrictionMessage() {
  return "该品种属于龟集市平台禁售范围，无法发布";
}

const SPECIES_IMPORT_ALIASES = {
  "果核": "GHG",
  "果核龟": "GHG",
  "头盔": "TBG",
  "头盔蛋龟": "TBG"
};

function compactSpeciesName(value) {
  return String(value || "").trim().replace(/[龟龜]/g, "");
}

function speciesByImportName(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const code = raw.toUpperCase();
  const aliasCode = SPECIES_IMPORT_ALIASES[raw] || SPECIES_IMPORT_ALIASES[compactSpeciesName(raw)];
  const exact = speciesByCode(code) || speciesList.find(item => item.name === raw);
  if (exact) return exact;
  if (aliasCode) return speciesByCode(aliasCode);
  const compact = compactSpeciesName(raw);
  if (!compact) return null;
  return speciesList.find(item => {
    const name = compactSpeciesName(item.name);
    return name === compact || name.includes(compact) || compact.includes(name);
  }) || null;
}

function numberFromImport(value) {
  const normalized = String(value || "").replace(/[^\d.-]/g, "");
  return Number(normalized || 0);
}

function loadSpeciesImageCache() {
  try {
    return JSON.parse(localStorage.getItem(SPECIES_IMAGE_CACHE)) || {};
  } catch {
    return {};
  }
}

function saveSpeciesImageCache() {
  localStorage.setItem(SPECIES_IMAGE_CACHE, JSON.stringify(speciesImageCache));
}

function speciesSearchName(item) {
  if (!item) return "";
  if (item.scientific) return item.scientific;
  const raw = decodeURIComponent(String(item.image || "").split("/Special:FilePath/")[1] || "");
  return raw.replace(/\.(jpg|jpeg|png|webp)$/i, "").replace(/\s+\d+$/i, "").trim() || item.name || item.code;
}

function speciesSearchCandidates(item) {
  const primary = speciesSearchName(item);
  const base = primary.split(/\s+/).slice(0, 2).join(" ");
  return [...new Set([primary, base, item?.name].filter(Boolean))];
}

function speciesPhoto(item) {
  if (!item) return defaultPhoto;
  // Catalogue photos ship with the app.  They are deliberately preferred over
  // cache and network URLs so the whole species page works offline instantly.
  return `${BUNDLED_SPECIES_IMAGE_ROOT}/${encodeURIComponent(item.code)}.jpg`;
}

async function resolveSpeciesImage(item) {
  return item ? speciesPhoto(item) : "";
}

function hydrateSpeciesImages() {
  document.querySelectorAll("[data-fallback-photo]").forEach(img => {
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      // Keep the catalogue completely offline, even if one bundled file is
      // damaged. A release build must never request Wikimedia at runtime.
      img.src = defaultPhoto;
    }, { once: true });
  });

  const images = [...document.querySelectorAll("[data-species-img]")];
  if (!images.length) return;

  const load = async img => {
    const item = speciesByCode(img.dataset.speciesImg);
    const image = await resolveSpeciesImage(item);
    if (image && img.isConnected) img.src = image;
  };

  if (!("IntersectionObserver" in window)) {
    images.forEach(load);
    return;
  }

  if (speciesImageObserver) speciesImageObserver.disconnect();
  speciesImageObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      speciesImageObserver.unobserve(entry.target);
      load(entry.target);
    });
  }, { root: null, rootMargin: "360px 0px" });

  images.forEach(img => speciesImageObserver.observe(img));
}

function memoWeekdays(memo) {
  const values = Array.isArray(memo?.weekdays) ? memo.weekdays : [];
  return values.map(String).filter(value => WEEKDAY_OPTIONS.some(item => item.value === value));
}

function refreshCareReminderTimers() {
  // Kept as a no-op for existing state transitions. The server owns the
  // reminder schedule and sends the remote notification.
}

async function requestCareReminderPermission() {
  // Chat and nursing reminders use the same native APNs authorization. The
  // browser/local-notification permission is not a reliable iOS signal.
  return true;
}

async function scheduleNativeCareReminder(memo) {
  // Scheduling happens on the server so reminders work after the app exits.
  return Boolean(memo?.remindTime);
}

async function cancelNativeCareReminder(memo) {
  // Deleting or updating the cloud-synced memo updates the server schedule.
  return Boolean(memo?.id);
}

async function activateCareReminder(memo) {
  if (!memo?.remindTime) return;
  const permitted = await requestCareReminderPermission();
  if (!permitted) {
    toast("提醒已保存，系统通知权限未开启");
    return;
  }
  await scheduleNativeCareReminder(memo);
  refreshCareReminderTimers();
}

function turtleLabel(turtle) {
  if (!turtle) return "未关联档案";
  return `${turtle.code || "未命名"} · ${turtle.speciesName || "未填写品种"}`;
}

function makeActivity(text, type = "操作") {
  return { id: crypto.randomUUID(), text, type, createdAt: new Date().toISOString() };
}

function logActivity(text, type = "操作") {
  return [makeActivity(text, type), ...(state.activityLogs || [])];
}

function activeTurtles() {
  return state.turtles.filter(t => t.status === "正常饲养");
}

function stats() {
  return {
    total: state.turtles.length,
    active: activeTurtles().length,
    healthy: state.turtles.filter(t => t.health === "健康").length,
    sick: state.turtles.filter(t => t.health === "生病").length,
    species: new Set(state.turtles.map(t => t.speciesCode)).size
  };
}

function chinaDateParts(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHINA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: CHINA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).format(date);
}

function formatMessagePreviewTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const current = chinaDateParts();
  const target = chinaDateParts(date);
  if (!current || !target) return "";
  if (current.year === target.year && current.month === target.month && current.day === target.day) {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: CHINA_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(date);
  }
  return current.year === target.year ? `${target.month}/${target.day}` : `${target.year}/${target.month}/${target.day}`;
}

function formatDate(value) {
  const parts = chinaDateParts(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : "";
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ratingStars(value) {
  const rating = Math.max(0, Math.min(5, Number(value || 0)));
  return `${"★".repeat(rating)}${"☆".repeat(5 - rating)}`;
}

function money(value) {
  return Number(value || 0).toFixed(2);
}

function valueOrFallback(value, fallback = "") {
  return value === undefined || value === null ? fallback : value;
}

function turtleFormDraft() {
  return state.formDraft && typeof state.formDraft === "object" && !Array.isArray(state.formDraft) ? state.formDraft : {};
}

function turtleFormValue(key, fallback = "") {
  const value = turtleFormDraft()[key];
  return valueOrFallback(value, fallback);
}

function turtleFormSelected(key, option, fallback = "") {
  return turtleFormValue(key, fallback) === option ? "selected" : "";
}

function captureTurtleFormDraft(form = document.querySelector("#turtleForm")) {
  if (!form) return { ...turtleFormDraft() };
  const data = new FormData(form);
  return TURTLE_FORM_DRAFT_FIELDS.reduce((draft, key) => {
    draft[key] = String(data.get(key) || "");
    return draft;
  }, {});
}

function preserveTurtleForm(extra = {}) {
  setState({ formDraft: captureTurtleFormDraft(), ...extra });
}

function ledgerFormDraft() {
  return state.ledgerDraftForm && typeof state.ledgerDraftForm === "object" && !Array.isArray(state.ledgerDraftForm) ? state.ledgerDraftForm : {};
}

function ledgerFormValue(key, fallback = "") {
  const value = ledgerFormDraft()[key];
  return valueOrFallback(value, fallback);
}

function ledgerFormSelected(key, option, fallback = "") {
  return ledgerFormValue(key, fallback) === option ? "selected" : "";
}

function captureLedgerFormDraft(form = document.querySelector("#ledgerForm")) {
  if (!form) return { ...ledgerFormDraft() };
  const data = new FormData(form);
  return LEDGER_FORM_DRAFT_FIELDS.reduce((draft, key) => {
    draft[key] = String(data.get(key) || "");
    return draft;
  }, {});
}

function preserveLedgerForm(extra = {}) {
  setState({ ledgerDraftForm: captureLedgerFormDraft(), ...extra });
}

function readImageAsDataUrl(file, maxSide = 960, quality = 0.66, maxLength = 260000) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("请选择图片"));
      return;
    }
    if (file.type && !file.type.startsWith("image/")) {
      reject(new Error("请选择图片文件"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.onload = () => {
      const original = String(reader.result || "");
      const image = new Image();
      image.onload = () => {
        const originalWidth = image.width || maxSide;
        const originalHeight = image.height || maxSide;
        let side = maxSide;
        let currentQuality = quality;
        let dataUrl = original;

        for (let attempt = 0; attempt < 7; attempt += 1) {
          const scale = Math.min(1, side / Math.max(originalWidth, originalHeight));
          const width = Math.max(1, Math.round(originalWidth * scale));
          const height = Math.max(1, Math.round(originalHeight * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          if (!context) break;
          context.drawImage(image, 0, 0, width, height);
          dataUrl = canvas.toDataURL("image/jpeg", currentQuality);
          if (dataUrl.length <= maxLength || (side <= 480 && currentQuality <= 0.52)) break;
          side = Math.max(480, Math.round(side * 0.82));
          currentQuality = Math.max(0.52, currentQuality - 0.06);
        }

        resolve(dataUrl);
      };
      image.onerror = () => resolve(original);
      image.src = original;
    };
    reader.readAsDataURL(file);
  });
}

function apiAssetUrl(url) {
  const value = String(url || "");
  const base = String(window.TURTLE_API_BASE_URL || "").replace(/\/+$/, "");
  // During the OSS cutover some installed clients persisted the bucket's
  // default-domain URLs.  iOS treats that domain as a download, not inline
  // media, so a perfectly valid image appears as a broken-image icon.  Keep
  // the stored data intact but render that legacy media through our API host,
  // whose /uploads route supports inline images and byte-range video.
  const legacyOssMedia = value.match(/^https?:\/\/turtlekeeper-media-hz2026\.oss-cn-hangzhou\.aliyuncs\.com(\/uploads\/.*)$/i);
  if (legacyOssMedia && base) return `${base}${legacyOssMedia[1]}`;
  if (!value || /^(https?:|data:|blob:)/i.test(value)) return value;
  const pathValue = value.startsWith("/") ? value : `/${value}`;
  return base ? `${base}${pathValue}` : pathValue;
}

function randomDefaultAccountAvatar() {
  return DEFAULT_ACCOUNT_AVATARS[Math.floor(Math.random() * DEFAULT_ACCOUNT_AVATARS.length)];
}

function isDefaultAccountAvatar(avatar) {
  const value = String(avatar || "");
  return DEFAULT_ACCOUNT_AVATARS.includes(value) || /^\/?assets\/default-avatars\/avatar-\d+\.png$/.test(value);
}

function accountAvatarSource(avatar) {
  const value = String(avatar || "");
  // Built-in avatars are bundled into the Capacitor web assets. Keeping this
  // relative path prevents an unnecessary network request on every render.
  return isDefaultAccountAvatar(value) ? value.replace(/^\/+/, "") : apiAssetUrl(value);
}

function isEmbeddedImage(value) {
  return /^data:image\//i.test(String(value || ""));
}

function compressImageDataUrl(source, maxSide = 960, quality = 0.66, maxLength = 260000) {
  return new Promise(resolve => {
    const original = String(source || "");
    const image = new Image();
    image.onload = () => {
      const originalWidth = image.width || maxSide;
      const originalHeight = image.height || maxSide;
      let side = maxSide;
      let currentQuality = quality;
      let dataUrl = original;

      for (let attempt = 0; attempt < 7; attempt += 1) {
        const scale = Math.min(1, side / Math.max(originalWidth, originalHeight));
        const width = Math.max(1, Math.round(originalWidth * scale));
        const height = Math.max(1, Math.round(originalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) break;
        context.drawImage(image, 0, 0, width, height);
        dataUrl = canvas.toDataURL("image/jpeg", currentQuality);
        if (dataUrl.length <= maxLength || (side <= 480 && currentQuality <= 0.52)) break;
        side = Math.max(480, Math.round(side * 0.82));
        currentQuality = Math.max(0.52, currentQuality - 0.06);
      }

      resolve(dataUrl);
    };
    image.onerror = () => resolve(original);
    image.src = original;
  });
}

function requireCloudImageSession() {
  if (!CONFIGURED_SMS_BACKEND) throw new Error("当前未连接云端服务，暂时无法上传图片");
  if (!state.loggedInPhone || !currentCloudToken()) throw new Error("请先登录账号后再上传图片");
}

async function uploadDataUrlToCloud(image, kind = "image") {
  requireCloudImageSession();
  const uploadImage = isEmbeddedImage(image) && String(image).length > 260000
    ? await compressImageDataUrl(image, kind === "avatar" ? 768 : 960, kind === "avatar" ? 0.78 : 0.66, 260000)
    : image;
  const result = await apiPost("/api/upload/image", {
    phone: state.loggedInPhone,
    token: currentCloudToken(),
    kind,
    image: uploadImage
  });
  if (!result.url) throw new Error("云端未返回图片地址");
  return apiAssetUrl(result.url);
}

async function uploadImageToServer(file, kind = "image", options = {}) {
  requireCloudImageSession();
  const image = await readImageAsDataUrl(
    file,
    options.maxSide || 760,
    options.quality || 0.62,
    options.maxLength || 180000
  );
  try {
    const result = await apiPost("/api/upload/image", {
      phone: state.loggedInPhone,
      token: currentCloudToken(),
      kind,
      image
    });
    if (!result.url) throw new Error("云端未返回图片地址");
    return apiAssetUrl(result.url);
  } catch (error) {
    console.warn("图片上传云端失败", error);
    throw new Error(error.message || "图片需要上传到云端，请检查网络或服务器后重试");
  }
}

function readImageForLocalUse(file, kind = "image", options = {}) {
  return readImageAsDataUrl(
    file,
    options.maxSide || (kind === "avatar" ? 640 : 720),
    options.quality || (kind === "avatar" ? 0.72 : 0.58),
    options.maxLength || (kind === "avatar" ? 140000 : 150000)
  );
}

function scheduleCloudImageMigration(delay = 500) {
  if (!hasCloudSession()) return;
  if (cloudImageMigrationInFlight) {
    cloudImageMigrationQueued = true;
    return;
  }
  if (cloudImageMigrationTimer) clearTimeout(cloudImageMigrationTimer);
  cloudImageMigrationTimer = setTimeout(() => {
    cloudImageMigrationTimer = null;
    migrateEmbeddedImagesToCloud({ silent: true });
  }, delay);
}

function saveWithDeferredImages(patch, images = [], options = {}) {
  const shouldDeferCloud = hasCloudSession() && images.some(isMigratableImage);
  setState(patch, { ...options, skipCloud: shouldDeferCloud || options.skipCloud });
  if (shouldDeferCloud) {
    persistPendingCloudData();
    scheduleCloudImageMigration();
  }
}

function isMigratableImage(value) {
  return isEmbeddedImage(value) && value !== defaultPhoto;
}

async function migrateImageField(target, field, kind, cache = new Map()) {
  if (!target || !isMigratableImage(target[field])) return false;
  const image = target[field];
  if (!cache.has(image)) cache.set(image, uploadDataUrlToCloud(image, kind));
  target[field] = await cache.get(image);
  return true;
}

async function migrateTurtleImageSet(turtle, kind = "turtle", cache = new Map()) {
  let changed = false;
  changed = await migrateImageField(turtle, "photo", kind, cache) || changed;
  if (Array.isArray(turtle.measureHistory)) {
    for (const item of turtle.measureHistory) {
      changed = await migrateImageField(item, "photo", kind, cache) || changed;
      changed = await migrateImageField(item, "oldPhoto", kind, cache) || changed;
      changed = await migrateImageField(item, "newPhoto", kind, cache) || changed;
    }
  }
  return changed;
}

async function migrateEmbeddedImagesToCloud(options = {}) {
  if (cloudImageMigrationInFlight) {
    cloudImageMigrationQueued = true;
    return false;
  }
  if (!hasCloudSession()) return false;
  cloudImageMigrationInFlight = true;
  let changed = false;
  const uploadCache = new Map();
  try {
    let accountAvatar = state.accountAvatar;
    if (isMigratableImage(accountAvatar)) {
      if (!uploadCache.has(accountAvatar)) uploadCache.set(accountAvatar, uploadDataUrlToCloud(accountAvatar, "avatar"));
      accountAvatar = await uploadCache.get(accountAvatar);
      changed = true;
    }

    const turtles = (state.turtles || []).map(turtle => ({
      ...turtle,
      measureHistory: Array.isArray(turtle.measureHistory) ? turtle.measureHistory.map(item => ({ ...item })) : []
    }));
    for (const turtle of turtles) {
      changed = await migrateTurtleImageSet(turtle, "turtle", uploadCache) || changed;
    }

    const ledgerRecords = (state.ledgerRecords || []).map(item => ({
      ...item,
      turtleSnapshot: item.turtleSnapshot ? {
        ...item.turtleSnapshot,
        measureHistory: Array.isArray(item.turtleSnapshot.measureHistory)
          ? item.turtleSnapshot.measureHistory.map(history => ({ ...history }))
          : []
      } : item.turtleSnapshot
    }));
    for (const item of ledgerRecords) {
      changed = await migrateImageField(item, "photo", "ledger", uploadCache) || changed;
      if (item.turtleSnapshot) {
        changed = await migrateTurtleImageSet(item.turtleSnapshot, "turtle", uploadCache) || changed;
      }
    }

    const breedingRecords = (state.breedingRecords || []).map(item => ({
      ...item,
      editHistory: Array.isArray(item.editHistory) ? item.editHistory.map(history => ({ ...history })) : []
    }));
    for (const item of breedingRecords) {
      changed = await migrateImageField(item, "photo", "breeding", uploadCache) || changed;
      if (Array.isArray(item.editHistory)) {
        for (const history of item.editHistory) {
          changed = await migrateImageField(history, "photo", "breeding", uploadCache) || changed;
          changed = await migrateImageField(history, "oldPhoto", "breeding", uploadCache) || changed;
          changed = await migrateImageField(history, "newPhoto", "breeding", uploadCache) || changed;
        }
      }
    }

    if (changed) {
      state = { ...state, accountAvatar, turtles, ledgerRecords, breedingRecords };
      saveState({ skipCloud: true });
      render();
      refreshCareReminderTimers();
      await pushCloudDataNow(true);
    }
    return changed;
  } catch (error) {
    console.warn("旧照片迁移云端失败", error);
    if (!options.silent) toast(error.message || "旧照片迁移云端失败，请稍后重试");
    return false;
  } finally {
    cloudImageMigrationInFlight = false;
    if (cloudImageMigrationQueued) {
      cloudImageMigrationQueued = false;
      scheduleCloudImageMigration(250);
    }
  }
}

function turtleDraftValue(turtle, key) {
  const draft = state.turtleDetailDraftId === turtle.id ? (state.turtleDetailDraft || {}) : {};
  return valueOrFallback(draft[key], valueOrFallback(turtle[key], ""));
}

function captureTurtleDetailDraft() {
  const form = document.querySelector("#turtleDetailForm");
  if (!form) return null;
  const data = new FormData(form);
  const turtle = state.turtles.find(item => item.id === state.selectedTurtleId);
  return {
    speciesCode: String(data.get("speciesCode") || ""),
    poolId: String(data.get("poolId") || ""),
    code: String(data.get("code") || ""),
    gender: String(data.get("gender") || "未知"),
    weight: String(data.get("weight") || ""),
    carapaceLength: String(data.get("carapaceLength") || ""),
    carapaceWidth: String(data.get("carapaceWidth") || ""),
    shellHeight: String(data.get("shellHeight") || ""),
    plastronLength: String(data.get("plastronLength") || ""),
    status: String(data.get("status") || turtle?.status || "正常饲养"),
    // 成长记录不修改健康、入手日期或购入价；草稿切换时保留档案原值。
    health: String(turtle?.health || "健康"),
    acquiredDate: String(turtle?.acquiredDate || ""),
    source: String(data.get("source") || turtle?.source || "购买"),
    price: String(turtle?.price || ""),
    note: String(data.get("note") || "")
  };
}

function describeTurtleSnapshot(snapshot = {}) {
  return [
    `龟龟昵称 ${snapshot.code || "-"}`,
    `体重 ${snapshot.weight || "-"}g`,
    `背甲 ${snapshot.carapaceLength || "-"}cm`,
    `${snapshot.status || "-"} · ${snapshot.health || "-"}`
  ].join(" · ");
}

function renderTurtleGrowthSnapshot(snapshot = {}, photo, label, isNew = false) {
  const nickname = escapeHtml(String(snapshot.code || "未命名"));
  const weight = snapshot.weight !== undefined && snapshot.weight !== "" ? `${escapeHtml(String(snapshot.weight))}g` : "-";
  const length = snapshot.carapaceLength !== undefined && snapshot.carapaceLength !== "" ? `${escapeHtml(String(snapshot.carapaceLength))}cm` : "-";
  const status = escapeHtml(String(snapshot.status || "-"));
  const health = escapeHtml(String(snapshot.health || "-"));
  const pool = escapeHtml(String(snapshot.poolName || turtlePoolName(snapshot.poolId)));
  return `
    <section class="growth-snapshot-card ${isNew ? "is-new" : ""}">
      <div class="growth-snapshot-head">
        <span>${label}</span>
        <img class="growth-preview-photo" src="${photo || defaultPhoto}" alt="${label}照片" data-growth-photo-preview role="button" tabindex="0" title="点击放大">
      </div>
      <strong>${nickname}</strong>
      <div class="growth-snapshot-meta">
        <span>体重 <b>${weight}</b></span>
        <span>背甲 <b>${length}</b></span>
        <span>状态 <b>${status}</b></span>
        <span>健康 <b>${health}</b></span>
        <span>龟池 <b>${pool}</b></span>
      </div>
    </section>
  `;
}

function renderBreedingHistorySnapshot(snapshot = {}, photo, label, isNew = false) {
  const motherName = escapeHtml(String(snapshot.motherName || "未填写种母"));
  const date = escapeHtml(String(snapshot.date || "-"));
  const eggCount = escapeHtml(String(snapshot.eggCount ?? 0));
  const fertileCount = escapeHtml(String(snapshot.fertileCount ?? 0));
  const hatchCount = escapeHtml(String(snapshot.hatchCount ?? 0));
  const poolName = escapeHtml(String(snapshot.poolName || turtlePoolName(snapshot.poolId)));
  return `
    <section class="growth-snapshot-card breeding-history-snapshot ${isNew ? "is-new" : ""}">
      <div class="growth-snapshot-head">
        <span>${label}</span>
        ${photo ? `<img class="growth-preview-photo" src="${photo}" alt="${label}附图" data-growth-photo-preview role="button" tabindex="0" title="点击放大">` : `<i class="breeding-history-photo" aria-hidden="true">繁</i>`}
      </div>
      <strong>${motherName}</strong>
      <div class="growth-snapshot-meta">
        <span>日期 <b>${date}</b></span>
        <span>产蛋 <b>${eggCount} 枚</b></span>
        <span>受精 <b>${fertileCount} 枚</b></span>
        <span>孵化 <b>${hatchCount} 只</b></span>
        <span>龟池 <b>${poolName}</b></span>
      </div>
    </section>
  `;
}

function describeBreedingSnapshot(snapshot = {}) {
  return [
    snapshot.date || "-",
    `种母 ${snapshot.motherName || "未填写"}`,
    `产蛋 ${snapshot.eggCount || 0} 枚`,
    `受精 ${snapshot.fertileCount || 0} 枚`,
    `孵化 ${snapshot.hatchCount || 0} 只`
  ].join(" · ");
}

function topbar(title, back = false, action = "", leading = "") {
  return `
    <div class="topbar">
      <div class="nav-title">
        ${back ? `<button class="icon-btn" type="button" data-back aria-label="返回"><svg class="back-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 4.5-7 7.5 7 7.5"></path></svg></button>` : (leading || `<span></span>`)}
        <h1>${title}</h1>
        ${action || `<span></span>`}
      </div>
    </div>
  `;
}

function tabIcon(name) {
  const icons = {
    home: `
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M4 11.5 12 4l8 7.5"></path>
        <path d="M6.5 10.5V20h11v-9.5"></path>
        <path d="M10 20v-5.5h4V20"></path>
      </svg>
    `,
    list: `
      <svg viewBox="0 0 24 24" focusable="false">
        <rect x="5" y="5" width="14" height="14" rx="2"></rect>
        <rect x="9" y="9" width="6" height="6" rx="1"></rect>
      </svg>
    `,
    breeding: `
      <svg viewBox="0 0 24 24" focusable="false">
        <circle cx="12" cy="12" r="8"></circle>
        <circle cx="12" cy="12" r="4.5"></circle>
      </svg>
    `,
    ledger: `
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="m7 5 5 7 5-7"></path>
        <path d="M12 12v7"></path>
        <path d="M8 12h8"></path>
        <path d="M8 16h8"></path>
      </svg>
    `,
    messages: `
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M5 6.5h14v9H10l-4.5 3v-3H5z"></path>
        <path d="M8.5 10h7"></path>
      </svg>
    `,
    market: `
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M4 9h16l-1.2-4H5.2z"></path>
        <path d="M5.5 9v10h13V9"></path>
        <path d="M9 19v-5h6v5"></path>
        <path d="M4 9c0 1.4 1 2.4 2.3 2.4S8.7 10.4 8.7 9c0 1.4 1 2.4 2.3 2.4s2.3-1 2.3-2.4c0 1.4 1 2.4 2.4 2.4S20 10.4 20 9"></path>
      </svg>
    `,
    mine: `
      <svg viewBox="0 0 24 24" focusable="false">
        <circle cx="12" cy="8" r="3.5"></circle>
        <path d="M5.5 19c1.4-3 3.4-4.5 6.5-4.5S17.1 16 18.5 19"></path>
      </svg>
    `
  };
  return `<span class="tab-icon" aria-hidden="true">${icons[name] || ""}</span>`;
}

function bottomNav() {
  const dashboardPages = ["home", "list", "turtleDetail", "species", "breeds", "add", "memos", "breeding", "breedingAdd", "breedingDetail", "pools", "poolAdd"];
  const ledgerPages = ["ledger", "ledgerDetail"];
  const marketPages = ["market", "marketAdd", "marketDetail", "marketSeller"];
  const messagePages = ["messages", "community", "communityAdd", "communityFriends", "communityChat", "communityPostDetail", "communityProfile"];
  const minePages = ["mine", "calendar", "satisfaction", "feedback", "feedbackAdd", "feedbackDetail", "account", "about", "rules", "privacy", "moderation", "reports", "marketFavorites", "marketHistory", "following", "followingProfile"];
  const unreadCount = Math.max(0, Number(state.messageUnreadCount || 0));
  const unreadText = unreadCount > 99 ? "99+" : String(unreadCount);
  return `
    <nav class="bottom-nav">
      <button class="${dashboardPages.includes(state.page) ? "active" : ""}" data-page="home">${tabIcon("home")}看板</button>
      <button class="${ledgerPages.includes(state.page) ? "active" : ""}" data-page="ledger">${tabIcon("ledger")}账本</button>
      <button class="${marketPages.includes(state.page) ? "active" : ""}" data-page="market">${tabIcon("market")}龟集市</button>
      <button class="nav-message-tab ${messagePages.includes(state.page) ? "active" : ""}" data-page="messages">${tabIcon("messages")}${unreadCount ? `<i class="nav-unread-badge">${unreadText}</i>` : ""}消息</button>
      <button class="${minePages.includes(state.page) ? "active" : ""}" data-page="mine">${tabIcon("mine")}空间</button>
    </nav>
  `;
}

function bottomNavActivePage(page = state.page) {
  if (["home", "list", "turtleDetail", "species", "breeds", "add", "memos", "breeding", "breedingAdd", "breedingDetail", "pools", "poolAdd"].includes(page)) return "home";
  if (["ledger", "ledgerDetail"].includes(page)) return "ledger";
  if (["market", "marketAdd", "marketDetail", "marketSeller"].includes(page)) return "market";
  if (["messages", "community", "communityAdd", "communityFriends", "communityChat", "communityPostDetail", "communityProfile"].includes(page)) return "messages";
  return "mine";
}

// Keep the guest view recognisable: visitors can see the normal page layout,
// while the unused area directly above the tab bar clearly explains how to
// unlock the page.  This is intentionally not a full-page replacement.
function guestLoginSlot() {
  if (state.loggedInPhone) return "";
  return `
    <section class="guest-login-slot" aria-label="登录提示">
      <div>
        <strong>请先登录账号</strong>
        <span>登录后即可使用全部功能</span>
        <button type="button" data-page="account">去登录</button>
      </div>
    </section>
  `;
}

function syncPersistentBottomNav(nav) {
  if (!nav) return;
  const activePage = bottomNavActivePage();
  nav.querySelectorAll("[data-page]").forEach(button => button.classList.toggle("active", button.dataset.page === activePage));
  const messageButton = nav.querySelector("[data-page='messages']");
  if (!messageButton) return;
  const unreadCount = Math.max(0, Number(state.messageUnreadCount || 0));
  let badge = messageButton.querySelector(".nav-unread-badge");
  if (unreadCount) {
    if (!badge) {
      badge = document.createElement("i");
      badge.className = "nav-unread-badge";
      messageButton.appendChild(badge);
    }
    badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
  } else {
    badge?.remove();
  }
}

function navigateBottomTab(targetPage) {
  if (!BOTTOM_NAV_ROOT_PAGES.has(targetPage) || state.page === targetPage) return;
  const navigationState = {
    page: targetPage,
    openTurtleMenuId: "",
    openLedgerMenuId: "",
    openBreedingMenuId: "",
    openFeedbackMenuId: "",
    updatingTurtleId: "",
    turtleDetailDraftId: "",
    turtleDetailDraft: null,
    updateDraftPhoto: ""
  };
  if (targetPage === "market") {
    marketLastLoadedAt = 0;
    Object.assign(navigationState, {
      marketFeedInitialized: false,
      marketFeedNextOffset: 0,
      marketFeedHasMore: true,
      marketFeedLoadingMore: false
    });
  }
  setState(navigationState);
}

function restoreBottomNavAfterForeground() {
  clearEdgeBackPreview();
  $app.style.transition = "";
  $app.style.transform = "";
  $app.classList.remove("edge-back-dragging");
  document.querySelectorAll(".bottom-nav").forEach(nav => {
    nav.removeAttribute("inert");
    nav.style.pointerEvents = "auto";
    nav.style.zIndex = "1100";
    syncPersistentBottomNav(nav);
  });
}

function setupBottomNavForegroundRecovery() {
  if (document.body.dataset.bottomNavRecoveryBound === "true") return;
  document.body.dataset.bottomNavRecoveryBound = "true";
  // Capture phase is intentionally independent of per-element listeners. A
  // preserved iOS WebView can resume with its fixed tab bar visible while its
  // old element listeners are no longer dispatching normally.
  document.addEventListener("click", event => {
    const tab = event.target.closest(".bottom-nav button[data-page]");
    if (!tab || !$app.contains(tab)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    navigateBottomTab(tab.dataset.page);
  }, true);
  // App resume only restores the fixed navigation layer. It deliberately does
  // not change state.page, so returning from another app preserves the page
  // where the user left off.
  const restore = () => window.requestAnimationFrame(restoreBottomNavAfterForeground);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) restore();
  });
  window.addEventListener("pageshow", restore);
}

function communityAvatar(item, className = "community-avatar") {
  const avatar = accountAvatarSource(item.authorAvatar || item.avatar || "");
  // Avatars are tiny but visually important. Ask WebKit to fetch and decode
  // them before feed media so the author rows appear immediately.
  if (avatar) return `<img class="${className}" src="${escapeHtml(avatar)}" alt="头像" loading="eager" decoding="async" fetchpriority="high">`;
  return `<span class="${className} fallback-avatar">${escapeHtml(String(item.authorName || item.name || "壳").slice(0, 1))}</span>`;
}

function marketSellerAvatar(item, className) {
  const avatar = accountAvatarSource(item.sellerAvatar || "");
  if (avatar) return `<img class="${className}" src="${escapeHtml(avatar)}" alt="卖家头像">`;
  return `<span class="${className} market-default-avatar">龟</span>`;
}

function communityPostMediaItems(item) {
  const values = Array.isArray(item?.mediaItems) && item.mediaItems.length
    ? item.mediaItems
    : (item?.mediaUrl ? [{ url: item.mediaUrl, posterUrl: item.posterUrl || "", type: item.mediaType }] : []);
  return values
    .map(media => ({
      url: String(media?.url || ""),
      posterUrl: String(media?.posterUrl || media?.poster || ""),
      type: media?.type === "video" ? "video" : "image"
    }))
    .filter(media => media.url)
    .slice(0, 9);
}

// Videos keep the system's native full-screen control in their player controls.
// Do not add a separate text badge over video content.
function inlineVideoExpandButton() {
  return "";
}

function communityMedia(item, compact = false) {
  const mediaItems = communityPostMediaItems(item);
  if (!mediaItems.length) return `<div class="community-media-placeholder"><span>壳友动态</span></div>`;
  const first = mediaItems[0];
  // Community cards must not download media until the user explicitly plays it.
  // The API server has limited bandwidth and several metadata/autoplay requests
  // in a scrolling feed can otherwise starve the video the user selected.
  if (first.type === "video") return `<video class="community-media" src="${first.url}"${videoPosterAttribute(first)} ${compact ? "muted playsinline" : "controls playsinline"} preload="none" crossorigin="anonymous"></video>`;
  if (mediaItems.length === 1) return `<img class="community-media" src="${first.url}" alt="动态图片" loading="lazy">`;
  return `<div class="community-media-gallery community-media-gallery-${mediaItems.length}">${mediaItems.map((media, index) => `<img class="community-media" src="${media.url}" alt="动态图片 ${index + 1}" loading="lazy">`).join("")}</div>`;
}

function communityFeedMedia(item) {
  const mediaItems = communityPostMediaItems(item);
  const mediaButton = (media, index) => {
    const label = media.type === "video" ? "播放视频" : `查看图片 ${index + 1}`;
    if (media.type === "video") {
      return `<div class="community-feed-media-button is-video" role="button" tabindex="0" data-preview-community-media="${item.id}" data-preview-community-media-index="${index}" aria-label="${label}"><div class="inline-video-shell"><video class="community-media" src="${media.url}"${videoPosterAttribute(media)} autoplay muted playsinline webkit-playsinline loop preload="none" crossorigin="anonymous" data-inline-video data-video-first-frame data-community-video-autoload data-community-video-autoplay></video>${inlineVideoExpandButton(media, "动态视频")}</div></div>`;
    }
    return `<button class="community-feed-media-button" type="button" data-preview-community-media="${item.id}" data-preview-community-media-index="${index}" aria-label="${label}"><img class="community-media" src="${media.url}" alt="动态图片 ${index + 1}" loading="lazy"><i class="community-detail-zoom-mark">⤢</i></button>`;
  };
  if (!mediaItems.length) return "";
  if (mediaItems.length === 1) return mediaButton(mediaItems[0], 0);
  return `<div class="community-media-gallery community-media-gallery-${mediaItems.length}">${mediaItems.map(mediaButton).join("")}</div>`;
}

function communityCompactCard(item) {
  const primaryMedia = communityPostMediaItems(item)[0];
  return `
    <article class="community-tile">
      <button class="community-tile-media" type="button" data-page="community">${communityMedia(item, true)}${primaryMedia?.type === "video" ? `<span class="community-video-mark">▶</span>` : ""}</button>
      <div class="community-tile-body">
        <p>${escapeHtml(item.content || "分享了一条新动态")}</p>
        <div class="community-tile-author">${communityAvatar(item, "community-mini-avatar")}<span>${escapeHtml(item.authorName || "壳友")}${platformAdminBadge(item)}</span><b>♡ ${item.likeCount || 0}</b></div>
      </div>
    </article>
  `;
}

function communityFeedCard(item, { allowDetail = false } = {}) {
  const comments = Array.isArray(item.comments) ? item.comments : [];
  const isOwn = Boolean(item.isOwn || item.pendingLocal);
  const canDelete = isOwn || state.isCommunityAdmin;
  const primaryMedia = communityPostMediaItems(item)[0];
  return `
    <article class="community-moment" data-community-feed-card="${item.id}" ${allowDetail ? `data-view-community-post="${item.id}" tabindex="0" role="button" aria-label="查看${escapeHtml(item.authorName || "壳友")}发布的动态"` : ""}>
      <button class="community-profile-avatar-button" type="button" data-view-community-user="${escapeHtml(item.authorId || "")}" aria-label="查看${escapeHtml(item.authorName || "壳友")}的主页">${communityAvatar(item)}</button>
      <div class="community-moment-main">
        <div class="community-moment-author"><span class="community-profile-name">${escapeHtml(item.authorName || "壳友")}${platformAdminBadge(item)}</span>${!isOwn ? `<span class="community-author-actions"><button class="community-follow-button ${item.followed ? "active" : ""}" type="button" data-toggle-community-follow="${item.authorId}">${item.followed ? "已关注" : "关注"}</button><button type="button" data-open-community-chat="${item.authorId}">聊天</button></span>` : ""}</div>
        ${item.content ? `<p class="community-post-copy">${escapeHtml(item.content)}</p>` : ""}
        ${primaryMedia ? `<div class="community-post-media ${primaryMedia.type === "video" ? "is-video" : ""}">${communityFeedMedia(item)}</div>` : ""}
        ${item.location ? `<span class="community-post-location">${escapeHtml(item.location)}</span>` : ""}
        <div class="community-moment-meta"><span>${formatTime(item.createdAt)}${canDelete ? `<button class="community-post-delete" type="button" data-delete-community-post="${item.id}">删除</button>` : ""}</span><div class="community-moment-action-wrap"><button type="button" data-community-more="${item.id}">••</button>${state.openCommunityActionId === item.id ? communityMomentActionMenu(item, isOwn) : ""}</div></div>
        ${(item.likeCount || comments.length) ? `<div class="community-social-panel">${item.likeCount ? `<p class="community-like-line">♡ ${item.likeCount} 人觉得很赞</p>` : ""}${comments.map(comment => `<p><strong>${escapeHtml(comment.authorName || "壳友")}${platformAdminBadge(comment)}</strong>：${escapeHtml(comment.content)}</p>`).join("")}</div>` : ""}
        ${state.communityCommentPostId === item.id ? `<form class="community-comment-form" data-community-comment-form="${item.id}"><input name="content" placeholder="评论" maxlength="500" autofocus><button type="submit">发送</button></form>` : ""}
      </div>
    </article>
  `;
}

function communityMomentActionMenu(item, isOwn = Boolean(item?.isOwn || item?.pendingLocal)) {
  if (!item?.id) return "";
  return `<div class="community-moment-popover" data-community-moment-popover><button class="${item.liked ? "active" : ""}" type="button" data-like-community-post="${item.id}">${item.liked ? "取消" : "赞"}</button><button type="button" data-show-community-comment="${item.id}">评论</button></div>`;
}

function findCommunityPost(postId) {
  const id = String(postId || "");
  return [...(state.communityPosts || []), ...(state.communityFollowingPosts || [])]
    .find(item => String(item.id) === id) || null;
}

function closeCommunityMomentPopovers(exceptWrap = null) {
  document.querySelectorAll(".community-moment-action-wrap .community-moment-popover").forEach(popover => {
    if (!exceptWrap || popover.parentElement !== exceptWrap) popover.remove();
  });
  if (!exceptWrap) state.openCommunityActionId = "";
}

function bindCommunityMomentPopover(popover) {
  if (!popover || popover.dataset.bound === "true") return;
  popover.dataset.bound = "true";
  popover.querySelector("[data-like-community-post]")?.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    state.openCommunityActionId = "";
    toggleCommunityLike(event.currentTarget.dataset.likeCommunityPost);
  });
  popover.querySelector("[data-show-community-comment]")?.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    setState({ communityCommentPostId: event.currentTarget.dataset.showCommunityComment, openCommunityActionId: "" }, { skipCloud: true });
  });
  popover.querySelector("[data-open-content-report]")?.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    state.openCommunityActionId = "";
    openContentReportDialog(event.currentTarget.dataset.reportType, event.currentTarget.dataset.reportId);
  });
  popover.querySelector("[data-block-content-user]")?.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    state.openCommunityActionId = "";
    confirmBlockUser({ targetType: event.currentTarget.dataset.blockType, targetId: event.currentTarget.dataset.blockId, name: event.currentTarget.dataset.blockName });
  });
}

function toggleCommunityMomentPopover(button) {
  const postId = String(button?.dataset.communityMore || "");
  const wrap = button?.closest(".community-moment-action-wrap");
  if (!postId || !wrap) return;
  const current = wrap.querySelector(".community-moment-popover");
  if (current) {
    current.remove();
    state.openCommunityActionId = "";
    return;
  }
  const post = findCommunityPost(postId);
  if (!post) return;
  closeCommunityMomentPopovers();
  const template = document.createElement("template");
  template.innerHTML = communityMomentActionMenu(post);
  const popover = template.content.firstElementChild;
  if (!popover) return;
  wrap.appendChild(popover);
  state.openCommunityActionId = postId;
  bindCommunityMomentPopover(popover);
}

function communityDetailMedia(item) {
  const mediaItems = communityPostMediaItems(item);
  if (!mediaItems.length) return "";
  const isGallery = mediaItems.length > 1;
  return `
    <div class="community-detail-media-gallery ${isGallery ? "is-gallery" : ""}">
      ${mediaItems.map((media, index) => {
        const label = media.type === "video" ? "播放视频" : `查看图片 ${index + 1}`;
        if (media.type === "video") {
          return `<div class="community-detail-media-button is-video" aria-label="${label}"><div class="inline-video-shell"><video class="community-media" src="${media.url}"${videoPosterAttribute(media)} muted playsinline controls preload="none" crossorigin="anonymous" data-inline-video></video>${inlineVideoExpandButton(media, "动态视频")}</div></div>`;
        }
        return `<button class="community-detail-media-button" type="button" data-preview-community-media="${item.id}" data-preview-community-media-index="${index}" aria-label="${label}"><img class="community-media" src="${media.url}" alt="动态图片 ${index + 1}" loading="lazy"><i class="community-detail-zoom-mark">⤢</i></button>`;
      }).join("")}
    </div>
  `;
}

function pageCommunityPostDetail() {
  const item = findCommunityPost(state.selectedCommunityPostId);
  if (!item) return `${topbar("动态详情", true)}<main class="content page-fresh"><div class="empty small-empty"><div><strong>这条动态不存在</strong></div></div></main>${bottomNav()}`;
  const comments = Array.isArray(item.comments) ? item.comments : [];
  const isOwn = Boolean(item.isOwn || item.pendingLocal);
  const canDelete = isOwn || state.isCommunityAdmin;
  return `
    ${topbar("动态详情", true)}
    <main class="content page-fresh community-detail-page">
      <article class="community-detail-card fresh-card">
        <header class="community-detail-head">
          <button class="community-profile-avatar-button" type="button" data-view-community-user="${escapeHtml(item.authorId || "")}" aria-label="查看${escapeHtml(item.authorName || "壳友")}的主页">${communityAvatar(item)}</button>
          <button class="community-detail-author-button" type="button" data-view-community-user="${escapeHtml(item.authorId || "")}"><strong>${escapeHtml(item.authorName || "壳友")}${platformAdminBadge(item)}</strong><span>${formatTime(item.createdAt)}</span></button>
          ${!isOwn ? `<div class="community-author-actions"><button class="${item.followed ? "active" : ""}" type="button" data-toggle-community-follow="${item.authorId}">${item.followed ? "已关注" : "关注"}</button><button type="button" data-open-community-chat="${item.authorId}">聊天</button></div>` : ""}
        </header>
        ${item.content ? `<p class="community-detail-copy">${escapeHtml(item.content)}</p>` : ""}
        ${communityDetailMedia(item)}
        ${item.location ? `<span class="community-post-location">${escapeHtml(item.location)}</span>` : ""}
        <div class="community-detail-actions">
          <button class="${item.liked ? "active" : ""}" type="button" data-like-community-post="${item.id}">${item.liked ? "已赞" : "♡ 赞"}${item.likeCount ? ` ${item.likeCount}` : ""}</button>
          <button type="button" data-show-community-comment="${item.id}">评论${comments.length ? ` ${comments.length}` : ""}</button>
          ${!isOwn ? `<button type="button" data-open-content-report data-report-type="community" data-report-id="${item.id}">举报</button><button class="danger-link" type="button" data-block-content-user data-block-type="community" data-block-id="${item.id}" data-block-name="${escapeHtml(item.authorName || "该用户")}">屏蔽用户</button>` : ""}
          ${canDelete ? `<button class="community-post-delete" type="button" data-delete-community-post="${item.id}">删除</button>` : ""}
        </div>
        ${(item.likeCount || comments.length) ? `<section class="community-detail-social">${item.likeCount ? `<p class="community-like-line">♡ ${item.likeCount} 人觉得很赞</p>` : ""}${comments.map(comment => `<p><strong>${escapeHtml(comment.authorName || "壳友")}${platformAdminBadge(comment)}</strong>：${escapeHtml(comment.content)}</p>`).join("")}</section>` : ""}
        ${state.communityCommentPostId === item.id ? `<form class="community-comment-form" data-community-comment-form="${item.id}"><input name="content" placeholder="写下评论" maxlength="500" autofocus><button type="submit">发送</button></form>` : ""}
      </article>
    </main>
    ${bottomNav()}
  `;
}

function pageMessages() {
  const latestPost = (state.communityPosts || [])[0];
  const chatPreview = latestCommunityMessagePreview(state.communityChatMessages || []);
  const friends = (() => {
    const rows = [...(state.communityFriends || [])];
    if (state.selectedCommunityFriendId && chatPreview?.lastMessage) {
      const index = rows.findIndex(item => item.id === state.selectedCommunityFriendId);
      const previewPatch = { lastMessage: chatPreview.lastMessage, lastMessageAt: chatPreview.lastMessageAt };
      // The conversation request contains the complete timeline and is often
      // newer than a list request that started a moment earlier. Never keep a
      // visible old preview merely because that row already has some text.
      if (index >= 0 && isCommunityPreviewAtLeastAsNew(previewPatch, rows[index])) rows[index] = { ...rows[index], ...previewPatch };
      if (index < 0 && state.selectedCommunityFriend) rows.unshift({ ...state.selectedCommunityFriend, ...previewPatch });
    }
    return rows;
  })();
  return `
    ${topbar("消息")}
    <main class="content page-fresh message-page">
      <section class="message-discover-list">
        <button class="message-discover-row" type="button" data-page="community"><span class="message-community-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2.8c2.5 0 3.9 3 2.2 4.8M21.2 12c0 2.5-3 3.9-4.8 2.2M12 21.2c-2.5 0-3.9-3-2.2-4.8M2.8 12c0-2.5 3-3.9 4.8-2.2"></path></svg></span><strong>壳友圈</strong><span class="message-discover-preview">${latestPost?.mediaUrl ? (latestPost.mediaType === "video" ? `<span class="message-video-thumb">▶</span>` : `<img src="${latestPost.mediaUrl}" alt="最新动态">`) : ""}</span><b>›</b></button>
      </section>
      <section class="message-friend-list">${friends.map(friend => `<article class="message-friend-swipe" data-conversation-id="${escapeHtml(friend.id)}"><button class="message-friend-row" type="button" data-open-community-chat="${friend.id}"><span class="message-friend-avatar-wrap">${communityAvatar(friend)}${friend.unreadCount ? `<i>${friend.unreadCount > 99 ? "99+" : friend.unreadCount}</i>` : ""}</span><div class="message-friend-copy"><strong>${escapeHtml(friend.name || "壳友")}${platformAdminBadge(friend)}</strong><span>${escapeHtml(friend.lastMessage || "暂无消息")}</span></div><span class="message-friend-meta">${friend.lastMessageAt ? `<time class="message-friend-time" datetime="${escapeHtml(friend.lastMessageAt)}">${formatMessagePreviewTime(friend.lastMessageAt)}</time>` : ""}<b>›</b></span></button><div class="message-friend-actions"><button type="button" data-toggle-conversation-pin="${escapeHtml(friend.id)}">${friend.pinned ? "取消置顶" : "置顶"}</button><button class="delete" type="button" data-delete-conversation="${escapeHtml(friend.id)}">删除</button></div></article>`).join("") || `<div class="message-empty"><strong>暂无消息</strong><span>在龟集市联系卖家后，可在这里继续沟通</span></div>`}</section>
    </main>
    ${guestLoginSlot()}
    ${bottomNav()}
  `;
}

function platformAdminBadge(subject = {}) {
  if (!subject.isAdmin && !subject.authorIsAdmin && !subject.sellerIsAdmin && !subject.senderIsAdmin) return "";
  return `<span class="platform-admin-badge" title="壳友手账官方管理员">官方管理员</span>`;
}

function pageCommunity() {
  const posts = state.communityPosts || [];
  const communityInitialLoading = Boolean(CONFIGURED_SMS_BACKEND && hasCloudSession() && !state.communityFeedInitialized && !posts.length);
  return `
    ${topbar("壳友圈", true, `<button class="community-camera-button" type="button" data-community-camera-button aria-label="拍摄或从相册选择"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z"></path><circle cx="12" cy="13.5" r="3.5"></circle></svg></button>`)}
    <main class="content page-fresh community-page community-moments-page">
      <input class="hidden-file" type="file" accept="image/*,video/*" multiple data-community-quick-media>
      <section class="community-feed ${communityInitialLoading ? "is-initial-loading" : ""}">${communityInitialLoading ? `<div class="community-feed-initial-loading" role="status" aria-live="polite"><i aria-hidden="true"></i><span>正在加载动态…</span></div>` : communityFeedMarkup(posts)}</section>
      ${posts.length ? `<div class="community-feed-status" data-community-load-sentinel>${state.communityFeedLoadingMore ? "正在加载更多动态…" : state.communityFeedHasMore ? "继续上滑，加载更多" : "已经到底了"}</div>` : ""}
    </main>
    ${bottomNav()}
  `;
}

function communityFeedMarkup(posts = state.communityPosts || [], options = {}) {
  return posts.map(item => communityFeedCard(item, options)).join("") || `<div class="empty small-empty"><div><strong>暂时还没有动态</strong><br>点击右上角相机发布第一条内容</div></div>`;
}

function communityFeedSignature(posts = []) {
  // API polling creates a new array every time. Compare only the fields that
  // affect the feed so an unchanged response never repaints the current page.
  return JSON.stringify((posts || []).map(post => [
    post.id,
    post.authorId,
    post.authorName,
    post.authorAvatar,
    post.content,
    post.createdAt,
    post.location,
    Boolean(post.isOwn),
    Boolean(post.pendingLocal),
    Boolean(post.followed),
    Boolean(post.liked),
    Number(post.likeCount || 0),
    (post.mediaItems || []).map(media => [media.url, media.posterUrl, media.type]),
    (post.comments || []).map(comment => [comment.id, comment.authorName, comment.authorAvatar, comment.content])
  ]));
}

function communityPostRenderSignature(post = {}) {
  // Keep this signature scoped to one card.  It lets a refresh replace only
  // the card whose visible data actually changed, instead of discarding every
  // image/video element in the feed after the page has opened.
  return JSON.stringify([
    post.id,
    post.authorId,
    post.authorName,
    post.authorAvatar,
    post.content,
    post.createdAt,
    post.location,
    Boolean(post.isOwn),
    Boolean(post.pendingLocal),
    Boolean(post.followed),
    Boolean(post.liked),
    Number(post.likeCount || 0),
    (post.mediaItems || []).map(media => [media.url, media.posterUrl, media.type]),
    (post.comments || []).map(comment => [comment.id, comment.authorName, comment.authorAvatar, comment.content])
  ]);
}

function communityPostMediaSignature(post = {}) {
  return JSON.stringify((post.mediaItems || []).map(media => [media.url, media.posterUrl, media.type]));
}

function createCommunityFeedCard(item) {
  const template = document.createElement("template");
  template.innerHTML = communityFeedCard(item).trim();
  return template.content.firstElementChild;
}

function bindPatchedCommunityFeed(feed) {
  if (!feed) return;
  const cards = feed.matches?.("[data-community-feed-card]")
    ? [feed]
    : [...feed.querySelectorAll("[data-community-feed-card]")];
  cards.forEach(card => {
    if (!card.dataset.viewCommunityPost) return;
    const openDetail = event => {
      if (event.target.closest("button, input, textarea, select, form, .inline-video-shell")) return;
      setState({ page: "communityPostDetail", selectedCommunityPostId: card.dataset.viewCommunityPost, openCommunityActionId: "", communityCommentPostId: "" }, { skipCloud: true });
    };
    card.addEventListener("click", openDetail);
    card.addEventListener("keydown", event => {
      if (event.target !== card || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      openDetail(event);
    });
  });
  feed.querySelectorAll("[data-preview-community-media]").forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    const post = findCommunityPost(button.dataset.previewCommunityMedia);
    const mediaItems = communityPostMediaItems(post);
    const index = Math.max(0, Number(button.dataset.previewCommunityMediaIndex || 0));
    const media = mediaItems[index];
    if (!media) return;
    if (media.type === "video") openVideoPreview(media.url, "动态视频", media.posterUrl || "");
    else openImagePreview(media.url, "动态图片");
  }));
  feed.querySelectorAll("[data-like-community-post]").forEach(btn => btn.addEventListener("click", () => toggleCommunityLike(btn.dataset.likeCommunityPost)));
  feed.querySelectorAll("[data-community-more]").forEach(btn => btn.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    toggleCommunityMomentPopover(event.currentTarget);
  }));
  feed.querySelectorAll("[data-show-community-comment]").forEach(btn => btn.addEventListener("click", () => setState({ communityCommentPostId: btn.dataset.showCommunityComment, openCommunityActionId: "" }, { skipCloud: true })));
  feed.querySelectorAll("[data-community-comment-form]").forEach(form => form.addEventListener("submit", submitCommunityComment));
  feed.querySelectorAll("[data-toggle-community-follow]").forEach(btn => btn.addEventListener("click", event => {
    event.stopPropagation();
    toggleCommunityFollow(btn.dataset.toggleCommunityFollow);
  }));
  feed.querySelectorAll("[data-view-community-user]").forEach(btn => btn.addEventListener("click", event => {
    event.stopPropagation();
    openCommunityUserProfile(btn.dataset.viewCommunityUser);
  }));
  feed.querySelectorAll("[data-open-community-chat]").forEach(btn => btn.addEventListener("click", () => openCommunityChat(btn.dataset.openCommunityChat)));
  feed.querySelectorAll("[data-delete-community-post]").forEach(btn => btn.addEventListener("click", event => {
    event.stopPropagation();
    deleteCommunityPost(btn.dataset.deleteCommunityPost);
  }));
}

function patchVisibleCommunityFeed(posts, previousPosts = []) {
  if (state.page !== "community") return false;
  const feed = $app.querySelector(".community-feed");
  if (!feed) return false;
  const previousById = new Map((previousPosts || []).map(post => [String(post.id), post]));
  const existingCards = [...feed.querySelectorAll(":scope > .community-moment")];
  const existingById = new Map(existingCards.map(card => [String(card.dataset.communityFeedCard || ""), card]));

  if (!posts.length) {
    if (!existingCards.length && feed.querySelector(".empty")) return true;
    feed.innerHTML = communityFeedMarkup([]);
    return true;
  }

  const cards = [];
  const changedCards = [];
  posts.forEach(post => {
    const id = String(post.id || "");
    const existing = existingById.get(id);
    const previous = previousById.get(id);
    const canKeepExistingCard = Boolean(existing && previous
      && communityPostRenderSignature(post) === communityPostRenderSignature(previous));
    const card = canKeepExistingCard ? existing : createCommunityFeedCard(post);
    // A comment/like change must update its card, but it must not restart an
    // unchanged inline video or make an already-decoded image flash. Move the
    // mounted media container to the replacement card when its media is the
    // same, then update the surrounding text/actions normally.
    if (!canKeepExistingCard && existing && previous
      && communityPostMediaSignature(post) === communityPostMediaSignature(previous)) {
      const existingMedia = existing.querySelector(".community-post-media");
      const nextMedia = card.querySelector(".community-post-media");
      if (existingMedia && nextMedia) nextMedia.replaceWith(existingMedia);
    }
    if (!canKeepExistingCard) changedCards.push(card);
    cards.push(card);
  });

  // Reorder by moving existing nodes in place.  Unchanged media elements stay
  // mounted, retain their decoded frame/playback state and do not flash again.
  let cursor = feed.firstElementChild;
  cards.forEach(card => {
    if (card !== cursor) feed.insertBefore(card, cursor);
    cursor = card.nextElementSibling;
  });
  while (cursor) {
    const next = cursor.nextElementSibling;
    cursor.remove();
    cursor = next;
  }

  changedCards.forEach(card => bindPatchedCommunityFeed(card));
  if (changedCards.length) {
    requestAnimationFrame(() => {
      hydrateVideoFirstFrames();
      hydrateCommunityPostVideos();
    });
  }
  return true;
}

function pageCommunityAdd() {
  const mediaItems = communityDraftMediaItems;
  const canPublish = Boolean(communityDraftText.trim() || mediaItems.length);
  const canAddMedia = !mediaItems.length || (mediaItems[0].type === "image" && mediaItems.length < 9);
  return `
    <div class="community-compose-nav"><button type="button" data-back>取消</button><button class="community-compose-submit ${canPublish ? "is-ready" : ""}" type="submit" form="communityPostForm" data-ready="${canPublish ? "true" : "false"}" aria-disabled="${canPublish ? "false" : "true"}" ${canPublish ? "" : "disabled"}>发表</button></div>
    <main class="community-compose-page">
      <form class="community-publish-form" id="communityPostForm">
        <textarea name="content" maxlength="1200" placeholder="这一刻的想法…">${escapeHtml(communityDraftText)}</textarea>
        <div class="community-draft-media-grid">
          ${mediaItems.map((media, index) => `<div class="community-draft-media-item">${media.type === "video" ? `<video src="${media.previewUrl}" muted playsinline></video><i>▶</i>` : `<img src="${media.previewUrl}" alt="待发布图片 ${index + 1}">`}<button type="button" data-remove-community-media="${index}" aria-label="移除媒体">×</button></div>`).join("")}
          ${canAddMedia ? `<button class="community-media-preview community-media-add" type="button" data-community-media-button><span>＋<small>${mediaItems.length ? "继续添加图片" : "添加图片或视频"}</small></span></button>` : ""}
        </div>
        ${mediaItems.length ? `<p class="community-draft-media-tip">${mediaItems[0].type === "video" ? "已选择 1 个视频（视频与图片不可混合发布）" : `已选择 ${mediaItems.length}/9 张图片（图片与视频不可混合发布）`}</p>` : ""}
        <input class="hidden-file" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" multiple data-community-media-input>
      </form>
    </main>
  `;
}

function pageCommunityFriends() {
  const friends = state.communityFriends || [];
  return `
    ${topbar("消息联系人", true)}
    <main class="content page-fresh community-page">
      <section class="section-title"><span>联系人</span><small>${friends.length} 位</small></section>
      <section class="community-friend-list">${friends.map(friend => `<article class="community-friend-row fresh-card">${communityAvatar(friend)}<div><strong>${escapeHtml(friend.name || "壳友")}${platformAdminBadge(friend)}</strong><small>${escapeHtml(friend.phone || "")}</small></div><button type="button" data-open-community-chat="${friend.id}">聊天</button></article>`).join("") || `<div class="empty small-empty"><div><strong>还没有联系人</strong><br>在龟集市联系卖家后即可继续聊天</div></div>`}</section>
    </main>
    ${bottomNav()}
  `;
}

function shouldShowCommunityMessageTime(messages, index) {
  if (index === 0) return true;
  const currentTime = Date.parse(messages[index]?.createdAt || "");
  const previousTime = Date.parse(messages[index - 1]?.createdAt || "");
  if (!Number.isFinite(currentTime) || !Number.isFinite(previousTime)) return true;
  return Math.abs(currentTime - previousTime) > 60 * 1000;
}

function normalizeCommunityChatListing(listing) {
  if (!listing || typeof listing !== "object") return null;
  const status = ["active", "inactive", "sold", "removed"].includes(listing.status) ? listing.status : "active";
  return {
    ...listing,
    status,
    unavailable: Boolean(listing.unavailable) || status !== "active",
    unavailableReason: listing.unavailableReason || (status === "sold" ? "sold" : status === "active" ? "" : "offline"),
    price: Math.max(0, Number(listing.price || 0)),
    mediaUrl: apiAssetUrl(listing.mediaUrl || listing.photoUrl || ""),
    mediaPosterUrl: apiAssetUrl(listing.mediaPosterUrl || listing.posterUrl || ""),
    photoUrl: apiAssetUrl(listing.photoUrl || listing.mediaUrl || ""),
    mediaType: listing.mediaType === "video" ? "video" : "image",
    mediaItems: Array.isArray(listing.mediaItems) ? listing.mediaItems.slice(0, 9).map(media => ({
      ...media,
      url: apiAssetUrl(media?.url || ""),
      posterUrl: apiAssetUrl(media?.posterUrl || media?.poster || ""),
      type: media?.type === "video" ? "video" : "image"
    })).filter(media => media.url) : []
  };
}

function videoPosterAttribute(media) {
  const posterUrl = String(media?.posterUrl || media?.mediaPosterUrl || media?.poster || "").trim();
  return posterUrl ? ` poster="${escapeHtml(posterUrl)}"` : "";
}

function marketVideoPosterUrl(media, fallbackUrl = defaultPhoto) {
  return String(media?.posterUrl || media?.mediaPosterUrl || media?.poster || fallbackUrl || defaultPhoto).trim() || defaultPhoto;
}

function marketDetailVideoMarkup(media, fallbackPosterUrl, sold = false, autoPlay = false) {
  // Use the video's own generated first-frame poster when available.  It
  // makes the detail page immediate without substituting an unrelated image.
  return `<div class="market-detail-photo market-detail-video-shell is-loading"><video src="${escapeHtml(media.url)}"${videoPosterAttribute(media)} controls playsinline preload="metadata"${autoPlay ? " autoplay muted" : ""} crossorigin="anonymous" data-inline-video data-video-first-frame data-market-detail-video${autoPlay ? " data-market-detail-autoplay" : ""}></video>${inlineVideoExpandButton(media, "商品视频")}<div class="market-detail-video-loading" aria-live="polite">视频加载中</div>${sold ? `<span>已售出</span>` : ""}</div>`;
}

function communityMessageAspectRatio(message, mediaType) {
  const ratio = Number(message?.mediaAspectRatio || 0);
  if (Number.isFinite(ratio) && ratio > 0) return Math.min(2, Math.max(0.45, ratio)).toFixed(4);
  // A stable fallback prevents late media decoding from changing the list height.
  return mediaType === "video" ? "0.5625" : "1.0000";
}

function prepareCommunityChatMedia(messages = []) {
  const items = Array.isArray(messages) ? messages : [];
  return Promise.all(items.map(message => {
    if (!message?.mediaUrl || message.mediaAspectRatio) return Promise.resolve(message);
    const mediaType = message.mediaType === "video" ? "video" : "image";
    const source = apiAssetUrl(message.mediaUrl);
    if (!source) return Promise.resolve(message);
    return new Promise(resolve => {
      let settled = false;
      let timer = null;
      const finish = (width, height) => {
        if (settled) return;
        settled = true;
        if (timer) window.clearTimeout(timer);
        const ratio = Number(width) > 0 && Number(height) > 0 ? Number(width) / Number(height) : 0;
        resolve(ratio ? { ...message, mediaAspectRatio: ratio } : message);
      };
      timer = window.setTimeout(() => finish(), 850);
      if (mediaType === "image") {
        const image = new Image();
        image.decoding = "async";
        image.onload = () => finish(image.naturalWidth, image.naturalHeight);
        image.onerror = () => finish();
        image.src = source;
        return;
      }
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = () => finish(video.videoWidth, video.videoHeight);
      video.onerror = () => finish();
      video.src = source;
      video.load();
    });
  }));
}

function isUnavailableChatListing(listing) {
  return Boolean(listing?.unavailable) || ["inactive", "sold", "removed"].includes(listing?.status);
}

function unavailableChatListingMessage(listing) {
  return listing?.status === "sold" || listing?.unavailableReason === "sold" ? "商品已售出" : "商品已下架";
}

function communityChatListingCard(listing) {
  if (!listing) return "";
  const title = listing.title || listing.speciesName || "龟集市商品";
  const meta = [listing.city || "全国", listing.delivery].filter(Boolean).join(" · ");
  const unavailable = isUnavailableChatListing(listing);
  const unavailableMark = unavailable ? `<em class="community-chat-product-unavailable-mark">已售出</em>` : "";
  const preview = listing.mediaUrl
    ? (listing.mediaType === "video"
      ? `<span class="community-chat-product-media is-video ${unavailable ? "is-unavailable" : ""}"><video src="${escapeHtml(listing.mediaUrl)}"${videoPosterAttribute(listing)} muted playsinline preload="auto" crossorigin="anonymous" data-video-first-frame></video><i>▶</i>${unavailableMark}</span>`
      : `<span class="community-chat-product-media ${unavailable ? "is-unavailable" : ""}"><img src="${escapeHtml(listing.mediaUrl)}" alt="${escapeHtml(title)}">${unavailableMark}</span>`)
    : `<span class="community-chat-product-media is-placeholder ${unavailable ? "is-unavailable" : ""}">龟${unavailableMark}</span>`;
  return `
    <button class="community-chat-product-strip" type="button" data-view-chat-market="${escapeHtml(listing.id || "")}" aria-label="${unavailable ? "商品已下架" : `查看商品详情：${escapeHtml(title)}`} ">
      ${preview}
      <div class="community-chat-product-info">
        <strong>${escapeHtml(title)}</strong>
        <b><i>¥</i>${money(listing.price)}</b>
        <span>${escapeHtml(meta || "商品信息" )}</span>
      </div>
      <span class="community-chat-product-link ${unavailable ? "is-unavailable" : ""}">${unavailable ? "已下架" : "查看商品"}</span>
    </button>
  `;
}

function pageCommunityChat() {
  const friend = state.selectedCommunityFriend || (state.communityFriends || []).find(item => item.id === state.selectedCommunityFriendId);
  const messages = state.communityChatMessages || [];
  const visibleMessages = messages.filter(message => !message.marketReferenceOnly);
  const marketListing = normalizeCommunityChatListing(state.communityChatListing);
  const toolsOpen = Boolean(state.communityChatToolsOpen);
  const messageMarkup = (message, index) => {
    if (message.official) {
      return `<div class="community-message community-message-official"><small>${formatTime(message.createdAt)}</small><section class="community-official-reminder"><div><i aria-hidden="true">!</i><strong>平台官方提醒</strong></div><p>${escapeHtml(message.rawContent || "私下直款交易有风险，请联系平台客服")}</p><button type="button" data-open-platform-wechat>联系客服</button></section></div>`;
    }
    const rawContent = String(message.rawContent ?? message.content ?? "").trim();
    const mediaUrl = message.mediaUrl ? apiAssetUrl(message.mediaUrl) : "";
    const mediaType = message.mediaType === "video" ? "video" : "image";
    const text = mediaUrl && ["[图片]", "[视频]"].includes(rawContent) ? "" : rawContent;
    const mediaPosterUrl = message.posterUrl ? apiAssetUrl(message.posterUrl) : "";
    const media = mediaUrl
      ? (mediaType === "video"
        ? `<div class="community-message-media is-video" style="--community-media-ratio:${communityMessageAspectRatio(message, mediaType)}" aria-label="查看聊天视频"><div class="inline-video-shell"><video src="${escapeHtml(mediaUrl)}"${videoPosterAttribute({ posterUrl: mediaPosterUrl })} muted playsinline controls preload="auto" crossorigin="anonymous" data-inline-video data-video-first-frame></video>${inlineVideoExpandButton({ url: mediaUrl, posterUrl: mediaPosterUrl }, "聊天视频")}</div></div>`
        : `<button class="community-message-media" style="--community-media-ratio:${communityMessageAspectRatio(message, mediaType)}" type="button" data-preview-chat-media="${escapeHtml(mediaUrl)}" data-chat-media-poster="${escapeHtml(mediaPosterUrl)}" data-chat-media-type="${mediaType}" aria-label="查看聊天图片"><img src="${escapeHtml(mediaUrl)}" alt="聊天图片"></button>`)
      : "";
    const showTime = shouldShowCommunityMessageTime(visibleMessages, index);
    const sender = { id: message.senderId || friend?.id || state.selectedCommunityFriendId, avatar: message.senderAvatar || friend?.avatar || "", name: friend?.name || "壳友", isAdmin: Boolean(message.senderIsAdmin || friend?.isAdmin) };
    const senderMark = !message.mine
      ? (showTime
        ? `<button class="community-chat-message-avatar" type="button" data-view-community-user="${escapeHtml(sender.id)}" aria-label="查看${escapeHtml(sender.name)}的主页">${communityAvatar(sender, "community-chat-avatar")}</button>`
        : `<span class="community-chat-avatar-spacer" aria-hidden="true"></span>`)
      : "";
    const recalled = Boolean(message.recalled);
    const textMessage = text && !mediaUrl && !recalled
      ? `<p class="community-chat-text-message" data-community-chat-text-message="${escapeHtml(message.id || "")}" tabindex="0">${escapeHtml(text)}</p>`
      : "";
    const recalledMessage = recalled
      ? `<p class="community-chat-recalled-message">${message.mine ? "你撤回了一条消息" : "对方撤回了一条消息"}</p>`
      : "";
    return `<div class="community-message ${message.mine ? "mine" : "theirs"} ${recalled ? "is-recalled" : ""}">${showTime ? `<small>${formatTime(message.createdAt)}</small>` : ""}<div class="community-message-body">${senderMark}<div class="community-message-content">${recalledMessage || textMessage}${media}</div></div></div>`;
  };
  const chatMessageList = visibleMessages.map(messageMarkup).join("") || (marketListing
    ? ""
    : communityChatOpening
      ? `<div class="community-chat-opening" role="status"><i aria-hidden="true"></i><span>正在打开聊天…</span></div>`
      : `<div class="community-chat-empty">打个招呼，开始聊天吧</div>`);
  const chatHeader = `
    <div class="topbar community-chat-topbar">
      <div class="community-chat-nav"><button class="icon-btn" type="button" data-back aria-label="返回"><svg class="back-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 4.5-7 7.5 7 7.5"></path></svg></button><button class="community-chat-user-link" type="button" data-view-community-user="${escapeHtml(friend?.id || state.selectedCommunityFriendId || "")}" aria-label="查看对方主页">${escapeHtml(friend?.name || "聊天")}${platformAdminBadge(friend || {})}</button><button class="community-chat-more" type="button" data-open-chat-more data-user-id="${escapeHtml(friend?.id || state.selectedCommunityFriendId || "")}" data-user-name="${escapeHtml(friend?.name || "该用户")}" aria-label="更多操作">•••</button></div>
    </div>
  `;
  return `
    ${chatHeader}
    <main class="content page-fresh community-chat-page ${marketListing ? "has-chat-product-context" : ""} ${toolsOpen ? "chat-tools-open" : ""}">
      <section class="community-chat-list">${chatMessageList}<div class="community-chat-bottom-anchor" aria-hidden="true"></div></section>
      <form class="community-chat-form" id="communityChatForm">
        <input name="content" maxlength="1000" value="${escapeHtml(marketChatDraft)}" placeholder="输入消息…" autocomplete="off" enterkeyhint="send">
        <button class="community-chat-plus-btn ${toolsOpen ? "is-open" : ""}" type="button" data-toggle-community-chat-tools aria-label="${toolsOpen ? "收起更多功能" : "更多功能"}" aria-expanded="${toolsOpen ? "true" : "false"}">${toolsOpen ? "×" : "+"}</button>
        <input class="community-chat-media-input" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,video/x-m4v" multiple data-community-chat-media-input hidden>
        <input class="community-chat-media-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" data-community-chat-camera-photo-input hidden>
        <input class="community-chat-media-input" type="file" accept="video/mp4,video/webm,video/quicktime,video/x-m4v" capture="environment" data-community-chat-camera-video-input hidden>
      </form>
    </main>
    ${marketListing ? `<section class="community-chat-product-context">${communityChatListingCard(marketListing)}</section>` : ""}
    ${toolsOpen ? `<section class="community-chat-tools" aria-label="更多聊天功能">
      <button type="button" data-community-chat-media-button><span aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="3"></rect><circle cx="9" cy="10" r="1.6"></circle><path d="m5.5 17 4.4-4.2 3.1 2.9 2.3-2.1 3.2 3.4"></path></svg></span><b>相册</b></button>
      <button type="button" data-community-chat-camera-button aria-label="短按拍照，长按录像"><span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4.5 8h3l1.4-2h6.2l1.4 2h3A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-8A1.5 1.5 0 0 1 4.5 8Z"></path><circle cx="12" cy="13.5" r="3.2"></circle></svg></span><b>拍摄</b></button>
    </section>` : ""}
  `;
}

function backNavigationState() {
  return {
    page: state.page === "turtleDetail" ? "home" : state.page === "ledgerDetail" ? "ledger" : state.page === "marketAdd" ? (state.editingMarketListingId ? "marketMy" : "market") : state.page === "marketDetail" ? "market" : state.page === "followingProfile" ? "following" : state.page === "species" && state.speciesPickerForAdd ? "add" : state.page === "feedbackAdd" || state.page === "feedbackDetail" ? "feedback" : state.page === "communityAdd" || state.page === "communityPostDetail" ? "community" : state.page === "community" || state.page === "communityFriends" || state.page === "communityChat" || state.page === "communityProfile" ? "messages" : state.page === "breedingAdd" || state.page === "breedingDetail" ? "breeding" : state.page === "poolAdd" ? "pools" : ["calendar", "satisfaction", "feedback", "account", "reports", "about", "marketFavorites", "marketHistory", "marketMy", "following"].includes(state.page) ? "mine" : "home",
    openTurtleMenuId: "", openLedgerMenuId: "", openBreedingMenuId: "", openFeedbackMenuId: "",
    editingTurtlePoolId: "", editingMarketListingId: "", updatingTurtleId: "", turtleDetailDraftId: "", turtleDetailDraft: null, updateDraftPhoto: ""
  };
}

function takeLiveSnapshotDom(snapshot) {
  const dom = document.createDocumentFragment();
  const preview = document.querySelector(".edge-back-preview");
  if (preview?.__edgeBackSnapshot === snapshot && !preview.__edgeBackUsesClone) {
    // Preserve the actual tab-bar node being shown in the preview. Recreating
    // it during the hand-off forces a small iOS layout repaint.
    const previewBottomNav = preview.__edgeBackBottomNav || null;
    previewBottomNav?.remove();
    while (preview.firstChild) dom.appendChild(preview.firstChild);
    dom.__edgeBackBottomNav = previewBottomNav;
    preview.__edgeBackSnapshot = null;
    preview.__edgeBackBottomNav = null;
  }
  if (preview?.__edgeBackSnapshot === snapshot && preview.__edgeBackUsesClone) {
    // The visible underlay is a clone. Keep it on screen while the real,
    // previously detached page is mounted back into #app offscreen. Moving a
    // visible node between parents was what made iOS repaint Messages like a
    // full refresh at the end of a chat back-swipe.
    preview.__edgeBackSnapshot = null;
    preview.__edgeBackBottomNav = null;
    preview.__edgeBackUsesClone = false;
  }
  if (snapshot?.liveDom) {
    while (snapshot.liveDom.firstChild) dom.appendChild(snapshot.liveDom.firstChild);
  }
  return dom;
}

function restoreLiveSnapshotToStash(preview) {
  const snapshot = preview?.__edgeBackSnapshot;
  if (!snapshot?.liveDom) return;
  if (preview.__edgeBackUsesClone) {
    // Nothing visible belongs to the saved fragment in clone mode, so it can
    // simply be removed on a cancelled gesture without touching the source.
    preview.__edgeBackSnapshot = null;
    preview.__edgeBackBottomNav = null;
    preview.__edgeBackUsesClone = false;
    return;
  }
  preview.__edgeBackBottomNav?.remove();
  while (preview.firstChild) snapshot.liveDom.appendChild(preview.firstChild);
  preview.__edgeBackSnapshot = null;
  preview.__edgeBackBottomNav = null;
}

function bottomNavFromHtml(html) {
  if (!html) return null;
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content.querySelector(".bottom-nav");
}

function restoreLiveNavigationSnapshot(snapshot, nextState, options = {}) {
  const liveDom = takeLiveSnapshotDom(snapshot);
  if (!liveDom.hasChildNodes()) return false;
  state = { ...state, ...nextState };
  preservedMessageSnapshotActive = snapshot.page === "messages";
  pendingPageEnterMotion = false;
  pendingCommunityChatEnterMotion = false;
  pendingPageScrollReset = false;
  $app.style.transition = "";
  if (!options.fromEdgeGesture) $app.style.transform = "";
  $app.classList.remove("edge-back-dragging", "page-enter-motion", "community-chat-enter-motion");
  const persistentBottomNav = $app.querySelector(":scope > .bottom-nav");
  persistentBottomNav?.remove();
  $app.replaceChildren(liveDom);
  const bottomNav = persistentBottomNav || liveDom.__edgeBackBottomNav || bottomNavFromHtml(snapshot.bottomNavHtml);
  if (bottomNav) {
    $app.appendChild(bottomNav);
    syncPersistentBottomNav(bottomNav);
  }
  saveState({ skipCloud: true });
  setupMarketInfiniteScroll();
  window.scrollTo({ top: Math.max(0, Number(snapshot.scrollY || 0)), left: 0, behavior: "auto" });
  restoredSnapshotRenderHoldUntil = Date.now() + 520;
  window.requestAnimationFrame(() => {
    $app.style.transform = "";
    window.requestAnimationFrame(clearEdgeBackPreview);
  });
  return true;
}

function navigateBack(options = {}) {
  const snapshot = edgeBackSnapshots.pop();
  const fallback = backNavigationState();
  const nextState = snapshot?.page ? { ...fallback, page: snapshot.page } : fallback;
  if (snapshot && restoreLiveNavigationSnapshot(snapshot, nextState, options)) return;
  if (snapshot?.html) {
    // Hand the exact frozen page to the real app before removing the preview.
    // This is intentionally not render(): recreating a long list (especially
    // messages) at this point is what caused the one-frame bounce on return.
    state = { ...state, ...nextState };
    preservedMessageSnapshotActive = snapshot.page === "messages";
    pendingPageEnterMotion = false;
    pendingCommunityChatEnterMotion = false;
    pendingPageScrollReset = false;
    // During an edge-back completion the outgoing page is already fully off
    // screen. Keep that layer offscreen until the previous page HTML and its
    // scroll position are ready, rather than briefly snapping the outgoing
    // page back to x=0 before replacing it.
    $app.style.transition = "";
    if (!options.fromEdgeGesture) $app.style.transform = "";
    $app.classList.remove("edge-back-dragging", "page-enter-motion", "community-chat-enter-motion");
    $app.innerHTML = snapshot.html;
    saveState({ skipCloud: true });
    bindEvents();
    setupMarketInfiniteScroll();
    window.scrollTo({ top: Math.max(0, Number(snapshot.scrollY || 0)), left: 0, behavior: "auto" });
    restoredSnapshotRenderHoldUntil = Date.now() + 520;
    window.requestAnimationFrame(() => {
      // The snapshot has now been mounted at the same scroll position as the
      // static preview. Reveal it in one compositor update, then remove the
      // preview on the following frame so there is no visible hand-off jump.
      $app.style.transform = "";
      hydrateVideoFirstFrames();
      hydrateCommunityPostVideos();
      hydrateMarketDetailVideos();
      window.requestAnimationFrame(clearEdgeBackPreview);
    });
    return;
  }
  setState(snapshot?.page ? { ...fallback, page: snapshot.page } : fallback, {
    pageMotion: "none",
    pageScroll: "preserve",
    skipEdgeSnapshot: true,
    keepEdgeBackPreview: true
  });
  window.scrollTo({ top: Math.max(0, Number(snapshot?.scrollY || 0)), left: 0, behavior: "auto" });
  window.requestAnimationFrame(clearEdgeBackPreview);
}

function pageFollowing() {
  const users = state.communityFollowingUsers || [];
  return `
    ${topbar("我的关注", true)}
    <main class="content page-fresh following-page">
      <section class="section-title"><span>关注的壳友</span><small>${users.length} 人</small></section>
      <section class="following-user-list">
        ${users.map(user => `<button class="following-user-card fresh-card" type="button" data-view-following-user="${user.id}">${communityAvatar(user, "following-user-avatar")}<div><strong>${escapeHtml(user.name || "壳友")}${platformAdminBadge(user)}</strong><span>${Number(user.postCount || 0)} 条动态 · ${Number(user.listingCount || 0)} 件在售</span></div><b>›</b></button>`).join("") || `<div class="empty small-empty"><div><strong>${followingLoading ? "正在加载关注" : "还没有关注壳友"}</strong><br>可以在壳友圈或商品详情中关注对方</div></div>`}
      </section>
    </main>
    ${bottomNav()}
  `;
}

function pageFollowingProfile() {
  const user = (state.communityFollowingUsers || []).find(item => item.id === state.selectedFollowingUserId);
  const posts = (state.communityFollowingPosts || []).filter(item => item.authorId === state.selectedFollowingUserId);
  const listings = (state.communityFollowingListings || []).filter(item => item.sellerId === state.selectedFollowingUserId);
  const activeTab = state.profileContentTab === "listings" ? "listings" : "posts";
  if (!user) return `${topbar("关注详情", true)}<main class="content page-fresh"><div class="empty"><strong>没有找到这位壳友</strong></div></main>${bottomNav()}`;
  return `
    ${topbar(user.name || "关注详情", true)}
    <main class="content page-fresh following-profile-page">
      <section class="following-profile-head fresh-card">${communityAvatar(user, "following-profile-avatar")}<div><h2>${escapeHtml(user.name || "壳友")}${platformAdminBadge(user)}</h2><p>${posts.length} 条动态 · ${listings.length} 件在售商品</p></div><button class="active" type="button" data-toggle-community-follow="${user.id}">已关注</button></section>
      ${profileContentTabs(posts.length, listings.length, activeTab)}
      <section class="profile-content-panel ${activeTab === "posts" ? "is-posts" : "is-listings"}">${activeTab === "posts"
        ? `<section class="community-feed following-posts">${posts.map(item => communityFeedCard(item, { allowDetail: true })).join("") || `<div class="empty small-empty"><div><strong>暂时没有动态</strong></div></div>`}</section>`
        : `<section class="market-grid following-market-grid">${listings.map(marketListingCard).join("") || `<div class="empty small-empty"><div><strong>暂时没有在售商品</strong></div></div>`}</section>`}</section>
    </main>
    ${bottomNav()}
  `;
}

function profileContentTabs(postCount, listingCount, activeTab) {
  return `
    <section class="profile-content-tabs" role="tablist" aria-label="用户主页内容">
      <button class="${activeTab === "posts" ? "active" : ""}" type="button" role="tab" aria-selected="${activeTab === "posts"}" data-profile-content-tab="posts"><strong>壳友圈</strong><span>${postCount} 条动态</span></button>
      <button class="${activeTab === "listings" ? "active" : ""}" type="button" role="tab" aria-selected="${activeTab === "listings"}" data-profile-content-tab="listings"><strong>出售商品</strong><span>${listingCount} 件在售</span></button>
    </section>
  `;
}

function pageCommunityProfile() {
  const user = state.selectedCommunityUser;
  const posts = state.communityUserPosts || [];
  const listings = state.communityUserListings || [];
  const activeTab = state.profileContentTab === "listings" ? "listings" : "posts";
  if (!user?.id) return `${topbar("壳友主页", true)}<main class="content page-fresh"><div class="empty"><strong>没有找到这位壳友</strong></div></main>${bottomNav()}`;
  return `
    ${topbar(user.name || "壳友主页", true)}
    <main class="content page-fresh following-profile-page community-profile-page">
      <section class="following-profile-head fresh-card">${communityAvatar(user, "following-profile-avatar")}<div><h2>${escapeHtml(user.name || "壳友")}${platformAdminBadge(user)}</h2><p>${Number(user.postCount ?? posts.length)} 条动态 · ${Number(user.listingCount ?? listings.length)} 件在售商品</p></div>${user.isOwn ? "" : `<button class="${user.followed ? "active" : ""}" type="button" data-toggle-community-follow="${user.id}">${user.followed ? "已关注" : "关注"}</button>`}</section>
      ${profileContentTabs(posts.length, listings.length, activeTab)}
      <section class="profile-content-panel ${activeTab === "posts" ? "is-posts" : "is-listings"}">${activeTab === "posts"
        ? `<section class="community-feed following-posts">${posts.map(item => communityFeedCard(item, { allowDetail: true })).join("") || `<div class="empty small-empty"><div><strong>暂时没有动态</strong></div></div>`}</section>`
        : `<section class="market-grid following-market-grid">${listings.map(marketListingCard).join("") || `<div class="empty small-empty"><div><strong>暂时没有在售商品</strong></div></div>`}</section>`}</section>
    </main>
    ${bottomNav()}
  `;
}

function pageSavedMarket(title, ids, emptyTitle) {
  const listingsById = new Map((state.marketListings || []).map(item => [item.id, item]));
  const listings = (ids || []).map(id => listingsById.get(id)).filter(Boolean);
  return `
    ${topbar(title, true)}
    <main class="content page-fresh saved-market-page">
      <section class="market-grid">${listings.map(marketListingCard).join("") || `<div class="empty small-empty"><div><strong>${emptyTitle}</strong></div></div>`}</section>
    </main>
    ${bottomNav()}
  `;
}

function pageMarketFavorites() {
  return pageSavedMarket("我的收藏", state.marketFavoriteIds || [], "还没有收藏商品");
}

function pageMarketHistory() {
  return pageSavedMarket("历史浏览", state.marketHistoryIds || [], "还没有浏览记录");
}

function savedMarketListingIds() {
  if (state.page === "marketFavorites") return (state.marketFavoriteIds || []).slice(0, 500);
  if (["marketHistory", "marketDetail"].includes(state.page)) return (state.marketHistoryIds || []).slice(0, 100);
  return [];
}

function marketStageLabel(stage) {
  return ({ hatchling: "苗子", juvenile: "亚成", adult: "种龟" })[stage] || "未标注";
}

function marketListingPhoto(item) {
  return item.mediaItems?.[0]?.url || item.photoUrl || item.photo || defaultPhoto;
}

function marketListingMediaItems(item) {
  if (Array.isArray(item.mediaItems) && item.mediaItems.length) return item.mediaItems.slice(0, 9);
  const url = item.photoUrl || item.photo || "";
  return url ? [{ url, type: "image" }] : [];
}

function marketDraftMediaMarkup() {
  const mediaItems = Array.isArray(state.marketDraftMedia) ? state.marketDraftMedia : [];
  return `${mediaItems.map((item, index) => `
    <div class="market-media-item" draggable="true" data-market-media-index="${index}">
      ${item.type === "video" ? `<video src="${item.dataUrl || item.url}"${videoPosterAttribute(item)} muted playsinline preload="auto" crossorigin="anonymous" data-video-first-frame></video><i>▶</i>` : `<img src="${item.dataUrl || item.url}" alt="实拍图 ${index + 1}">`}
      <div class="market-media-order-controls" aria-label="调整媒体顺序">
        <button type="button" data-move-market-media="${index}" data-market-media-direction="-1" aria-label="向前移动第 ${index + 1} 个媒体"${index === 0 ? " disabled" : ""}>‹</button>
        <button type="button" data-move-market-media="${index}" data-market-media-direction="1" aria-label="向后移动第 ${index + 1} 个媒体"${index === mediaItems.length - 1 ? " disabled" : ""}>›</button>
      </div>
      <button type="button" data-remove-market-media="${index}" aria-label="删除第 ${index + 1} 个媒体">×</button>
    </div>
  `).join("")}${mediaItems.length < 9 ? `<button class="market-media-add" type="button" data-market-media-button><b>＋</b><small>图片/视频</small></button>` : ""}`;
}

function marketTitleTemplates(species) {
  const name = String(species?.name || "").trim();
  if (!name) return [];
  return [
    `${name}诚意出售`,
    `自家饲养${name}，状态好`,
    `实拍${name}，欢迎交流`,
    `精品${name}在售`
  ];
}

function marketDescriptionTemplate(species) {
  const name = String(species?.name || "").trim();
  if (!name) return "";
  return `${name}，尺寸见图，状态好，吃食正常，健康没问题。调整龟池出，喜欢可以聊，细节私信`;
}

function renderMarketDescriptionTemplate(species) {
  const description = document.querySelector("[data-market-description]");
  const template = marketDescriptionTemplate(species);
  if (!description || !template) return;
  const previousTemplate = String(description.dataset.marketDescriptionTemplate || "");
  const currentText = String(description.value || "").trim();
  // 仅在说明为空或仍是上一版自动模板时更新，绝不覆盖用户自行填写的内容。
  if (!currentText || currentText === previousTemplate) description.value = template;
  description.dataset.marketDescriptionTemplate = template;
  state.marketDraftDescription = description.value;
  state.marketDraftDescriptionTemplate = template;
}

function marketSpeciesMatches(query) {
  const keyword = String(query || "").trim().toLowerCase();
  return speciesList
    .map(item => {
      const name = String(item.name || "").toLowerCase();
      const code = String(item.code || "").toLowerCase();
      let rank = 99;
      if (!keyword) rank = 4;
      else if (name.startsWith(keyword)) rank = 0;
      else if (code.startsWith(keyword)) rank = 1;
      else if (name.includes(keyword)) rank = 2;
      else if (code.includes(keyword)) rank = 3;
      return { item, rank };
    })
    .filter(entry => entry.rank < 99)
    .sort((left, right) => left.rank - right.rank || left.item.name.localeCompare(right.item.name, "zh-CN"))
    .slice(0, 30)
    .map(entry => entry.item);
}

function marketPublishSpeciesMatches(query) {
  return marketSpeciesMatches(query).filter(item => !isMarketProhibitedSpecies(item));
}

function bindMarketSearchSuggestions() {
  const form = document.querySelector("[data-market-search-form]");
  const input = form?.querySelector("[data-market-search]");
  const suggestions = document.querySelector("[data-market-search-suggestions]");
  if (!form || !input || !suggestions) return;
  let closeTimer = 0;

  const close = () => {
    suggestions.hidden = true;
    suggestions.innerHTML = "";
    input.setAttribute("aria-expanded", "false");
  };

  const searchSpecies = code => {
    const species = speciesByCode(code);
    if (!species) return;
    input.value = species.name;
    close();
    resetMarketFeed({ marketSearch: species.name });
  };

  const renderSuggestions = () => {
    const query = String(input.value || "").trim();
    const matches = query ? marketPublishSpeciesMatches(query).slice(0, 6) : [];
    if (!matches.length) {
      close();
      return;
    }
    suggestions.innerHTML = matches.map(species => `
      <button type="button" role="option" data-market-search-species="${escapeHtml(species.code)}">
        <strong>${escapeHtml(species.name)}</strong><small>${escapeHtml(species.code)} · 搜索该品种</small>
      </button>
    `).join("");
    suggestions.hidden = false;
    input.setAttribute("aria-expanded", "true");
    suggestions.querySelectorAll("[data-market-search-species]").forEach(button => {
      button.addEventListener("mousedown", event => event.preventDefault());
      button.addEventListener("click", () => searchSpecies(button.dataset.marketSearchSpecies));
    });
  };

  input.setAttribute("aria-expanded", "false");
  input.addEventListener("focus", () => {
    window.clearTimeout(closeTimer);
    renderSuggestions();
  });
  input.addEventListener("input", renderSuggestions);
  input.addEventListener("keydown", event => {
    if (event.key === "Escape") close();
  });
  input.addEventListener("blur", () => {
    closeTimer = window.setTimeout(close, 140);
  });
  form.addEventListener("submit", () => close());
}

function marketTitleTemplatesMarkup(species) {
  const templates = marketTitleTemplates(species);
  if (!templates.length) return "";
  return `<small>快捷模板</small><span>${templates.map((title, index) => `<button type="button" data-market-title-template="${index}" data-market-title-value="${escapeHtml(title)}">${escapeHtml(title)}</button>`).join("")}</span>`;
}

function renderMarketTitleTemplates(species, autoFill = false) {
  const titleInput = document.querySelector("[data-market-title]");
  const templates = marketTitleTemplates(species);
  const container = document.querySelector("[data-market-title-templates]");
  if (!titleInput || !container) return;
  container.innerHTML = marketTitleTemplatesMarkup(species);
  if (autoFill && templates[0]) titleInput.value = templates[0];
  container.querySelectorAll("[data-market-title-template]").forEach(button => {
    button.addEventListener("click", () => {
      titleInput.value = button.dataset.marketTitleValue || "";
      titleInput.focus();
    });
  });
}

function normalizeMarketListings(listings = []) {
  return listings.map(item => {
    const status = ["active", "inactive", "sold"].includes(item?.status) ? item.status : "active";
    return {
    ...item,
    status,
    price: Number(item.price || 0),
    viewCount: Math.max(0, Number(item.viewCount || 0)),
    wantCount: Math.max(0, Number(item.wantCount || 0)),
    photoUrl: item.photoUrl ? apiAssetUrl(item.photoUrl) : "",
    mediaItems: Array.isArray(item.mediaItems) ? item.mediaItems.slice(0, 9).map(media => ({
      ...media,
      url: media.url ? apiAssetUrl(media.url) : "",
      posterUrl: media.posterUrl || media.poster ? apiAssetUrl(media.posterUrl || media.poster) : ""
    })) : []
    };
  });
}

function isMarketFavorite(listingId) {
  return (state.marketFavoriteIds || []).includes(String(listingId || ""));
}

function marketFavoriteButton(item, className = "market-favorite-button") {
  const active = isMarketFavorite(item.id);
  return `<button class="${className} ${active ? "active" : ""}" type="button" data-market-favorite="${item.id}" aria-label="${active ? "取消收藏" : "收藏商品"}" aria-pressed="${active ? "true" : "false"}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"></path></svg></button>`;
}

function webNetworkConnectionType() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return String(connection?.type || "unknown").toLowerCase();
}

function shouldAutoplayMarketVideo() {
  // 仅当原生插件或浏览器明确报告 Wi-Fi 时才自动播放，未知网络一律按非 Wi-Fi 处理。
  const connectionType = marketNetworkType !== "unknown" ? marketNetworkType : webNetworkConnectionType();
  return connectionType === "wifi";
}

function syncMarketWifiVideos() {
  if (!shouldAutoplayMarketVideo()) return;
  document.querySelectorAll("[data-market-wifi-video]").forEach(video => {
    video.muted = true;
    video.defaultMuted = true;
    video.play().catch(() => {});
  });
}

function updateMarketNetworkType(status) {
  const nextType = String(status?.connectionType || "unknown").toLowerCase();
  if (nextType === marketNetworkType) return;
  marketNetworkType = nextType;
  if (state.page === "market") render();
}

function startMarketNetworkMonitoring() {
  if (marketNetworkMonitoringStarted) return;
  marketNetworkMonitoringStarted = true;

  const browserConnection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  browserConnection?.addEventListener?.("change", () => {
    if (marketNetworkType === "unknown" && state.page === "market") render();
  });

  const capacitor = window.Capacitor;
  const network = capacitor?.Plugins?.Network || capacitor?.registerPlugin?.("Network");
  if (!network?.getStatus) return;
  network.getStatus()
    .then(updateMarketNetworkType)
    .catch(() => {});
  network.addListener?.("networkStatusChange", updateMarketNetworkType)
    ?.catch?.(() => {});
}

function marketListingCard(item) {
  const unavailable = item.status !== "active";
  const firstMedia = marketListingMediaItems(item)[0];
  const wifiAutoplay = firstMedia?.type === "video" && shouldAutoplayMarketVideo();
  return `
    <article class="market-card-wrap">
    <button class="market-card ${unavailable ? "is-sold" : ""}" type="button" data-view-market="${item.id}">
      <span class="market-card-photo ${wifiAutoplay ? "wifi-video-autoplay" : ""}">
        ${firstMedia?.type === "video" ? `<video src="${firstMedia.url}"${videoPosterAttribute(firstMedia)} muted playsinline crossorigin="anonymous" data-video-first-frame ${wifiAutoplay ? "autoplay loop preload=\"auto\" data-market-wifi-video" : "preload=\"auto\""}></video>${wifiAutoplay ? "" : `<b class="market-video-mark">▶</b>`}` : `<img src="${marketListingPhoto(item)}" alt="${escapeHtml(item.title || item.speciesName || "在售乌龟")}" loading="lazy">`}
        ${unavailable ? `<i>已售出</i>` : item.negotiable ? `<i class="negotiable">可议价</i>` : ""}
      </span>
      <span class="market-card-body">
        <strong>${escapeHtml(item.title || `${item.speciesName || "乌龟"}在售`)}</strong>
        <small>${escapeHtml(item.speciesName || "品种未填写")} · ${marketStageLabel(item.stage)}${item.gender ? ` · ${escapeHtml(item.gender)}` : ""}</small>
        <span class="market-card-price"><b><i>¥</i>${money(item.price)}</b><small>${Math.max(0, Number(item.wantCount || 0))}人想要</small></span>
        <span class="market-card-seller">${marketSellerAvatar(item, "market-seller-avatar")}<i>${escapeHtml(item.sellerName || "壳友卖家")}${platformAdminBadge(item)}</i>${item.delivery ? `<b class="market-card-delivery">${escapeHtml(item.delivery)}</b>` : ""}<em>${escapeHtml(item.city || "全国")}</em></span>
      </span>
    </button>
    ${marketFavoriteButton(item)}
    </article>
  `;
}

const MARKET_PROVINCE_CITIES = {
  "北京市": ["北京市"], "天津市": ["天津市"], "上海市": ["上海市"], "重庆市": ["重庆市"],
  "河北省": ["石家庄市", "唐山市", "秦皇岛市", "邯郸市", "邢台市", "保定市", "张家口市", "承德市", "沧州市", "廊坊市", "衡水市"],
  "山西省": ["太原市", "大同市", "阳泉市", "长治市", "晋城市", "朔州市", "晋中市", "运城市", "忻州市", "临汾市", "吕梁市"],
  "内蒙古自治区": ["呼和浩特市", "包头市", "乌海市", "赤峰市", "通辽市", "鄂尔多斯市", "呼伦贝尔市", "巴彦淖尔市", "乌兰察布市", "兴安盟", "锡林郭勒盟", "阿拉善盟"],
  "辽宁省": ["沈阳市", "大连市", "鞍山市", "抚顺市", "本溪市", "丹东市", "锦州市", "营口市", "阜新市", "辽阳市", "盘锦市", "铁岭市", "朝阳市", "葫芦岛市"],
  "吉林省": ["长春市", "吉林市", "四平市", "辽源市", "通化市", "白山市", "松原市", "白城市", "延边州"],
  "黑龙江省": ["哈尔滨市", "齐齐哈尔市", "鸡西市", "鹤岗市", "双鸭山市", "大庆市", "伊春市", "佳木斯市", "七台河市", "牡丹江市", "黑河市", "绥化市", "大兴安岭地区"],
  "江苏省": ["南京市", "无锡市", "徐州市", "常州市", "苏州市", "南通市", "连云港市", "淮安市", "盐城市", "扬州市", "镇江市", "泰州市", "宿迁市"],
  "浙江省": ["杭州市", "宁波市", "温州市", "嘉兴市", "湖州市", "绍兴市", "金华市", "衢州市", "舟山市", "台州市", "丽水市"],
  "安徽省": ["合肥市", "芜湖市", "蚌埠市", "淮南市", "马鞍山市", "淮北市", "铜陵市", "安庆市", "黄山市", "滁州市", "阜阳市", "宿州市", "六安市", "亳州市", "池州市", "宣城市"],
  "福建省": ["福州市", "厦门市", "莆田市", "三明市", "泉州市", "漳州市", "南平市", "龙岩市", "宁德市"],
  "江西省": ["南昌市", "景德镇市", "萍乡市", "九江市", "新余市", "鹰潭市", "赣州市", "吉安市", "宜春市", "抚州市", "上饶市"],
  "山东省": ["济南市", "青岛市", "淄博市", "枣庄市", "东营市", "烟台市", "潍坊市", "济宁市", "泰安市", "威海市", "日照市", "临沂市", "德州市", "聊城市", "滨州市", "菏泽市"],
  "河南省": ["郑州市", "开封市", "洛阳市", "平顶山市", "安阳市", "鹤壁市", "新乡市", "焦作市", "濮阳市", "许昌市", "漯河市", "三门峡市", "南阳市", "商丘市", "信阳市", "周口市", "驻马店市", "济源市"],
  "湖北省": ["武汉市", "黄石市", "十堰市", "宜昌市", "襄阳市", "鄂州市", "荆门市", "孝感市", "荆州市", "黄冈市", "咸宁市", "随州市", "恩施州", "仙桃市", "潜江市", "天门市", "神农架林区"],
  "湖南省": ["长沙市", "株洲市", "湘潭市", "衡阳市", "邵阳市", "岳阳市", "常德市", "张家界市", "益阳市", "郴州市", "永州市", "怀化市", "娄底市", "湘西州"],
  "广东省": ["广州市", "韶关市", "深圳市", "珠海市", "汕头市", "佛山市", "江门市", "湛江市", "茂名市", "肇庆市", "惠州市", "梅州市", "汕尾市", "河源市", "阳江市", "清远市", "东莞市", "中山市", "潮州市", "揭阳市", "云浮市"],
  "广西壮族自治区": ["南宁市", "柳州市", "桂林市", "梧州市", "北海市", "防城港市", "钦州市", "贵港市", "玉林市", "百色市", "贺州市", "河池市", "来宾市", "崇左市"],
  "海南省": ["海口市", "三亚市", "三沙市", "儋州市"], "四川省": ["成都市", "自贡市", "攀枝花市", "泸州市", "德阳市", "绵阳市", "广元市", "遂宁市", "内江市", "乐山市", "南充市", "眉山市", "宜宾市", "广安市", "达州市", "雅安市", "巴中市", "资阳市", "阿坝州", "甘孜州", "凉山州"],
  "贵州省": ["贵阳市", "六盘水市", "遵义市", "安顺市", "毕节市", "铜仁市", "黔西南州", "黔东南州", "黔南州"],
  "云南省": ["昆明市", "曲靖市", "玉溪市", "保山市", "昭通市", "丽江市", "普洱市", "临沧市", "楚雄州", "红河州", "文山州", "西双版纳州", "大理州", "德宏州", "怒江州", "迪庆州"],
  "西藏自治区": ["拉萨市", "日喀则市", "昌都市", "林芝市", "山南市", "那曲市", "阿里地区"],
  "陕西省": ["西安市", "铜川市", "宝鸡市", "咸阳市", "渭南市", "延安市", "汉中市", "榆林市", "安康市", "商洛市"],
  "甘肃省": ["兰州市", "嘉峪关市", "金昌市", "白银市", "天水市", "武威市", "张掖市", "平凉市", "酒泉市", "庆阳市", "定西市", "陇南市", "临夏州", "甘南州"],
  "青海省": ["西宁市", "海东市", "海北州", "黄南州", "海南州", "果洛州", "玉树州", "海西州"],
  "宁夏回族自治区": ["银川市", "石嘴山市", "吴忠市", "固原市", "中卫市"],
  "新疆维吾尔自治区": ["乌鲁木齐市", "克拉玛依市", "吐鲁番市", "哈密市", "昌吉州", "博尔塔拉州", "巴音郭楞州", "阿克苏地区", "克孜勒苏州", "喀什地区", "和田地区", "伊犁州", "塔城地区", "阿勒泰地区"],
  "香港特别行政区": ["香港特别行政区"], "澳门特别行政区": ["澳门特别行政区"], "台湾省": ["台北市", "高雄市", "台中市", "台南市", "新北市", "桃园市", "新竹市", "基隆市", "嘉义市"]
};

function marketProvinceForCity(value) {
  const city = String(value || "").trim();
  if (!city) return "";
  return Object.entries(MARKET_PROVINCE_CITIES).find(([province, cities]) => province === city || cities.includes(city))?.[0] || "";
}

function marketRegionCities(value = state.marketRegion) {
  const region = String(value || "");
  if (!region) return [];
  if (region.startsWith("province:")) return MARKET_PROVINCE_CITIES[region.slice(9)] || [];
  return region.startsWith("city:") ? [region.slice(5)] : [region];
}

function marketRegionLabel(value = state.marketRegion) {
  const region = String(value || "");
  if (region.startsWith("province:")) return region.slice(9);
  return region.startsWith("city:") ? region.slice(5) : region;
}

function marketRegionOptions(regions = []) {
  const city = String(state.marketSearchLocationCity || "").trim();
  const province = marketProvinceForCity(city);
  const cities = [...new Set([...(province ? MARKET_PROVINCE_CITIES[province] || [] : []), ...regions])].sort((left, right) => left.localeCompare(right, "zh-CN"));
  return { city, province, cities };
}

function marketListingTime(item = {}) {
  const time = Date.parse(item.refreshedAt || item.createdAt || "");
  return Number.isFinite(time) ? time : 0;
}

function marketSearchResultListings() {
  const keyword = String(state.marketSearch || "").trim().toLowerCase();
  const stage = state.marketStage || "all";
  const regionCities = marketRegionCities();
  const delivery = String(state.marketDelivery || "").trim();
  const freshAfter = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const listings = (state.marketListings || []).filter(item => {
    // The public market only contains listings currently for sale. Saved
    // history/chat references can coexist in local state, so treat the
    // client-side filter as the last line of defence against sold or offline
    // items flashing into the public grid before a remote refresh completes.
    if (item.status !== "active") return false;
    const matchesStage = stage === "all" || item.stage === stage;
    const haystack = `${item.title || ""} ${item.speciesName || ""} ${item.city || ""}`.toLowerCase();
    const matchesKeyword = !keyword || haystack.includes(keyword);
    const matchesRegion = !regionCities.length || regionCities.includes(String(item.city || "").trim());
    const matchesDelivery = !delivery || String(item.delivery || "") === delivery;
    const matchesFresh = !state.marketFreshOnly || marketListingTime(item) >= freshAfter;
    return matchesStage && matchesKeyword && matchesRegion && matchesDelivery && matchesFresh;
  });
  return listings.sort((left, right) => {
    if (state.marketPriceOrder === "asc") return Number(left.price || 0) - Number(right.price || 0) || marketListingTime(right) - marketListingTime(left);
    if (state.marketPriceOrder === "desc") return Number(right.price || 0) - Number(left.price || 0) || marketListingTime(right) - marketListingTime(left);
    if (state.marketSort === "popular") return Number(right.wantCount || 0) - Number(left.wantCount || 0) || marketListingTime(right) - marketListingTime(left);
    return marketListingTime(right) - marketListingTime(left);
  });
}

function marketAssistControls(regions = []) {
  const sortLabel = state.marketSort === "popular" ? "热门" : state.marketSort === "latest" ? "最新" : "综合";
  const priceLabel = state.marketPriceOrder === "asc" ? "价格↑" : state.marketPriceOrder === "desc" ? "价格↓" : "价格";
  const hasMoreFilters = Boolean(state.marketDelivery || state.marketFreshOnly || state.marketRegion || state.marketPriceOrder);
  const deliveryOptions = ["", "可快递", "仅自提", "可面交"];
  const region = marketRegionOptions(regions);
  const panel = state.marketAssistMenu === "sort"
    ? `<section class="market-assist-panel" aria-label="综合排序"><button class="${state.marketSort === "comprehensive" ? "active" : ""}" type="button" data-market-sort="comprehensive">综合排序</button><button class="${state.marketSort === "latest" ? "active" : ""}" type="button" data-market-sort="latest">最新发布</button><button class="${state.marketSort === "popular" ? "active" : ""}" type="button" data-market-sort="popular">最受关注</button></section>`
    : state.marketAssistMenu === "region"
      ? `<section class="market-assist-panel market-region-panel" aria-label="区域筛选"><header><strong>${region.city ? `当前定位：${escapeHtml(region.city)}` : state.marketSearchLocationStatus === "loading" ? "正在定位…" : "定位后可优先查看本省"}</strong>${region.province ? `<small>${escapeHtml(region.province)}</small>` : ""}</header><div><button class="${!state.marketRegion ? "active" : ""}" type="button" data-market-region="">全国</button>${region.province ? `<button class="${state.marketRegion === `province:${region.province}` ? "active" : ""}" type="button" data-market-region="province:${escapeHtml(region.province)}">${escapeHtml(region.province)}</button>` : ""}${region.cities.map(city => `<button class="${state.marketRegion === `city:${city}` ? "active" : ""}" type="button" data-market-region="city:${escapeHtml(city)}">${escapeHtml(city)}</button>`).join("") || `<p>暂时没有可选城市</p>`}</div></section>`
      : state.marketAssistMenu === "filter"
        ? `<section class="market-assist-panel market-filter-panel" aria-label="更多筛选"><div><span>交付方式</span>${deliveryOptions.map(value => `<button class="${state.marketDelivery === value ? "active" : ""}" type="button" data-market-delivery="${escapeHtml(value)}">${value || "全部"}</button>`).join("")}</div><button class="market-filter-reset" type="button" data-market-filter-reset>重置筛选</button></section>`
        : "";
  return `
    <div class="market-assist-wrap">
      <section class="market-assist-bar" aria-label="辅助搜索">
        <button class="${state.marketAssistMenu === "sort" ? "active" : ""}" type="button" data-market-assist-menu="sort">${sortLabel}<i>⌄</i></button>
        <button class="${state.marketPriceOrder ? "active" : ""}" type="button" data-market-price-order>${priceLabel}</button>
        <button class="${state.marketFreshOnly ? "active" : ""}" type="button" data-market-fresh>新发</button>
        <button class="${state.marketAssistMenu === "region" || state.marketRegion ? "active" : ""}" type="button" data-market-assist-menu="region">${escapeHtml(marketRegionLabel() || "区域")}<i>⌄</i></button>
        <button class="${state.marketAssistMenu === "filter" || hasMoreFilters ? "active" : ""}" type="button" data-market-assist-menu="filter">筛选</button>
      </section>
      ${panel}
    </div>
  `;
}

function marketPublishProgressMarkup() {
  if (!marketPublishProgress.active) return "";
  const total = Math.max(0, Number(marketPublishProgress.total) || 0);
  const current = Math.min(total, Math.max(0, Number(marketPublishProgress.current) || 0));
  return `
    <aside class="market-publish-progress" data-market-publish-progress role="status" aria-live="polite" aria-atomic="true">
      <i class="market-publish-progress-spinner" aria-hidden="true"></i>
      <div class="market-publish-progress-copy">
        <strong>商品发布中</strong>
        <span data-market-publish-progress-stage>${escapeHtml(marketPublishProgress.stage || "正在准备上传…")}</span>
      </div>
      ${total ? `<b data-market-publish-progress-count>${current}/${total}</b>` : ""}
    </aside>
  `;
}

function updateMarketPublishProgress(patch = {}) {
  marketPublishProgress = { ...marketPublishProgress, ...patch, active: true };
  const card = document.querySelector("[data-market-publish-progress]");
  if (!card) return;
  const stage = card.querySelector("[data-market-publish-progress-stage]");
  if (stage) stage.textContent = marketPublishProgress.stage || "正在准备上传…";
  const count = card.querySelector("[data-market-publish-progress-count]");
  const total = Math.max(0, Number(marketPublishProgress.total) || 0);
  if (count && total) {
    const current = Math.min(total, Math.max(0, Number(marketPublishProgress.current) || 0));
    count.textContent = `${current}/${total}`;
  }
}

function clearMarketPublishProgress() {
  marketPublishProgress = { active: false, current: 0, total: 0, stage: "" };
  document.querySelector("[data-market-publish-progress]")?.remove();
}

function pageMarket() {
  const keyword = String(state.marketSearch || "").trim().toLowerCase();
  const stage = state.marketStage || "all";
  const listings = marketSearchResultListings();
  const regions = [...new Set((state.marketListings || []).map(item => String(item.city || "").trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, "zh-CN"));
  const showAssistSearch = Boolean(keyword || state.marketPriceOrder || state.marketFreshOnly || state.marketRegion || state.marketDelivery);
  const marketRequiresLogin = !state.loggedInPhone;
  const marketInitialLoading = Boolean(!marketRequiresLogin && CONFIGURED_SMS_BACKEND && !state.marketFeedInitialized && !listings.length);
  const marketEmptyMarkup = marketRequiresLogin
    ? ""
    : `<div class="market-empty"><span>龟</span><strong>${keyword || stage !== "all" ? "没有找到合适的商品" : "龟集市还没有商品"}</strong><p>从自己的乌龟档案一键发布，尺寸和状态会自动带入。</p><button type="button" data-page="marketAdd">发布第一只</button></div>`;
  return `
    ${marketPublishProgressMarkup()}
    ${topbar("龟集市", false, `<button class="market-top-add" type="button" data-page="marketAdd" aria-label="发布出售">＋</button>`, `<button class="market-top-service" type="button" data-market-top-service aria-label="联系平台客服"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 13.2v-1.1a7.5 7.5 0 0 1 15 0v1.1"></path><path d="M4.5 12.6H3.8a1.8 1.8 0 0 0-1.8 1.8v2.1a1.8 1.8 0 0 0 1.8 1.8h1.7v-5.7ZM19.5 12.6h.7a1.8 1.8 0 0 1 1.8 1.8v2.1a1.8 1.8 0 0 1-1.8 1.8h-1.7v-5.7ZM19.5 18.1c0 1.3-1.2 2.4-2.7 2.4h-1.5"></path><path d="M13.2 20.5h2.4"></path></svg></button>`)}
    <main class="content page-fresh market-page">
      <div class="market-search-area">
        <form class="market-search-wrap" role="search" data-market-search-form>
          <input type="search" name="keyword" value="${escapeHtml(state.marketSearch || "")}" placeholder="搜索品种、标题或城市" aria-label="搜索龟集市商品" autocomplete="off" data-market-search>
          <button type="submit" aria-label="查找">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"></circle><path d="m15.5 15.5 4.2 4.2"></path></svg>
          </button>
        </form>
        <div class="market-search-suggestions" role="listbox" aria-label="品种搜索建议" hidden data-market-search-suggestions></div>
      </div>
      <section class="market-promise-strip">
        <span><b>实拍</b> 一龟一图</span><span><b>直聊</b> 买卖双方沟通</span><span><b>透明</b> 状态尺寸清晰</span>
      </section>
      ${showAssistSearch ? marketAssistControls(regions) : ""}
      <section class="market-stage-tabs">
        ${[["all", "全部"], ["hatchling", "苗子"], ["juvenile", "亚成"], ["adult", "种龟"]].map(([value, label]) => `<button class="${stage === value ? "active" : ""}" type="button" data-market-stage="${value}">${label}</button>`).join("")}
      </section>
      <section class="market-grid ${marketInitialLoading ? "is-initial-loading" : ""}">
        ${marketInitialLoading ? `<div class="market-feed-initial-loading" role="status" aria-live="polite"><i aria-hidden="true"></i><span>正在加载商品…</span></div>` : ""}
        ${listings.map(marketListingCard).join("") || marketEmptyMarkup}
      </section>
      ${listings.length ? `<div class="market-feed-status" data-market-load-sentinel>${state.marketFeedLoadingMore ? "正在加载更多商品…" : state.marketFeedHasMore ? "继续上滑，加载更多" : "已经到底了"}</div>` : ""}
    </main>
    ${guestLoginSlot()}
    <button class="market-floating-add" type="button" data-page="marketAdd"><span>＋</span>发布出售</button>
    ${bottomNav()}
  `;
}

const MARKET_REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function marketRefreshMeta(item = {}) {
  const refreshedAt = Date.parse(item.refreshedAt || item.createdAt || "");
  const elapsed = Number.isFinite(refreshedAt) ? Math.max(0, Date.now() - refreshedAt) : MARKET_REFRESH_WINDOW_MS;
  const remainingDays = Math.max(0, Math.ceil((MARKET_REFRESH_WINDOW_MS - elapsed) / (24 * 60 * 60 * 1000)));
  if (item.status === "inactive") return { label: "已下架", hint: "超过 7 天未刷新，已自动下架" };
  return { label: "已发布", hint: `距自动下架还有 ${remainingDays} 天` };
}

function myMarketListingRow(item) {
  const media = marketListingMediaItems(item)[0];
  const meta = marketRefreshMeta(item);
  const preview = media?.type === "video"
    ? `<span class="my-market-media is-video"><video src="${media.url}" muted playsinline preload="metadata"></video><i>▶</i></span>`
    : `<span class="my-market-media"><img src="${marketListingPhoto(item)}" alt="${escapeHtml(item.title || "出售乌龟")}"></span>`;
  return `
    <article class="my-market-listing fresh-card ${item.status === "inactive" ? "is-inactive" : ""}">
      ${preview}
      <div class="my-market-listing-main">
        <div><strong>${escapeHtml(item.title || `${item.speciesName || "乌龟"}在售`)}</strong><em>${meta.label}</em></div>
        <span>${escapeHtml(item.speciesName || "品种未填写")} · ${marketStageLabel(item.stage)}</span>
        <b><i>¥</i>${money(item.price)}</b>
        <small>${meta.hint}</small>
      </div>
      <div class="my-market-listing-actions ${item.status === "active" ? "has-offline" : ""}">
        <button type="button" data-edit-market-listing="${item.id}">编辑</button>
        <button class="refresh" type="button" data-refresh-market-listing="${item.id}">${item.status === "inactive" ? "重新上架" : "刷新"}</button>
        ${item.status === "active" ? `<button class="offline" type="button" data-offline-market-listing="${item.id}">下架</button>` : ""}
      </div>
    </article>
  `;
}

function pageMyMarketListings() {
  const tab = state.marketMyTab === "inactive" ? "inactive" : "active";
  const all = state.myMarketListings || [];
  const activeCount = all.filter(item => item.status === "active").length;
  const inactiveCount = all.filter(item => item.status === "inactive").length;
  const listings = all.filter(item => tab === "active" ? item.status === "active" : item.status === "inactive");
  return `
    ${topbar("我的发布", true, `<button class="market-top-add" type="button" data-page="marketAdd" aria-label="发布出售">＋</button>`)}
    <main class="content page-fresh my-market-page">
      <section class="my-market-notice"><strong>发布后请记得刷新</strong><p>商品超过 7 天未刷新将自动下架，刷新后重新计算展示时间。</p></section>
      <section class="my-market-tabs">
        <button class="${tab === "active" ? "active" : ""}" type="button" data-my-market-tab="active">已发布 <b>${activeCount}</b></button>
        <button class="${tab === "inactive" ? "active" : ""}" type="button" data-my-market-tab="inactive">已下架 <b>${inactiveCount}</b></button>
      </section>
      <section class="my-market-list">${listings.map(myMarketListingRow).join("") || `<div class="market-empty"><span>龟</span><strong>${tab === "active" ? "还没有已发布的商品" : "没有已下架的商品"}</strong><p>${tab === "active" ? "发布出售后会显示在这里。" : "超过 7 天未刷新时，商品会自动移动到这里。"}</p>${tab === "active" ? `<button type="button" data-page="marketAdd">发布出售</button>` : ""}</div>`}</section>
    </main>
    ${bottomNav()}
  `;
}

function pageMarketAdd() {
  const editingListing = state.editingMarketListingId
    ? ((state.myMarketListings || []).find(item => item.id === state.editingMarketListingId) || (state.marketListings || []).find(item => item.id === state.editingMarketListingId))
    : null;
  const turtle = (state.turtles || []).find(item => item.id === (state.marketDraftTurtleId || editingListing?.turtleId));
  const activeTurtles = (state.turtles || []).filter(item => item.status !== "已转让" && item.status !== "已死亡");
  if (!(state.marketDraftMedia || []).length && editingListing) state.marketDraftMedia = marketListingMediaItems(editingListing).map(media => ({ dataUrl: media.url, posterUrl: media.posterUrl || "", type: media.type || "image" }));
  if (!(state.marketDraftMedia || []).length && turtle?.photo) state.marketDraftMedia = [{ dataUrl: turtle.photo, type: "image" }];
  const turtleSpeciesCode = editingListing?.speciesCode || turtle?.speciesCode || speciesList.find(item => item.name === turtle?.speciesName)?.code || "";
  const turtleSpecies = speciesByCode(turtleSpeciesCode);
  const speciesSearchValue = turtleSpecies ? `${turtleSpecies.code} · ${turtleSpecies.name}` : "";
  const speciesPolicyHint = turtleSpecies && isMarketProhibitedSpecies(turtleSpecies)
    ? `<p class="market-species-policy-hint">${marketSpeciesRestrictionMessage()}</p>`
    : "";
  const titleValue = editingListing?.title || (turtle ? `${turtle.code || turtle.speciesName || "乌龟"}诚意出售` : "");
  const formValue = (field, turtleField = field) => editingListing?.[field] ?? turtle?.[turtleField] ?? "";
  const descriptionValue = editingListing ? (editingListing.description || "") : (state.marketDraftDescription || "");
  const descriptionTemplate = editingListing ? "" : (state.marketDraftDescriptionTemplate || "");
  const mediaCount = Array.isArray(state.marketDraftMedia) ? state.marketDraftMedia.length : 0;
  return `
    ${topbar(editingListing ? "编辑出售" : "发布出售", true)}
    <main class="content page-fresh market-publish-page">
      <form id="marketListingForm" class="market-publish-form">
        <section class="market-form-card market-source-card">
          <div class="market-form-heading"><b>从档案带入</b><small>减少重复填写，数据更可信</small></div>
          <select class="select" name="turtleId" data-market-turtle-source>
            <option value="">不关联档案，从品种库选择</option>
            ${activeTurtles.map(item => `<option value="${item.id}" ${(state.marketDraftTurtleId || editingListing?.turtleId) === item.id ? "selected" : ""}>${escapeHtml(item.code || "未命名")} · ${escapeHtml(item.speciesName || "未知品种")}</option>`).join("")}
          </select>
        </section>
        <section class="market-form-card market-media-card">
          <div class="market-form-heading"><b>实拍图片或视频</b><small>${mediaCount}/9</small></div>
          <div class="market-media-grid" data-market-media-grid>${marketDraftMediaMarkup()}</div>
          <input class="hidden-file" type="file" accept="image/*,video/*" multiple data-market-media-input>
          <p>点击“图片/视频”从系统相册多选；第一项会作为展示首图，最多 9 项。视频仅允许 30 秒以内，超时视频不会加入商品。</p>
        </section>
        <section class="market-form-card market-fields-card">
          <div class="market-field-group"><span>品种<i class="required-mark" aria-hidden="true">*</i></span><div class="market-species-picker" data-market-species-picker>
            <div class="market-species-search-row">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"></circle><path d="m15.5 15.5 4.2 4.2"></path></svg>
              <input type="search" value="${escapeHtml(speciesSearchValue)}" placeholder="输入品种名称或代码" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="marketSpeciesOptions" data-market-species-search>
              <button type="button" aria-label="展开品种选项" data-market-species-toggle>⌄</button>
            </div>
            <input type="hidden" name="speciesCode" value="${escapeHtml(turtleSpeciesCode)}" data-market-species-value>
            <div class="market-species-options" id="marketSpeciesOptions" role="listbox" hidden data-market-species-options></div>
            ${speciesPolicyHint}
          </div></div>
          <label class="market-title-field"><span>出售标题<i class="required-mark" aria-hidden="true">*</i></span><input class="field" name="title" maxlength="40" value="${escapeHtml(titleValue)}" placeholder="选择品种后自动生成，可自行修改" data-market-title required><div class="market-title-templates" data-market-title-templates>${marketTitleTemplatesMarkup(turtleSpecies)}</div></label>
          <div class="market-form-two">
            <label><span>阶段<i class="required-mark" aria-hidden="true">*</i></span><select class="select" name="stage" required><option value="" ${!formValue("stage") ? "selected" : ""} disabled>请选择阶段</option><option value="hatchling" ${formValue("stage") === "hatchling" ? "selected" : ""}>苗子</option><option value="juvenile" ${formValue("stage") === "juvenile" ? "selected" : ""}>亚成</option><option value="adult" ${formValue("stage") === "adult" ? "selected" : ""}>种龟</option></select></label>
            <label><span>性别</span><select class="select" name="gender"><option value="未知" ${formValue("gender") === "未知" || !formValue("gender") ? "selected" : ""}>未知</option><option value="公" ${formValue("gender") === "公" ? "selected" : ""}>公</option><option value="母" ${formValue("gender") === "母" ? "selected" : ""}>母</option></select></label>
            <label><span>背甲长度<i class="required-mark" aria-hidden="true">*</i></span><input class="field" name="shellLength" type="number" min="0.1" step="0.1" value="${escapeHtml(formValue("shellLength", "carapaceLength"))}" placeholder="cm" required></label>
            <label><span>当前克重</span><input class="field" name="weight" type="number" min="0" step="0.1" value="${escapeHtml(formValue("weight"))}" placeholder="g"></label>
          </div>
          <label><span>出售价格</span><div class="market-price-input"><b>¥</b><input name="price" type="number" min="0" step="0.01" value="${escapeHtml(editingListing?.price ?? "")}" placeholder="0.00" required></div></label>
          <label class="market-check"><input name="negotiable" type="checkbox" ${editingListing?.negotiable ? "checked" : ""}><span>接受合理议价</span></label>
          <div class="market-form-two market-city-delivery-row">
            <div class="market-city-field">
              <div class="market-city-label"><span>所在城市<i class="required-mark" aria-hidden="true">*</i></span><button type="button" data-market-city-locate>⌖ 定位</button></div>
              <input class="field" name="city" maxlength="24" value="${escapeHtml(state.marketDraftCity || "")}" placeholder="请先允许定位" data-market-city readonly required aria-describedby="marketCityHint">
              <small id="marketCityHint" data-market-city-hint>城市仅能由当前位置自动获取，不能手动填写</small>
            </div>
            <label class="market-delivery-field"><span>交付方式<i class="required-mark" aria-hidden="true">*</i></span><select class="select" name="delivery" required><option value="" ${!formValue("delivery") ? "selected" : ""} disabled>请选择方式</option><option value="可快递" ${formValue("delivery") === "可快递" ? "selected" : ""}>可快递</option><option value="仅自提" ${formValue("delivery") === "仅自提" ? "selected" : ""}>仅自提</option><option value="可面交" ${formValue("delivery") === "可面交" ? "selected" : ""}>可面交</option></select><small aria-hidden="true">&nbsp;</small></label>
          </div>
          <label><span>详细说明<i class="required-mark" aria-hidden="true">*</i></span><textarea name="description" maxlength="600" placeholder="可填写开食情况、饲养环境、健康状态及转让原因" data-market-description data-market-description-template="${escapeHtml(descriptionTemplate)}" required>${escapeHtml(descriptionValue)}</textarea></label>
        </section>
        <section class="market-safe-note"><b>交易提示</b><p>发布前请如实描述健康状态；交易前充分沟通并核对实物，不要脱离双方确认的联系方式盲目付款。</p></section>
        <button class="market-publish-submit" type="submit">${editingListing ? "保存并刷新" : "确认发布"}</button>
      </form>
    </main>
  `;
}

function pageMarketDetail() {
  const item = (state.marketListings || []).find(listing => listing.id === state.selectedMarketListingId);
  if (!item) {
    const openingSharedListing = incomingMarketShareLoading
      && incomingMarketShareListingId === String(state.selectedMarketListingId || "");
    return `${topbar("商品详情", true)}<main class="content page-fresh market-detail-page"><div class="empty"><strong>${openingSharedListing ? "正在打开商品…" : "商品已下架"}</strong>${openingSharedListing ? "<br>正在读取商品信息" : ""}</div></main>`;
  }
  const isOwn = Boolean(item.isOwn || item.pendingLocal);
  const canDelete = isOwn || state.isCommunityAdmin;
  const sold = item.status === "sold";
  const mediaItems = marketListingMediaItems(item);
  const firstMediaIsVideo = mediaItems[0]?.type === "video";
  const primaryMediaItems = firstMediaIsVideo ? mediaItems.slice(0, 1) : mediaItems.filter(media => media.type !== "video");
  const secondaryMediaItems = firstMediaIsVideo ? mediaItems.slice(1) : [];
  const detailVideosAfterDescription = firstMediaIsVideo ? [] : mediaItems.filter(media => media.type === "video");
  const hasPrimaryGalleryControls = primaryMediaItems.length > 1;
  const detailVideoFallbackPoster = mediaItems.find(media => media.type !== "video" && media.url)?.url || defaultPhoto;
  const detailMoreAction = `<button class="market-detail-more-button" type="button" data-market-detail-more="${escapeHtml(item.id)}" aria-label="商品更多操作" aria-haspopup="dialog">•••</button>`;
  return `
    ${topbar("商品详情", true, detailMoreAction)}
    <main class="content page-fresh market-detail-page">
      <section class="market-detail-gallery-wrap">
      <section class="market-detail-gallery" id="marketDetailGallery" data-market-detail-gallery><div class="market-detail-gallery-track" data-market-detail-gallery-track>${primaryMediaItems.length ? primaryMediaItems.map((media, index) => media.type === "video" ? marketDetailVideoMarkup(media, detailVideoFallbackPoster, sold, index === 0) : `<div class="market-detail-photo"><img src="${media.url}" alt="${escapeHtml(item.title || "出售乌龟")} ${index + 1}" data-preview-market-image tabindex="0" role="button" draggable="false" decoding="async" fetchpriority="${index < 2 ? "high" : "auto"}">${sold ? `<span>已售出</span>` : ""}</div>`).join("") : `<div class="market-detail-photo"><img src="${defaultPhoto}" alt="暂无实拍图" data-preview-market-image tabindex="0" role="button" draggable="false" decoding="async">${sold ? `<span>已售出</span>` : ""}</div>`}</div></section>
        <span class="market-detail-edge-back-zone" aria-hidden="true"></span>
        <span class="market-detail-gallery-count" data-market-gallery-count aria-live="polite">1/${Math.max(1, primaryMediaItems.length)}</span>
        ${hasPrimaryGalleryControls ? `<button class="market-detail-gallery-arrow prev" type="button" data-market-gallery-prev aria-label="查看上一张图片" aria-controls="marketDetailGallery">‹</button><button class="market-detail-gallery-arrow next" type="button" data-market-gallery-next aria-label="查看下一张图片" aria-controls="marketDetailGallery">›</button>` : ""}
      </section>
      <section class="market-detail-main">
        <div class="market-detail-price"><strong><i>¥</i>${money(item.price)}</strong>${item.negotiable ? `<span>可议价</span>` : ""}</div>
        <h2>${escapeHtml(item.title || `${item.speciesName || "乌龟"}在售`)}</h2>
        <p>${escapeHtml(item.speciesName || "品种未填写")} · ${marketStageLabel(item.stage)} · ${escapeHtml(item.gender || "性别未知")}</p>
        <div class="market-detail-stats"><span>曝光 ${Math.max(0, Number(item.viewCount || 0))} 次</span><i></i><span><b>${Math.max(0, Number(item.wantCount || 0))}</b> 人想要</span></div>
      </section>
      <section class="market-detail-specs">
        <div><span>当前克重</span><strong>${item.weight ? `${escapeHtml(item.weight)}g` : "未填写"}</strong></div>
        <div><span>背甲长度</span><strong>${item.shellLength ? `${escapeHtml(item.shellLength)}cm` : "未填写"}</strong></div>
        <div><span>所在城市</span><strong>${escapeHtml(item.city || "未填写")}</strong></div>
        <div><span>交付方式</span><strong>${escapeHtml(item.delivery || "双方协商")}</strong></div>
      </section>
      ${secondaryMediaItems.length ? `<section class="market-detail-secondary-media">${secondaryMediaItems.map((media, index) => media.type === "video" ? marketDetailVideoMarkup(media, detailVideoFallbackPoster) : `<div class="market-detail-secondary-photo"><img src="${media.url}" alt="${escapeHtml(item.title || "出售乌龟")} 实拍 ${index + 2}" data-preview-market-image tabindex="0" role="button"></div>`).join("")}</section>` : ""}
      ${item.description ? `<section class="market-detail-description"><h3>卖家说明</h3><p>${escapeHtml(item.description)}</p></section>` : ""}
      ${detailVideosAfterDescription.length ? `<section class="market-detail-secondary-media market-detail-video-media">${detailVideosAfterDescription.map(media => marketDetailVideoMarkup(media, detailVideoFallbackPoster)).join("")}</section>` : ""}
      <section class="market-seller-card">
        <button class="market-seller-avatar-slot market-seller-profile-link" type="button" data-view-market-seller="${escapeHtml(item.sellerId || "")}" aria-label="查看${escapeHtml(item.sellerName || "卖家")}发布的商品">${marketSellerAvatar(item, "market-detail-avatar")}</button>
        <button class="market-seller-profile-link market-seller-name" type="button" data-view-market-seller="${escapeHtml(item.sellerId || "")}"><strong>${escapeHtml(item.sellerName || "壳友卖家")}${platformAdminBadge(item)}</strong><span>${isOwn ? "这是我发布的商品" : "已通过账号认证"}</span></button>
        ${isOwn ? "" : `<div class="market-seller-actions"><button class="${item.sellerFollowed ? "active" : ""}" type="button" data-toggle-community-follow="${item.sellerId}">${item.sellerFollowed ? "已关注" : "关注"}</button><button type="button" data-market-contact="${item.id}">聊一聊</button></div>`}
      </section>
      <section class="market-safe-note"><b>交易咨询</b><p>先看近期实拍或视频，再确认健康、尺寸与交付方式；如需购买，请联系平台客服并发送商品咨询码，活体运输责任以双方确认内容为准。</p></section>
    </main>
    <div class="market-detail-actions">
      ${marketFavoriteButton(item, "market-detail-favorite")}
      ${!isOwn ? `<button class="market-contact-action" type="button" data-market-contact="${item.id}">联系卖家</button>` : ""}
      ${isOwn ? `<button class="market-delete-action" type="button" data-delete-market="${item.id}">删除</button><button class="market-sold-action" type="button" data-market-sold="${item.id}">${sold ? "恢复在售" : "标记已售"}</button>` : canDelete ? `<button class="market-delete-action" type="button" data-delete-market="${item.id}">管理员删除</button>` : sold ? `<button class="market-sold-disabled" type="button" disabled>该商品已售出</button>` : `<button class="market-want-action" type="button" data-market-platform-service="${item.id}">联系平台客服</button>`}
    </div>
  `;
}

function pageMarketSeller() {
  const sellerId = String(state.selectedMarketSellerId || "");
  const sourceListing = (state.marketListings || []).find(item => String(item.sellerId || "") === sellerId)
    || (state.myMarketListings || []).find(item => String(item.sellerId || "") === sellerId);
  const seller = state.selectedMarketSeller || (sourceListing ? {
    id: sourceListing.sellerId,
    sellerName: sourceListing.sellerName,
    sellerAvatar: sourceListing.sellerAvatar,
    sellerIsAdmin: sourceListing.sellerIsAdmin,
    city: sourceListing.city,
    sellerFollowed: sourceListing.sellerFollowed
  } : null);
  if (!seller?.id) return `${topbar("卖家主页", true)}<main class="content page-fresh seller-store-page"><div class="empty"><strong>暂时无法找到这位卖家</strong></div></main>${bottomNav()}`;
  const listings = (state.marketListings || []).filter(item => String(item.sellerId || "") === String(seller.id) && item.status === "active");
  const isOwnSeller = String(seller.id) === String(state.loggedInPhone || "");
  return `
    ${topbar(seller.sellerName || "卖家主页", true)}
    <main class="content page-fresh seller-store-page">
      <section class="seller-store-head fresh-card">
        ${marketSellerAvatar(seller, "seller-store-avatar")}
        <div><h2>${escapeHtml(seller.sellerName || "壳友卖家")}${platformAdminBadge(seller)}</h2><p>${escapeHtml(seller.city || "全国")} · ${listings.length} 件在售商品</p></div>
        ${isOwnSeller ? "" : `<button class="${seller.sellerFollowed ? "active" : ""}" type="button" data-toggle-community-follow="${escapeHtml(seller.id)}">${seller.sellerFollowed ? "已关注" : "关注"}</button>`}
      </section>
      <section class="section-title seller-store-title"><span>全部在售商品</span><small>${listings.length} 件</small></section>
      <section class="market-grid seller-store-grid">${listings.map(marketListingCard).join("") || `<div class="empty small-empty"><div><strong>这位卖家暂时没有在售商品</strong></div></div>`}</section>
    </main>
    ${bottomNav()}
  `;
}

function pageHome() {
  const s = stats();
  return `
    ${topbar("壳友手账")}
    <main class="content home-redesign">
      <section class="home-hero">
        <div>
          <p class="eyebrow">我的饲养概览</p>
          <h2>${s.active} 只正在饲养</h2>
          <p>共 ${s.total} 只乌龟，覆盖 ${s.species} 个品种</p>
        </div>
        <button class="hero-add" data-page="add">+</button>
      </section>
      <section class="metric-strip">
        <div><strong>${s.total}</strong><span>总数量</span></div>
        <div><strong>${s.healthy}</strong><span>健康</span></div>
        <div><strong>${s.sick}</strong><span>生病</span></div>
        <div><strong>${s.species}</strong><span>品种</span></div>
      </section>
      <section class="action-panel care-action-panel home-module-panel">
        <button class="care-action home-module-action growth-action" data-page="growth"><span class="home-module-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18.5V5.5"></path><path d="M5 18.5h14"></path><path d="m8.5 14 3-3 2.6 1.7 3.4-4.3"></path><circle cx="8.5" cy="14" r=".7"></circle><circle cx="11.5" cy="11" r=".7"></circle><circle cx="14.1" cy="12.7" r=".7"></circle><circle cx="17.5" cy="8.4" r=".7"></circle></svg></span><strong>成长记录</strong><small>变化与趋势</small></button>
        <button class="care-action" data-page="memos"><span class="home-module-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 12.5 3.3 3.3 7.7-8.2"></path></svg></span><strong>护理</strong><small>备忘与提醒</small></button>
        <button class="care-action home-module-action breeding-action" data-page="breeding"><span class="home-module-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.7" r="4.7"></circle><circle cx="8.3" cy="14.1" r="4.7"></circle><circle cx="15.7" cy="14.1" r="4.7"></circle></svg></span><strong>繁殖</strong><small>产蛋、受精与孵化</small></button>
        <button class="care-action home-module-action pool-action" data-page="pools"><span class="home-module-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 8.3h15v9.2a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z"></path><path d="M4.5 11.6c2.1 1.4 4.2 1.4 6.3 0 2.1-1.4 4.2-1.4 6.3 0"></path><path d="M7.5 5.5h9"></path></svg></span><strong>龟池</strong><small>数量与尺寸</small></button>
      </section>
      ${archiveDashboardSection()}
    </main>
    ${bottomNav()}
  `;
}

function turtlePoolTypeLabel(type) {
  return ({ hatchling: "苗池", juvenile: "压成池", breeder: "种龟池" })[type] || "未填写类型";
}

function turtlePoolName(poolId) {
  return (state.turtlePools || []).find(pool => pool.id === poolId)?.name || "未关联";
}

function turtlePoolDimensions(pool = {}) {
  const values = [
    pool.length !== "" && pool.length !== undefined && `长 ${pool.length}`,
    pool.width !== "" && pool.width !== undefined && `宽 ${pool.width}`,
    pool.height !== "" && pool.height !== undefined && `高 ${pool.height}`
  ].filter(Boolean);
  return values.length ? `${values.join(" · ")} cm` : "未记录尺寸";
}

function turtlePoolRow(pool) {
  return `
    <article class="turtle-pool-row fresh-card" data-edit-turtle-pool="${pool.id}" role="button" tabindex="0">
      <div class="turtle-pool-row-head">
        <span class="turtle-pool-mark" aria-hidden="true">池</span>
        <div>
          <div class="turtle-pool-title"><strong>${escapeHtml(pool.name || "未命名龟池")}</strong><span>${turtlePoolTypeLabel(pool.type)}</span></div>
          <small>${escapeHtml(turtlePoolDimensions(pool))}</small>
        </div>
        <b>${Math.max(0, Number(pool.count || 0))}<em>只</em></b>
      </div>
      ${pool.note ? `<p>${escapeHtml(pool.note)}</p>` : ""}
    </article>
  `;
}

function pageTurtlePools() {
  const pools = state.turtlePools || [];
  const turtleCount = pools.reduce((sum, pool) => sum + Math.max(0, Number(pool.count || 0)), 0);
  return `
    ${topbar("龟池管理", true)}
    <main class="content page-fresh turtle-pools-page">
      <section class="page-intro compact-intro turtle-pools-intro">
        <div><p class="eyebrow dark">龟池</p><h2>${pools.length} 个龟池</h2><p>记录每个龟池的类型、尺寸、数量和日常备注。</p></div>
        <button class="round-action" type="button" data-page="poolAdd" aria-label="新增龟池">+</button>
      </section>
      <section class="turtle-pool-summary fresh-card">
        <div><strong>${pools.length}</strong><span>龟池数量</span></div>
        <div><strong>${turtleCount}</strong><span>记录饲养数量</span></div>
      </section>
      <section class="turtle-pool-list">
        ${pools.map(turtlePoolRow).join("") || `<div class="empty small-empty"><div><strong>还没有龟池</strong><br>点击右上角加号，先记录第一个龟池。</div></div>`}
      </section>
    </main>
    ${bottomNav()}
  `;
}

function pageTurtlePoolAdd() {
  const pool = (state.turtlePools || []).find(item => item.id === state.editingTurtlePoolId);
  const editing = Boolean(pool);
  return `
    ${topbar(editing ? "编辑龟池" : "新增龟池", true)}
    <main class="content page-fresh turtle-pool-add-page">
      <section class="page-intro compact-intro turtle-pools-intro">
        <div><p class="eyebrow dark">${editing ? "编辑" : "新增"}</p><h2>${editing ? escapeHtml(pool.name || "龟池") : "记录一个龟池"}</h2><p>名称和类型为必填信息，其余数据可随时补充。</p></div>
      </section>
      <form class="pool-form fresh-card" id="turtlePoolForm">
        <label><span>龟池名称<i class="required-mark" aria-hidden="true">*</i></span><input class="field" name="name" maxlength="24" value="${escapeHtml(pool?.name || "")}" placeholder="例如：南侧苗池" required></label>
        <section class="pool-type-field">
          <span>龟池类型<i class="required-mark" aria-hidden="true">*</i></span>
          <input type="hidden" name="type" value="${escapeHtml(pool?.type || "")}" required data-pool-type-value>
          <div class="pool-type-choices" role="group" aria-label="龟池类型">
            ${[["hatchling", "苗池"], ["juvenile", "压成池"], ["breeder", "种龟池"]].map(([value, label]) => `<button type="button" class="${pool?.type === value ? "active" : ""}" data-pool-type="${value}" aria-pressed="${pool?.type === value ? "true" : "false"}">${label}</button>`).join("")}
          </div>
        </section>
        <section class="pool-dimension-section">
          <small>单位 cm</small>
          <div class="pool-dimension-grid">
            <label><span>长</span><input class="field" name="length" type="number" min="0" step="0.1" value="${escapeHtml(pool?.length ?? "")}" placeholder="未填写"></label>
            <label><span>宽</span><input class="field" name="width" type="number" min="0" step="0.1" value="${escapeHtml(pool?.width ?? "")}" placeholder="未填写"></label>
            <label><span>高</span><input class="field" name="height" type="number" min="0" step="0.1" value="${escapeHtml(pool?.height ?? "")}" placeholder="未填写"></label>
          </div>
        </section>
        <label><span>数量</span><input class="field" name="count" type="number" min="0" step="1" value="${pool ? Math.max(0, Number(pool.count || 0)) : ""}" placeholder="例如：12"></label>
        <label class="pool-note"><span>备注</span><textarea name="note" maxlength="200" placeholder="可记录水温、位置、设备或其他说明">${escapeHtml(pool?.note || "")}</textarea></label>
        <button class="primary" type="submit">${editing ? "保存修改" : "添加龟池"}</button>
        ${editing ? `<button class="pool-delete-button" type="button" data-delete-turtle-pool="${pool.id}">删除此龟池</button>` : ""}
      </form>
    </main>
    ${bottomNav()}
  `;
}

function turtleCard(t) {
  return `
    <article class="home-turtle-card" data-view-turtle="${t.id}">
      <img class="turtle-photo" src="${t.photo || defaultPhoto}" alt="${t.speciesName}">
      <div>
        <strong>${t.code} · ${t.speciesName}</strong>
        <span>${t.gender} · ${t.acquiredDate || "未填写日期"}</span>
        <div class="home-turtle-meta"><span>${t.weight || "-"}g</span><span>背甲 ${t.carapaceLength || "-"}cm</span><span>${t.health}</span></div>
      </div>
    </article>
  `;
}

function sortedTurtles() {
  let list = [...state.turtles];
  if (state.turtleFilter !== "all") list = list.filter(t => t.speciesCode === state.turtleFilter);
  if (state.turtlePoolFilter === "unassigned") {
    list = list.filter(t => !t.poolId || !(state.turtlePools || []).some(pool => pool.id === t.poolId));
  } else if (state.turtlePoolFilter !== "all") {
    list = list.filter(t => t.poolId === state.turtlePoolFilter);
  }
  if (state.turtleSort === "latest") list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (state.turtleSort === "weight") list.sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0));
  if (state.turtleSort === "shellLength") list.sort((a, b) => Number(b.carapaceLength || 0) - Number(a.carapaceLength || 0));
  return list;
}

function archiveDashboardSection() {
  const speciesOptions = [...new Set(state.turtles.map(t => t.speciesCode))]
    .map(code => speciesByCode(code) || { code, name: code });
  const poolOptions = state.turtlePools || [];
  return `
    <section class="home-archive-section" data-turtle-reorder-list>
      <section class="filter-dock">
        <select class="select" data-filter-species>
          <option value="all">全部品种</option>
          ${speciesOptions.map(s => `<option value="${s.code}" ${state.turtleFilter === s.code ? "selected" : ""}>${s.name}</option>`).join("")}
        </select>
        <select class="select" data-filter-pool>
          <option value="all">全部龟池</option>
          <option value="unassigned" ${state.turtlePoolFilter === "unassigned" ? "selected" : ""}>未关联龟池</option>
          ${poolOptions.map(pool => `<option value="${pool.id}" ${state.turtlePoolFilter === pool.id ? "selected" : ""}>${escapeHtml(pool.name || "未命名龟池")}</option>`).join("")}
        </select>
        <select class="select" data-sort-turtles>
          <option value="default" ${state.turtleSort === "default" ? "selected" : ""}>默认排序</option>
          <option value="latest" ${state.turtleSort === "latest" ? "selected" : ""}>最新添加</option>
          <option value="weight" ${state.turtleSort === "weight" ? "selected" : ""}>克重排序</option>
          <option value="shellLength" ${state.turtleSort === "shellLength" ? "selected" : ""}>背甲长度排序</option>
        </select>
      </section>
      ${sortedTurtles().map(turtleListRow).join("") || `<div class="empty"><div><strong>还没有乌龟档案</strong><p>点击右上角加号，创建第一份档案。</p></div></div>`}
    </section>
  `;
}

function pageList() {
  return pageHome();
}

function turtleActionIcon(type) {
  return ({
    update: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8a7.5 7.5 0 1 0 .3 7.5"></path><path d="M19 4v4h-4"></path></svg>`,
    sold: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 8.5h15v11h-15z"></path><path d="M8 8.5V6.8a4 4 0 0 1 8 0v1.7"></path><path d="M9 13h6"></path></svg>`,
    loss: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"></circle><path d="M8.5 12h7"></path></svg>`,
    delete: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8h10l-.7 11H7.7L7 8Z"></path><path d="M5.5 8h13M9.5 8V5.5h5V8"></path></svg>`
  }[type] || "");
}

function turtleListRow(t) {
  const menuOpen = state.openTurtleMenuId === t.id;
  return `
    <article class="turtle-row fresh-card ${menuOpen ? "menu-open" : ""}" data-view-turtle="${t.id}" data-reorder-turtle="${t.id}">
      <img src="${t.photo || defaultPhoto}" alt="${t.speciesName}" draggable="false">
      <div class="turtle-row-content">
        <div class="turtle-row-title">
          <strong>${t.code}</strong>
          <span class="turtle-pool-title-meta">龟池 ${escapeHtml(turtlePoolName(t.poolId))}</span>
        </div>
        <div class="turtle-row-species">
          <p>${t.speciesName}</p>
          ${Number(t.price) > 0 ? `<span class="turtle-price">¥${money(t.price)}</span>` : ""}
        </div>
        <div class="turtle-row-meta">
          <span>${t.weight || "-"}g</span>
          <span>背甲 ${t.carapaceLength || "-"}cm</span>
        </div>
      </div>
      <button class="more-btn" data-toggle-turtle-menu="${t.id}" aria-label="档案操作" aria-expanded="${menuOpen ? "true" : "false"}"><span aria-hidden="true">•••</span></button>
      ${menuOpen ? `
        <div class="turtle-menu archive-turtle-menu" role="menu" aria-label="${escapeHtml(t.code || t.speciesName || "乌龟")}的档案操作">
          <button data-update-turtle="${t.id}" role="menuitem">${turtleActionIcon("update")}<span>更新</span></button>
          <button data-ledger-for-turtle="sold:${t.id}" role="menuitem">${turtleActionIcon("sold")}<span>售出</span></button>
          <button data-ledger-for-turtle="loss:${t.id}" role="menuitem">${turtleActionIcon("loss")}<span>损耗</span></button>
          <button class="danger-link" data-delete-turtle="${t.id}" role="menuitem">${turtleActionIcon("delete")}<span>删除</span></button>
        </div>
      ` : ""}
    </article>
  `;
}

function pageTurtleDetail() {
  const t = state.turtles.find(item => item.id === state.selectedTurtleId);
  if (!t) return `${topbar("档案详情", true)}<main class="content page-fresh"><div class="empty"><strong>没有找到这份档案</strong></div></main>${bottomNav()}`;
  const isEditing = state.updatingTurtleId === t.id;
  const speciesCode = isEditing ? (turtleDraftValue(t, "speciesCode") || t.speciesCode) : t.speciesCode;
  const species = speciesByCode(speciesCode) || speciesByCode(t.speciesCode) || { code: speciesCode, name: t.speciesName };
  const nickname = isEditing ? (turtleDraftValue(t, "code") || t.code) : t.code;
  const photo = isEditing && state.updateDraftPhoto === "__CLEAR__" ? defaultPhoto : (isEditing ? state.updateDraftPhoto : "") || t.photo || speciesPhoto(species) || defaultPhoto;
  // 档案详情是完整成长时间线，始终从第 1 次成长开始向下查看。
  const historyList = [...(t.measureHistory || [])].reverse();
  const menuOpen = state.openTurtleMenuId === t.id;
  return `
    ${topbar(isEditing ? "成长记录" : "档案详情", true)}
    <main class="content page-fresh">
      <section class="page-intro compact-intro detail-summary-card ${menuOpen ? "menu-open" : ""}">
        <div>
          <p class="eyebrow dark">明细</p>
          <h2>${nickname || "未命名档案"}</h2>
          <p>${species.name || t.speciesName} · ${turtleDraftValue(t, "status") || t.status} · ${turtleDraftValue(t, "health") || t.health}</p>
        </div>
        <button class="detail-more" data-toggle-turtle-menu="${t.id}" aria-label="档案操作" aria-expanded="${menuOpen ? "true" : "false"}"><span aria-hidden="true">•••</span></button>
        ${menuOpen ? `
          <div class="turtle-menu detail-menu detail-actions-menu" role="menu" aria-label="${escapeHtml(nickname || species.name || "乌龟")}的档案操作">
            <button data-update-turtle="${t.id}" role="menuitem">${turtleActionIcon("update")}<span>更新</span></button>
            <button data-ledger-for-turtle="sold:${t.id}" role="menuitem">${turtleActionIcon("sold")}<span>售出</span></button>
            <button data-ledger-for-turtle="loss:${t.id}" role="menuitem">${turtleActionIcon("loss")}<span>损耗</span></button>
            <button class="danger-link" data-delete-turtle="${t.id}" role="menuitem">${turtleActionIcon("delete")}<span>删除</span></button>
          </div>
        ` : ""}
      </section>
      ${isEditing ? `
      <form class="breeding-form fresh-card turtle-detail-edit-form" id="turtleDetailForm">
        <div class="photo-uploader breeding-photo-box">
          <img src="${photo}" alt="${species.name || t.speciesName}">
          <div>
            <button class="secondary" type="button" data-update-photo-button>龟龟最新照片</button>
            <button class="danger-link" type="button" data-clear-update-photo>清除图片</button>
          </div>
        </div>
        <input class="hidden-file" type="file" accept="image/*" lang="zh-CN" title="选择图片" aria-label="选择图片" data-update-photo-input>
        <div class="breeding-form-grid">
          <label><span>品种代码</span><select class="select" name="speciesCode" required>${speciesList.map(item => `<option value="${item.code}" ${item.code === speciesCode ? "selected" : ""}>${item.code} · ${item.name}</option>`).join("")}</select></label>
          <label><span>龟龟昵称</span><input class="field" name="code" value="${nickname || ""}" placeholder="例如：小核桃、黑豆、将军"></label>
          <label><span>龟池</span><select class="select" name="poolId"><option value="">暂不关联龟池</option>${(state.turtlePools || []).map(pool => `<option value="${pool.id}" ${turtleDraftValue(t, "poolId") === pool.id ? "selected" : ""}>${escapeHtml(pool.name || "未命名龟池")} · ${turtlePoolTypeLabel(pool.type)}</option>`).join("")}</select></label>
          <div class="detail-choice-row">
            <span>性别</span>
            <div>
              <input type="hidden" name="gender" value="${turtleDraftValue(t, "gender") || "未知"}">
              <div class="radio-row">
                ${["公", "母", "未知"].map(value => `<button class="choice ${turtleDraftValue(t, "gender") === value ? "active" : ""}" type="button" data-detail-choice="gender" data-choice-value="${value}">${value}</button>`).join("")}
              </div>
            </div>
          </div>
          <label><span>当前体重(g)</span><input class="field" name="weight" type="number" min="0" step="0.1" required value="${turtleDraftValue(t, "weight")}"></label>
          <label><span>背甲长度(cm)</span><input class="field" name="carapaceLength" type="number" min="0" step="0.1" required value="${turtleDraftValue(t, "carapaceLength")}"></label>
          <details class="measure-extra">
            <summary><span>更多体测数据</span><small>背甲宽度、背高、腹甲长度</small></summary>
            <label><span>背甲宽度(cm)</span><input class="field" name="carapaceWidth" type="number" min="0" step="0.1" value="${turtleDraftValue(t, "carapaceWidth")}"></label>
            <label><span>背高(cm)</span><input class="field" name="shellHeight" type="number" min="0" step="0.1" value="${turtleDraftValue(t, "shellHeight")}"></label>
            <label><span>腹甲长度(cm)</span><input class="field" name="plastronLength" type="number" min="0" step="0.1" value="${turtleDraftValue(t, "plastronLength")}"></label>
          </details>
        </div>
        <label class="breeding-note"><span>备注</span><textarea name="note" placeholder="性格、饮食、状态变化、到家表现等">${turtleDraftValue(t, "note") || ""}</textarea></label>
        <button class="primary" type="submit">保存修改</button>
      </form>
      ` : turtleReadOnlyDetail(t, species, photo)}
      <section class="section-title"><h3>成长记录</h3></section>
      ${historyList.map((h, index) => `
        <div class="growth-history-entry">
          <article class="history-card growth-history-card fresh-card">
            <div class="growth-history-head">
              <strong>第 ${index + 1} 次成长</strong>
              <small>${formatTime(h.updatedAt)}</small>
            </div>
            <div class="growth-comparison">
              ${renderTurtleGrowthSnapshot(h.oldSnapshot || { carapaceLength: h.oldLength }, h.oldPhoto, "更新前")}
              <span class="growth-inline-arrow" aria-hidden="true">→</span>
              ${renderTurtleGrowthSnapshot(h.newSnapshot || { carapaceLength: h.newLength }, h.newPhoto, "更新后", true)}
            </div>
          </article>
          ${index < historyList.length - 1 ? `<div class="growth-down-arrow" aria-hidden="true"><span>↓</span><small>继续成长</small></div>` : ""}
        </div>
      `).join("") || `<div class="empty small-empty"><div><strong>暂时还没有成长记录</strong></div></div>`}
    </main>
    ${bottomNav()}
  `;
}

function turtleReadOnlyDetail(t, species, photo) {
  return `
    <section class="turtle-detail-hero fresh-card detail-photo-card">
      <img class="growth-preview-photo" src="${photo}" alt="${species.name || t.speciesName}" data-growth-photo-preview role="button" tabindex="0" title="点击放大">
      <div>
        <h2>${t.code || "未命名档案"}</h2>
        <p>${species.name || t.speciesName || "-"}</p>
        <small>${t.status || "-"} · ${t.health || "-"}</small>
      </div>
    </section>
    <section class="detail-grid-card fresh-card">
      <div><span>性别</span><strong>${t.gender || "-"}</strong></div>
      <div><span>体重</span><strong>${t.weight || "-"}g</strong></div>
      <div><span>背甲长</span><strong>${t.carapaceLength || "-"}cm</strong></div>
      <div><span>背甲宽</span><strong>${t.carapaceWidth || "-"}cm</strong></div>
      <div><span>背高</span><strong>${t.shellHeight || "-"}cm</strong></div>
      <div><span>腹甲长</span><strong>${t.plastronLength || "-"}cm</strong></div>
      <div><span>入手日期</span><strong>${t.acquiredDate || "-"}</strong></div>
      <div><span>来源</span><strong>${t.source || "-"}</strong></div>
      <div><span>购入价</span><strong>${t.price ? `¥${money(t.price)}` : "-"}</strong></div>
      <div><span>龟池</span><strong>${escapeHtml(turtlePoolName(t.poolId))}</strong></div>
    </section>
    ${t.note ? `<section class="fresh-card note-card">${t.note}</section>` : ""}
  `;
}

function pageSpecies() {
  const list = speciesList
    .sort((a, b) => a.letter.localeCompare(b.letter) || a.name.localeCompare(b.name, "zh-CN"));
  const groups = Object.entries(groupBy(list, "letter"));
  const availableLetters = new Set(groups.map(([letter]) => letter));
  return `
    ${topbar("品种选择", true)}
    <main class="content page-fresh">
      <section class="page-intro species-intro compact-intro">
        <div>
          <p class="eyebrow dark">图鉴</p>
          <h2>${list.length} 个可选品种</h2>
          <p>按首字母分组，搜索中文名称或代码后可直接加入常用品种。</p>
        </div>
      </section>
      <section class="species-search-card fresh-card">
        <span>搜索</span>
        <input class="field fresh-search" data-species-search placeholder="搜索中文名称或代码">
      </section>
      <nav class="species-alpha-nav" aria-label="品种首字母导航">
        ${ALPHABET.map(letter => `<button class="${availableLetters.has(letter) ? "" : "muted"}" data-scroll-letter="${letter}" type="button">${letter}</button>`).join("")}
      </nav>
      ${groups.map(([letter, items]) => `
        <section class="species-section" data-letter-section="${letter}">
          <div class="species-letter"><h3>${letter}</h3><span>${items.length} 个品种</span></div>
          ${items.map(item => `
            <article class="species-row fresh-card ${state.keptSpecies.includes(item.code) ? "selected" : ""}" data-species-keywords="${item.name.toLowerCase()} ${item.code.toLowerCase()}">
              <img class="species-photo" src="${speciesPhoto(item)}" alt="${item.name}" data-species-img="${item.code}" data-fallback-photo loading="lazy">
              <div><strong>${item.name}</strong><small>${item.code}</small></div>
              <button class="species-add ${state.keptSpecies.includes(item.code) ? "selected" : ""}" data-add-species="${item.code}">${state.keptSpecies.includes(item.code) ? "取消" : "加入"}</button>
            </article>
          `).join("")}
        </section>
      `).join("") || `<div class="empty small-empty"><div><strong>没有找到匹配品种</strong><br>换一个名称或代码试试</div></div>`}
    </main>
  `;
}

function groupBy(list, key) {
  return list.reduce((acc, item) => {
    const group = item[key] || "#";
    acc[group] = acc[group] || [];
    acc[group].push(item);
    return acc;
  }, {});
}

function scrollToSpeciesLetter(letter) {
  const targetLetter = ALPHABET.slice(ALPHABET.indexOf(letter)).find(item => document.querySelector(`[data-letter-section="${item}"]`));
  const target = targetLetter ? document.querySelector(`[data-letter-section="${targetLetter}"]`) : document.querySelector("[data-letter-section]");
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function pageBreeds() {
  const kept = state.keptSpecies.map(code => speciesByCode(code) || { code, name: code, image: defaultPhoto });
  return `
    ${topbar("饲养品种", true)}
    <main class="content page-fresh">
      <section class="page-intro"><div><p class="eyebrow dark">常用</p><h2>${kept.length} 个品种</h2><p>这里展示已加入的饲养品种，可以删除。</p></div><button class="round-action" data-page="species">+</button></section>
      ${kept.map(item => `
        <article class="breed-row fresh-card">
          <img class="ledger-thumb species-photo" src="${speciesPhoto(item)}" alt="${item.name}" data-species-img="${item.code}" data-fallback-photo loading="lazy">
          <div><strong>${item.name}</strong><small>${item.code}</small></div>
          <button class="danger-link" data-remove-species="${item.code}">删除</button>
        </article>
      `).join("") || `<div class="empty"><div><strong>还没有常用品种</strong></div></div>`}
    </main>
  `;
}

function pageAdd() {
  const kept = state.keptSpecies.length ? state.keptSpecies.map(code => speciesByCode(code)).filter(Boolean) : speciesList.slice(0, 8);
  const today = formatDate(new Date());
  const draftSpeciesCode = turtleFormValue("speciesCode", state.selectedSpeciesCode);
  const draftHealth = turtleFormValue("health", "健康");
  const draftSource = turtleFormValue("source", "购买");
  const draftPoolId = turtleFormValue("poolId");
  const turtlePools = state.turtlePools || [];
  return `
    ${topbar("新建档案", true)}
    <main class="content page-fresh">
      <form id="turtleForm">
        <section class="form-block fresh-card">
          <h3>基础信息</h3>
          <div class="photo-uploader">
            <img src="${state.formPhoto || defaultPhoto}" alt="乌龟照片">
            <div><button class="secondary" type="button" data-photo-input-button>上传照片</button><button class="danger-link" type="button" data-photo-clear>清除</button></div>
          </div>
          <input class="hidden-file" type="file" accept="image/*" lang="zh-CN" title="选择图片" aria-label="选择图片" data-photo-input>
          <div class="label">品种代码 <span class="required">*</span></div>
          <select class="select" name="speciesCode" required>
            <option value="">请选择品种</option>
            ${kept.map(s => `<option value="${s.code}" ${draftSpeciesCode === s.code ? "selected" : ""}>${s.code} · ${s.name}</option>`).join("")}
          </select>
          <button class="text-green add-species-hint" type="button" data-page="species">没有这个品种？去图鉴添加</button>
          <div class="label">龟池</div>
          <select class="select" name="poolId">
            <option value="">暂不关联龟池</option>
            ${turtlePools.map(pool => `<option value="${pool.id}" ${draftPoolId === pool.id ? "selected" : ""}>${escapeHtml(pool.name || "未命名龟池")} · ${turtlePoolTypeLabel(pool.type)}</option>`).join("")}
          </select>
          <div class="label">龟龟昵称</div>
          <input class="field" name="code" placeholder="例如：小核桃、黑豆、将军" value="${escapeHtml(turtleFormValue("code"))}">
          <div class="label">性别 <span class="required">*</span></div>
          <div class="radio-row">
            ${["公", "母", "未知"].map(g => `<button class="choice ${state.formGender === g ? "active" : ""}" type="button" data-gender="${g}">${g}</button>`).join("")}
          </div>
        </section>
        <section class="form-block fresh-card">
          <h3>体测数据</h3>
          <div class="label">当前体重(g) <span class="required">*</span></div>
          <input class="field" name="weight" type="number" min="0" step="0.1" value="${escapeHtml(turtleFormValue("weight"))}" required>
          <div class="label">背甲长度(cm) <span class="required">*</span></div>
          <input class="field" name="carapaceLength" type="number" min="0" step="0.1" value="${escapeHtml(turtleFormValue("carapaceLength"))}" required>
          <details class="measure-extra">
            <summary><span>更多体测数据</span><small>背甲宽度、背高、腹甲长度</small></summary>
            <label><span>背甲宽度(cm)</span><input class="field" name="carapaceWidth" type="number" min="0" step="0.1" value="${escapeHtml(turtleFormValue("carapaceWidth"))}"></label>
            <label><span>背高(cm)</span><input class="field" name="shellHeight" type="number" min="0" step="0.1" value="${escapeHtml(turtleFormValue("shellHeight"))}"></label>
            <label><span>腹甲长度(cm)</span><input class="field" name="plastronLength" type="number" min="0" step="0.1" value="${escapeHtml(turtleFormValue("plastronLength"))}"></label>
          </details>
        </section>
        <section class="form-block fresh-card">
          <h3>当前状态</h3>
          <input type="hidden" name="status" value="正常饲养">
          <div class="label">健康状态</div>
          <input type="hidden" name="health" value="${draftHealth}">
          <div class="radio-row two-options">
            ${["健康", "生病"].map(value => `<button class="choice ${draftHealth === value ? "active" : ""}" type="button" data-turtle-choice="health" data-choice-value="${value}">${value}</button>`).join("")}
          </div>
        </section>
        <section class="form-block fresh-card">
          <h3>入手记录</h3>
          <div class="label">入手日期</div><input class="field" name="acquiredDate" type="date" value="${escapeHtml(turtleFormValue("acquiredDate", today))}">
          <div class="label">来到你家的方式</div>
          <input type="hidden" name="source" value="${draftSource}">
          <div class="radio-row">
            ${["购买", "孵化", "其他"].map(value => `<button class="choice ${draftSource === value ? "active" : ""}" type="button" data-turtle-choice="source" data-choice-value="${value}">${value}</button>`).join("")}
          </div>
          <div class="label">花费(元)</div><input class="field" name="price" type="number" min="0" step="0.01" value="${escapeHtml(turtleFormValue("price"))}">
          <div class="label">备注</div><textarea name="note" placeholder="性格、食欲、卖家、到家表现等都可以写在这里">${escapeHtml(turtleFormValue("note"))}</textarea>
        </section>
        <button class="primary" type="submit">保存档案</button>
      </form>
    </main>
  `;
}

function pageMemos() {
  const list = state.memoTab === "all" ? state.memos : state.memos.filter(m => state.memoTab === "repeat" ? m.repeat : !m.repeat);
  const editingMemo = state.memos.find(m => m.id === state.memoEditingId);
  const selectedWeekdays = memoWeekdays(editingMemo);
  return `
    ${topbar("护理提醒", true)}
    <main class="content page-fresh">
      <section class="page-intro">
        <div><p class="eyebrow dark">备忘</p><h2>${state.memos.length} 条护理事项</h2><p>换水、喂食、晒背、复查都可以记录在这里。</p></div>
        <button class="round-action" data-new-memo>+</button>
      </section>
      ${state.memoDraftOpen ? `
        <form class="memo-form fresh-card" id="memoForm">
          <div class="form-head"><div><p class="eyebrow dark">${editingMemo ? "调整护理" : "新增护理"}</p><h3>${editingMemo ? "更新这条护理事项" : "记下一件要照看的事"}</h3></div><button type="button" class="danger-link" data-cancel-memo>取消</button></div>
          <label><span>事项名称</span><input class="field" name="title" required placeholder="例如：换水、喂食、晒背" value="${escapeHtml(editingMemo?.title || "")}"></label>
          <label><span>设定时间</span><input class="field" name="remindTime" type="time" value="${escapeHtml(editingMemo?.remindTime || "")}"></label>
          <label><span>重复</span><select class="select" name="repeat"><option value="false" ${!editingMemo?.repeat ? "selected" : ""}>只执行一次</option><option value="true" ${editingMemo?.repeat ? "selected" : ""}>重复执行</option></select></label>
          <div class="weekday-field">
            <span>每周生效日（以开始时间为准）</span>
            <div class="weekday-picker">
              ${WEEKDAY_OPTIONS.map(day => `
                <label class="weekday-chip ${selectedWeekdays.includes(day.value) ? "active" : ""}">
                  <input type="checkbox" name="weekdays" value="${day.value}" ${selectedWeekdays.includes(day.value) ? "checked" : ""}>
                  <span>${day.label}</span>
                </label>
              `).join("")}
            </div>
          </div>
          <label><span>补充说明</span><textarea name="content" placeholder="可以写频率、用量、注意事项">${escapeHtml(editingMemo?.content || "")}</textarea></label>
          <button class="primary" type="submit">${editingMemo ? "保存调整" : "添加护理"}</button>
        </form>
      ` : ""}
      <section class="memo-tabs">
        ${["all:全部", "repeat:重复", "once:单次"].map(item => {
          const [key, label] = item.split(":");
          return `<button class="tab ${state.memoTab === key ? "active" : ""}" data-memo-tab="${key}">${label}</button>`;
        }).join("")}
      </section>
      ${list.map(m => `
        <article class="card memo-row">
          <div><strong>${m.title}</strong><p>${m.content || "无备注"}</p><small class="muted">上次操作 ${formatTime(m.updatedAt)} · ${m.remindTime || "未设时间"} · ${m.repeat ? "重复执行" : "只执行一次"}</small></div>
          <div><button class="text-green" data-edit-memo="${m.id}">调整</button><button class="danger-link" data-delete-memo="${m.id}">移除</button></div>
        </article>
      `).join("") || `<div class="empty"><div><strong>还没有护理提醒</strong><br>点击加号新建一条</div></div>`}
    </main>
  `;
}

function ledgerTypeText(type) {
  if (type === "purchase") return "收购";
  if (type === "sold") return "售出";
  if (type === "loss") return "损耗";
  if (type === "other") return "其他支出";
  return "记录";
}

function ledgerDateRange(preset = state.ledgerDatePreset || "all") {
  const today = formatDate(new Date());
  if (preset === "week") {
    const from = new Date();
    from.setDate(from.getDate() - 6);
    return { from: formatDate(from), to: today, label: "近七天" };
  }
  if (preset === "month") {
    const from = new Date();
    from.setDate(from.getDate() - 29);
    return { from: formatDate(from), to: today, label: "一个月" };
  }
  return { from: "", to: "", label: "全部" };
}

function pageLedger() {
  const dateRange = ledgerDateRange();
  const inDateRange = item => {
    const date = item.recordDate || formatDate(item.createdAt);
    if (dateRange.from && date < dateRange.from) return false;
    if (dateRange.to && date > dateRange.to) return false;
    return true;
  };
  const allRecords = (state.ledgerRecords || []).filter(inDateRange);
  const records = allRecords.filter(item => state.ledgerTab === "all" || item.type === state.ledgerTab);
  const purchaseTotal = allRecords.filter(item => item.type === "purchase").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const soldTotal = allRecords.filter(item => item.type === "sold").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const lossTotal = allRecords.filter(item => item.type === "loss").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const otherTotal = allRecords.filter(item => item.type === "other").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const profit = soldTotal - purchaseTotal - lossTotal - otherTotal;
  const profitLabel = profit > 0 ? "当前盈利" : profit < 0 ? "当前亏损" : "当前结余";
  const profitPrefix = profit > 0 ? "+" : profit < 0 ? "-" : "±";
  const dateText = dateRange.label;
  return `
    ${topbar("经营账本")}
    <main class="content page-fresh ${state.loggedInPhone ? "" : "guest-ledger-content"}">
      <section class="page-intro ledger-intro"><div><p class="eyebrow dark">经营</p><h2>${records.length} 条资金明细</h2><p>${dateText}，收购、售出、损耗和日常养护支出都能留图、留备注。</p></div></section>
      <section class="ledger-profit-card ${profit < 0 ? "negative" : "positive"}">
        <div><span>${profitLabel}</span><strong><i>${profitPrefix}</i><em>${money(Math.abs(profit))}</em></strong><small>售出收入 − 收购投入 − 损耗金额 − 日常支出</small></div>
        <mark>${dateText}</mark>
      </section>
      <section class="ledger-summary">
        <div class="purchase"><span>收购投入</span><strong class="ledger-summary-value"><i>-</i><em>${money(purchaseTotal)}</em></strong><small>${allRecords.filter(item => item.type === "purchase").length} 条</small></div>
        <div class="loss"><span>损耗金额</span><strong class="ledger-summary-value"><i>-</i><em>${money(lossTotal)}</em></strong><small>${allRecords.filter(item => item.type === "loss").length} 条</small></div>
        <div class="other"><span>日常支出</span><strong class="ledger-summary-value"><i>-</i><em>${money(otherTotal)}</em></strong><small>${allRecords.filter(item => item.type === "other").length} 条</small></div>
        <div class="sold"><span>售出收入</span><strong class="ledger-summary-value"><i>+</i><em>${money(soldTotal)}</em></strong><small>${allRecords.filter(item => item.type === "sold").length} 条</small></div>
      </section>
      <section class="fresh-card ledger-command-panel" aria-label="账本操作">
        <div class="ledger-command-grid" aria-label="账本日期筛选">
          ${[
            ["week", "近七天"],
            ["month", "一个月"],
            ["all", "全部"]
          ].map(([key, label]) => `<button class="ledger-command-button ${state.ledgerDatePreset === key || (!state.ledgerDatePreset && key === "all") ? "active" : ""}" type="button" data-ledger-date-preset="${key}">${label}</button>`).join("")}
        </div>
        <div class="ledger-command-grid" aria-label="新增账本记录">
          ${[
            ["purchase", "记录收购"],
            ["loss", "记录损耗"],
            ["other", "其他记账"],
            ["sold", "记录售出"]
          ].map(([key, label]) => `<button class="ledger-command-button ${state.ledgerDraftType === key ? "active" : ""}" type="button" data-new-ledger="${key}">${label}</button>`).join("")}
        </div>
      </section>
      ${state.ledgerDraftType ? ledgerForm() : ""}
      <section class="memo-tabs">
        ${["all:全部", "purchase:收购", "sold:售出", "loss:损耗", "other:其他支出"].map(item => {
          const [key, label] = item.split(":");
          return `<button class="tab ${state.ledgerTab === key ? "active" : ""}" data-ledger-tab="${key}">${label}</button>`;
        }).join("")}
      </section>
      ${records.map(ledgerRow).join("") || `<div class="empty"><div><strong>还没有账本记录</strong></div></div>`}
    </main>
    ${bottomNav()}
  `;
}

function persistDashboardTurtleOrder(list) {
  const orderedIds = [...list.querySelectorAll(":scope > [data-reorder-turtle]")]
    .map(row => row.dataset.reorderTurtle)
    .filter(Boolean);
  if (orderedIds.length < 2) return;
  const visibleIds = new Set(orderedIds);
  const visibleTurtles = new Map((state.turtles || []).map(turtle => [turtle.id, turtle]));
  let visibleIndex = 0;
  const turtles = (state.turtles || []).map(turtle => {
    if (!visibleIds.has(turtle.id)) return turtle;
    return visibleTurtles.get(orderedIds[visibleIndex++]) || turtle;
  });
  setState({ turtles, turtleSort: "default", openTurtleMenuId: "" });
  toast("已保存为默认排序");
}

function setupDashboardTurtleReorder() {
  const list = document.querySelector("[data-turtle-reorder-list]");
  if (!list || list.dataset.reorderBound === "true") return;
  list.dataset.reorderBound = "true";
  let interaction = null;
  let autoScrollFrame = 0;

  const placeDraggingRow = (active, clientY) => {
    const rows = [...list.querySelectorAll(":scope > [data-reorder-turtle]:not(.is-turtle-dragging)")];
    const before = rows.find(row => clientY < row.getBoundingClientRect().top + row.offsetHeight / 2);
    if (before) list.insertBefore(active.row, before);
    else if (rows.length) list.insertBefore(active.row, rows[rows.length - 1].nextSibling);
  };
  const stopAutoScroll = () => {
    if (autoScrollFrame) window.cancelAnimationFrame(autoScrollFrame);
    autoScrollFrame = 0;
  };
  const runAutoScroll = () => {
    autoScrollFrame = 0;
    const active = interaction;
    if (!active?.dragging) return;
    const edge = 92;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    let speed = 0;
    if (active.lastY < edge) speed = -Math.min(16, (edge - active.lastY) * 0.2);
    else if (active.lastY > viewportHeight - edge) speed = Math.min(16, (active.lastY - (viewportHeight - edge)) * 0.2);
    if (!speed) return;
    window.scrollBy(0, speed);
    placeDraggingRow(active, active.lastY);
    autoScrollFrame = window.requestAnimationFrame(runAutoScroll);
  };
  const updateAutoScroll = active => {
    const edge = 92;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const nearEdge = active.lastY < edge || active.lastY > viewportHeight - edge;
    if (nearEdge && !autoScrollFrame) autoScrollFrame = window.requestAnimationFrame(runAutoScroll);
    else if (!nearEdge) stopAutoScroll();
  };

  const clearPressTimer = active => {
    if (!active?.timer) return;
    window.clearTimeout(active.timer);
    active.timer = 0;
  };
  const finish = (event, cancelled = false) => {
    const active = interaction;
    if (!active || (event?.pointerId !== undefined && event.pointerId !== active.pointerId)) return;
    interaction = null;
    clearPressTimer(active);
    stopAutoScroll();
    if (!active.dragging) return;
    dashboardTurtleDragSuppressUntil = Date.now() + 650;
    document.documentElement.classList.remove("dashboard-turtle-reordering");
    active.row.classList.remove("is-turtle-dragging");
    try { active.row.releasePointerCapture(active.pointerId); } catch {}
    if (cancelled) {
      render();
      return;
    }
    persistDashboardTurtleOrder(list);
    event?.preventDefault();
    event?.stopPropagation();
  };

  list.addEventListener("pointerdown", event => {
    const row = event.target.closest("[data-reorder-turtle]");
    // iOS may cancel a PointerEvent as soon as the page recognises a vertical
    // pan. Touches below deliberately use the native TouchEvent path so a
    // long-press can take ownership after the normal scroll decision.
    if (!row || event.pointerType === "touch" || !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (event.target.closest("button, a, input, select, textarea, .turtle-menu")) return;
    interaction = {
      pointerId: event.pointerId,
      row,
      startX: event.clientX,
      startY: event.clientY,
      lastY: event.clientY,
      dragging: false,
      timer: window.setTimeout(() => {
        const active = interaction;
        if (!active || active.pointerId !== event.pointerId) return;
        active.timer = 0;
        active.dragging = true;
        dashboardTurtleDragSuppressUntil = Date.now() + 650;
        document.documentElement.classList.add("dashboard-turtle-reordering");
        active.row.classList.add("is-turtle-dragging");
        try { active.row.setPointerCapture?.(active.pointerId); } catch {}
        navigator.vibrate?.(18);
      }, 420)
    };
  }, { passive: true });

  list.addEventListener("pointermove", event => {
    const active = interaction;
    if (!active || active.pointerId !== event.pointerId || !event.isPrimary) return;
    const distance = Math.hypot(event.clientX - active.startX, event.clientY - active.startY);
    if (!active.dragging) {
      if (distance > 9) {
        clearPressTimer(active);
        interaction = null;
      }
      return;
    }
    active.lastY = event.clientY;
    placeDraggingRow(active, event.clientY);
    updateAutoScroll(active);
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
  }, { passive: false });
  list.addEventListener("pointerup", event => finish(event), { passive: false });
  list.addEventListener("pointercancel", event => finish(event, true), { passive: false });
  list.addEventListener("contextmenu", event => {
    if (interaction?.dragging || event.target.closest("[data-reorder-turtle]")) event.preventDefault();
  });

  const findTouch = (event, identifier) => [...event.changedTouches].find(touch => touch.identifier === identifier)
    || [...event.touches].find(touch => touch.identifier === identifier);
  list.addEventListener("touchstart", event => {
    if (event.touches.length !== 1 || interaction) return;
    const row = event.target.closest("[data-reorder-turtle]");
    if (!row || event.target.closest("button, a, input, select, textarea, .turtle-menu")) return;
    const touch = event.touches[0];
    interaction = {
      pointerId: `touch-${touch.identifier}`,
      touchIdentifier: touch.identifier,
      row,
      startX: touch.clientX,
      startY: touch.clientY,
      lastY: touch.clientY,
      dragging: false,
      timer: window.setTimeout(() => {
        const active = interaction;
        if (!active || active.touchIdentifier !== touch.identifier) return;
        active.timer = 0;
        active.dragging = true;
        dashboardTurtleDragSuppressUntil = Date.now() + 650;
        document.documentElement.classList.add("dashboard-turtle-reordering");
        active.row.classList.add("is-turtle-dragging");
        navigator.vibrate?.(18);
      }, 420)
    };
  }, { passive: true });
  list.addEventListener("touchmove", event => {
    const active = interaction;
    if (!active?.touchIdentifier && active?.touchIdentifier !== 0) return;
    const touch = findTouch(event, active.touchIdentifier);
    if (!touch) return;
    const distance = Math.hypot(touch.clientX - active.startX, touch.clientY - active.startY);
    if (!active.dragging) {
      if (distance > 9) {
        clearPressTimer(active);
        interaction = null;
      }
      return;
    }
    active.lastY = touch.clientY;
    placeDraggingRow(active, touch.clientY);
    updateAutoScroll(active);
    // Only prevent scrolling after the long press has entered ordering mode.
    // Before that, the dashboard keeps the normal iOS vertical scroll feel.
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
  }, { passive: false });
  list.addEventListener("touchend", event => {
    const active = interaction;
    if (!active?.touchIdentifier && active?.touchIdentifier !== 0) return;
    if ([...event.touches].some(touch => touch.identifier === active.touchIdentifier)) return;
    finish(event);
  }, { passive: false });
  list.addEventListener("touchcancel", event => {
    const active = interaction;
    if (!active?.touchIdentifier && active?.touchIdentifier !== 0) return;
    if ([...event.touches].some(touch => touch.identifier === active.touchIdentifier)) return;
    finish(event, true);
  }, { passive: false });
  list.addEventListener("click", event => {
    if (Date.now() >= dashboardTurtleDragSuppressUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}

function growthTimestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function growthDateLabel(value) {
  const timestamp = growthTimestamp(value);
  return timestamp ? formatDate(new Date(timestamp)) : "日期未记录";
}

function growthChangeText(label, before, after, unit = "") {
  const from = before === undefined || before === null || before === "" ? "-" : before;
  const to = after === undefined || after === null || after === "" ? "-" : after;
  if (String(from) === String(to)) return `${label} ${to}${unit}`;
  return `${label} ${from}${unit} → ${to}${unit}`;
}

function growthElapsedLabel(timestamp) {
  if (!timestamp) return "刚刚记录";
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86400000));
  if (days === 0) return "今日更新";
  if (days === 1) return "1 天前更新";
  return `${days} 天前更新`;
}

function growthIntervalLabel(currentTimestamp, previousTimestamp, kind = "测量", initialTimestamp = 0) {
  if (!currentTimestamp) return "已建立初始对比";
  const referenceTimestamp = previousTimestamp || initialTimestamp;
  if (!referenceTimestamp) return "已建立初始对比";
  const days = Math.max(0, Math.round((currentTimestamp - referenceTimestamp) / 86400000));
  if (days === 0) return `同日再次${kind}`;
  return previousTimestamp ? `与上次${kind}相隔 ${days} 天` : `与建档记录相隔 ${days} 天`;
}

function turtleGrowthUpdates() {
  const breedingByMother = new Map();
  (state.breedingRecords || []).forEach(record => {
    if (!record.motherId) return;
    const key = String(record.motherId);
    breedingByMother.set(key, [...(breedingByMother.get(key) || []), record]);
  });
  breedingByMother.forEach(records => records.sort((a, b) => growthTimestamp(b.updatedAt || b.createdAt || b.date) - growthTimestamp(a.updatedAt || a.createdAt || a.date)));

  return (state.turtles || []).map(turtle => {
    const measurements = [...(turtle.measureHistory || [])].sort((a, b) => growthTimestamp(b.updatedAt) - growthTimestamp(a.updatedAt));
    const breedingRecords = breedingByMother.get(String(turtle.id)) || [];
    const measurement = measurements[0];
    const breeding = breedingRecords[0];
    const measurementTime = growthTimestamp(measurement?.updatedAt);
    const breedingTime = growthTimestamp(breeding?.updatedAt || breeding?.createdAt || breeding?.date);
    if (!measurement && !breeding) return null;
    if (breedingTime > measurementTime) {
      return { type: "breeding", turtle, record: breeding, timestamp: breedingTime, priorTimestamp: growthTimestamp(breedingRecords[1]?.updatedAt || breedingRecords[1]?.createdAt || breedingRecords[1]?.date) };
    }
    const previous = measurement.oldSnapshot || {};
    const current = measurement.newSnapshot || turtle;
    // 最早一次更新的旧快照就是完整成长对比的基准。旧记录不再单列，
    // 但它的体重、背甲等会持续显示在最新卡片的左侧。
    const baseline = measurements[measurements.length - 1]?.oldSnapshot || previous;
    const poolChanged = String(baseline.poolId || "") !== String(current.poolId || "");
    return {
      type: poolChanged ? "pool" : "measure",
      turtle,
      record: measurement,
      timestamp: measurementTime,
      priorTimestamp: growthTimestamp(measurements[1]?.updatedAt),
      baseline,
      previous,
      current,
      timeline: [...measurements].reverse(),
      historyCount: measurements.length,
      poolChanged
    };
  }).filter(Boolean).sort((a, b) => b.timestamp - a.timestamp);
}

function growthTrendMarkup(label, timeline = [], turtle = {}, field, unit = "") {
  const firstSnapshot = timeline[0]?.oldSnapshot || turtle;
  const milestones = [{ value: firstSnapshot?.[field], timestamp: growthTimestamp(turtle.createdAt || turtle.acquiredDate) }];
  timeline.forEach(record => {
    const snapshot = record.newSnapshot || {};
    const nextValue = snapshot[field];
    const last = milestones[milestones.length - 1];
    // 连续更新但该项未变化时合并，保留真正发生变化的节点。
    if (String(nextValue ?? "") === String(last.value ?? "")) {
      // 数值没变也代表一次真实更新；用它刷新节点时间，下一次变化的
      // 间隔就会准确显示为“距上次更新多少天”。
      last.timestamp = growthTimestamp(record.updatedAt) || last.timestamp;
      return;
    }
    milestones.push({ value: nextValue, timestamp: growthTimestamp(record.updatedAt) });
  });
  const displayValue = value => `${value === undefined || value === null || value === "" ? "-" : value}${unit}`;
  const nodes = milestones.map((point, index) => {
    if (index === 0) return `<span class="growth-trend-value">${escapeHtml(displayValue(point.value))}</span>`;
    const previous = milestones[index - 1];
    const days = previous.timestamp && point.timestamp ? Math.max(0, Math.round((point.timestamp - previous.timestamp) / 86400000)) : null;
    const interval = days === null ? "更新后" : `${days} 天`;
    return `<span class="growth-trend-transition"><i>${interval}</i><b aria-hidden="true">→</b></span><span class="growth-trend-value">${escapeHtml(displayValue(point.value))}</span>`;
  }).join("");
  return `<em class="growth-trend"><strong>${label}</strong>${nodes}</em>`;
}

function growthSnapshotMetric(snapshot = {}, field, unit) {
  const value = snapshot[field];
  return value === undefined || value === null || value === "" ? "-" : `${value}${unit}`;
}

function growthHistoryStepMarkup(record, index, turtleId = "") {
  const before = record.oldSnapshot || {};
  const after = record.newSnapshot || {};
  const date = growthDateLabel(record.updatedAt);
  const removeButton = record.id && turtleId
    ? `<button class="growth-history-delete" type="button" data-delete-growth-update="${escapeHtml(record.id)}" data-growth-turtle-id="${escapeHtml(turtleId)}" aria-label="删除第 ${index + 1} 次更新" title="删除本次更新">×</button>`
    : "";
  return `
    <section class="growth-history-step">
      <div class="growth-history-step-head"><strong>第 ${index + 1} 次更新</strong><small>${date}</small>${removeButton}</div>
      <div class="growth-history-pair">
        <div><span>更新前</span><b>体重 ${escapeHtml(growthSnapshotMetric(before, "weight", "g"))}</b><b>背甲 ${escapeHtml(growthSnapshotMetric(before, "carapaceLength", "cm"))}</b></div>
        <i aria-hidden="true">→</i>
        <div><span>更新后</span><b>体重 ${escapeHtml(growthSnapshotMetric(after, "weight", "g"))}</b><b>背甲 ${escapeHtml(growthSnapshotMetric(after, "carapaceLength", "cm"))}</b></div>
      </div>
    </section>
  `;
}

function growthHistoryFlowMarkup(timeline = [], turtleId = "") {
  return timeline.map((record, index) => {
    const step = growthHistoryStepMarkup(record, index, turtleId);
    if (index === timeline.length - 1) return step;
    const next = timeline[index + 1];
    const days = Math.max(0, Math.round((growthTimestamp(next.updatedAt) - growthTimestamp(record.updatedAt)) / 86400000));
    return `${step}<div class="growth-history-interval"><small>相隔 ${days} 天</small><b aria-hidden="true">→</b></div>`;
  }).join("");
}

function growthUpdateCard(item) {
  const turtle = item.turtle;
  const photo = item.record?.newPhoto || turtle.photo || defaultPhoto;
  const isBreeding = item.type === "breeding";
  const timing = [
    growthElapsedLabel(item.timestamp),
    growthIntervalLabel(item.timestamp, item.priorTimestamp, isBreeding ? "繁殖记录" : "测量", isBreeding ? 0 : growthTimestamp(turtle.createdAt || turtle.acquiredDate))
  ];
  let meta = [];
  let historyFlow = "";
  let heading = "成长更新";
  if (item.type === "breeding") {
    heading = "繁殖更新";
    meta = [`产蛋 ${item.record.eggCount || 0} 枚`, `受精 ${item.record.fertileCount || 0} 枚`, `孵化 ${item.record.hatchCount || 0} 只`];
  } else {
    historyFlow = growthHistoryFlowMarkup(item.timeline || [item.record], turtle.id);
    if (item.poolChanged) {
      heading = "龟池变动";
      meta.push(`龟池 ${item.baseline.poolName || turtlePoolName(item.baseline.poolId)} → ${item.current.poolName || turtlePoolName(item.current.poolId)}`);
    } else {
      if (item.previous.health !== item.current.health) meta.push(`健康 ${item.previous.health || "-"} → ${item.current.health || "-"}`);
      if (item.previous.status !== item.current.status) meta.push(`状态 ${item.previous.status || "-"} → ${item.current.status || "-"}`);
    }
  }
  return `
    <article class="growth-update-card fresh-card" data-view-turtle="${escapeHtml(turtle.id)}" role="button" tabindex="0" aria-label="查看 ${escapeHtml(turtle.code || turtle.speciesName || "乌龟")} 的成长详情">
      <img src="${photo}" alt="${escapeHtml(turtle.code || turtle.speciesName || "乌龟")}" loading="lazy">
      <div class="growth-update-main">
        <div class="growth-update-head"><strong>${escapeHtml(turtle.code || "未命名乌龟")}</strong><span>${heading}</span></div>
        <p>${escapeHtml(turtle.speciesName || "未填写品种")} · ${growthDateLabel(item.record?.updatedAt || item.record?.createdAt || item.record?.date)}${!isBreeding && item.historyCount > 1 ? ` · 已汇总 ${item.historyCount} 次更新` : ""}</p>
        ${historyFlow ? `<div class="growth-history-flow" data-growth-history-flow aria-label="完整成长更新记录，可左右滑动查看每次更新"><div class="growth-history-track">${historyFlow}</div></div>` : `<div class="growth-update-chips">${meta.filter(Boolean).map(text => text.startsWith("<em ") ? text : `<em>${escapeHtml(text)}</em>`).join("")}</div>`}
      </div>
      <div class="growth-update-timing" aria-label="记录时间"><span>${escapeHtml(timing[0])}</span><small>${escapeHtml(timing[1])}</small></div>
      <b aria-hidden="true">›</b>
    </article>
  `;
}

function pageGrowth() {
  const updates = turtleGrowthUpdates();
  const updatedTurtleCount = new Set(updates.map(item => item.turtle.id)).size;
  const filter = state.growthFilter || "all";
  const visible = filter === "all" ? updates : updates.filter(item => item.type === filter || (filter === "measure" && item.type === "pool"));
  const recentTime = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentCount = updates.filter(item => item.timestamp >= recentTime).length;
  return `
    ${topbar("成长记录", true)}
    <main class="content page-fresh growth-page">
      <section class="page-intro compact-intro growth-intro">
        <div><p class="eyebrow dark">成长汇总</p><h2>${updatedTurtleCount} 只乌龟有更新</h2><p>每只乌龟保留最新一张卡片，并把最早记录到当前的体重、背甲和龟池变化完整汇总。</p></div>
      </section>
      <section class="growth-summary fresh-card"><div><strong>${updatedTurtleCount}</strong><span>已更新个体</span></div><div><strong>${recentCount}</strong><span>近 7 天更新</span></div><div><strong>${Math.max(0, (state.turtles || []).length - updatedTurtleCount)}</strong><span>暂无更新</span></div></section>
      <section class="growth-filter-row" aria-label="成长记录筛选">
        ${[["all", "全部"], ["measure", "成长测量"], ["breeding", "繁殖"], ["pool", "龟池"]].map(([value, label]) => `<button type="button" class="${filter === value ? "active" : ""}" data-growth-filter="${value}">${label}</button>`).join("")}
      </section>
      <section class="growth-update-list">
        ${visible.map(growthUpdateCard).join("") || `<div class="empty small-empty"><div><strong>${updates.length ? "没有符合筛选条件的更新" : "还没有成长更新"}</strong><br>${updates.length ? "切换筛选项查看其他记录。" : "在乌龟档案中点击更新后，体重、背甲和状态变化会自动显示在这里。"}</div></div>`}
      </section>
    </main>
    ${bottomNav()}
  `;
}

function ledgerForm() {
  const type = state.ledgerDraftType;
  const isPurchase = type === "purchase";
  const isOther = type === "other";
  // 收购是新增一只龟，不能关联或覆盖已有档案。
  const draftTurtleId = isPurchase ? "" : ledgerFormValue("turtleId", state.ledgerDraftTurtleId);
  const turtle = state.turtles.find(t => t.id === draftTurtleId);
  const today = ledgerFormValue("recordDate", formatDate(new Date()));
  const defaultAmount = type === "loss" && turtle?.price ? turtle.price : "";
  const amountValue = ledgerFormValue("amount", defaultAmount);
  const purchaseGender = ledgerFormValue("purchaseGender", state.ledgerPurchaseGender || "未知") || "未知";
  const supportsPool = type === "purchase" || type === "loss";
  const poolId = ledgerFormValue("poolId", turtle?.poolId || "");
  return `
    <form class="ledger-shell" id="ledgerForm">
      <section class="form-block fresh-card">
        <div class="form-head"><div><p class="eyebrow dark">${ledgerTypeText(type)}</p><h3>基础信息</h3></div><button type="button" class="danger-link" data-cancel-ledger>取消</button></div>
        <div class="photo-uploader">
          ${state.ledgerDraftPhoto ? `<img src="${state.ledgerDraftPhoto}" alt="${ledgerTypeText(type)}照片">` : `<span>照片</span>`}
          <div><button class="secondary" type="button" data-ledger-photo-button>上传照片</button><p class="muted">${isOther ? "可上传小票、发票或购买物品照片。" : "和新建档案一样，可以上传这只龟当时的照片。"}</p></div>
        </div>
        <input class="hidden-file" type="file" accept="image/*" lang="zh-CN" title="选择图片" aria-label="选择图片" data-ledger-photo-input>
        ${isOther ? `
          <div class="label">支出分类 <span class="required">*</span></div>
          <select class="select" name="otherCategory" required>
            ${["龟粮", "耗材", "设备", "药品", "水电", "运输", "检测", "其他"].map(category => `<option value="${category}" ${ledgerFormSelected("otherCategory", category, "龟粮")}>${category}</option>`).join("")}
          </select>
          <div class="label">记账事项 <span class="required">*</span></div>
          <input class="field" name="otherTitle" required value="${escapeHtml(ledgerFormValue("otherTitle"))}" placeholder="例如：购买幼龟粮、加热棒、过滤棉">
        ` : !isPurchase ? `
          <div class="label">关联档案</div>
          <select class="select" name="turtleId">
            <option value="">不关联档案</option>
            ${state.turtles.map(t => `<option value="${t.id}" ${draftTurtleId === t.id ? "selected" : ""}>${t.code} · ${t.speciesName}</option>`).join("")}
          </select>
        ` : ""}
        ${supportsPool ? `
          <div class="label">龟池</div>
          <select class="select" name="poolId">
            <option value="">未关联龟池</option>
            ${(state.turtlePools || []).map(pool => `<option value="${pool.id}" ${poolId === pool.id ? "selected" : ""}>${escapeHtml(pool.name || "未命名龟池")} · ${turtlePoolTypeLabel(pool.type)}</option>`).join("")}
          </select>
        ` : ""}
        ${isPurchase ? `
          <div class="label">品种代码</div>
          <select class="select" name="purchaseSpeciesCode" required><option value="">请选择品种</option>${speciesList.map(s => `<option value="${s.code}" ${ledgerFormSelected("purchaseSpeciesCode", s.code)}>${s.code} · ${s.name}</option>`).join("")}</select>
          <button class="text-green" type="button" data-page="species" style="margin-top:8px;">没有这个品种？去图鉴添加</button>
          <div class="label">龟龟昵称</div>
          <input class="field" name="purchaseCode" value="${escapeHtml(ledgerFormValue("purchaseCode"))}" placeholder="例如：小核桃、黑豆、将军">
          <div class="label">性别 <span class="required">*</span></div>
          <div class="radio-row">
            ${["公", "母", "未知"].map(g => `<button class="choice ${purchaseGender === g ? "active" : ""}" type="button" data-purchase-gender="${g}">${g}</button>`).join("")}
          </div>
          <input type="hidden" name="purchaseGender" value="${purchaseGender}">
        ` : turtle ? `
          <div class="label">品种代码</div>
          <input class="field" value="${turtle.speciesCode} · ${turtle.speciesName}" readonly>
          <div class="label">龟龟昵称</div>
          <input class="field" value="${turtle.code}" readonly>
          <div class="label">性别</div>
          <div class="radio-row readonly-radio">
            ${["公", "母", "未知"].map(g => `<button class="choice ${turtle.gender === g ? "active" : ""}" type="button" disabled>${g}</button>`).join("")}
          </div>
        ` : ""}
      </section>

      ${!isOther ? `<section class="form-block fresh-card">
        <h3>体测数据</h3>
        <div class="label">当前体重(g) ${isPurchase ? `<span class="required">*</span>` : ""}</div>
        <input class="field" name="weight" type="number" min="0" step="0.1" value="${escapeHtml(ledgerFormValue("weight", turtle?.weight || ""))}" ${isPurchase ? "required" : ""}>
        <div class="label">背甲长度(cm) ${isPurchase ? `<span class="required">*</span>` : ""}</div>
        <input class="field" name="carapaceLength" type="number" min="0" step="0.1" value="${escapeHtml(ledgerFormValue("carapaceLength", turtle?.carapaceLength || ""))}" ${isPurchase ? "required" : ""}>
        <details class="measure-extra">
          <summary><span>更多体测数据</span><small>背甲宽度、背高、腹甲长度</small></summary>
          <label><span>背甲宽度(cm)</span><input class="field" name="carapaceWidth" type="number" min="0" step="0.1" value="${escapeHtml(ledgerFormValue("carapaceWidth", turtle?.carapaceWidth || ""))}"></label>
          <label><span>背高(cm)</span><input class="field" name="shellHeight" type="number" min="0" step="0.1" value="${escapeHtml(ledgerFormValue("shellHeight", turtle?.shellHeight || ""))}"></label>
          <label><span>腹甲长度(cm)</span><input class="field" name="plastronLength" type="number" min="0" step="0.1" value="${escapeHtml(ledgerFormValue("plastronLength", turtle?.plastronLength || ""))}"></label>
        </details>
      </section>` : ""}

      ${isPurchase ? `
        <section class="form-block fresh-card">
          <h3>当前状态</h3>
          <div class="label">饲养状态</div>
          <select class="select" name="purchaseStatus"><option ${ledgerFormSelected("purchaseStatus", "正常饲养", "正常饲养")}>正常饲养</option><option ${ledgerFormSelected("purchaseStatus", "已转让", "正常饲养")}>已转让</option><option ${ledgerFormSelected("purchaseStatus", "已死亡", "正常饲养")}>已死亡</option></select>
          <div class="label">健康状态</div>
          <select class="select" name="purchaseHealth"><option ${ledgerFormSelected("purchaseHealth", "健康", "健康")}>健康</option><option ${ledgerFormSelected("purchaseHealth", "生病", "健康")}>生病</option></select>
          <input type="hidden" name="purchaseSource" value="购买">
        </section>
      ` : ""}

      <section class="form-block fresh-card">
        <h3>${isOther ? "日常养护支出" : (isPurchase ? "入手记录" : `${ledgerTypeText(type)}记录`)}</h3>
        <div class="label">${isPurchase ? "入手日期" : "日期"}</div><input class="field" name="recordDate" type="date" value="${today}">
        <div class="label">${isOther ? "支出金额(元)" : (isPurchase ? "花费(元)" : "金额(元)")}</div><input class="field" name="amount" type="number" min="0" step="0.01" required value="${escapeHtml(amountValue)}">
        <div class="label">备注</div><textarea name="note" placeholder="${isOther ? "可记录品牌、规格、数量、购买渠道、使用周期等" : (isPurchase ? "性格、食欲、卖家、到家表现等都可以写在这里" : "客户、损耗原因、交接情况等都可以写在这里")}">${escapeHtml(ledgerFormValue("note"))}</textarea>
      </section>
      <button class="primary" type="submit">保存${isOther ? "其他支出" : ledgerTypeText(type)}</button>
    </form>
  `;
}

function ledgerRow(item) {
  const turtle = state.turtles.find(t => t.id === item.turtleId) || item.turtleSnapshot;
  const typeText = ledgerTypeText(item.type);
  const isOther = item.type === "other";
  const nickname = isOther ? (item.title || "未命名支出") : (turtle?.code || String(item.title || "未关联档案").split(" · ")[0] || "未关联档案");
  const speciesName = isOther ? (item.category || "日常养护支出") : (turtle?.speciesName || item.speciesName || String(item.title || "").split(" · ").slice(1).join(" · ") || "未填写品种");
  const weight = item.weight || turtle?.weight || "";
  const carapaceLength = item.carapaceLength || turtle?.carapaceLength || "";
  const weightText = weight !== "" ? `${weight}g` : "—g";
  const carapaceText = carapaceLength !== "" ? `背甲 ${carapaceLength}cm` : "背甲 —cm";
  const linkedFollowup = item.type === "purchase" && item.turtleId
    ? (state.ledgerRecords || [])
      .filter(record => record.turtleId === item.turtleId && ["sold", "loss"].includes(record.type))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0]
    : null;
  const linkedStatus = linkedFollowup ? `已${ledgerTypeText(linkedFollowup.type)}` : "";
  const menuOpen = state.openLedgerMenuId === item.id;
  return `
    <article class="fresh-card ledger-row ${menuOpen ? "ledger-menu-open" : ""}" data-view-ledger="${item.id}">
      ${item.photo ? `<img class="ledger-thumb" src="${item.photo}" alt="${typeText}照片">` : `<div class="ledger-thumb ledger-thumb-placeholder" aria-label="未添加照片"><span>龟</span></div>`}
      <div class="ledger-row-main">
        <div class="ledger-row-title-line">
          <div class="ledger-row-title"><span class="ledger-inline-type ${item.type}">${typeText}</span><strong class="ledger-title-text">${escapeHtml(nickname)}</strong></div>
          <p class="ledger-row-species">${escapeHtml(speciesName)}</p>
        </div>
        ${isOther ? `<div class="ledger-turtle-meta"><span>${escapeHtml(item.note || "未填写备注")}</span></div>` : `<div class="ledger-turtle-meta"><span>${escapeHtml(String(weightText))}</span><span>${escapeHtml(carapaceText)}</span></div>`}
      </div>
      <div class="ledger-row-side ${linkedStatus ? "has-linked-status" : ""}">
        ${linkedStatus ? `<span class="ledger-linked-status ${linkedFollowup.type}">${linkedStatus}</span>` : ""}
        <div class="ledger-amount ${item.type}">${item.type === "sold" ? "+" : "-"}${money(item.amount)}</div>
        <small class="ledger-row-date">${item.recordDate || formatDate(item.createdAt)}</small>
      </div>
      <button class="more-btn ledger-more-btn" data-toggle-ledger-menu="${item.id}" aria-label="账本记录操作" aria-expanded="${menuOpen ? "true" : "false"}"><span aria-hidden="true">•••</span></button>
      ${menuOpen ? `<div class="ledger-action-menu" role="menu" aria-label="账本记录操作"><button class="danger-link" data-delete-ledger="${item.id}" role="menuitem">${turtleActionIcon("delete")}<span>删除</span></button></div>` : ""}
    </article>
  `;
}

function pageLedgerDetail() {
  const item = (state.ledgerRecords || []).find(record => record.id === state.selectedLedgerId);
  if (!item) return `${topbar("账本详情", true)}<main class="content page-fresh"><div class="empty"><strong>没有找到这条记录</strong></div></main>`;
  const turtle = state.turtles.find(t => t.id === item.turtleId) || item.turtleSnapshot;
  const typeText = ledgerTypeText(item.type);
  const amountPrefix = item.type === "sold" ? "+" : "-";
  const isOther = item.type === "other";
  return `
    ${topbar("账本详情", true)}
    <main class="content page-fresh">
      <section class="ledger-detail-hero">${item.photo ? `<img src="${item.photo}" alt="${typeText}照片">` : `<div class="ledger-detail-empty">${typeText}</div>`}</section>
      <section class="fresh-card ledger-detail-card">
        <div class="ledger-detail-head"><span class="ledger-inline-type ${item.type}">${typeText}</span><strong class="${item.type !== "sold" ? "danger-text" : ""}">${amountPrefix}${money(item.amount)}</strong></div>
        <h2>${isOther ? escapeHtml(item.title || "未命名支出") : (turtle ? `${turtle.code} · ${turtle.speciesName}` : (item.title || "未关联档案"))}</h2>
        <p class="muted">${item.recordDate || formatDate(item.createdAt)}</p>
        <div class="detail-grid">
          ${isOther ? `<div><span>支出分类</span><strong>${escapeHtml(item.category || "其他")}</strong></div><div><span>凭证</span><strong>${item.photo ? "已上传" : "未上传"}</strong></div>` : `
          <div><span>档案状态</span><strong>${turtle ? "已保留快照" : "未关联"}</strong></div>
          <div><span>性别</span><strong>${turtle?.gender || "-"}</strong></div>
          <div><span>体重</span><strong>${item.weight || turtle?.weight || "-"}g</strong></div>
          <div><span>背甲长</span><strong>${item.carapaceLength || turtle?.carapaceLength || "-"}cm</strong></div>
          <div><span>背甲宽</span><strong>${item.carapaceWidth || turtle?.carapaceWidth || "-"}cm</strong></div>
          <div><span>背高</span><strong>${item.shellHeight || turtle?.shellHeight || "-"}cm</strong></div>
          <div><span>腹甲长</span><strong>${item.plastronLength || turtle?.plastronLength || "-"}cm</strong></div>
          <div><span>记录时间</span><strong>${formatTime(item.createdAt)}</strong></div>
          ${item.type === "sold" ? `<div><span>成交方式</span><strong>${escapeHtml(item.saleMethod || "未填写")}</strong></div>` : ""}`}
        </div>
        ${item.note ? `<p class="detail-note">${item.note}</p>` : ""}
      </section>
    </main>
  `;
}

function pageCalendar() {
  const logs = state.activityLogs || [];
  return `
    ${topbar("操作日志", true)}
    <main class="content page-fresh">
      <section class="page-intro compact-intro"><div><p class="eyebrow dark">记录</p><h2>${logs.length} 条操作动态</h2><p>购买、收购、售出、损耗、删除和护理调整都会自动留在这里。</p></div></section>
      <section class="activity-list">
        ${logs.map(log => `
          <article class="activity-row fresh-card"><span class="activity-dot"></span><div><strong>${log.type || "操作"}</strong><p>${log.text}</p><small>${formatTime(log.createdAt)}</small></div></article>
        `).join("") || `<div class="empty small-empty"><div><strong>暂时还没有操作记录</strong><br>新增、购买、售出或损耗后会自动显示在这里</div></div>`}
      </section>
    </main>
    ${bottomNav()}
  `;
}

function pageBreeding() {
  const records = state.breedingRecords || [];
  return `
    ${topbar("繁殖记录", true)}
    <main class="content page-fresh">
      <section class="page-intro breeding-intro">
        <div>
          <p class="eyebrow dark">繁殖</p>
          <h2>${records.length} 条产蛋记录</h2>
        <p>记录日期、种母、产蛋数、受精数、孵化数、备注和现场附图。</p>
        </div>
        <button class="round-action" data-page="breedingAdd">+</button>
      </section>
      <section class="section-title"><span>繁殖明细</span></section>
      <section class="breeding-list">
        ${records.map(breedingRow).join("") || `<div class="empty small-empty"><div><strong>还没有繁殖记录</strong><br>点击右上角加号记录第一窝蛋</div></div>`}
      </section>
    </main>
    ${bottomNav()}
  `;
}

function suggestedManualBreedingMother(date = formatDate(new Date())) {
  const dateCode = String(date || formatDate(new Date())).replace(/\D/g, "").slice(0, 8) || formatDate(new Date()).replace(/-/g, "");
  return `${dateCode}-${(state.breedingRecords || []).length + 1}`;
}

function isSuggestedManualBreedingMother(value) {
  return /^\d{8}-\d+$/.test(String(value || ""));
}

function pageBreedingAdd() {
  const today = state.breedingDraftDate || formatDate(new Date());
  const manualMotherSelected = state.breedingMotherMode === "manual";
  const manualMotherValue = state.breedingManualMother || suggestedManualBreedingMother(today);
  const females = state.turtles.filter(t => t.gender === "母" || t.gender === "未知");
  const turtlePools = state.turtlePools || [];
  return `
    ${topbar("新增繁殖", true)}
    <main class="content page-fresh">
      <section class="page-intro breeding-intro compact-intro">
        <div>
          <p class="eyebrow dark">新增</p>
          <h2>记录一窝蛋</h2>
          <p>填写种母、产蛋数量、受精数量、孵化数量，并可上传备注附图。</p>
        </div>
      </section>
      <form class="breeding-form fresh-card" id="breedingForm">
        <div class="form-head">
          <div><p class="eyebrow dark">新增</p><h3>记录一窝蛋</h3></div>
        </div>
        <div class="photo-uploader breeding-photo-box">
          ${state.breedingDraftPhoto ? `<img src="${state.breedingDraftPhoto}" alt="繁殖备注附图">` : `<span>附图</span>`}
          <div>
            <button class="secondary" type="button" data-breeding-photo-button>上传备注附图</button>
            <p class="muted">可上传产蛋现场、蛋盒、标记卡等图片。</p>
          </div>
        </div>
        <input class="hidden-file" type="file" accept="image/*" lang="zh-CN" title="选择图片" aria-label="选择图片" data-breeding-photo-input>
        <div class="breeding-form-grid">
          <label class="breeding-date-field"><span>日期</span><input class="field" name="date" type="date" value="${today}" required></label>
          <label class="breeding-mother-field"><span>种母</span>
            <select class="select" name="mother" data-breeding-mother required>
              <option value="" ${!state.breedingMotherValue ? "selected" : ""}>选择种母</option>
              ${females.map(t => `<option value="${t.id}" ${state.breedingMotherValue === t.id ? "selected" : ""}>${t.code} · ${t.speciesName}</option>`).join("")}
              <option value="manual" ${manualMotherSelected ? "selected" : ""}>手动备注</option>
            </select>
          </label>
          <label class="breeding-pool-field"><span>龟池</span><select class="select" name="poolId"><option value="">暂不关联龟池</option>${turtlePools.map(pool => `<option value="${pool.id}" ${state.breedingPoolId === pool.id ? "selected" : ""}>${escapeHtml(pool.name || "未命名龟池")} · ${turtlePoolTypeLabel(pool.type)}</option>`).join("")}</select></label>
          ${manualMotherSelected ? `<label class="breeding-manual-mother"><span>手动备注</span><input class="field" name="manualMother" value="${escapeHtml(manualMotherValue)}" placeholder="可自行修改编号" required></label>` : ""}
          <label><span>产蛋数</span><input class="field" name="eggCount" type="number" min="0" step="1" required placeholder="0" value="${state.breedingEggCount || ""}"></label>
          <label><span>受精数</span><input class="field" name="fertileCount" type="number" min="0" step="1" required placeholder="0" value="${state.breedingFertileCount || ""}"></label>
          <label><span>孵化数</span><input class="field" name="hatchCount" type="number" min="0" step="1" placeholder="0" value="${state.breedingHatchCount || ""}"></label>
        </div>
        <label class="breeding-note"><span>备注</span><textarea name="note" placeholder="产蛋位置、状态、孵化盒编号、温度等">${state.breedingNote || ""}</textarea></label>
        <button class="primary" type="submit">保存繁殖记录</button>
      </form>
    </main>
    ${bottomNav()}
  `;
}

function breedingRow(record) {
  const menuOpen = state.openBreedingMenuId === record.id;
  return `
    <article class="breeding-row fresh-card ${menuOpen ? "menu-open" : ""}" data-view-breeding="${record.id}">
      <div class="breeding-row-main">
        ${record.photo ? `<img src="${record.photo}" alt="繁殖附图">` : `<div class="breeding-thumb">繁</div>`}
        <div class="breeding-row-copy">
          <div class="breeding-row-heading"><strong>${record.motherName || "未填写种母"}</strong></div>
          <p>${record.date || "未填写日期"} · 龟池 ${escapeHtml(record.poolName || turtlePoolName(record.poolId))}</p>
          ${record.note ? `<small>${escapeHtml(record.note)}</small>` : ""}
        </div>
      </div>
      <div class="breeding-stat-grid" aria-label="繁殖数据">
        <div><span>产蛋</span><strong>${record.eggCount || 0}<em>枚</em></strong></div>
        <div><span>受精</span><strong>${record.fertileCount || 0}<em>枚</em></strong></div>
        <div><span>孵化</span><strong>${record.hatchCount || 0}<em>只</em></strong></div>
      </div>
      <button class="more-btn breeding-more-btn" data-toggle-breeding-menu="${record.id}" aria-label="繁殖记录操作" aria-expanded="${menuOpen ? "true" : "false"}"><span aria-hidden="true">•••</span></button>
      ${menuOpen ? `
        <div class="breeding-actions-menu" role="menu" aria-label="${escapeHtml(record.motherName || "繁殖记录")}操作">
          <button class="danger-link" data-delete-breeding="${record.id}" role="menuitem">${turtleActionIcon("delete")}<span>删除</span></button>
        </div>
      ` : ""}
    </article>
  `;
}

function pageBreedingDetail() {
  const record = (state.breedingRecords || []).find(item => item.id === state.selectedBreedingId);
  if (!record) return `${topbar("繁殖详情", true)}<main class="content page-fresh"><div class="empty"><strong>没有找到这条繁殖记录</strong></div></main>${bottomNav()}`;
  const females = state.turtles.filter(t => t.gender === "母" || t.gender === "未知");
  const currentPhoto = state.breedingEditPhoto === "__CLEAR__" ? "" : state.breedingEditPhoto || record.photo || "";
  const isManual = !record.motherId || record.motherId === "manual";
  const historyList = [...(record.editHistory || [])].reverse();
  const turtlePools = state.turtlePools || [];
  return `
    ${topbar("繁殖详情", true)}
    <main class="content page-fresh">
      <section class="page-intro compact-intro">
        <div><p class="eyebrow dark">明细</p><h2>${record.motherName || "未填写种母"}</h2><p>${record.date || "-"} · 产蛋 ${record.eggCount || 0} 枚 · 受精 ${record.fertileCount || 0} 枚 · 孵化 ${record.hatchCount || 0} 只</p></div>
      </section>
      <form class="breeding-form fresh-card" id="breedingDetailForm">
        <div class="photo-uploader breeding-photo-box">
          ${currentPhoto ? `<img src="${currentPhoto}" alt="繁殖备注附图">` : `<span>附图</span>`}
          <div>
            <button class="secondary" type="button" data-breeding-edit-photo-button>更换附图</button>
            <button class="danger-link" type="button" data-clear-breeding-edit-photo>清除图片</button>
          </div>
        </div>
        <input class="hidden-file" type="file" accept="image/*" lang="zh-CN" title="选择图片" aria-label="选择图片" data-breeding-edit-photo-input>
        <div class="breeding-form-grid">
          <label class="breeding-date-field"><span>日期</span><input class="field" name="date" type="date" value="${record.date || formatDate(new Date())}" required></label>
          <label class="breeding-mother-field"><span>种母</span>
            <select class="select" name="mother">
              <option value="manual" ${isManual ? "selected" : ""}>手动备注</option>
              ${females.map(t => `<option value="${t.id}" ${record.motherId === t.id ? "selected" : ""}>${t.code} · ${t.speciesName}</option>`).join("")}
            </select>
          </label>
          <label class="breeding-pool-field"><span>龟池</span><select class="select" name="poolId"><option value="">暂不关联龟池</option>${turtlePools.map(pool => `<option value="${pool.id}" ${record.poolId === pool.id ? "selected" : ""}>${escapeHtml(pool.name || "未命名龟池")} · ${turtlePoolTypeLabel(pool.type)}</option>`).join("")}</select></label>
          <label class="breeding-manual-mother"><span>种母备注</span><input class="field" name="manualMother" value="${isManual ? (record.motherName || "") : ""}" placeholder="可自行修改编号"></label>
          <label><span>产蛋数</span><input class="field" name="eggCount" type="number" min="0" step="1" required value="${record.eggCount || 0}"></label>
          <label><span>受精数</span><input class="field" name="fertileCount" type="number" min="0" step="1" required value="${record.fertileCount || 0}"></label>
          <label><span>孵化数</span><input class="field" name="hatchCount" type="number" min="0" step="1" value="${record.hatchCount || 0}"></label>
        </div>
        <label class="breeding-note"><span>备注</span><textarea name="note" placeholder="产蛋位置、状态、孵化盒编号、温度等">${record.note || ""}</textarea></label>
        <button class="primary" type="submit">保存修改</button>
      </form>
      <section class="section-title"><h3>繁殖记录</h3></section>
      ${historyList.map((item, index) => `
        <div class="growth-history-entry">
          <article class="history-card growth-history-card fresh-card">
            <div class="growth-history-head">
              <strong>第 ${index + 1} 次更新</strong>
              <small>${formatTime(item.updatedAt)}</small>
            </div>
            <div class="growth-comparison">
              ${renderBreedingHistorySnapshot(item.oldSnapshot || {}, item.oldPhoto, "更新前")}
              <span class="growth-inline-arrow" aria-hidden="true">→</span>
              ${renderBreedingHistorySnapshot(item.newSnapshot || {}, item.newPhoto, "更新后", true)}
            </div>
          </article>
          ${index < historyList.length - 1 ? `<div class="growth-down-arrow" aria-hidden="true"><span>↓</span><small>继续记录</small></div>` : ""}
        </div>
      `).join("") || `<div class="empty small-empty"><div><strong>暂时还没有繁殖记录</strong></div></div>`}
    </main>
    ${bottomNav()}
  `;
}

function pageMine() {
  const loggedIn = Boolean(state.loggedInPhone);
  const profileTitle = loggedIn ? (state.accountName || maskPhone(state.loggedInPhone)) : "未登录用户";
  const profileSub = loggedIn ? maskPhone(state.loggedInPhone) : "登录后同步你的档案和账本";
  const ownPosts = (state.communityPosts || []).filter(item => item.isOwn);
  const localReceivedLikes = ownPosts.reduce((total, item) => total + Math.max(0, Number(item.likeCount || 0)), 0);
  const receivedLikes = Math.max(0, Number(state.communityProfileStats?.receivedLikes || localReceivedLikes));
  const followerCount = Math.max(0, Number(state.communityProfileStats?.followerCount || 0));
  return `
    ${topbar("我的空间")}
    <section class="profile fresh-profile account-profile space-profile-card">
      <button class="space-profile-avatar-button" type="button" data-page="account" aria-label="编辑头像">
        ${accountAvatarMarkup()}
      </button>
      <div class="space-profile-main">
        <button class="space-profile-name-button" type="button" data-page="account" aria-label="编辑资料">
          <div class="space-name-line"><h2>${escapeHtml(profileTitle)}</h2></div>
        </button>
        <p class="profile-phone">${profileSub}</p>
        <div class="space-profile-pills">
          <span>壳友圈获赞 ${receivedLikes}</span>
          <span>${followerCount} 位粉丝</span>
        </div>
      </div>
    </section>
    <main class="content page-fresh">
      <section class="account-brief">
        <div><strong>${state.turtles.length}</strong><span>档案</span></div>
        <div><strong>${state.ledgerRecords.length}</strong><span>账本</span></div>
        <div><strong>${state.memos.length}</strong><span>护理</span></div>
      </section>
      <section class="fresh-card settings-card">
        <div class="settings-title">页面颜色</div>
        <div class="theme-row">
          ${[["teal", "青绿"], ["forest", "森林"], ["ocean", "海蓝"], ["plum", "梅紫"], ["dark", "深色"]].map(([key, label]) => `<button class="theme-dot ${key} ${state.themeColor === key ? "active" : ""}" data-theme="${key}"><span></span>${label}</button>`).join("")}
        </div>
      </section>
      <section class="space-social-links fresh-card">
        <button type="button" data-page="marketMy"><strong>${(state.myMarketListings || []).length}</strong><span>我的发布</span></button>
        <button type="button" data-page="marketFavorites"><strong>${(state.marketFavoriteIds || []).length}</strong><span>我的收藏</span></button>
        <button type="button" data-page="marketHistory"><strong>${(state.marketHistoryIds || []).length}</strong><span>历史浏览</span></button>
        <button type="button" data-page="following"><strong>${(state.communityFollowingUsers || []).length}</strong><span>我的关注</span></button>
      </section>
      <section class="fresh-card mine-list">
        <button class="mine-row" data-page="reports"><span>表</span><strong>高级报表</strong></button>
        <button class="mine-row" data-page="calendar"><span>◷</span><strong>操作日志</strong></button>
        <button class="mine-row" data-page="satisfaction"><span>☆</span><strong>满意度调查</strong></button>
        <button class="mine-row" data-page="feedback"><span>✎</span><strong>意见反馈</strong></button>
        <button class="mine-row" data-page="account"><span>⚙</span><strong>账号与安全</strong></button>
        <button class="mine-row" data-page="rules"><span>☷</span><strong>平台规则与隐私</strong></button>
        ${state.isCommunityAdmin ? `<button class="mine-row" data-page="moderation"><span>⚑</span><strong>举报审核</strong><em class="mine-row-count">${(state.contentReports || []).filter(item => item.status === "pending").length}</em></button>` : ""}
        ${state.isCommunityAdmin ? `<button class="mine-row" data-page="announcements"><span>◉</span><strong>系统公告</strong></button>` : ""}
        <button class="mine-row" data-page="about"><span>i</span><strong>关于壳友手账</strong></button>
      </section>
    </main>
    ${bottomNav()}
  `;
}

function pageSatisfaction() {
  const reviews = state.satisfactionReviews || [];
  return `
    ${topbar("满意度调查", true)}
    <main class="content page-fresh">
      <section class="page-intro compact-intro">
        <div><p class="eyebrow dark">体验评分</p><h2>给壳友手账打个分</h2><p>你的评价会保存在本机，方便后续继续优化。</p></div>
      </section>
      <form class="fresh-card survey-form" id="satisfactionForm">
        <div class="settings-title">软件满意度</div>
        <div class="rating-row">
          ${[1, 2, 3, 4, 5].map(score => `<button type="button" class="rating-star ${state.satisfactionRating >= score ? "active" : ""}" data-rating="${score}">★</button>`).join("")}
        </div>
        <input type="hidden" name="rating" value="${state.satisfactionRating}">
        <label class="survey-field"><span>评价内容</span><textarea name="comment" required placeholder="写下你觉得好用、不顺手、希望新增的功能"></textarea></label>
        <button class="primary" type="submit">提交评价</button>
      </form>
      <section class="section-title"><span>历史评价</span><small>${reviews.length} 条</small></section>
      ${reviews.map(item => `
        <article class="fresh-card survey-record">
          <strong>${"★".repeat(item.rating)}${"☆".repeat(5 - item.rating)}</strong>
          <p>${item.comment}</p>
          <small>${formatTime(item.createdAt)}</small>
        </article>
      `).join("") || `<div class="empty small-empty"><div><strong>还没有评价</strong><br>提交后会显示在这里</div></div>`}
    </main>
    ${bottomNav()}
  `;
}

function pagePublicSatisfaction() {
  const reviews = CONFIGURED_SMS_BACKEND ? (state.publicReviews || []) : (state.satisfactionReviews || []);
  return `
    ${topbar("满意度调查", true)}
    <main class="content page-fresh">
      <section class="page-intro compact-intro">
        <div><p class="eyebrow dark">体验评分</p><h2>给壳友手账打个分</h2><p>普通用户只查看自己的历史评价，管理员账号可查看全部评价。</p></div>
      </section>
      <form class="fresh-card survey-form" id="satisfactionForm">
        <div class="settings-title">软件满意度</div>
        <div class="rating-row">
          ${[1, 2, 3, 4, 5].map(score => `<button type="button" class="rating-star ${state.satisfactionRating >= score ? "active" : ""}" data-rating="${score}">★</button>`).join("")}
        </div>
        <input type="hidden" name="rating" value="${state.satisfactionRating}">
        <label class="survey-field"><span>评价内容</span><textarea name="comment" required placeholder="写下你觉得好用、不顺手、希望新增的功能"></textarea></label>
        <button class="primary" type="submit">提交评价</button>
      </form>
      <section class="section-title"><span>历史评价</span><small>${reviews.length} 条</small></section>
      ${reviews.map(item => `
        <article class="fresh-card survey-record public-review">
          <div class="review-head">
            <div>
              <strong class="review-stars">${ratingStars(item.rating)}</strong>
              <p class="review-author">${escapeHtml(item.authorName || "壳友")} · ${escapeHtml(item.authorPhone || "")}</p>
            </div>
            ${item.canDelete ? `<button class="danger-link review-delete" type="button" data-delete-review="${item.id}">删除</button>` : ""}
          </div>
          <p>${escapeHtml(item.comment)}</p>
          <small>${formatTime(item.createdAt)}</small>
        </article>
      `).join("") || `<div class="empty small-empty"><div><strong>还没有评价</strong><br>提交后会显示在这里</div></div>`}
    </main>
    ${bottomNav()}
  `;
}

function feedbackAvatarMarkup(item, className = "feedback-avatar") {
  const avatar = item.authorAvatar || "";
  if (avatar) return `<img class="${className}" src="${avatar}" alt="头像">`;
  const letter = String(item.authorName || "壳").trim().slice(0, 1) || "壳";
  return `<div class="${className} fallback-avatar">${escapeHtml(letter)}</div>`;
}

function sortedPublicFeedbacks() {
  const ownPhone = state.loggedInPhone ? maskPhone(state.loggedInPhone) : "";
  return [...(state.publicFeedbackItems || [])].sort((a, b) => {
    const aOwn = a.authorPhone === ownPhone ? 1 : 0;
    const bOwn = b.authorPhone === ownPhone ? 1 : 0;
    if (aOwn !== bOwn) return bOwn - aOwn;
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });
}

function feedbackActionMenu(item) {
  if (state.openFeedbackMenuId !== item.id) return "";
  return `
    <div class="feedback-action-popover">
      <button type="button" data-like-feedback="${item.id}">${item.liked ? "已赞" : "赞"}</button>
      <button type="button" data-comment-feedback="${item.id}">评论</button>
    </div>
  `;
}

function publicFeedbackCard(item, options = {}) {
  const comments = Array.isArray(item.comments) ? item.comments : [];
  const previewComments = options.detail ? comments : comments.slice(0, 2);
  return `
    <article class="feedback-post ${options.detail ? "detail" : ""}">
      <div class="feedback-post-head">
        ${feedbackAvatarMarkup(item)}
        <div class="feedback-post-main">
          <div class="feedback-author-line">
            <strong>${escapeHtml(item.authorName || "壳友")}</strong>
            <span>${escapeHtml(item.authorPhone || "")}</span>
          </div>
          <button class="feedback-body-button" type="button" data-view-feedback="${item.id}">
            <p>${escapeHtml(item.content)}</p>
            <small>${escapeHtml(item.type || "反馈")}</small>
          </button>
          <div class="feedback-post-meta">
            <span>${formatTime(item.createdAt)}</span>
            ${item.canDelete ? `<button class="feedback-delete" type="button" data-delete-feedback="${item.id}">删除</button>` : ""}
            <div class="feedback-action-wrap">
              <button class="feedback-more" type="button" data-feedback-action="${item.id}">••</button>
              ${feedbackActionMenu(item)}
            </div>
          </div>
          ${(item.likeCount || comments.length) ? `
            <div class="feedback-social-line">
              ${item.likeCount ? `<span>赞 ${item.likeCount}</span>` : ""}
              ${comments.length ? `<span>评论 ${comments.length}</span>` : ""}
            </div>
          ` : ""}
          ${previewComments.length ? `
            <div class="feedback-comment-list">
              ${previewComments.map(comment => `
                <div class="feedback-comment-row">
                  <span><strong>${escapeHtml(comment.authorName || "壳友")}</strong>：${escapeHtml(comment.content)}</span>
                  ${comment.canDelete ? `<button type="button" data-delete-feedback-comment="${item.id}:${comment.id}">删除</button>` : ""}
                </div>
              `).join("")}
              ${!options.detail && comments.length > previewComments.length ? `<button class="feedback-view-more" type="button" data-view-feedback="${item.id}">查看全部 ${comments.length} 条评论</button>` : ""}
            </div>
          ` : ""}
        </div>
      </div>
    </article>
  `;
}

function pageFeedback() {
  const items = sortedPublicFeedbacks();
  return `
    ${topbar("意见反馈", true)}
    <main class="content page-fresh feedback-page">
      <section class="page-intro compact-intro feedback-intro">
        <div><p class="eyebrow dark">公开反馈</p><h2>把想法发出来</h2><p>反馈会保存到云端，所有登录用户都能查看、点赞和评论。</p></div>
        <button class="intro-action feedback-suggest-link" type="button" data-page="feedbackAdd">提建议✏️</button>
      </section>
      <section class="section-title"><span>反馈记录</span><small>${items.length} 条</small></section>
      <section class="feedback-feed">
        ${items.map(item => publicFeedbackCard(item)).join("") || `<div class="empty small-empty"><div><strong>还没有反馈</strong><br>发布后会显示在这里</div></div>`}
      </section>
    </main>
    ${bottomNav()}
  `;
}

function pageFeedbackAdd() {
  return `
    ${topbar("提建议", true)}
    <main class="content page-fresh feedback-page">
      <section class="page-intro compact-intro">
        <div><p class="eyebrow dark">公开反馈</p><h2>写下你的想法</h2><p>发布后会进入反馈记录，大家可以点赞和评论。</p></div>
      </section>
      <form class="fresh-card survey-form" id="feedbackForm">
        <label class="survey-field"><span>反馈类型</span><select class="select" name="type"><option>功能建议</option><option>界面问题</option><option>使用问题</option><option>其他</option></select></label>
        <label class="survey-field"><span>反馈内容</span><textarea name="content" required placeholder="写下你遇到的问题，或希望新增的功能"></textarea></label>
        <button class="primary" type="submit">发布反馈</button>
      </form>
    </main>
  `;
}

function currentPublicFeedback() {
  return (state.publicFeedbackItems || []).find(item => item.id === state.selectedFeedbackId);
}

function pageFeedbackDetail() {
  const item = currentPublicFeedback();
  return `
    ${topbar("详情", true)}
    <main class="content page-fresh feedback-page feedback-detail-page">
      ${item ? `
        ${publicFeedbackCard(item, { detail: true })}
        <form class="feedback-detail-comment" id="feedbackCommentForm" data-feedback-id="${item.id}">
          <input class="field" name="content" placeholder="发表评论：" maxlength="600">
          <button class="secondary" type="submit">发送</button>
        </form>
      ` : `<div class="empty small-empty"><div><strong>这条反馈不存在</strong><br>可能已经被删除</div></div>`}
    </main>
  `;
}

function pageAccount() {
  const loggedIn = Boolean(state.loggedInPhone);
  const maskedPhone = state.loggedInPhone ? `${state.loggedInPhone.slice(0, 3)}****${state.loggedInPhone.slice(7)}` : "";
  const codeCooldown = accountCodeCooldownRemaining();
  return `
    ${topbar("账号与安全", true)}
    <main class="content page-fresh">
      <section class="page-intro compact-intro">
        <div><p class="eyebrow dark">账户</p><h2>${loggedIn ? maskedPhone : "手机号登录"}</h2><p>${loggedIn ? "账号已登录，可管理本地资料和同步设置。" : "使用手机号登录；注册时需要创建密码并通过验证码核对。"}</p></div>
      </section>
      ${loggedIn ? `
        <section class="fresh-card survey-form">
          <div class="settings-title">当前账号</div>
          <div class="profile-edit-head">
            ${accountAvatarMarkup("profile-avatar")}
            <div>
              <button class="secondary" type="button" data-account-avatar-button>更换头像</button>
              <p class="muted">支持从本机上传头像</p>
            </div>
          </div>
          <input class="hidden-file" type="file" accept="image/*" lang="zh-CN" title="选择图片" aria-label="选择图片" data-account-avatar-input>
          <section class="default-avatar-picker" aria-label="选择内置头像">
            <div><strong>选择内置头像</strong><span>新用户将随机获得其中一张</span></div>
            <div class="default-avatar-grid">
              ${DEFAULT_ACCOUNT_AVATARS.map((avatar, index) => `<button class="default-avatar-option ${state.accountAvatar === avatar ? "active" : ""}" type="button" data-select-default-avatar="${avatar}" aria-label="选择默认头像 ${index + 1}"><img src="${accountAvatarSource(avatar)}" alt="默认头像 ${index + 1}"></button>`).join("")}
            </div>
          </section>
          <form id="profileForm" class="profile-form-inner">
            <label class="survey-field"><span>昵称</span><input class="field" name="nickname" value="${state.accountName || ""}" placeholder="请输入昵称"></label>
            <button class="primary" type="submit">保存昵称和头像</button>
          </form>
          <p class="muted">手机号：${maskedPhone}</p>
          <button class="logout-card" type="button" data-logout-account>退出账号</button>
        </section>
        <section class="fresh-card settings-card account-safety-card">
          <div class="settings-title">内容与隐私安全</div>
          <button class="account-settings-row" type="button" data-refresh-blocked-users>
            <span><strong>屏蔽与拉黑</strong><small>管理已隐藏内容或禁止联系的用户</small></span>
            <em>${(state.blockedUsers || []).length} 人</em>
          </button>
          <div class="blocked-user-list">
            ${(state.blockedUsers || []).map(user => `<div class="blocked-user-row">${communityAvatar(user, "blocked-user-avatar")}<span><strong>${escapeHtml(user.name || "壳友")}</strong><small>${user.type === "blacklist" ? "已拉黑" : "已屏蔽"}</small></span><button type="button" data-unblock-user="${escapeHtml(user.id || "")}">${user.type === "blacklist" ? "解除拉黑" : "解除屏蔽"}</button></div>`).join("") || `<p class="muted blocked-user-empty">暂无已屏蔽或拉黑的用户</p>`}
          </div>
        </section>
        <section class="fresh-card settings-card account-danger-zone">
          <div class="settings-title">账号注销</div>
          <p class="muted">永久删除账号及相关档案、动态、商品和聊天记录。注销完成后无法恢复。</p>
          <button class="account-delete-button" type="button" data-open-account-delete>永久注销账号</button>
        </section>
        ${state.isCommunityAdmin ? `
          <section class="fresh-card settings-card push-test-card">
            <div class="settings-title">推送通知实机测试</div>
            <p class="muted">本机已允许通知并完成登录后，可向当前设备发送一条测试通知。此入口仅对平台管理员开放。</p>
            <button class="secondary" type="button" data-test-push-notification>发送测试通知</button>
          </section>
        ` : ""}
      ` : `
        <section class="memo-tabs auth-tabs">
          <button class="tab ${state.accountMode === "login" ? "active" : ""}" data-account-mode="login">登录</button>
          <button class="tab ${state.accountMode === "register" ? "active" : ""}" data-account-mode="register">注册</button>
        </section>
        <form class="fresh-card survey-form" id="accountForm" data-auth-form="${state.accountMode}">
          <label class="survey-field"><span>手机号</span><input class="field" name="phone" inputmode="tel" maxlength="11" placeholder="请输入 11 位手机号" value="${state.accountDraftPhone || ""}" required></label>
          <label class="survey-field"><span>${state.accountMode === "register" ? "创建密码" : "登录密码"}</span><input class="field" name="password" type="password" minlength="6" placeholder="至少 6 位密码" value="${state.accountDraftPassword || ""}" required></label>
          ${state.accountMode === "register" ? `
            <label class="survey-field"><span>核对密码</span><input class="field" name="confirmPassword" type="password" minlength="6" placeholder="请再次输入密码" value="${state.accountDraftConfirmPassword || ""}" required><small class="field-error" data-password-error hidden>密码不一致</small></label>
            <div class="code-row">
              <label class="survey-field"><span>验证码</span><input class="field" name="code" inputmode="numeric" maxlength="6" placeholder="6 位验证码" required></label>
              <button class="secondary" type="button" data-send-code ${codeCooldown > 0 ? "disabled" : ""}>${codeCooldown > 0 ? `${codeCooldown} 秒后重试` : "获取验证码"}</button>
            </div>
            <label class="auth-agreement"><input type="checkbox" name="termsAccepted" required><span>我已阅读并同意<button type="button" data-page="rules">《服务与社区规则》</button>及<button type="button" data-page="privacy">《隐私政策》</button></span></label>
            ${!CONFIGURED_SMS_BACKEND && state.pendingAuthCode && state.pendingAuthCode !== SERVER_SMS_CODE ? `<p class="muted auth-code-hint">原型验证码：${state.pendingAuthCode}</p>` : ""}
          ` : ""}
          <button class="primary" type="submit">${state.accountMode === "register" ? "注册并登录" : "登录"}</button>
          ${state.accountMode === "login" ? `<label class="auth-agreement"><input type="checkbox" name="termsAccepted" required><span>我已阅读并同意<button type="button" data-page="rules">《服务与社区规则》</button>及<button type="button" data-page="privacy">《隐私政策》</button></span></label>` : ""}
        </form>
      `}
      <section class="fresh-card settings-card">
        <div class="settings-title">安全状态</div>
        <p class="muted">${CONFIGURED_SMS_BACKEND ? "当前使用真实短信验证服务。" : "当前是本地原型，验证码为模拟发送；上线时可接入短信服务和后端账号系统。"}</p>
      </section>
    </main>
    ${bottomNav()}
  `;
}

function pageReports() {
  const finance = ledgerMoneyStats();
  const breed = breedingStats();
  const profit = finance.sold - finance.purchase - finance.loss;
  const fertileRate = breed.egg ? Math.round((breed.fertile / breed.egg) * 100) : 0;
  const hatchRate = breed.fertile ? Math.round((breed.hatch / breed.fertile) * 100) : 0;
  const financeMax = Math.max(finance.purchase, finance.sold, finance.loss, 1);
  return `
    ${topbar("高级报表", true)}
    <main class="content page-fresh reports-page">
      <section class="page-intro compact-intro report-intro">
        <div>
          <p class="eyebrow dark">数据中心</p>
          <h2>饲养经营，一眼看清</h2>
          <p>汇总经营、繁殖与账本数据，帮助你快速掌握当前状态。</p>
        </div>
        <span class="report-scope">全部记录</span>
      </section>
      <section class="fresh-card report-profit-card ${profit >= 0 ? "positive" : "negative"}">
        <div class="report-profit-copy">
          <span>经营结余</span>
          <strong>¥${money(profit)}</strong>
          <small>售出收入减去收购与损耗</small>
        </div>
        <div class="report-profit-breakdown">
          <div><span>收入</span><b>¥${money(finance.sold)}</b></div>
          <div><span>收购</span><b>¥${money(finance.purchase)}</b></div>
          <div><span>损耗</span><b>¥${money(finance.loss)}</b></div>
        </div>
      </section>
      <section class="fresh-card chart-card report-section">
        <div class="report-section-head">
          <div><span class="report-section-mark">¥</span><div><h3>资金流向</h3><p>收入与支出构成</p></div></div>
          <em>共 ${state.ledgerRecords.length} 笔</em>
        </div>
        ${[
          ["售出收入", finance.sold, "income"],
          ["收购成本", finance.purchase, "purchase"],
          ["损耗金额", finance.loss, "loss"]
        ].map(([label, value, color]) => {
          return `<div class="chart-row ${color}"><div><span>${label}</span><em>¥${money(value)}</em></div><b><i style="width:${Math.round((value / financeMax) * 100)}%"></i></b></div>`;
        }).join("")}
      </section>
      <section class="fresh-card chart-card report-section breeding-section">
        <div class="report-section-head">
          <div><span class="report-section-mark">繁</span><div><h3>繁殖进度</h3><p>从产蛋到孵化的转化</p></div></div>
          <em>${state.breedingRecords.length} 条记录</em>
        </div>
        <div class="breeding-report">
          <div><span>产蛋</span><strong>${breed.egg}</strong><small>枚</small></div>
          <div><span>受精</span><strong>${breed.fertile}</strong><small>枚</small></div>
          <div><span>孵化</span><strong>${breed.hatch}</strong><small>只</small></div>
        </div>
        <div class="report-rate-list">
          <div><span>受精率</span><b><i style="width:${fertileRate}%"></i></b><em>${fertileRate}%</em></div>
          <div><span>孵化率</span><b><i style="width:${hatchRate}%"></i></b><em>${hatchRate}%</em></div>
        </div>
      </section>
      <section class="fresh-card export-card report-section">
        <div class="report-section-head">
          <div><span class="report-section-mark">导</span><div><h3>数据导出</h3><p>保存完整数据，方便备份整理</p></div></div>
        </div>
        <div class="report-export-actions">
          <button class="secondary" type="button" data-export-data="account"><span>档</span><div><strong>全部数据</strong><small>档案、账本和繁殖</small></div></button>
          <button class="secondary" type="button" data-export-data="business"><span>表</span><div><strong>经营报表</strong><small>收购、售出与损耗</small></div></button>
        </div>
      </section>
    </main>
    ${bottomNav()}
  `;
}

function pageSync() {
  return `
    ${topbar("数据同步设置", true)}
    <main class="content page-fresh">
      <section class="page-intro compact-intro">
        <div><p class="eyebrow dark">同步</p><h2>账号云端保存</h2><p>登录后，档案、护理、繁殖、账本、空间资料和图片都会随账号保存到云端，同一账号可在不同设备查看。</p></div>
      </section>
      <section class="fresh-card settings-card">
        <button class="mine-row sync-toggle" data-toggle-sync><span>⇄</span><strong>立即同步到云端</strong><span>›</span></button>
      </section>
    </main>
    ${bottomNav()}
  `;
}

function pageAbout() {
  return `
    ${topbar("关于壳友手账", true)}
    <main class="content page-fresh">
      <section class="page-intro compact-intro">
        <div><p class="eyebrow dark">关于</p><h2>壳友手账</h2><p>为养龟、繁殖和日常经营提供清晰可靠的记录工具。</p></div>
      </section>
      <section class="fresh-card settings-card">
        <div class="settings-title">当前能力</div>
        <p class="muted">登录后，档案、繁殖、账本、护理、操作日志、满意度调查和意见反馈都会随账号保存到云端。</p>
      </section>
      <section class="fresh-card settings-card about-contact-card">
        <div class="settings-title">交流与商务合作</div>
        <div class="about-contact-row"><span>微信号</span><strong>${PLATFORM_SERVICE_WECHAT}</strong></div>
        <button class="about-contact-action" type="button" data-open-platform-wechat>复制微信号并打开微信</button>
        <p class="muted about-contact-tip">微信打开后，粘贴客服微信号并搜索即可添加。</p>
      </section>
      <section class="fresh-card settings-card about-compliance-card">
        <div class="settings-title">规则与隐私</div>
        <p class="muted">使用壳友圈和龟集市前，请阅读平台规则、交易提示与隐私政策。</p>
        <div><button type="button" data-page="rules">查看平台规则</button><button type="button" data-page="privacy">查看隐私政策</button></div>
      </section>
    </main>
    ${bottomNav()}
  `;
}

function pageRules() {
  return `
    ${topbar("平台规则", true)}
    <main class="content page-fresh compliance-page">
      <section class="page-intro compact-intro compliance-intro">
        <div><p class="eyebrow dark">生效日期：2026 年 7 月 17 日</p><h2>服务、社区与交易规则</h2><p>壳友手账提供养龟记录、公开内容发布和商品信息展示服务。</p></div>
      </section>
      <section class="fresh-card policy-card">
        <h3>一、服务范围</h3>
        <p>平台提供档案记录、壳友圈内容发布、龟集市商品信息展示、关注和聊天咨询功能。龟集市仅用于信息发布与沟通撮合，不提供在线支付、资金托管、担保交易、验货、物流或售后承诺。</p>
      </section>
      <section class="fresh-card policy-card">
        <h3>二、发布与交易要求</h3>
        <ol><li>发布者应如实填写品种、尺寸、克重、健康状况、照片或视频、交付方式和价格。</li><li>不得发布国家重点保护野生动物、来源或许可不合法的个体，或其他法律法规禁止交易、运输、寄递的内容。</li><li>不得虚假宣传、欺诈、诱导站外付款、发布他人隐私、侵权图片视频或违法联系方式。</li><li>买卖双方应自行核验合法来源、健康状况、运输条件和当地监管要求；交易风险由双方依法律与约定承担。</li></ol>
      </section>
      <section class="fresh-card policy-card">
        <h3>三、壳友圈与聊天规则</h3>
        <p>不得发布违法、暴力、色情、赌博、诈骗、仇恨、侵权、侮辱诽谤、个人敏感信息或其他损害他人权益的内容。不得骚扰、冒用他人身份或批量营销。</p>
      </section>
      <section class="fresh-card policy-card">
        <h3>四、举报与处置</h3>
        <p>用户可在动态详情或商品详情中举报内容。平台会留存举报记录并核验；对违规内容可采取删除动态、下架商品、限制发布或关闭账号等措施。举报并不代表平台已对交易事实作出认定。</p>
        <p>用户可以屏蔽其他用户。屏蔽后，该用户的动态、商品和消息会立即从当前用户的页面中移除，同时平台会收到相关内容或近期互动信息以便核验；用户可在“账号与安全—已屏蔽用户”中解除屏蔽。</p>
      </section>
      <section class="fresh-card policy-card">
        <h3>五、规则变更与联系我们</h3>
        <p>涉及收费、交易、争议解决等重大变更会在应用内显著提示并要求重新确认。壳友手账由陈仔健运营；对规则、投诉或数据权利有疑问，可联系平台客服微信：<strong>${PLATFORM_SERVICE_WECHAT}</strong>。</p>
      </section>
      <button class="compliance-link-card" type="button" data-page="privacy"><span>隐私政策</span><b>›</b></button>
    </main>
    ${bottomNav()}
  `;
}

function pagePrivacy() {
  return `
    ${topbar("隐私政策", true)}
    <main class="content page-fresh compliance-page">
      <section class="page-intro compact-intro compliance-intro">
        <div><p class="eyebrow dark">生效日期：2026 年 7 月 17 日</p><h2>壳友手账隐私政策</h2><p>个人信息处理者：陈仔健。我们按合法、正当、必要原则处理与你使用服务直接相关的信息。</p></div>
      </section>
      <section class="fresh-card policy-card">
        <h3>一、我们收集的信息</h3>
        <p>注册和登录时收集手机号、密码验证信息与昵称；你主动上传的头像、乌龟档案、龟池、护理、繁殖、账本、壳友圈、商品、聊天和反馈内容会用于提供对应功能。你主动点击定位并授权后，平台仅将所在城市用于商品发布展示。</p>
      </section>
      <section class="fresh-card policy-card">
        <h3>二、使用目的</h3>
        <p>用于账号认证、跨设备同步、内容发布与展示、买卖双方咨询、内容安全审核、故障排查和服务改进。你同意通知权限后，通知设备标识仅用于聊天消息等系统提醒。我们不会将你的个人信息用于与上述目的无关的用途。</p>
      </section>
      <section class="fresh-card policy-card">
        <h3>三、存储与共享</h3>
        <p>数据存储在中国境内服务器。公开发布的壳友圈和龟集市内容会向其他用户展示；聊天内容仅向会话双方及依法履行审核职责的人员展示。除法律法规要求、保护用户权益或获得你的单独同意外，不会向第三方出售个人信息。</p>
      </section>
      <section class="fresh-card policy-card">
        <h3>四、信息保护与备份</h3>
        <p>服务端使用账号验证、访问控制和定期备份保护数据。数据库及上传媒体会建立灾备副本并按保留策略清理，灾难恢复备份默认最长保留 30 天；备份仅用于故障恢复和安全审计，不用于公开展示。</p>
      </section>
      <section class="fresh-card policy-card">
        <h3>五、你的权利</h3>
        <p>你可在“我的空间—账号与安全”中修改昵称和头像、管理已屏蔽用户，并删除自己发布的动态或商品。你也可在该页面选择“永久注销账号”，完成密码验证和二次确认后，直接在应用内删除账号及相关个人数据，无需联系客服。依法需要留存的安全与投诉记录将仅在必要期限内限制保存。</p>
      </section>
      <section class="fresh-card policy-card">
        <h3>六、未成年人</h3>
        <p>如你未满十八周岁，请在监护人同意和指导下使用本服务。我们不会故意收集与服务无关的未成年人信息。</p>
      </section>
      <button class="compliance-link-card" type="button" data-page="rules"><span>服务与社区规则</span><b>›</b></button>
    </main>
    ${bottomNav()}
  `;
}

function reportTypeLabel(type) {
  return type === "market" ? "龟集市商品" : "壳友圈动态";
}

function reportStatusLabel(status) {
  return ({ pending: "待审核", resolved: "已处理", removed: "已处置" })[status] || "待审核";
}

function pageModeration() {
  const reports = state.contentReports || [];
  const pendingCount = reports.filter(item => item.status === "pending").length;
  return `
    ${topbar("举报审核", true)}
    <main class="content page-fresh moderation-page">
      <section class="page-intro compact-intro moderation-intro"><div><p class="eyebrow dark">内容安全</p><h2>${pendingCount} 条待审核</h2><p>核验举报理由和原始内容后，再决定删除动态或下架商品。</p></div></section>
      <section class="moderation-report-list">${reports.map(item => `
        <article class="fresh-card moderation-report-card">
          <div class="moderation-report-head"><span>${reportTypeLabel(item.targetType)}</span><em class="${item.status}">${reportStatusLabel(item.status)}</em></div>
          <strong>${escapeHtml(item.targetTitle || "内容已删除")}</strong>
          <p><b>举报原因：</b>${escapeHtml(item.reasonLabel || item.reason || "其他")}</p>
          ${item.detail ? `<p><b>补充说明：</b>${escapeHtml(item.detail)}</p>` : ""}
          <small>${escapeHtml(item.reporterName || "匿名用户")} · ${formatTime(item.createdAt)}${item.targetExists ? "" : " · 原内容已不存在"}</small>
          ${item.status === "pending" ? `<div class="moderation-report-actions"><button type="button" data-process-content-report="${item.id}" data-report-action="resolve">标记已处理</button><button class="danger" type="button" data-process-content-report="${item.id}" data-report-action="remove">${item.targetType === "market" ? "下架商品" : "删除动态"}</button></div>` : ""}
        </article>
      `).join("") || `<div class="empty small-empty"><div><strong>暂时没有举报</strong><br>新提交的举报会显示在这里。</div></div>`}</section>
    </main>
    ${bottomNav()}
  `;
}

function announcementStatusLabel(status) {
  return status === "active" ? "展示中" : "已结束";
}

function pageAnnouncements() {
  const announcements = state.adminSystemAnnouncements || [];
  return `
    ${topbar("系统公告", true)}
    <main class="content page-fresh announcement-admin-page">
      <section class="page-intro compact-intro"><div><p class="eyebrow dark">平台通知</p><h2>向所有用户发布公告</h2><p>发布后，用户下次打开 App 会看到弹窗；已开启通知的设备会同时收到推送。</p></div></section>
      <form class="fresh-card survey-form announcement-form" data-system-announcement-form>
        <label class="survey-field"><span>公告标题</span><input class="field" name="title" maxlength="48" required placeholder="例如：服务恢复通知"></label>
        <label class="survey-field"><span>公告内容</span><textarea name="content" maxlength="1200" required placeholder="请清楚说明发生了什么、当前影响和预计恢复时间"></textarea></label>
        <label class="survey-field"><span>结束展示时间（可选）</span><input class="field" type="datetime-local" name="expiresAt"></label>
        <label class="announcement-pin"><input type="checkbox" name="pinned"><span>置顶显示</span><small>有多条公告时优先展示</small></label>
        <button class="primary" type="submit">发布公告</button>
      </form>
      <section class="section-title"><span>已发布公告</span><small>${announcements.length} 条</small></section>
      <section class="announcement-admin-list">
        ${announcements.map(item => `<article class="fresh-card announcement-admin-card">
          <div><span class="announcement-status ${item.status === "active" ? "active" : "ended"}">${announcementStatusLabel(item.status)}</span>${item.pinned ? `<span class="announcement-pinned">置顶</span>` : ""}<small>${formatTime(item.createdAt)}</small></div>
          <strong>${escapeHtml(item.title || "系统公告")}</strong>
          <p>${escapeHtml(item.content || "").replace(/\n/g, "<br>")}</p>
          ${item.expiresAt ? `<small>计划结束：${formatTime(item.expiresAt)}</small>` : ""}
          <footer>${item.status === "active" ? `<button type="button" data-system-announcement-action="end" data-system-announcement-id="${item.id}">结束展示</button>` : ""}<button class="danger" type="button" data-system-announcement-action="delete" data-system-announcement-id="${item.id}">删除</button></footer>
        </article>`).join("") || `<div class="empty small-empty"><div><strong>还没有系统公告</strong><br>发布后会在这里管理展示状态。</div></div>`}
      </section>
    </main>
    ${bottomNav()}
  `;
}

function placeholder(title) {
  return `${topbar(title, true)}<main class="content page-fresh"><div class="empty"><strong>${title}</strong><br>这个入口已经放好，后续可以继续扩展。</div></main>`;
}

function render() {
  if (state.page === "membership") state.page = "mine";
  applyTheme();
  if (forceUpdateState.required) {
    $app.innerHTML = forceUpdatePage();
    bindForceUpdateActions();
    return;
  }
  const pages = {
    home: pageHome,
    messages: pageMessages,
    community: pageCommunity,
    communityPostDetail: pageCommunityPostDetail,
    communityAdd: pageCommunityAdd,
    communityFriends: pageCommunityFriends,
    communityChat: pageCommunityChat,
    following: pageFollowing,
    followingProfile: pageFollowingProfile,
    communityProfile: pageCommunityProfile,
    market: pageMarket,
    marketAdd: pageMarketAdd,
    marketDetail: pageMarketDetail,
    marketSeller: pageMarketSeller,
    marketMy: pageMyMarketListings,
    marketFavorites: pageMarketFavorites,
    marketHistory: pageMarketHistory,
    list: pageList,
    growth: pageGrowth,
    turtleDetail: pageTurtleDetail,
    species: pageSpecies,
    breeds: pageBreeds,
    add: pageAdd,
    memos: pageMemos,
    ledger: pageLedger,
    ledgerDetail: pageLedgerDetail,
    calendar: pageCalendar,
    mine: pageMine,
    satisfaction: pagePublicSatisfaction,
    feedback: pageFeedback,
    feedbackAdd: pageFeedbackAdd,
    feedbackDetail: pageFeedbackDetail,
    account: pageAccount,
    reports: pageReports,
    about: pageAbout,
    rules: pageRules,
    privacy: pagePrivacy,
    moderation: pageModeration,
    announcements: pageAnnouncements,
    breeding: pageBreeding,
    breedingAdd: pageBreedingAdd,
    breedingDetail: pageBreedingDetail,
    pools: pageTurtlePools,
    poolAdd: pageTurtlePoolAdd
  };
  // Reset before replacing content. Resetting after a complete DOM replacement
  // makes iOS recompute fixed surfaces twice and causes the visible tab-bar hop.
  if (pendingPageScrollReset) {
    pendingPageScrollReset = false;
    if (window.scrollY > 1) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }
  // Root tab pages retain one physical bottom-nav node between renders. Its
  // safe-area geometry and compositor layer therefore remain stable while only
  // the middle content is replaced.
  const persistentBottomNav = $app.querySelector(".bottom-nav");
  $app.innerHTML = (pages[state.page] || pageHome)() + policyConsentGate() + systemAnnouncementOverlay();
  const incomingBottomNav = $app.querySelector(".bottom-nav");
  if (persistentBottomNav && incomingBottomNav) {
    incomingBottomNav.replaceWith(persistentBottomNav);
    syncPersistentBottomNav(persistentBottomNav);
  }
  if (pendingPageEnterMotion) {
    pendingPageEnterMotion = false;
    $app.classList.remove("page-enter-motion");
    void $app.offsetWidth;
    $app.classList.add("page-enter-motion");
    if (pageEnterMotionTimer) window.clearTimeout(pageEnterMotionTimer);
    pageEnterMotionTimer = window.setTimeout(() => {
      $app.classList.remove("page-enter-motion");
      pageEnterMotionTimer = null;
    }, 380);
  }
  if (pendingCommunityChatEnterMotion) {
    pendingCommunityChatEnterMotion = false;
    $app.classList.remove("community-chat-enter-motion");
    void $app.offsetWidth;
    $app.classList.add("community-chat-enter-motion");
    window.setTimeout(() => $app.classList.remove("community-chat-enter-motion"), 300);
  }
  bindEvents();
  setupMarketInfiniteScroll();
  setupCommunityInfiniteScroll();
  requestAnimationFrame(() => {
    hydrateVideoFirstFrames();
    hydrateCommunityPostVideos();
    hydrateMarketDetailVideos();
    // 时间轴保持从旧到新，进入成长记录时直接定位最右侧的最新一次；
    // 之后可自然向左回看旧记录、向右回到最新记录。
    if (state.page === "growth") {
      document.querySelectorAll("[data-growth-history-flow]").forEach(flow => {
        flow.scrollLeft = Math.max(0, flow.scrollWidth - flow.clientWidth);
      });
    }
  });
  if (state.page === "communityChat") scrollCommunityChatToLatest();
  hydrateSpeciesImages();
  startAccountCodeCooldownTimer();
  if (state.page === "satisfaction") refreshPublicReviews();
  if (["feedback", "feedbackAdd", "feedbackDetail"].includes(state.page)) refreshPublicFeedback();
  if (["messages", "community", "communityFriends", "communityProfile", "mine"].includes(state.page)) refreshCommunity();
  if (["mine", "following", "followingProfile"].includes(state.page)) refreshFollowing();
  if (state.page === "moderation") refreshContentReports();
  if (state.page === "announcements") refreshSystemAnnouncements();
  if (state.page === "communityProfile" && state.selectedCommunityUserId) refreshCommunityUserProfile();
  if (state.page === "communityChat" && state.selectedCommunityFriendId) refreshCommunityChat();
  if (["market", "marketDetail", "marketSeller", "marketMy", "marketFavorites", "marketHistory", "following", "followingProfile", "mine"].includes(state.page)) refreshMarket();
  if (state.page === "marketAdd") requestMarketCityAutofill();
  if (state.page === "market") requestAnimationFrame(syncMarketWifiVideos);
  refreshMessageUnread();
  refreshSystemAnnouncements();
}

function policyConsentGate() {
  if (!state.policyConsentRequired || !state.loggedInPhone) return "";
  return `
    <div class="policy-consent-overlay" role="dialog" aria-modal="true" aria-labelledby="policyConsentTitle">
      <form class="policy-consent-dialog" data-policy-consent-form>
        <p class="policy-consent-kicker">服务协议更新</p>
        <h1 id="policyConsentTitle">请阅读并同意服务协议</h1>
        <p>为继续使用壳友手账，请阅读最新版《服务与社区规则》和《隐私政策》。本次更新生效日期为 2026 年 7 月 17 日。</p>
        <div class="policy-consent-links">
          <a href="https://api.turtleworld.cn/terms.html" target="_blank" rel="noopener noreferrer">查看服务与社区规则 <b>›</b></a>
          <a href="https://api.turtleworld.cn/privacy.html" target="_blank" rel="noopener noreferrer">查看隐私政策 <b>›</b></a>
        </div>
        <label class="policy-consent-check"><input type="checkbox" data-policy-consent-check><span>我已阅读并同意上述协议</span></label>
        <p class="policy-consent-error" data-policy-consent-error hidden aria-live="polite"></p>
        <button class="primary policy-consent-submit" type="submit" data-policy-consent-submit disabled>同意并继续使用</button>
        <button class="policy-consent-logout" type="button" data-policy-consent-logout>暂不同意，退出账号</button>
      </form>
    </div>
  `;
}

function scrollCommunityChatToLatest() {
  if (!pendingCommunityChatLatestScroll || state.page !== "communityChat") return;
  if (!communityChatLoadedKey && !(state.communityChatMessages || []).length) return;
  pendingCommunityChatLatestScroll = false;
  const list = document.querySelector(".community-chat-list");
  if (!list) return;
  // Media bubbles reserve their own stable aspect-ratio box, so one final
  // positioning pass reaches the newest message without waiting for media.
  const anchor = list.querySelector(".community-chat-bottom-anchor");
  if (anchor) anchor.scrollIntoView({ block: "end", inline: "nearest", behavior: "auto" });
  else window.scrollTo({ top: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight), left: 0, behavior: "auto" });
}

function accountCodeCooldownRemaining() {
  return Math.max(0, Math.ceil((Number(state.accountCodeCooldownUntil || 0) - Date.now()) / 1000));
}

function startAccountCodeCooldownTimer() {
  if (accountCooldownTimer) clearInterval(accountCooldownTimer);
  const button = document.querySelector("[data-send-code]");
  if (!button) return;
  const syncButton = () => {
    const remaining = accountCodeCooldownRemaining();
    button.disabled = remaining > 0;
    button.textContent = remaining > 0 ? `${remaining} 秒后重试` : "获取验证码";
    if (remaining <= 0 && accountCooldownTimer) {
      clearInterval(accountCooldownTimer);
      accountCooldownTimer = null;
    }
  };
  syncButton();
  if (accountCodeCooldownRemaining() > 0) accountCooldownTimer = setInterval(syncButton, 1000);
}

function bindEvents() {
  setupNativeMessageRowSwipes($app);
  if (state.openTurtleMenuId) {
    $app.addEventListener("click", event => {
      if (event.target.closest("[data-toggle-turtle-menu], .turtle-menu")) return;
      const draft = state.page === "turtleDetail" ? captureTurtleDetailDraft() : null;
      setState({
        openTurtleMenuId: "",
        turtleDetailDraftId: draft ? state.selectedTurtleId : state.turtleDetailDraftId,
        turtleDetailDraft: draft || state.turtleDetailDraft
      });
    }, { once: true });
  }
  if (state.openLedgerMenuId) {
    $app.addEventListener("click", event => {
      if (event.target.closest("[data-toggle-ledger-menu], .ledger-action-menu")) return;
      setState({ openLedgerMenuId: "" });
    }, { once: true });
  }
  if (state.openFeedbackMenuId) {
    $app.addEventListener("click", event => {
      if (event.target.closest("[data-feedback-action], .feedback-action-popover")) return;
      setState({ openFeedbackMenuId: "" }, { skipCloud: true });
    }, { once: true });
  }
  if (state.openBreedingMenuId) {
    $app.addEventListener("click", event => {
      if (event.target.closest("[data-toggle-breeding-menu], .breeding-actions-menu")) return;
      setState({ openBreedingMenuId: "" });
    }, { once: true });
  }
  document.querySelectorAll("[data-page]").forEach(el => {
    // Do not persist the event-binding flag in markup.  A page-back snapshot
    // is restored with brand-new DOM nodes; a data attribute copied into that
    // snapshot made bindEvents() wrongly skip those nodes, leaving the home
    // dashboard's add / care / breeding / pool buttons untappable.
    // A JavaScript-only property survives only on the one physical node that
    // is intentionally kept alive (the bottom navigation), while restored
    // snapshot nodes are correctly bound again.
    if (el.__turtlekeeperPageNavigationBound) return;
    el.__turtlekeeperPageNavigationBound = true;
    el.removeAttribute("data-page-navigation-bound");
    el.addEventListener("click", event => {
    event.preventDefault();
    const targetPage = el.dataset.page;
    if (targetPage === "add" && !requireArchiveCapacity()) return;
    if (["breedingAdd", "feedbackAdd", "communityAdd", "communityFriends", "marketAdd", "poolAdd"].includes(targetPage) && !requireLogin()) return;
    if (targetPage === "reports" && !requireLogin()) return;
    if (targetPage === "moderation" && !state.isCommunityAdmin) return toast("仅平台管理员可审核举报");
    if (targetPage === "announcements" && !state.isCommunityAdmin) return toast("仅平台管理员可管理系统公告");
    const navigationState = { page: targetPage, openTurtleMenuId: "", openLedgerMenuId: "", openBreedingMenuId: "", openFeedbackMenuId: "", updatingTurtleId: "", turtleDetailDraftId: "", turtleDetailDraft: null, updateDraftPhoto: "" };
    if (targetPage === "poolAdd") navigationState.editingTurtlePoolId = "";
    if (targetPage === "marketAdd") {
      navigationState.editingMarketListingId = "";
      navigationState.marketDraftTurtleId = "";
      navigationState.marketDraftMedia = [];
      navigationState.marketDraftCity = "";
      navigationState.marketDraftLatitude = "";
      navigationState.marketDraftLongitude = "";
      navigationState.marketDraftDescription = "";
      navigationState.marketDraftDescriptionTemplate = "";
      navigationState.marketLocationStatus = "idle";
    }
    if (targetPage === "market" && state.page !== "market") {
      marketLastLoadedAt = 0;
      Object.assign(navigationState, {
        marketFeedInitialized: false,
        marketFeedNextOffset: 0,
        marketFeedHasMore: true,
        marketFeedLoadingMore: false
      });
    }
    if (targetPage === "species") {
      navigationState.speciesPickerForAdd = state.page === "add";
      if (state.page === "add") navigationState.formDraft = captureTurtleFormDraft();
    }
      // 壳友圈的内容随后会由接口在原列表中补齐。不要先播放淡入缩放
      // 再补数据，否则在 iPhone 上会像页面重新渲染了一次。
      setState(navigationState, targetPage === "community" ? { pageMotion: "none" } : {});
    });
  });
  document.querySelectorAll("[data-open-platform-wechat]").forEach(button => button.addEventListener("click", openPlatformWeChat));
  document.querySelectorAll("[data-open-platform-service-dialog]").forEach(button => button.addEventListener("click", openMarketTopService));
  document.querySelectorAll("[data-back]").forEach(el => el.addEventListener("click", navigateBack));
  document.querySelectorAll("[data-view-turtle]").forEach(el => el.addEventListener("click", () => setState({ page: "turtleDetail", selectedTurtleId: el.dataset.viewTurtle, openTurtleMenuId: "", updatingTurtleId: "", turtleDetailDraftId: "", turtleDetailDraft: null, updateDraftPhoto: "" })));
  // The product gallery's legacy drag path writes the exact finger position
  // immediately instead of waiting for a scroll animation frame. Use that
  // same single-owner strategy here: iOS keeps vertical page scroll, while
  // growth history owns a confirmed horizontal drag from start to release.
  document.querySelectorAll("[data-growth-history-flow]").forEach(flow => {
    let historyDrag = null;
    let suppressClickUntil = 0;
    const card = flow.closest(".growth-update-card");
    const clearHistoryDrag = event => {
      if (!historyDrag) return;
      const active = historyDrag;
      historyDrag = null;
      if (!active.horizontal) return;
      suppressClickUntil = Date.now() + 420;
      try { flow.releasePointerCapture(active.pointerId); } catch {}
      card?.classList.remove("is-history-interacting");
      event?.preventDefault();
      event?.stopPropagation();
    };
    flow.addEventListener("pointerdown", event => {
      if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0) || event.target.closest("button")) return;
      historyDrag = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        startScrollLeft: flow.scrollLeft,
        horizontal: false
      };
    }, { passive: true });
    flow.addEventListener("pointermove", event => {
      const active = historyDrag;
      if (!active || active.pointerId !== event.pointerId || !event.isPrimary) return;
      const dx = event.clientX - active.x;
      const dy = event.clientY - active.y;
      if (!active.horizontal) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return;
        if (Math.abs(dy) >= Math.abs(dx)) {
          historyDrag = null;
          return;
        }
        active.horizontal = true;
      }
      card?.classList.add("is-history-interacting");
      flow.setPointerCapture?.(active.pointerId);
      // Same immediate write as the legacy product-gallery drag path.
      // Do not batch this in requestAnimationFrame: that adds visible lag.
      flow.scrollLeft = active.startScrollLeft - dx;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
    }, { passive: false });
    flow.addEventListener("pointerup", clearHistoryDrag, { passive: false });
    flow.addEventListener("pointercancel", clearHistoryDrag, { passive: false });
    flow.addEventListener("click", event => {
      // Never let a timeline tap enter the archive. Buttons inside it (such
      // as delete) keep their own behaviour and already stop propagation.
      event.stopPropagation();
      if (Date.now() < suppressClickUntil) event.preventDefault();
    });
  });
  document.querySelectorAll("[data-growth-filter]").forEach(button => button.addEventListener("click", () => setState({ growthFilter: button.dataset.growthFilter }, { pageScroll: "preserve" })));
  document.querySelectorAll("[data-delete-growth-update]").forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    deleteGrowthUpdate(button.dataset.growthTurtleId, button.dataset.deleteGrowthUpdate);
  }));
  document.querySelectorAll("[data-toggle-turtle-menu]").forEach(btn => btn.addEventListener("click", event => {
    event.stopPropagation();
    const draft = state.page === "turtleDetail" ? captureTurtleDetailDraft() : null;
    setState({
      openTurtleMenuId: state.openTurtleMenuId === btn.dataset.toggleTurtleMenu ? "" : btn.dataset.toggleTurtleMenu,
      turtleDetailDraftId: draft ? state.selectedTurtleId : state.turtleDetailDraftId,
      turtleDetailDraft: draft || state.turtleDetailDraft
    });
  }));
  document.querySelectorAll("[data-update-turtle]").forEach(btn => btn.addEventListener("click", event => {
    event.stopPropagation();
    if (!requireLogin()) return;
    const draft = captureTurtleDetailDraft();
    setState({
      updatingTurtleId: btn.dataset.updateTurtle,
      turtleDetailDraftId: draft ? state.selectedTurtleId : "",
      turtleDetailDraft: draft,
      openTurtleMenuId: "",
      page: "turtleDetail",
      selectedTurtleId: btn.dataset.updateTurtle
    });
    requestAnimationFrame(() => document.querySelector("#turtleDetailForm")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }));
  document.querySelector("[data-clear-update-photo]")?.addEventListener("click", () => {
    if (!requireLogin()) return;
    setState({
      turtleDetailDraftId: state.selectedTurtleId,
      turtleDetailDraft: captureTurtleDetailDraft(),
      updateDraftPhoto: "__CLEAR__"
    });
  });
  document.querySelector("[data-update-photo-button]")?.addEventListener("click", () => {
    if (!requireLogin()) return;
    const input = document.querySelector("[data-update-photo-input]");
    if (!input) return;
    input.value = "";
    input.click();
  });
  document.querySelector("[data-update-photo-input]")?.addEventListener("change", readUpdatePhoto);
  document.querySelector("#turtleDetailForm")?.addEventListener("submit", submitTurtleDetail);
  document.querySelectorAll("[data-ledger-for-turtle]").forEach(btn => btn.addEventListener("click", event => {
    event.stopPropagation();
    if (!requireLogin()) return;
    const [type, turtleId] = btn.dataset.ledgerForTurtle.split(":");
    openLedgerForm(type, turtleId);
  }));
  document.querySelectorAll("[data-delete-turtle]").forEach(btn => btn.addEventListener("click", event => {
    event.stopPropagation();
    deleteTurtle(btn.dataset.deleteTurtle);
  }));
  setupDashboardTurtleReorder();
  document.querySelector("[data-filter-species]")?.addEventListener("change", e => setState({ turtleFilter: e.target.value }));
  document.querySelector("[data-filter-pool]")?.addEventListener("change", e => setState({ turtlePoolFilter: e.target.value }));
  document.querySelector("[data-sort-turtles]")?.addEventListener("change", e => setState({ turtleSort: e.target.value }));
  document.querySelector("[data-species-search]")?.addEventListener("input", e => filterSpeciesRows(e.target.value));
  document.querySelectorAll("[data-scroll-letter]").forEach(btn => btn.addEventListener("click", () => scrollToSpeciesLetter(btn.dataset.scrollLetter)));
  document.querySelectorAll("[data-add-species]").forEach(btn => btn.addEventListener("click", () => addKeptSpecies(btn.dataset.addSpecies)));
  document.querySelectorAll("[data-remove-species]").forEach(btn => btn.addEventListener("click", () => removeKeptSpecies(btn.dataset.removeSpecies)));
  document.querySelectorAll("[data-gender]").forEach(btn => btn.addEventListener("click", () => {
    if (!requireLogin()) return;
    preserveTurtleForm({ formGender: btn.dataset.gender });
  }));
  document.querySelectorAll("[data-turtle-choice]").forEach(btn => btn.addEventListener("click", () => {
    if (!requireLogin()) return;
    const field = btn.dataset.turtleChoice;
    preserveTurtleForm({ formDraft: { ...captureTurtleFormDraft(), [field]: btn.dataset.choiceValue } });
  }));
  document.querySelectorAll("[data-detail-choice]").forEach(btn => btn.addEventListener("click", () => {
    if (!requireLogin()) return;
    const field = btn.dataset.detailChoice;
    const row = btn.closest(".detail-choice-row");
    const input = row?.querySelector(`input[name="${field}"]`);
    if (!row || !input) return;
    input.value = btn.dataset.choiceValue;
    row.querySelectorAll("[data-detail-choice]").forEach(choice => choice.classList.toggle("active", choice === btn));
  }));
  document.querySelectorAll("[data-growth-photo-preview]").forEach(img => {
    const openPreview = () => openImagePreview(img.currentSrc || img.src, img.alt || "成长照片");
    img.addEventListener("click", openPreview);
    img.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openPreview();
    });
  });
  const marketPreviewImages = Array.from(document.querySelectorAll("[data-preview-market-image]"))
    .map(img => ({ src: img.currentSrc || img.src, alt: img.alt || "商品实拍图" }))
    .filter(item => item.src);
  document.querySelectorAll("[data-preview-market-image]").forEach((img, index) => {
    const openPreview = () => {
      if (Date.now() < marketGalleryPreviewSuppressUntil) return;
      openImagePreview(img.currentSrc || img.src, img.alt || "商品实拍图", {
        gallery: marketPreviewImages,
        index
      });
    };
    img.addEventListener("click", openPreview);
    img.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openPreview();
    });
  });
  document.querySelectorAll("[data-purchase-gender]").forEach(btn => btn.addEventListener("click", () => {
    if (!requireLogin()) return;
    const draft = captureLedgerFormDraft();
    draft.purchaseGender = btn.dataset.purchaseGender;
    setState({ ledgerDraftForm: draft, ledgerPurchaseGender: btn.dataset.purchaseGender });
  }));
  document.querySelector("[data-photo-input-button]")?.addEventListener("click", () => {
    if (!requireLogin()) return;
    const input = document.querySelector("[data-photo-input]");
    if (!input) return;
    input.value = "";
    input.click();
  });
  document.querySelector("[data-photo-clear]")?.addEventListener("click", () => {
    if (!requireLogin()) return;
    const input = document.querySelector("[data-photo-input]");
    if (input) input.value = "";
    preserveTurtleForm({ formPhoto: "" });
  });
  document.querySelector("[data-photo-input]")?.addEventListener("change", readPhoto);
  document.querySelector("#turtleForm")?.addEventListener("submit", submitTurtle);
  document.querySelector("[data-new-memo]")?.addEventListener("click", () => {
    if (!requireLogin()) return;
    setState({ memoDraftOpen: true, memoEditingId: "" });
  });
  document.querySelector("[data-cancel-memo]")?.addEventListener("click", () => setState({ memoDraftOpen: false, memoEditingId: "" }));
  document.querySelector("#memoForm")?.addEventListener("submit", submitMemoForm);
  document.querySelectorAll("[data-memo-tab]").forEach(btn => btn.addEventListener("click", () => setState({ memoTab: btn.dataset.memoTab })));
  document.querySelectorAll("[data-edit-memo]").forEach(btn => btn.addEventListener("click", () => {
    if (!requireLogin()) return;
    setState({ memoDraftOpen: true, memoEditingId: btn.dataset.editMemo });
  }));
  document.querySelectorAll("[data-delete-memo]").forEach(btn => btn.addEventListener("click", () => deleteMemo(btn.dataset.deleteMemo)));
  document.querySelectorAll("[data-new-ledger]").forEach(btn => btn.addEventListener("click", () => openLedgerForm(btn.dataset.newLedger)));
  document.querySelectorAll("[data-ledger-tab]").forEach(btn => btn.addEventListener("click", () => setState({ ledgerTab: btn.dataset.ledgerTab })));
  document.querySelectorAll("[data-ledger-date-preset]").forEach(btn => btn.addEventListener("click", () => setState({
    ledgerDatePreset: btn.dataset.ledgerDatePreset,
    ledgerDateFrom: "",
    ledgerDateTo: ""
  })));
  document.querySelectorAll("[data-view-ledger]").forEach(el => el.addEventListener("click", () => setState({ page: "ledgerDetail", selectedLedgerId: el.dataset.viewLedger, openLedgerMenuId: "" })));
  document.querySelectorAll("[data-toggle-ledger-menu]").forEach(btn => btn.addEventListener("click", event => {
    event.stopPropagation();
    setState({ openLedgerMenuId: state.openLedgerMenuId === btn.dataset.toggleLedgerMenu ? "" : btn.dataset.toggleLedgerMenu });
  }));
  document.querySelectorAll("[data-delete-ledger]").forEach(btn => btn.addEventListener("click", event => {
    event.stopPropagation();
    deleteLedgerRecord(btn.dataset.deleteLedger);
  }));
  document.querySelector("[data-cancel-ledger]")?.addEventListener("click", () => setState({ ledgerDraftType: "", ledgerDraftPhoto: "", ledgerDraftTurtleId: "", ledgerDraftForm: {}, ledgerPurchaseGender: "未知" }));
  document.querySelector("#ledgerForm [name='turtleId']")?.addEventListener("change", event => {
    if (!requireLogin()) return;
    const turtle = (state.turtles || []).find(item => item.id === event.target.value);
    const draft = captureLedgerFormDraft();
    if (turtle?.poolId && ["purchase", "loss"].includes(state.ledgerDraftType)) draft.poolId = turtle.poolId;
    setState({ ledgerDraftTurtleId: event.target.value || "", ledgerDraftForm: draft }, { skipCloud: true });
  });
  document.querySelector("[data-ledger-photo-button]")?.addEventListener("click", () => {
    if (!requireLogin()) return;
    const input = document.querySelector("[data-ledger-photo-input]");
    if (!input) return;
    input.value = "";
    input.click();
  });
  document.querySelector("[data-ledger-photo-input]")?.addEventListener("change", readLedgerPhoto);
  document.querySelector("#ledgerForm")?.addEventListener("submit", submitLedgerRecord);
  document.querySelector("[data-breeding-photo-button]")?.addEventListener("click", () => {
    if (!requireLogin()) return;
    const input = document.querySelector("[data-breeding-photo-input]");
    if (!input) return;
    input.value = "";
    input.click();
  });
  document.querySelector("[data-breeding-photo-input]")?.addEventListener("change", readBreedingPhoto);
  document.querySelectorAll("[data-view-breeding]").forEach(el => el.addEventListener("click", () => setState({ page: "breedingDetail", selectedBreedingId: el.dataset.viewBreeding, openBreedingMenuId: "", breedingEditPhoto: "" })));
  document.querySelectorAll("[data-toggle-breeding-menu]").forEach(btn => btn.addEventListener("click", event => {
    event.stopPropagation();
    setState({ openBreedingMenuId: state.openBreedingMenuId === btn.dataset.toggleBreedingMenu ? "" : btn.dataset.toggleBreedingMenu });
  }));
  document.querySelector("[data-breeding-edit-photo-button]")?.addEventListener("click", () => {
    if (!requireLogin()) return;
    const input = document.querySelector("[data-breeding-edit-photo-input]");
    if (!input) return;
    input.value = "";
    input.click();
  });
  document.querySelector("[data-breeding-edit-photo-input]")?.addEventListener("change", readBreedingEditPhoto);
  document.querySelector("[data-clear-breeding-edit-photo]")?.addEventListener("click", () => {
    if (!requireLogin()) return;
    setState({ breedingEditPhoto: "__CLEAR__" });
  });
  document.querySelector("#breedingDetailForm")?.addEventListener("submit", submitBreedingDetail);
  document.querySelector("[data-breeding-mother]")?.addEventListener("change", e => {
    if (!requireLogin()) return;
    const draft = readBreedingDraft();
    const manual = e.target.value === "manual";
    const mother = state.turtles.find(t => t.id === e.target.value);
    setState({
      ...draft,
      breedingMotherMode: manual ? "manual" : "archive",
      breedingMotherValue: e.target.value,
      breedingPoolId: manual ? draft.breedingPoolId : (mother?.poolId || ""),
      breedingManualMother: manual ? (draft.breedingManualMother || suggestedManualBreedingMother(draft.breedingDraftDate || state.breedingDraftDate || formatDate(new Date()))) : draft.breedingManualMother
    });
  });
  document.querySelectorAll("#breedingForm [name='date'], #breedingForm [name='manualMother'], #breedingForm [name='eggCount'], #breedingForm [name='fertileCount'], #breedingForm [name='hatchCount'], #breedingForm [name='note']").forEach(input => {
    input.addEventListener("input", event => {
      if (!requireLogin()) return;
      const draft = readBreedingDraft();
      if (event.target.name === "date" && state.breedingMotherMode === "manual" && isSuggestedManualBreedingMother(state.breedingManualMother)) {
        draft.breedingManualMother = suggestedManualBreedingMother(draft.breedingDraftDate);
        const manualInput = document.querySelector("#breedingForm [name='manualMother']");
        if (manualInput) manualInput.value = draft.breedingManualMother;
      }
      Object.assign(state, draft);
    });
  });
  document.querySelector("#breedingForm [name='poolId']")?.addEventListener("change", () => {
    if (!requireLogin()) return;
    Object.assign(state, readBreedingDraft());
  });
  document.querySelector("#breedingForm")?.addEventListener("submit", submitBreedingRecord);
  document.querySelectorAll("[data-delete-breeding]").forEach(btn => btn.addEventListener("click", event => {
    event.stopPropagation();
    deleteBreedingRecord(btn.dataset.deleteBreeding);
  }));
  document.querySelectorAll("[data-edit-turtle-pool]").forEach(card => {
    const openPool = () => {
      if (!requireLogin()) return;
      setState({ page: "poolAdd", editingTurtlePoolId: card.dataset.editTurtlePool });
    };
    card.addEventListener("click", openPool);
    card.addEventListener("keydown", event => {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      openPool();
    });
  });
  document.querySelectorAll("[data-pool-type]").forEach(button => button.addEventListener("click", () => {
    const form = button.closest("#turtlePoolForm");
    const input = form?.querySelector("[data-pool-type-value]");
    if (!input) return;
    input.value = button.dataset.poolType || "";
    form.querySelectorAll("[data-pool-type]").forEach(choice => {
      const active = choice === button;
      choice.classList.toggle("active", active);
      choice.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }));
  document.querySelector("#turtlePoolForm")?.addEventListener("submit", submitTurtlePool);
  document.querySelector("[data-delete-turtle-pool]")?.addEventListener("click", () => deleteTurtlePool(state.editingTurtlePoolId));
  document.querySelectorAll("[data-theme]").forEach(btn => btn.addEventListener("click", () => {
    if (!requireLogin()) return;
    setState({ themeColor: btn.dataset.theme });
  }));
  document.querySelectorAll("[data-rating]").forEach(btn => btn.addEventListener("click", () => {
    if (!requireLogin()) return;
    setState({ satisfactionRating: Number(btn.dataset.rating) });
  }));
  document.querySelector("#satisfactionForm")?.addEventListener("submit", submitPublicSatisfaction);
  document.querySelectorAll("[data-delete-review]").forEach(btn => btn.addEventListener("click", () => deletePublicReview(btn.dataset.deleteReview)));
  document.querySelector("#feedbackForm")?.addEventListener("submit", submitPublicFeedback);
  document.querySelectorAll("[data-community-media-button]").forEach(button => button.addEventListener("click", () => document.querySelector("[data-community-media-input]")?.click()));
  document.querySelector("[data-community-media-input]")?.addEventListener("change", readCommunityMedia);
  document.querySelectorAll("[data-remove-community-media]").forEach(button => button.addEventListener("click", () => removeCommunityDraftMedia(Number(button.dataset.removeCommunityMedia))));
  document.querySelector("[data-community-camera-button]")?.addEventListener("click", () => {
    if (!requireLogin()) return;
    document.querySelector("[data-community-quick-media]")?.click();
  });
  document.querySelector("[data-community-quick-media]")?.addEventListener("change", readCommunityMedia);
  document.querySelector("#communityPostForm textarea")?.addEventListener("input", event => {
    communityDraftText = event.target.value;
    syncCommunityPublishButton();
  });
  syncCommunityPublishButton();
  document.querySelector("#communityPostForm")?.addEventListener("submit", submitCommunityPost);
  document.querySelectorAll("[data-view-community-post]").forEach(card => {
    const openDetail = event => {
      if (event.target.closest("button, input, textarea, select, form, .inline-video-shell")) return;
      setState({ page: "communityPostDetail", selectedCommunityPostId: card.dataset.viewCommunityPost, openCommunityActionId: "", communityCommentPostId: "" }, { skipCloud: true });
    };
    card.addEventListener("click", openDetail);
    card.addEventListener("keydown", event => {
      if (event.target !== card || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      openDetail(event);
    });
  });
  document.querySelectorAll("[data-preview-community-media]").forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    const post = findCommunityPost(button.dataset.previewCommunityMedia);
    const mediaItems = communityPostMediaItems(post);
    const index = Math.max(0, Number(button.dataset.previewCommunityMediaIndex || 0));
    const media = mediaItems[index];
    if (!media) return;
    if (media.type === "video") openVideoPreview(media.url, "动态视频", media.posterUrl || "");
    else openImagePreview(media.url, "动态图片");
  }));
  document.querySelectorAll("[data-like-community-post]").forEach(btn => btn.addEventListener("click", () => toggleCommunityLike(btn.dataset.likeCommunityPost)));
  document.querySelectorAll("[data-community-more]").forEach(btn => btn.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    toggleCommunityMomentPopover(event.currentTarget);
  }));
  document.querySelectorAll("[data-open-content-report]").forEach(btn => btn.addEventListener("click", event => {
    event.stopPropagation();
    openContentReportDialog(btn.dataset.reportType, btn.dataset.reportId);
  }));
  document.querySelectorAll("[data-block-content-user]").forEach(btn => btn.addEventListener("click", event => {
    event.stopPropagation();
    confirmBlockUser({ targetType: btn.dataset.blockType, targetId: btn.dataset.blockId, name: btn.dataset.blockName });
  }));
  document.querySelectorAll("[data-block-user-id]").forEach(btn => btn.addEventListener("click", event => {
    event.stopPropagation();
    confirmBlockUser({ userId: btn.dataset.blockUserId, name: btn.dataset.blockName });
  }));
  document.querySelector("[data-open-chat-more]")?.addEventListener("click", event => {
    const button = event.currentTarget;
    openCommunityChatMore(button.dataset.userId, button.dataset.userName);
  });
  document.querySelectorAll("[data-show-community-comment]").forEach(btn => btn.addEventListener("click", () => setState({ communityCommentPostId: btn.dataset.showCommunityComment, openCommunityActionId: "" }, { skipCloud: true })));
  document.querySelectorAll("[data-community-comment-form]").forEach(form => form.addEventListener("submit", submitCommunityComment));
  document.querySelectorAll("[data-toggle-community-follow]").forEach(btn => btn.addEventListener("click", event => {
    event.stopPropagation();
    toggleCommunityFollow(btn.dataset.toggleCommunityFollow);
  }));
  document.querySelectorAll("[data-view-following-user]").forEach(btn => btn.addEventListener("click", () => {
    setState({ page: "followingProfile", selectedFollowingUserId: btn.dataset.viewFollowingUser, profileContentTab: "posts" }, { skipCloud: true });
  }));
  document.querySelectorAll("[data-profile-content-tab]").forEach(btn => btn.addEventListener("click", () => {
    setState({ profileContentTab: btn.dataset.profileContentTab === "listings" ? "listings" : "posts" }, { skipCloud: true });
  }));
  document.querySelectorAll("[data-view-community-user]").forEach(btn => btn.addEventListener("click", event => {
    event.stopPropagation();
    openCommunityUserProfile(btn.dataset.viewCommunityUser);
  }));
  document.querySelectorAll("[data-open-community-chat]").forEach(btn => btn.addEventListener("click", () => openCommunityChat(btn.dataset.openCommunityChat)));
  document.querySelectorAll("[data-toggle-conversation-pin]").forEach(btn => btn.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    void toggleCommunityConversationPin(btn.dataset.toggleConversationPin);
  }));
  document.querySelectorAll("[data-delete-conversation]").forEach(btn => btn.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    void deleteCommunityConversation(btn.dataset.deleteConversation);
  }));
  document.querySelectorAll("[data-delete-community-post]").forEach(btn => btn.addEventListener("click", () => deleteCommunityPost(btn.dataset.deleteCommunityPost)));
  document.querySelector("#communityChatForm")?.addEventListener("submit", sendCommunityMessage);
  document.querySelector("#communityChatForm input[name='content']")?.addEventListener("input", event => {
    marketChatDraft = event.currentTarget.value;
  });
  document.querySelector("#communityChatForm input[name='content']")?.addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  });
  bindCommunityChatTextMessageMenus();
  document.querySelector("[data-toggle-community-chat-tools]")?.addEventListener("click", () => {
    document.querySelector("#communityChatForm input[name='content']")?.blur();
    setState({ communityChatToolsOpen: !state.communityChatToolsOpen }, { skipCloud: true });
  });
  document.querySelector("[data-community-chat-media-button]")?.addEventListener("click", () => {
    document.querySelector("[data-community-chat-media-input]")?.click();
  });
  bindCommunityChatCameraButton();
  document.querySelector("[data-community-chat-media-input]")?.addEventListener("change", sendCommunityChatMediaBatch);
  document.querySelector("[data-community-chat-camera-photo-input]")?.addEventListener("change", sendCommunityChatMedia);
  document.querySelector("[data-community-chat-camera-video-input]")?.addEventListener("change", sendCommunityChatMedia);
  document.querySelectorAll("[data-preview-chat-media]").forEach(button => button.addEventListener("click", () => {
    const url = button.dataset.previewChatMedia || "";
    if (!url) return;
    if (button.dataset.chatMediaType === "video") openVideoPreview(url, "聊天视频", button.dataset.chatMediaPoster || "");
    else openImagePreview(url, "聊天图片");
  }));
  document.querySelector("[data-market-search-form]")?.addEventListener("submit", event => {
    event.preventDefault();
    const input = event.currentTarget.querySelector("[data-market-search]");
    resetMarketFeed({ marketSearch: String(input?.value || "").trim(), marketAssistMenu: "" });
  });
  bindMarketSearchSuggestions();
  document.querySelectorAll("[data-market-stage]").forEach(btn => btn.addEventListener("click", () => resetMarketFeed({ marketStage: btn.dataset.marketStage, marketAssistMenu: "" })));
  document.querySelectorAll("[data-market-assist-menu]").forEach(btn => btn.addEventListener("click", () => {
    const menu = btn.dataset.marketAssistMenu;
    const nextMenu = state.marketAssistMenu === menu ? "" : menu;
    setState({ marketAssistMenu: nextMenu }, { skipCloud: true });
    if (nextMenu === "region") requestMarketSearchLocation({ showSettingsHint: true });
  }));
  document.querySelectorAll("[data-market-sort]").forEach(btn => btn.addEventListener("click", () => setState({ marketSort: btn.dataset.marketSort, marketAssistMenu: "" }, { skipCloud: true })));
  document.querySelector("[data-market-price-order]")?.addEventListener("click", () => {
    const next = state.marketPriceOrder === "" ? "asc" : state.marketPriceOrder === "asc" ? "desc" : "";
    setState({ marketPriceOrder: next }, { skipCloud: true });
  });
  document.querySelector("[data-market-fresh]")?.addEventListener("click", () => setState({ marketFreshOnly: !state.marketFreshOnly }, { skipCloud: true }));
  document.querySelectorAll("[data-market-region]").forEach(btn => btn.addEventListener("click", () => resetMarketFeed({ marketRegion: btn.dataset.marketRegion || "", marketAssistMenu: "" })));
  document.querySelectorAll("[data-market-delivery]").forEach(btn => btn.addEventListener("click", () => setState({ marketDelivery: btn.dataset.marketDelivery || "" }, { skipCloud: true })));
  document.querySelector("[data-market-filter-reset]")?.addEventListener("click", () => resetMarketFeed({ marketPriceOrder: "", marketFreshOnly: false, marketRegion: "", marketDelivery: "", marketAssistMenu: "" }));
  document.querySelectorAll("[data-my-market-tab]").forEach(btn => btn.addEventListener("click", () => setState({ marketMyTab: btn.dataset.myMarketTab }, { skipCloud: true })));
  document.querySelectorAll("[data-view-market]").forEach(btn => btn.addEventListener("click", () => openMarketDetail(btn.dataset.viewMarket)));
  document.querySelectorAll("[data-view-market-seller]").forEach(btn => btn.addEventListener("click", () => openMarketSeller(btn.dataset.viewMarketSeller)));
  const marketDetailGallery = document.querySelector("[data-market-detail-gallery]");
  const useNativeDetailGallery = Boolean(marketDetailGallery && window.CSS?.supports?.("scroll-snap-type", "x mandatory"));
  // Older WebViews keep the previous compositor-transform implementation as
  // a fallback. Current iOS uses the native scroller bound below, which is
  // what gives the gallery its direct, system-level feel.
  if (marketDetailGallery && !useNativeDetailGallery) {
    const track = marketDetailGallery.querySelector("[data-market-detail-gallery-track]");
    const slides = Array.from(track?.querySelectorAll(".market-detail-photo") || []);
    const previous = document.querySelector("[data-market-gallery-prev]");
    const next = document.querySelector("[data-market-gallery-next]");
    const count = document.querySelector("[data-market-gallery-count]");
    let galleryIndex = 0;
    let galleryPaintFrame = 0;
    let pendingGalleryTransform = null;
    let galleryMotionTimer = 0;
    const galleryWidth = () => Math.max(1, marketDetailGallery.clientWidth);
    const updateGalleryControls = () => {
      if (previous) previous.disabled = galleryIndex === 0;
      if (next) next.disabled = galleryIndex >= slides.length - 1;
      if (count) count.textContent = `${galleryIndex + 1}/${Math.max(1, slides.length)}`;
    };
    const paintGalleryTransform = (value, immediate = false) => {
      if (!track) return;
      pendingGalleryTransform = value;
      const paint = () => {
        galleryPaintFrame = 0;
        if (pendingGalleryTransform === null) return;
        track.style.transform = `translate3d(${pendingGalleryTransform}px, 0, 0)`;
        pendingGalleryTransform = null;
      };
      if (immediate) {
        if (galleryPaintFrame) cancelAnimationFrame(galleryPaintFrame);
        paint();
      } else if (!galleryPaintFrame) {
        galleryPaintFrame = requestAnimationFrame(paint);
      }
    };
    const setGalleryIndex = (nextIndex, motion = true) => {
      if (!track || !slides.length) return;
      const options = typeof motion === "boolean" ? { animate: motion } : (motion || {});
      const animate = options.animate !== false;
      const duration = Math.round(Math.max(140, Math.min(360, Number(options.duration) || 270)));
      const easing = options.easing || "cubic-bezier(.16,.9,.24,1)";
      galleryIndex = Math.max(0, Math.min(slides.length - 1, nextIndex));
      track.style.transition = animate ? `transform ${duration}ms ${easing}` : "none";
      if (animate) {
        marketDetailGallery.classList.add("is-settling");
        if (galleryMotionTimer) clearTimeout(galleryMotionTimer);
        galleryMotionTimer = window.setTimeout(() => {
          galleryMotionTimer = 0;
          marketDetailGallery.classList.remove("is-settling");
        }, duration + 48);
      }
      paintGalleryTransform(-galleryIndex * galleryWidth(), true);
      updateGalleryControls();
      if (!animate) requestAnimationFrame(() => {
        if (!marketDetailGallery.classList.contains("is-dragging")) {
          marketDetailGallery.classList.remove("is-settling");
          track.style.removeProperty("transition");
        }
      });
    };
    const moveGallery = offset => setGalleryIndex(galleryIndex + offset, {
      animate: true,
      duration: 270
    });
    previous?.addEventListener("click", () => moveGallery(-1));
    next?.addEventListener("click", () => moveGallery(1));
    window.addEventListener("resize", () => setGalleryIndex(galleryIndex, false), { once: true });
    setGalleryIndex(0, false);

    // Keep a drag constrained to its immediate neighbour.  A long or fast
    // swipe must never skip across several listing photos in one movement.
    let galleryPointer = null;
    const releaseGalleryPointer = active => {
      if (active?.pointerId === undefined) return;
      try { marketDetailGallery.releasePointerCapture(active.pointerId); } catch {}
    };
    const settleGallery = (active, cancelled = false) => {
      if (!active?.dragging) return;
      if (galleryPaintFrame) {
        cancelAnimationFrame(galleryPaintFrame);
        galleryPaintFrame = 0;
      }
      if (pendingGalleryTransform !== null) {
        track.style.transform = `translate3d(${pendingGalleryTransform}px, 0, 0)`;
        pendingGalleryTransform = null;
      }
      const width = active.width;
      const distance = active.lastX - active.startX;
      // Retain the last meaningful pointer velocity. Pointer-up events often
      // arrive with the same x coordinate as the final move, which used to
      // erase the user's momentum and made every release feel like a rigid
      // fixed-time snap.
      const projectedDistance = cancelled ? distance : distance + (active.velocityX * 165);
      const threshold = Math.max(42, width * .16);
      let target = active.startIndex;
      if (!cancelled && Math.abs(projectedDistance) >= threshold) target += projectedDistance < 0 ? 1 : -1;
      target = Math.max(0, Math.min(slides.length - 1, target));
      const targetTransform = -target * width;
      const currentTransform = Number.isFinite(active.currentTransform)
        ? active.currentTransform
        : active.startTransform;
      const travelled = Math.min(1, Math.abs(distance) / width);
      const speed = Math.min(1.45, Math.abs(active.velocityX));
      // The remaining motion is shorter for a quick flick and longer for a
      // slow, deliberate pull.  This keeps the visual movement connected to
      // the finger instead of always snapping in the same .24 seconds.
      const remaining = Math.min(1, Math.abs(targetTransform - currentTransform) / width);
      const duration = Math.round(Math.max(150, Math.min(330,
        292 - (speed * 74) - (travelled * 44) + (remaining * 22)
      )));
      marketDetailGallery.classList.remove("is-dragging");
      setGalleryIndex(target, { animate: true, duration });
      marketGalleryPreviewSuppressUntil = Date.now() + duration + 80;
    };
    marketDetailGallery.addEventListener("pointerdown", event => {
      if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
      if (event.target.closest("button, video")) return;
      if (galleryMotionTimer) {
        clearTimeout(galleryMotionTimer);
        galleryMotionTimer = 0;
      }
      marketDetailGallery.classList.remove("is-settling");
      track.style.transition = "none";
      const now = performance.now();
      galleryPointer = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastAt: now,
        velocityX: 0,
        width: galleryWidth(),
        startIndex: galleryIndex,
        startTransform: -galleryIndex * galleryWidth(),
        currentTransform: -galleryIndex * galleryWidth(),
        dragging: false
      };
    }, { passive: true });
    marketDetailGallery.addEventListener("pointermove", event => {
      const active = galleryPointer;
      if (!active || event.pointerId !== active.pointerId || !event.isPrimary) return;
      const dx = event.clientX - active.startX;
      // Keep vertical page scrolling natural until a horizontal drag is clear.
      if (!active.dragging) {
        const movementY = Math.abs(event.clientY - active.startY);
        if (Math.max(Math.abs(dx), movementY) < 6) return;
        if (movementY > Math.abs(dx)) {
          galleryPointer = null;
          return;
        }
        active.dragging = true;
        marketDetailGallery.classList.add("is-dragging");
        track.style.transition = "none";
        marketDetailGallery.setPointerCapture?.(active.pointerId);
      }
      const now = performance.now();
      const elapsed = Math.max(1, now - active.lastAt);
      const movedX = event.clientX - active.lastX;
      const instantaneousVelocity = movedX / elapsed;
      if (Math.abs(movedX) > .15) {
        active.velocityX = !active.velocityX || Math.sign(active.velocityX) !== Math.sign(instantaneousVelocity)
          ? instantaneousVelocity
          : ((active.velocityX * .62) + (instantaneousVelocity * .38));
      }
      active.lastX = event.clientX;
      active.lastAt = now;
      // Do not expose more than one neighbouring photo during an individual
      // drag either, even if the finger travels a large distance.
      const minIndex = Math.min(slides.length - 1, active.startIndex + 1);
      const maxIndex = Math.max(0, active.startIndex - 1);
      const minTransform = -minIndex * active.width;
      const maxTransform = -maxIndex * active.width;
      // The track is a compositor layer: write the exact finger position
      // immediately.  Batching this through another animation frame adds a
      // visible one-frame delay on iOS and is the reason the carousel felt
      // stiff even when it was not technically dropping frames.
      active.currentTransform = Math.max(minTransform, Math.min(maxTransform, active.startTransform + dx));
      paintGalleryTransform(active.currentTransform, true);
      if (event.cancelable) event.preventDefault();
    }, { passive: false });
    marketDetailGallery.addEventListener("pointerup", event => {
      const active = galleryPointer;
      if (!active || event.pointerId !== active.pointerId) return;
      const now = performance.now();
      const elapsed = Math.max(1, now - active.lastAt);
      const movedX = event.clientX - active.lastX;
      if (Math.abs(movedX) > .15) {
        const instantaneousVelocity = movedX / elapsed;
        active.velocityX = !active.velocityX || Math.sign(active.velocityX) !== Math.sign(instantaneousVelocity)
          ? instantaneousVelocity
          : ((active.velocityX * .62) + (instantaneousVelocity * .38));
      }
      active.lastX = event.clientX;
      releaseGalleryPointer(active);
      settleGallery(active);
      galleryPointer = null;
    }, { passive: true });
    marketDetailGallery.addEventListener("pointercancel", event => {
      const active = galleryPointer;
      if (!active || event.pointerId !== active.pointerId) return;
      releaseGalleryPointer(active);
      settleGallery(active, true);
      galleryPointer = null;
    }, { passive: true });
  }
  // On current iOS WebViews the browser's native scroll compositor follows
  // the finger much more closely than a JavaScript translateX loop can. Keep
  // the transform implementation above only for older WebViews, and use
  // native scroll-snap everywhere else. No pointer handler is installed
  // here: iOS owns direct tracking, deceleration, reversal and settlement.
  if (marketDetailGallery && useNativeDetailGallery) {
    const track = marketDetailGallery.querySelector("[data-market-detail-gallery-track]");
    const slides = Array.from(track?.querySelectorAll(".market-detail-photo") || []);
    const previous = document.querySelector("[data-market-gallery-prev]");
    const next = document.querySelector("[data-market-gallery-next]");
    const count = document.querySelector("[data-market-gallery-count]");
    if (track && slides.length) {
      const total = slides.length;
      let galleryIndex = 0;
      let settleTimer = 0;
      let resizeFrame = 0;
      const galleryWidth = () => Math.max(1, marketDetailGallery.clientWidth);
      const clampIndex = value => Math.max(0, Math.min(total - 1, Math.round(value)));
      const readIndex = () => clampIndex(marketDetailGallery.scrollLeft / galleryWidth());
      const updateGalleryControls = () => {
        if (previous) previous.disabled = galleryIndex === 0;
        if (next) next.disabled = galleryIndex >= total - 1;
        if (count) count.textContent = `${galleryIndex + 1}/${total}`;
      };
      const applyIndex = (nextIndex, options = {}) => {
        const { smooth = false, source = "program" } = options;
        galleryIndex = clampIndex(nextIndex);
        updateGalleryControls();
        if (source === "scroll") return;
        const left = galleryIndex * galleryWidth();
        if (smooth && typeof marketDetailGallery.scrollTo === "function") {
          marketDetailGallery.scrollTo({ left, behavior: "smooth" });
        } else {
          marketDetailGallery.scrollLeft = left;
        }
      };
      const finishNativeSettle = () => {
        settleTimer = 0;
        // Do not correct a user's finger position in JavaScript. WebKit owns
        // this scroll view from touch-down through deceleration and its own
        // mandatory snap, which preserves the native reversal behaviour.
        galleryIndex = readIndex();
        updateGalleryControls();
        marketDetailGallery.classList.remove("is-native-scrolling");
        marketGalleryPreviewSuppressUntil = Date.now() + 220;
      };
      const scheduleNativeSettle = () => {
        if (settleTimer) clearTimeout(settleTimer);
        // Never correct while iOS is still carrying the scroll with momentum.
        // `scrollend` (when present) handles the exact finish; this longer
        // debounce is only the compatibility fallback for older WebViews.
        settleTimer = window.setTimeout(finishNativeSettle, 220);
      };
      const moveGallery = offset => {
        const target = clampIndex(galleryIndex + offset);
        if (target === galleryIndex) return;
        marketDetailGallery.classList.add("is-native-scrolling");
        applyIndex(target, { smooth: true });
        scheduleNativeSettle();
      };

      track.style.setProperty("--market-gallery-slide-count", String(total));
      marketDetailGallery.classList.add("uses-native-gallery");
      previous?.addEventListener("click", () => moveGallery(-1));
      next?.addEventListener("click", () => moveGallery(1));
      marketDetailGallery.addEventListener("scroll", () => {
        const nextIndex = readIndex();
        if (nextIndex !== galleryIndex) {
          galleryIndex = nextIndex;
          updateGalleryControls();
        }
        marketDetailGallery.classList.add("is-native-scrolling");
        marketGalleryPreviewSuppressUntil = Date.now() + 340;
        scheduleNativeSettle();
      }, { passive: true });
      if ("onscrollend" in marketDetailGallery) {
        marketDetailGallery.addEventListener("scrollend", () => {
          if (settleTimer) clearTimeout(settleTimer);
          finishNativeSettle();
        }, { passive: true });
      }
      window.addEventListener("resize", () => {
        if (resizeFrame) cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
          resizeFrame = 0;
          applyIndex(galleryIndex, { smooth: false });
        });
      }, { passive: true });
      requestAnimationFrame(() => applyIndex(0, { smooth: false }));
    }
  }
  document.querySelectorAll("[data-market-favorite]").forEach(btn => btn.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    toggleMarketFavorite(btn.dataset.marketFavorite);
  }));
  document.querySelector("[data-market-turtle-source]")?.addEventListener("change", event => {
    const turtle = (state.turtles || []).find(item => item.id === event.target.value);
    const description = document.querySelector("[data-market-description]");
    const currentDescription = String(description?.value || state.marketDraftDescription || "").trim();
    const currentTemplate = String(description?.dataset.marketDescriptionTemplate || state.marketDraftDescriptionTemplate || "").trim();
    const template = marketDescriptionTemplate(speciesByCode(turtle?.speciesCode));
    const canReplaceDescription = !currentDescription || currentDescription === currentTemplate;
    setState({
      marketDraftTurtleId: event.target.value,
      marketDraftPhoto: "",
      marketDraftMedia: turtle?.photo ? [{ dataUrl: turtle.photo, type: "image" }] : [],
      marketDraftDescription: canReplaceDescription ? template : currentDescription,
      marketDraftDescriptionTemplate: canReplaceDescription ? template : ""
    }, { skipCloud: true });
  });
  document.querySelector("[data-market-description]")?.addEventListener("input", event => {
    state.marketDraftDescription = event.target.value;
    if (String(event.target.value || "").trim() !== String(event.target.dataset.marketDescriptionTemplate || "").trim()) {
      state.marketDraftDescriptionTemplate = "";
    }
  });
  document.querySelector("[data-market-city-locate]")?.addEventListener("click", () => requestMarketCityAutofill({ force: true }));
  bindMarketSpeciesPicker();
  bindMarketMediaDraftEvents();
  document.querySelector("#marketListingForm")?.addEventListener("submit", submitMarketListing);
  document.querySelectorAll("[data-market-sold]").forEach(btn => btn.addEventListener("click", () => toggleMarketSold(btn.dataset.marketSold)));
  document.querySelectorAll("[data-delete-market]").forEach(btn => btn.addEventListener("click", () => deleteMarketListing(btn.dataset.deleteMarket)));
  document.querySelectorAll("[data-edit-market-listing]").forEach(btn => btn.addEventListener("click", () => beginMarketListingEdit(btn.dataset.editMarketListing)));
  document.querySelectorAll("[data-refresh-market-listing]").forEach(btn => btn.addEventListener("click", () => refreshOwnMarketListing(btn.dataset.refreshMarketListing)));
  document.querySelectorAll("[data-offline-market-listing]").forEach(btn => btn.addEventListener("click", () => offlineOwnMarketListing(btn.dataset.offlineMarketListing)));
  document.querySelectorAll("[data-market-contact]").forEach(btn => btn.addEventListener("click", () => contactMarketSeller(btn.dataset.marketContact)));
  document.querySelectorAll("[data-market-detail-more]").forEach(btn => btn.addEventListener("click", () => openMarketDetailMore(btn.dataset.marketDetailMore)));
  document.querySelectorAll("[data-view-chat-market]").forEach(btn => btn.addEventListener("click", () => openChatMarketListing(btn.dataset.viewChatMarket)));
  document.querySelector("[data-market-top-service]")?.addEventListener("click", openMarketTopService);
  document.querySelectorAll("[data-market-platform-service]").forEach(btn => btn.addEventListener("click", () => openMarketPlatformService(btn.dataset.marketPlatformService)));
  document.querySelectorAll("[data-process-content-report]").forEach(btn => btn.addEventListener("click", () => processContentReport(btn.dataset.processContentReport, btn.dataset.reportAction)));
  document.querySelector("[data-system-announcement-form]")?.addEventListener("submit", submitSystemAnnouncement);
  document.querySelectorAll("[data-system-announcement-action]").forEach(button => button.addEventListener("click", () => manageSystemAnnouncement(button.dataset.systemAnnouncementId, button.dataset.systemAnnouncementAction)));
  document.querySelectorAll("[data-dismiss-system-announcement]").forEach(button => button.addEventListener("click", () => dismissSystemAnnouncement(button.dataset.dismissSystemAnnouncement)));
  document.querySelectorAll("[data-view-feedback]").forEach(el => el.addEventListener("click", event => {
    event.stopPropagation();
    setState({ page: "feedbackDetail", selectedFeedbackId: el.dataset.viewFeedback, openFeedbackMenuId: "" }, { skipCloud: true });
  }));
  document.querySelectorAll("[data-feedback-action]").forEach(btn => btn.addEventListener("click", event => {
    event.stopPropagation();
    setState({ openFeedbackMenuId: state.openFeedbackMenuId === btn.dataset.feedbackAction ? "" : btn.dataset.feedbackAction }, { skipCloud: true });
  }));
  document.querySelectorAll("[data-like-feedback]").forEach(btn => btn.addEventListener("click", event => {
    event.stopPropagation();
    toggleFeedbackLike(btn.dataset.likeFeedback);
  }));
  document.querySelectorAll("[data-comment-feedback]").forEach(btn => btn.addEventListener("click", event => {
    event.stopPropagation();
    setState({ page: "feedbackDetail", selectedFeedbackId: btn.dataset.commentFeedback, openFeedbackMenuId: "" }, { skipCloud: true });
  }));
  document.querySelector("#feedbackCommentForm")?.addEventListener("submit", submitFeedbackComment);
  document.querySelectorAll("[data-delete-feedback]").forEach(btn => btn.addEventListener("click", event => {
    event.stopPropagation();
    deletePublicFeedback(btn.dataset.deleteFeedback);
  }));
  document.querySelectorAll("[data-delete-feedback-comment]").forEach(btn => btn.addEventListener("click", event => {
    event.stopPropagation();
    const [feedbackId, commentId] = btn.dataset.deleteFeedbackComment.split(":");
    deletePublicFeedbackComment(feedbackId, commentId);
  }));
  document.querySelector("#accountForm")?.addEventListener("submit", submitAccount);
  document.querySelectorAll("[data-account-mode]").forEach(btn => btn.addEventListener("click", () => setState({ accountMode: btn.dataset.accountMode, pendingAuthCode: "", pendingAuthPhone: "", authCodeExpiresAt: "" })));
  const passwordInput = document.querySelector("#accountForm [name='password']");
  const confirmPasswordInput = document.querySelector("#accountForm [name='confirmPassword']");
  const accountCodeInput = document.querySelector("#accountForm [name='code']");
  [passwordInput, confirmPasswordInput].forEach(input => input?.addEventListener("input", validateAccountPasswordMatch));
  accountCodeInput?.addEventListener("input", event => {
    event.target.value = event.target.value.replace(/\D/g, "").slice(0, 6);
    if (event.target.value.length !== 6 || accountSubmitInFlight) return;
    requestAnimationFrame(() => document.querySelector("#accountForm")?.requestSubmit());
  });
  document.querySelector("[data-send-code]")?.addEventListener("click", sendAccountCode);
  document.querySelector("[data-account-avatar-button]")?.addEventListener("click", () => {
    if (!requireLogin()) return;
    const input = document.querySelector("[data-account-avatar-input]");
    if (!input) return;
    input.value = "";
    input.click();
  });
  document.querySelector("[data-account-avatar-input]")?.addEventListener("change", readAccountAvatar);
  document.querySelectorAll("[data-select-default-avatar]").forEach(button => button.addEventListener("click", () => {
    if (!requireLogin()) return;
    setState({ accountAvatar: button.dataset.selectDefaultAvatar || randomDefaultAccountAvatar() }, { skipCloud: true });
    toast("已选择内置头像，点击保存后生效");
  }));
  document.querySelector("#profileForm")?.addEventListener("submit", submitProfile);
  document.querySelectorAll("[data-logout-account]").forEach(btn => btn.addEventListener("click", logoutAccount));
  document.querySelector("[data-open-account-delete]")?.addEventListener("click", openAccountDeleteDialog);
  document.querySelector("[data-refresh-blocked-users]")?.addEventListener("click", () => refreshBlockedUsers(true));
  document.querySelectorAll("[data-unblock-user]").forEach(button => button.addEventListener("click", () => unblockUser(button.dataset.unblockUser)));
  const policyConsentForm = document.querySelector("[data-policy-consent-form]");
  const policyConsentCheck = document.querySelector("[data-policy-consent-check]");
  const policyConsentSubmit = document.querySelector("[data-policy-consent-submit]");
  const syncPolicyConsentSubmit = () => {
    if (policyConsentSubmit) policyConsentSubmit.disabled = !policyConsentCheck.checked;
  };
  policyConsentCheck?.addEventListener("change", syncPolicyConsentSubmit);
  policyConsentCheck?.addEventListener("input", syncPolicyConsentSubmit);
  policyConsentForm?.addEventListener("submit", event => {
    event.preventDefault();
    if (!policyConsentCheck?.checked) return;
    void acceptLatestPolicies();
  });
  document.querySelector("[data-policy-consent-logout]")?.addEventListener("click", logoutAccount);
  document.querySelector("[data-test-push-notification]")?.addEventListener("click", testNativePushNotification);
  document.querySelectorAll("[data-export-data]").forEach(btn => btn.addEventListener("click", () => exportAccountData(btn.dataset.exportData)));
  document.querySelector("#batchImportForm")?.addEventListener("submit", submitBatchImport);
  document.querySelector("#deliveryNoteForm")?.addEventListener("submit", submitDeliveryNote);
}

function reviewAuthPayload(extra = {}) {
  return {
    phone: state.loggedInPhone,
    token: currentCloudToken(),
    ...extra
  };
}

function canUsePublicReviews() {
  if (!CONFIGURED_SMS_BACKEND) {
    toast("公共评价需要连接云端服务");
    return false;
  }
  if (!requireLogin()) return false;
  if (!currentCloudToken()) {
    toast("请重新登录账号");
    return false;
  }
  return true;
}

async function refreshPublicReviews(force = false) {
  if (!CONFIGURED_SMS_BACKEND || publicReviewsLoading) return;
  if (!state.loggedInPhone || !currentCloudToken()) {
    if ((state.publicReviews || []).length) setState({ publicReviews: [] }, { skipCloud: true });
    return;
  }
  if (!force && Date.now() - publicReviewsLastLoadedAt < 10000 && (state.publicReviews || []).length) return;
  publicReviewsLoading = true;
  try {
    const result = await apiPost("/api/reviews/list", reviewAuthPayload());
    publicReviewsLastLoadedAt = Date.now();
    setState({ publicReviews: Array.isArray(result.reviews) ? result.reviews : [] }, { skipCloud: true });
  } catch (error) {
    console.warn(error.message || "公共评价读取失败");
  } finally {
    publicReviewsLoading = false;
  }
}

async function submitPublicSatisfaction(event) {
  if (!CONFIGURED_SMS_BACKEND) return submitSatisfaction(event);
  event.preventDefault();
  if (!canUsePublicReviews()) return;
  const form = new FormData(event.currentTarget);
  const comment = String(form.get("comment") || "").trim();
  const rating = Number(form.get("rating") || state.satisfactionRating || 5);
  if (!comment) return toast("请填写评价内容");
  try {
    const result = await apiPost("/api/reviews/create", reviewAuthPayload({ rating, comment }));
    publicReviewsLastLoadedAt = Date.now();
    setState({
      publicReviews: Array.isArray(result.reviews) ? result.reviews : state.publicReviews,
      activityLogs: logActivity(`提交满意度评价：${rating} 分`, "空间")
    });
    toast("评价已提交");
  } catch (error) {
    toast(error.message || "评价提交失败");
  }
}

async function submitReviewComment(event) {
  event.preventDefault();
  if (!canUsePublicReviews()) return;
  const reviewId = event.currentTarget.dataset.reviewId;
  const form = new FormData(event.currentTarget);
  const content = String(form.get("content") || "").trim();
  if (!content) return toast("请填写评论内容");
  try {
    const result = await apiPost("/api/reviews/comment", reviewAuthPayload({ reviewId, content }));
    publicReviewsLastLoadedAt = Date.now();
    setState({
      publicReviews: Array.isArray(result.reviews) ? result.reviews : state.publicReviews,
      activityLogs: logActivity("评论了一条满意度评价", "空间")
    });
    toast("评论已发布");
  } catch (error) {
    toast(error.message || "评论失败");
  }
}

async function deletePublicReview(reviewId) {
  if (!canUsePublicReviews()) return;
  if (!confirm("确定删除这条评价和下面的评论吗？")) return;
  try {
    const result = await apiPost("/api/reviews/delete", reviewAuthPayload({ reviewId }));
    publicReviewsLastLoadedAt = Date.now();
    setState({ publicReviews: Array.isArray(result.reviews) ? result.reviews : state.publicReviews }, { skipCloud: true });
    toast("评价已删除");
  } catch (error) {
    toast(error.message || "删除失败");
  }
}

async function deletePublicReviewComment(reviewId, commentId) {
  if (!canUsePublicReviews()) return;
  if (!confirm("确定删除这条评论吗？")) return;
  try {
    const result = await apiPost("/api/reviews/comment/delete", reviewAuthPayload({ reviewId, commentId }));
    publicReviewsLastLoadedAt = Date.now();
    setState({ publicReviews: Array.isArray(result.reviews) ? result.reviews : state.publicReviews }, { skipCloud: true });
    toast("评论已删除");
  } catch (error) {
    toast(error.message || "删除失败");
  }
}

function feedbackAuthPayload(extra = {}) {
  return {
    phone: state.loggedInPhone,
    token: currentCloudToken(),
    ...extra
  };
}

function canUsePublicFeedback() {
  if (!CONFIGURED_SMS_BACKEND) {
    toast("公开反馈需要连接云端服务");
    return false;
  }
  if (!requireLogin()) return false;
  if (!currentCloudToken()) {
    toast("请重新登录账号");
    return false;
  }
  return true;
}

function communityAuthPayload(extra = {}) {
  return { phone: state.loggedInPhone, token: currentCloudToken(), ...extra };
}

function canUseCommunity() {
  if (!CONFIGURED_SMS_BACKEND) {
    toast("壳友圈需要连接云端服务");
    return false;
  }
  if (!requireLogin()) return false;
  if (!currentCloudToken()) {
    toast("请重新登录账号");
    return false;
  }
  return true;
}

function marketAuthPayload(extra = {}) {
  return communityAuthPayload(extra);
}

function localMarketListing(payload) {
  return {
    id: `local-market-${Date.now()}`,
    ...payload,
    photoUrl: payload.photoUrl || payload.photo || "",
    sellerId: state.loggedInPhone,
    sellerName: state.accountName || "壳友卖家",
    sellerAvatar: state.accountAvatar || "",
    status: "active",
    isOwn: true,
    isFriend: false,
    pendingLocal: true,
    createdAt: new Date().toISOString()
  };
}

async function refreshMarket(force = false) {
  const isMarketFeed = state.page === "market";
  const savedListingIds = savedMarketListingIds();
  // A stale saved login used to make every visible market render ask the
  // server again.  Once apiPost detects 401 it clears that login; this guard
  // prevents a repeated background request/error loop from making the page
  // feel like it is continually refreshing.
  if (!hasCloudSession() || marketLoading) return;
  if (isMarketFeed && state.marketFeedInitialized && !force) return;
  if (!force && Date.now() - marketLastLoadedAt < 10000) return;
  marketLoading = true;
  try {
    const sharedListingId = incomingMarketShareLoading
      && incomingMarketShareListingId === String(state.selectedMarketListingId || "")
      ? incomingMarketShareListingId
      : "";
    if (sharedListingId) {
      const result = await apiPost("/api/market/detail", marketAuthPayload({ listingId: sharedListingId }));
      const sharedListing = normalizeMarketListings([result.listing])[0];
      if (!sharedListing) throw new Error("商品已下架或不存在");
      const retainedListings = (state.marketListings || []).filter(item => item.id !== sharedListing.id);
      marketLastLoadedAt = Date.now();
      incomingMarketShareLoading = false;
      setState({ marketListings: [sharedListing, ...retainedListings] }, { skipCloud: true });
      return;
    }
    const result = await apiPost("/api/market/list", marketAuthPayload(isMarketFeed ? {
      offset: 0,
      limit: 8,
      keyword: state.marketSearch || "",
      stage: state.marketStage || "all",
      regionCities: marketRegionCities()
    } : { all: true, savedListingIds }));
    const pending = (state.marketListings || []).filter(item => item.pendingLocal);
    const remoteListings = normalizeMarketListings(result.listings || []);
    const savedListings = normalizeMarketListings(result.savedListings || []);
    const chatReference = (state.marketListings || []).find(item => item.chatReference && item.id === state.selectedMarketListingId);
    const retainedReference = chatReference && !remoteListings.some(item => item.id === chatReference.id) ? [chatReference] : [];
    const mergedListings = new Map();
    [...pending, ...retainedReference, ...remoteListings, ...savedListings].forEach(item => mergedListings.set(item.id, item));
    const accountPatch = result.accountData ? normalizeAccountData(result.accountData) : {};
    marketLastLoadedAt = Date.now();
    if (incomingMarketShareListingId && incomingMarketShareListingId === String(state.selectedMarketListingId || "")) {
      incomingMarketShareLoading = false;
    }
    setState({
      ...accountPatch,
      marketListings: [...mergedListings.values()],
      myMarketListings: normalizeMarketListings(result.myListings || []),
      ...(isMarketFeed ? {
        marketFeedInitialized: true,
        marketFeedNextOffset: Math.max(0, Number(result.nextOffset ?? remoteListings.length)),
        marketFeedHasMore: Boolean(result.hasMore),
        marketFeedLoadingMore: false
      } : {})
    }, { skipCloud: true });
  } catch (error) {
    if (incomingMarketShareListingId && incomingMarketShareListingId === String(state.selectedMarketListingId || "")) {
      incomingMarketShareLoading = false;
      if (state.page === "marketDetail") render();
    }
    if (error.status !== 405 && error.message !== "方法不支持") console.warn(error.message || "龟集市读取失败");
  } finally {
    marketLoading = false;
  }
}

function resetMarketFeed(patch = {}) {
  marketLastLoadedAt = 0;
  setState({
    ...patch,
    marketListings: [],
    marketFeedInitialized: false,
    marketFeedNextOffset: 0,
    marketFeedHasMore: true,
    marketFeedLoadingMore: false
  }, { skipCloud: true });
}

async function loadMoreMarketListings() {
  if (!hasCloudSession() || state.page !== "market" || marketLoading || state.marketFeedLoadingMore || !state.marketFeedHasMore) return;
  marketLoading = true;
  setState({ marketFeedLoadingMore: true }, { skipCloud: true });
  try {
    const result = await apiPost("/api/market/list", marketAuthPayload({
      offset: Math.max(0, Number(state.marketFeedNextOffset || 0)),
      limit: 8,
      keyword: state.marketSearch || "",
      stage: state.marketStage || "all",
      regionCities: marketRegionCities()
    }));
    const incoming = normalizeMarketListings(result.listings || []);
    const existingIds = new Set((state.marketListings || []).map(item => item.id));
    const appended = incoming.filter(item => !existingIds.has(item.id));
    marketLastLoadedAt = Date.now();
    setState({
      marketListings: [...(state.marketListings || []), ...appended],
      myMarketListings: normalizeMarketListings(result.myListings || state.myMarketListings || []),
      marketFeedInitialized: true,
      marketFeedNextOffset: Math.max(0, Number(result.nextOffset ?? (Number(state.marketFeedNextOffset || 0) + incoming.length))),
      marketFeedHasMore: Boolean(result.hasMore),
      marketFeedLoadingMore: false
    }, { skipCloud: true });
  } catch (error) {
    setState({ marketFeedLoadingMore: false }, { skipCloud: true });
    console.warn(error.message || "加载更多龟集市商品失败");
  } finally {
    marketLoading = false;
  }
}

function setupMarketInfiniteScroll() {
  marketLoadObserver?.disconnect();
  marketLoadObserver = null;
  if (state.page !== "market" || !state.marketFeedHasMore || state.marketFeedLoadingMore) return;
  const sentinel = document.querySelector("[data-market-load-sentinel]");
  if (!sentinel || typeof IntersectionObserver === "undefined") return;
  marketLoadObserver = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) loadMoreMarketListings();
  }, { root: null, rootMargin: "0px 0px 220px", threshold: 0.01 });
  marketLoadObserver.observe(sentinel);
}

function updateMarketMetrics(listingId, metrics = {}) {
  setState({
    marketListings: (state.marketListings || []).map(item => item.id === listingId
      ? {
          ...item,
          viewCount: Math.max(0, Number(metrics.viewCount ?? item.viewCount ?? 0)),
          wantCount: Math.max(0, Number(metrics.wantCount ?? item.wantCount ?? 0))
        }
      : item)
  }, { skipCloud: true });
}

function openMarketDetail(listingId) {
  const id = String(listingId || "");
  const marketHistoryIds = [id, ...(state.marketHistoryIds || []).filter(item => item !== id)].slice(0, 100);
  setState({ page: "marketDetail", selectedMarketListingId: id, marketHistoryIds });
  recordMarketView(listingId);
}

function openMarketSeller(sellerId) {
  const id = String(sellerId || "");
  const listing = (state.marketListings || []).find(item => String(item.sellerId || "") === id)
    || (state.myMarketListings || []).find(item => String(item.sellerId || "") === id);
  if (!id || !listing) return toast("暂时无法读取卖家信息");
  setState({
    page: "marketSeller",
    selectedMarketSellerId: id,
    selectedMarketSeller: {
      id,
      sellerName: listing.sellerName || "壳友卖家",
      sellerAvatar: listing.sellerAvatar || "",
      city: listing.city || "全国",
      sellerFollowed: Boolean(listing.sellerFollowed)
    }
  }, { skipCloud: true });
}

function toggleMarketFavorite(listingId) {
  if (!requireLogin()) return;
  const id = String(listingId || "");
  if (!id) return;
  const active = isMarketFavorite(id);
  const marketFavoriteIds = active
    ? (state.marketFavoriteIds || []).filter(item => item !== id)
    : [id, ...(state.marketFavoriteIds || []).filter(item => item !== id)].slice(0, 500);
  setState({ marketFavoriteIds });
  toast(active ? "已取消收藏" : "已收藏");
}

async function recordMarketView(listingId) {
  const listing = (state.marketListings || []).find(item => item.id === listingId);
  if (!listing || listing.pendingLocal) return;
  try {
    const result = await apiPost("/api/market/view", { listingId });
    updateMarketMetrics(listingId, result);
  } catch (error) {
    if (error.status !== 405 && error.message !== "方法不支持") console.warn(error.message || "商品曝光统计失败");
  }
}

async function recordMarketWant(listingId) {
  try {
    const result = await apiPost("/api/market/want", marketAuthPayload({ listingId }));
    updateMarketMetrics(listingId, result);
  } catch (error) {
    if (error.status !== 405 && error.message !== "方法不支持") console.warn(error.message || "商品想要人数统计失败");
  }
}

function renderMarketMediaDraft() {
  const grid = document.querySelector("[data-market-media-grid]");
  if (!grid) return;
  grid.innerHTML = marketDraftMediaMarkup();
  const count = document.querySelector(".market-media-card .market-form-heading small");
  if (count) count.textContent = `${(state.marketDraftMedia || []).length}/9`;
  bindMarketMediaDraftEvents();
}

function bindMarketSpeciesPicker() {
  const picker = document.querySelector("[data-market-species-picker]");
  if (!picker) return;
  const search = picker.querySelector("[data-market-species-search]");
  const value = picker.querySelector("[data-market-species-value]");
  const options = picker.querySelector("[data-market-species-options]");
  const toggle = picker.querySelector("[data-market-species-toggle]");
  if (!search || !value || !options) return;
  let matches = [];
  let activeIndex = -1;
  let closeTimer = 0;

  const closeOptions = () => {
    options.hidden = true;
    search.setAttribute("aria-expanded", "false");
    search.removeAttribute("aria-activedescendant");
    activeIndex = -1;
  };

  const findMatches = query => marketPublishSpeciesMatches(query);

  const updateActiveOption = nextIndex => {
    const buttons = Array.from(options.querySelectorAll("[data-market-species-option]"));
    if (!buttons.length) return;
    activeIndex = Math.max(0, Math.min(nextIndex, buttons.length - 1));
    buttons.forEach((button, index) => {
      const active = index === activeIndex;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    const activeButton = buttons[activeIndex];
    search.setAttribute("aria-activedescendant", activeButton.id);
    activeButton.scrollIntoView({ block: "nearest" });
  };

  const selectSpecies = code => {
    const item = speciesByCode(code);
    if (!item) return;
    if (isMarketProhibitedSpecies(item)) {
      toast(marketSpeciesRestrictionMessage());
      return;
    }
    value.value = item.code;
    search.value = `${item.code} · ${item.name}`;
    renderMarketTitleTemplates(item, true);
    renderMarketDescriptionTemplate(item);
    closeOptions();
  };

  const queryForOptions = () => {
    const selected = speciesByCode(value.value);
    const selectedText = selected ? `${selected.code} · ${selected.name}` : "";
    return selectedText && search.value.trim() === selectedText ? "" : search.value;
  };

  const autoSelectClosestMatch = query => {
    const keyword = String(query || "").trim();
    const closest = matches[0];
    if (!keyword || !closest) {
      value.value = "";
      return;
    }
    const changed = value.value !== closest.code;
    value.value = closest.code;
    updateActiveOption(0);
    if (changed) {
      renderMarketTitleTemplates(closest, true);
      renderMarketDescriptionTemplate(closest);
    }
  };

  const renderOptions = query => {
    matches = findMatches(query);
    activeIndex = -1;
    const rawMatches = marketSpeciesMatches(query);
    options.innerHTML = matches.length
      ? matches.map((item, index) => `
          <button type="button" id="marketSpeciesOption${index}" role="option" aria-selected="false" data-market-species-option="${escapeHtml(item.code)}">
            <strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.code)}</small>
          </button>`).join("")
      : `<p>${rawMatches.length ? marketSpeciesRestrictionMessage() : "没有找到匹配品种"}</p>`;
    options.hidden = false;
    search.setAttribute("aria-expanded", "true");
    options.querySelectorAll("[data-market-species-option]").forEach(button => {
      button.addEventListener("mousedown", event => event.preventDefault());
      button.addEventListener("click", () => selectSpecies(button.dataset.marketSpeciesOption));
    });
  };

  search.addEventListener("focus", () => {
    window.clearTimeout(closeTimer);
    renderOptions(queryForOptions());
  });
  search.addEventListener("input", () => {
    renderOptions(search.value);
    autoSelectClosestMatch(search.value);
  });
  search.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeOptions();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (options.hidden) renderOptions(queryForOptions());
      updateActiveOption(event.key === "ArrowDown" ? activeIndex + 1 : (activeIndex < 0 ? matches.length - 1 : activeIndex - 1));
      return;
    }
    if (event.key === "Enter" && !options.hidden && activeIndex >= 0) {
      event.preventDefault();
      selectSpecies(matches[activeIndex]?.code);
    }
  });
  search.addEventListener("blur", () => {
    closeTimer = window.setTimeout(closeOptions, 120);
  });
  toggle?.addEventListener("mousedown", event => event.preventDefault());
  toggle?.addEventListener("click", () => {
    if (options.hidden) {
      renderOptions("");
      search.focus();
    } else {
      closeOptions();
    }
  });

  renderMarketTitleTemplates(speciesByCode(value.value), false);
}

function moveMarketDraftMedia(fromIndex, toIndex) {
  const mediaItems = [...(state.marketDraftMedia || [])];
  const from = Number(fromIndex);
  const to = Number(toIndex);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from === to || from < 0 || to < 0 || from >= mediaItems.length || to >= mediaItems.length) return;
  const [moved] = mediaItems.splice(from, 1);
  mediaItems.splice(to, 0, moved);
  state.marketDraftMedia = mediaItems;
  renderMarketMediaDraft();
}

function bindMarketMediaDraftEvents() {
  const input = document.querySelector("[data-market-media-input]");
  const addButton = document.querySelector("[data-market-media-button]");
  if (input) input.onchange = readMarketMedia;
  if (addButton) addButton.onclick = () => input?.click();
  document.querySelectorAll("[data-remove-market-media]").forEach(button => {
    button.onclick = () => {
      const index = Number(button.dataset.removeMarketMedia);
      const removed = (state.marketDraftMedia || [])[index];
      if (String(removed?.dataUrl || "").startsWith("blob:")) URL.revokeObjectURL(removed.dataUrl);
      if (String(removed?.posterUrl || "").startsWith("blob:")) URL.revokeObjectURL(removed.posterUrl);
      state.marketDraftMedia = (state.marketDraftMedia || []).filter((_, itemIndex) => itemIndex !== index);
      renderMarketMediaDraft();
    };
  });
  document.querySelectorAll("[data-move-market-media]").forEach(button => {
    button.onclick = () => {
      const from = Number(button.dataset.moveMarketMedia);
      const direction = Number(button.dataset.marketMediaDirection);
      moveMarketDraftMedia(from, from + direction);
    };
  });

  const mediaItems = Array.from(document.querySelectorAll("[data-market-media-index]"));
  let desktopDragIndex = null;
  const clearDragState = () => mediaItems.forEach(item => item.classList.remove("is-dragging", "is-drag-over"));

  mediaItems.forEach(item => {
    const index = Number(item.dataset.marketMediaIndex);
    item.addEventListener("dragstart", event => {
      desktopDragIndex = index;
      item.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(index));
    });
    item.addEventListener("dragover", event => {
      if (desktopDragIndex === null || desktopDragIndex === index) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      mediaItems.forEach(entry => entry.classList.toggle("is-drag-over", entry === item));
    });
    item.addEventListener("drop", event => {
      event.preventDefault();
      const from = Number(event.dataTransfer.getData("text/plain") || desktopDragIndex);
      clearDragState();
      desktopDragIndex = null;
      moveMarketDraftMedia(from, index);
    });
    item.addEventListener("dragend", () => {
      desktopDragIndex = null;
      clearDragState();
    });

  });
}

async function readMarketMedia(event) {
  const current = Array.isArray(state.marketDraftMedia) ? state.marketDraftMedia : [];
  const remaining = Math.max(0, 9 - current.length);
  const selected = Array.from(event.target.files || []);
  event.target.value = "";
  if (!selected.length || !remaining) return;
  const files = selected.slice(0, remaining);
  if (selected.length > remaining) toast(`最多只能添加9个，已选取前${remaining}个`);
  const nextItems = [];
  for (const file of files) {
    try {
      // iOS may leave File.type empty for a video picked from Photos.  Fall
      // back to the extension so a valid MOV/MP4 is still treated as video.
      const mediaKind = localMediaFileKind(file);
      const isImage = mediaKind === "image";
      const isVideo = mediaKind === "video";
      if (!isImage && !isVideo) {
        toast(`不支持文件：${file.name}`);
        continue;
      }
      let duration = 0;
      if (isVideo) {
        duration = await readVideoDuration(file);
        if (duration > 30) {
          toast(`视频时长不能超过30秒：${file.name}`);
          continue;
        }
      }
      const dataUrl = isImage
        ? file.size <= 8 * 1024 * 1024
          ? await fileAsDataUrl(file)
          : await readImageForLocalUse(file, "market", { maxSide: 3200, quality: 0.96, maxLength: 8500000 })
        : URL.createObjectURL(file);
      const poster = isVideo ? await createVideoPoster(file) : null;
      nextItems.push({
        dataUrl,
        file: isVideo ? file : null,
        duration,
        posterFile: poster?.file || null,
        posterUrl: poster?.previewUrl || "",
        type: isVideo ? "video" : "image"
      });
    } catch (error) {
      // One unreadable or overlength item must not cancel other valid items
      // selected from the same native iOS photo picker.
      toast(error?.message || `无法读取：${file.name}`);
    }
  }
  if (!nextItems.length) return;
  state.marketDraftMedia = [...current, ...nextItems].slice(0, 9);
  renderMarketMediaDraft();
}

function normalizeMarketCity(value) {
  const text = String(value || "").replace(/\s+/g, "").trim();
  if (!text) return "";
  if (/(区|县|镇|乡|街|街道|村|社区|开发区|新区)$/.test(text)) return "";
  if (/^(?:[\u4e00-\u9fff]{2,12}省|[\u4e00-\u9fff]{2,12}自治区|[\u4e00-\u9fff]{2,12}特别行政区|中国)$/.test(text)) return "";
  const provinceMatch = text.match(/(?:省|自治区|特别行政区)([^省自治区特别行政区,，]{2,12}?市)/);
  if (provinceMatch?.[1]) return provinceMatch[1];
  const segments = text.split(/[,，]/).map(item => item.trim()).filter(Boolean);
  const citySegment = segments.find(item => /市$/.test(item) && !/(区|县|镇|乡|街|街道|村|社区|开发区|新区)市$/.test(item));
  if (citySegment) return citySegment;
  if (/^(北京|上海|天津|重庆)市?$/.test(text)) return text.endsWith("市") ? text : `${text}市`;
  return /^[\u4e00-\u9fff]{2,12}$/.test(text) ? `${text}市` : "";
}

function updateMarketCityLocationUi(status = state.marketLocationStatus) {
  const button = document.querySelector("[data-market-city-locate]");
  const hint = document.querySelector("[data-market-city-hint]");
  if (!button || !hint) return;
  const labels = {
    loading: ["定位中…", "正在读取设备位置"],
    success: ["重新定位", "已按当前位置自动填写，城市不可手动修改"],
    error: ["重新定位", "无法获取城市。请开启位置权限后重新定位"],
    manual: ["重新定位", "请重新定位以确认所在城市"],
    idle: ["定位", "城市仅能通过当前位置自动获取"]
  };
  const [buttonText, hintText] = labels[status] || labels.idle;
  button.textContent = buttonText;
  button.disabled = status === "loading";
  hint.textContent = hintText;
}

async function fetchMarketLocationJson(url) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, {
      headers: { "Accept-Language": "zh-CN,zh;q=0.9" },
      signal: controller.signal,
      cache: "no-store"
    });
    if (!response.ok) throw new Error("定位服务暂不可用");
    return await response.json();
  } finally {
    window.clearTimeout(timer);
  }
}

async function reverseGeocodeMarketCity(latitude, longitude) {
  const lat = Number(latitude).toFixed(6);
  const lon = Number(longitude).toFixed(6);
  const nominatim = new URLSearchParams({ lat, lon, format: "jsonv2", zoom: "10", "accept-language": "zh-CN" });
  try {
    const result = await fetchMarketLocationJson(`https://nominatim.openstreetmap.org/reverse?${nominatim}`);
    const address = result?.address || {};
    const city = [address.city, address.municipality, result?.display_name, address.town, address.county]
      .map(normalizeMarketCity)
      .find(Boolean);
    if (city) return city;
  } catch {
    // 尝试备用服务，保证定位接口短暂不可用时仍可填写城市。
  }
  const fallback = await fetchMarketLocationJson(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&localityLanguage=zh`);
  return [fallback?.city, fallback?.locality]
    .map(normalizeMarketCity)
    .find(Boolean) || "";
}

function nativeGeolocationPlugin() {
  const capacitor = window.Capacitor;
  if (!capacitor || typeof capacitor.isNativePlatform !== "function" || !capacitor.isNativePlatform()) return null;
  const plugin = capacitor.Plugins?.Geolocation || capacitor.registerPlugin?.("Geolocation");
  return plugin && typeof plugin.getCurrentPosition === "function" ? plugin : null;
}

// iOS's WebView file input uses the modern system Photos sheet.  That sheet
// changes depending on the OS and is not styled by the app.  The native picker
// below is our own full-screen, dark media grid, so every non-camera upload
// entry has one consistent experience (archive, ledger, breeding, avatar,
// market, community and chat).
function nativeMediaPickerPlugin() {
  const capacitor = window.Capacitor;
  if (!capacitor || typeof capacitor.isNativePlatform !== "function" || !capacitor.isNativePlatform()) return null;
  if (typeof capacitor.getPlatform === "function" && capacitor.getPlatform() !== "ios") return null;
  const plugin = capacitor.Plugins?.TurtleMediaPicker || capacitor.registerPlugin?.("TurtleMediaPicker");
  return plugin && typeof plugin.pick === "function" ? plugin : null;
}

function nativeMediaPickerOptions(input) {
  const accepted = String(input?.accept || "").toLowerCase();
  const allowVideos = /video|\.mp4|\.mov|\.m4v|\.webm/.test(accepted);
  const allowImages = /image|\.jpe?g|\.png|\.webp|\.heic/.test(accepted) || !allowVideos;
  return {
    allowImages,
    allowVideos,
    // Existing one-photo fields still use the same grid UI, but keep their
    // one-item data rule. Market is the only multi-media upload and remains
    // capped at nine items.
    selectionLimit: input?.multiple ? 9 : 1,
    maximumVideoDuration: allowVideos ? 30 : 0
  };
}

async function nativePickedFiles(items = []) {
  const capacitor = window.Capacitor;
  const files = [];
  for (const [index, item] of items.entries()) {
    const path = String(item?.path || "");
    if (!path) continue;
    const source = typeof capacitor?.convertFileSrc === "function" ? capacitor.convertFileSrc(path) : path;
    let response;
    let blob;
    // A freshly exported camera/photo file can reach WKWebView a fraction of
    // a second before Capacitor's local-file handler can serve its contents.
    // Retry that transient empty response so the first user action succeeds.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      response = await fetch(`${source}${source.includes("?") ? "&" : "?"}read=${Date.now()}-${attempt}`, { cache: "no-store" });
      blob = await response.blob();
      if ((response.ok || response.status === 0) && blob.size) break;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 120 * (attempt + 1)));
    }
    // Capacitor's iOS local-file handler returns URLResponse for media files,
    // which has no HTTP status even when the file body is valid.  Trust a
    // non-empty body in that case instead of rejecting every selected photo
    // or video as a failed network response.
    if ((!response.ok && response.status !== 0) || !blob?.size) throw new Error("读取已选媒体失败，请重试");
    const mimeType = String(item?.mimeType || blob.type || (item?.mediaType === "video" ? "video/mp4" : "image/jpeg"));
    const extension = mimeType.startsWith("video/") ? "mp4" : "jpg";
    const name = String(item?.name || `${item?.mediaType === "video" ? "video" : "photo"}-${Date.now()}-${index + 1}.${extension}`);
    files.push(new File([blob], name, { type: mimeType, lastModified: Date.now() }));
  }
  return files;
}

async function openNativeMediaPickerForInput(input) {
  const picker = nativeMediaPickerPlugin();
  if (!picker || !input?.isConnected) return false;
  const result = await picker.pick(nativeMediaPickerOptions(input));
  const files = await nativePickedFiles(Array.isArray(result?.files) ? result.files : []);
  if (!files.length || !input.isConnected) return true;
  const transfer = new DataTransfer();
  files.forEach(file => transfer.items.add(file));
  try {
    input.files = transfer.files;
  } catch {
    Object.defineProperty(input, "files", { configurable: true, value: transfer.files });
  }
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function setupNativeMediaPicker() {
  if (document.body.dataset.nativeMediaPickerBound === "true") return;
  document.body.dataset.nativeMediaPickerBound = "true";
  document.addEventListener("click", event => {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    // Camera buttons deliberately remain native camera capture. Every regular
    // image/video upload opens the consistent app-owned media grid instead.
    if (!input || input.type !== "file" || input.hasAttribute("capture") || !nativeMediaPickerPlugin()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (nativeMediaPickerOpening) return;
    nativeMediaPickerOpening = true;
    void openNativeMediaPickerForInput(input)
      .catch(error => toast(error?.message || "打开媒体选择器失败"))
      .finally(() => { nativeMediaPickerOpening = false; });
  }, true);
}

function locationPermissionError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function isLocationPermissionDenied(error) {
  return error?.code === "LOCATION_DENIED" || error?.message === "LOCATION_DENIED";
}

function locationSettingsHint() {
  return "已拒绝位置权限，请打开 iPhone「设置 > 隐私与安全性 > 定位服务 > 壳友手账」，选择“使用 App 期间”后再试。";
}

async function getMarketLocationPosition({ requestPermission = true } = {}) {
  const nativePlugin = nativeGeolocationPlugin();
  if (nativePlugin) {
    let permissions = await nativePlugin.checkPermissions();
    if (permissions?.location === "denied") throw locationPermissionError("LOCATION_DENIED");
    if (permissions?.location !== "granted") {
      if (!requestPermission) throw locationPermissionError("LOCATION_PERMISSION_REQUIRED");
      permissions = await nativePlugin.requestPermissions({ permissions: ["location"] });
      if (permissions?.location !== "granted") throw locationPermissionError("LOCATION_DENIED");
    }
    return nativePlugin.getCurrentPosition({
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 5 * 60 * 1000
    });
  }

  if (!navigator.geolocation) throw locationPermissionError("LOCATION_UNAVAILABLE");
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 5 * 60 * 1000
    });
  });
}

async function requestLocationPermissionOnLogin() {
  const nativePlugin = nativeGeolocationPlugin();
  if (!nativePlugin?.checkPermissions || !nativePlugin?.requestPermissions) return;
  try {
    const permissions = await nativePlugin.checkPermissions();
    if (permissions?.location === "granted") return;
    if (permissions?.location === "denied") {
      setState({ marketSearchLocationStatus: "denied" }, { skipCloud: true });
      return;
    }
    const requested = await nativePlugin.requestPermissions({ permissions: ["location"] });
    if (requested?.location !== "granted") {
      setState({ marketSearchLocationStatus: "denied" }, { skipCloud: true });
    }
  } catch {
    // 权限弹窗被系统中断时，后续仍可在区域筛选中重新尝试。
  }
}

async function requestMarketCityAutofill({ force = false } = {}) {
  if (state.marketLocationStatus === "loading") return;
  if (!force && state.marketLocationStatus === "success" && String(state.marketDraftCity || "").trim() && Number.isFinite(Number(state.marketDraftLatitude)) && Number.isFinite(Number(state.marketDraftLongitude))) {
    updateMarketCityLocationUi(state.marketLocationStatus === "idle" ? "success" : state.marketLocationStatus);
    return;
  }
  state.marketLocationStatus = "loading";
  updateMarketCityLocationUi();
  try {
    const position = await getMarketLocationPosition({ requestPermission: force });
    const city = await reverseGeocodeMarketCity(position.coords.latitude, position.coords.longitude);
    if (!city) throw new Error("未能识别所在城市");
    const input = document.querySelector("[data-market-city]");
    state.marketDraftCity = city;
    state.marketDraftLatitude = String(position.coords.latitude);
    state.marketDraftLongitude = String(position.coords.longitude);
    if (input) input.value = city;
    state.marketLocationStatus = "success";
    updateMarketCityLocationUi();
  } catch (error) {
    state.marketLocationStatus = "error";
    updateMarketCityLocationUi();
    if (isLocationPermissionDenied(error)) toast(locationSettingsHint());
  }
}

async function requestMarketSearchLocation({ showSettingsHint = false } = {}) {
  if (state.marketSearchLocationStatus === "loading" || state.marketSearchLocationCity) return;
  state.marketSearchLocationStatus = "loading";
  render();
  try {
    const position = await getMarketLocationPosition({ requestPermission: true });
    const city = await reverseGeocodeMarketCity(position.coords.latitude, position.coords.longitude);
    if (!city) throw new Error("未能识别所在城市");
    setState({ marketSearchLocationCity: city, marketSearchLocationStatus: "success" }, { skipCloud: true });
  } catch (error) {
    const status = isLocationPermissionDenied(error) ? "denied" : "error";
    setState({ marketSearchLocationStatus: status }, { skipCloud: true });
    if (status === "denied" && showSettingsHint) toast(locationSettingsHint());
  }
}

async function submitMarketListing(event) {
  event.preventDefault();
  if (marketPublishInFlight) {
    toast("商品正在发布，请勿重复点击");
    return;
  }
  if (!canUseCommunity()) return;
  const formElement = event.currentTarget;
  const editingListingId = state.editingMarketListingId;
  const form = new FormData(formElement);
  const turtle = (state.turtles || []).find(item => item.id === String(form.get("turtleId") || ""));
  const localMedia = (state.marketDraftMedia || []).length
    ? state.marketDraftMedia.slice(0, 9)
    : turtle?.photo ? [{ dataUrl: turtle.photo, type: "image" }] : [];
  let speciesCode = String(form.get("speciesCode") || "");
  let species = speciesByCode(speciesCode);
  if (!species) {
    const speciesSearch = event.currentTarget.querySelector("[data-market-species-search]");
    species = marketSpeciesMatches(speciesSearch?.value || "")[0] || null;
    speciesCode = species?.code || "";
  }
  if (!species) return toast("请从搜索结果中选择品种");
  if (isMarketProhibitedSpecies(species)) return toast(marketSpeciesRestrictionMessage());
  const payload = {
    turtleId: String(form.get("turtleId") || ""),
    title: String(form.get("title") || "").trim(),
    speciesCode,
    speciesName: species?.name || turtle?.speciesName || "",
    stage: String(form.get("stage") || ""),
    gender: String(form.get("gender") || "未知"),
    weight: String(form.get("weight") || "").trim(),
    shellLength: String(form.get("shellLength") || "").trim(),
    price: Number(form.get("price") || 0),
    negotiable: form.get("negotiable") === "on",
    city: String(form.get("city") || "").trim(),
    locationSource: "device",
    latitude: Number(state.marketDraftLatitude),
    longitude: Number(state.marketDraftLongitude),
    delivery: String(form.get("delivery") || ""),
    description: String(form.get("description") || "").trim()
  };
  const missingFields = [
    !payload.title && "出售标题",
    !payload.speciesName && "品种",
    !payload.stage && "阶段",
    !payload.shellLength && "背甲长度",
    payload.shellLength && (!Number.isFinite(Number(payload.shellLength)) || Number(payload.shellLength) <= 0) && "背甲长度",
    (!payload.city || state.marketLocationStatus !== "success" || !Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude)) && "所在城市（请先允许位置访问并完成定位）",
    !payload.delivery && "交付方式",
    !payload.description && "详细说明"
  ].filter(Boolean);
  if (missingFields.length || payload.price < 0) return toast(`请填写必填项：${[...new Set(missingFields)].join("、") || "出售价格"}`);
  if (!localMedia.length) return toast("请至少添加一张实拍图片或一段视频");

  const fingerprint = JSON.stringify({
    editingListingId,
    payload,
    media: localMedia.map(media => {
      const source = String(media?.dataUrl || media?.url || "");
      const file = media?.file;
      return {
        type: media?.type || "image",
        name: String(file?.name || ""),
        size: Number(file?.size || 0),
        modifiedAt: Number(file?.lastModified || 0),
        sourceLength: source.length,
        sourceStart: source.slice(0, 72),
        sourceEnd: source.slice(-72)
      };
    })
  });
  if (fingerprint !== marketPublishFingerprint) {
    marketPublishFingerprint = fingerprint;
    marketPublishSubmissionId = crypto.randomUUID();
  }
  const submissionId = marketPublishSubmissionId;
  const publishButton = formElement.querySelector(".market-publish-submit");
  const publishButtonText = publishButton?.textContent || (editingListingId ? "保存并刷新" : "确认发布");
  const setPublishingLabel = (text, current = marketPublishProgress.current) => {
    updateMarketPublishProgress({ stage: text, current });
    if (!publishButton?.isConnected) return;
    publishButton.disabled = true;
    publishButton.setAttribute("aria-busy", "true");
    publishButton.textContent = text;
  };
  marketPublishInFlight = true;
  updateMarketPublishProgress({
    active: true,
    current: 0,
    total: localMedia.length,
    stage: "正在准备上传…"
  });
  // Do not make the user wait on a media-heavy form. The upload owns its
  // files, so it remains safe to replace this page with the market now.
  setState({ page: "market" }, {
    skipCloud: true,
    skipEdgeSnapshot: true,
    pageMotion: "none"
  });
  try {
    const mediaItems = [];
    for (const [mediaIndex, media] of localMedia.entries()) {
      const source = media.dataUrl || media.url || "";
      if (!source) continue;
      setPublishingLabel(`正在上传第 ${mediaIndex + 1} 项（共 ${localMedia.length} 项）…`, mediaIndex + 1);
      let posterUrl = String(media.posterUrl || "");
      if (media.type === "video" && media.posterFile) {
        try {
          const uploadedPoster = await apiUploadMediaFile(media.posterFile);
          posterUrl = uploadedPoster.url || posterUrl;
        } catch (error) {
          console.warn("视频封面上传失败", error);
        }
      }
      if (media.file) {
        const uploaded = await apiUploadMediaFile(media.file, media.duration || 0, {
          onRetry: ({ attempt, maxAttempts }) => {
            setPublishingLabel(
              `第 ${mediaIndex + 1} 项上传连接波动，正在重试（${attempt + 1}/${maxAttempts}）…`,
              mediaIndex + 1
            );
          }
        });
        mediaItems.push({ url: uploaded.url || source, type: uploaded.mediaType || media.type || "video", posterUrl });
      } else if (source.startsWith("data:")) {
        const uploaded = await apiPost("/api/upload/media", marketAuthPayload({ media: source }));
        mediaItems.push({ url: uploaded.url || source, type: uploaded.mediaType || media.type || "image", posterUrl });
      } else {
        mediaItems.push({ url: source, type: media.type || "image", posterUrl });
      }
    }
    const photoUrl = mediaItems[0]?.url || "";
    setPublishingLabel(editingListingId ? "正在保存商品信息…" : "正在发布商品信息…", localMedia.length);
    const result = await apiPost(editingListingId ? "/api/market/update" : "/api/market/create", marketAuthPayload({
      ...payload,
      listingId: editingListingId,
      submissionId,
      photoUrl,
      mediaItems
    }));
    localMedia.forEach(media => {
      if (media.file && String(media.dataUrl || "").startsWith("blob:")) URL.revokeObjectURL(media.dataUrl);
      if (String(media.posterUrl || "").startsWith("blob:")) URL.revokeObjectURL(media.posterUrl);
    });
    state.marketDraftPhoto = "";
    state.marketDraftMedia = [];
    state.marketDraftTurtleId = "";
    state.marketDraftCity = "";
    state.marketDraftLatitude = "";
    state.marketDraftLongitude = "";
    state.marketDraftDescription = "";
    state.marketDraftDescriptionTemplate = "";
    state.marketLocationStatus = "idle";
    state.editingMarketListingId = "";
    marketPublishFingerprint = "";
    marketPublishSubmissionId = "";
    marketLastLoadedAt = Date.now();
    clearMarketPublishProgress();
    setState({
      page: "market",
      marketListings: normalizeMarketListings(result.listings || []),
      myMarketListings: normalizeMarketListings(result.myListings || [])
    }, { skipCloud: true });
    toast(editingListingId ? "商品已保存并刷新" : "商品已发布，7 天未刷新将自动下架");
  } catch (error) {
    clearMarketPublishProgress();
    if (error.status === 405 || error.message === "方法不支持") {
      toast("服务器尚未更新，暂时无法发布九宫格商品");
      return;
    }
    const message = String(error?.message || "");
    if (/^load failed$/i.test(message) || error?.name === "TypeError") {
      toast("网络连接中断，暂未确认发布结果；请稍后再次点击，系统会避免重复创建商品");
      return;
    }
    toast(message || "发布失败");
  } finally {
    marketPublishInFlight = false;
    if (publishButton?.isConnected) {
      publishButton.disabled = false;
      publishButton.removeAttribute("aria-busy");
      publishButton.textContent = publishButtonText;
    }
  }
}

function requestMarketSaleDetails(listing) {
  return new Promise(resolve => {
    document.querySelector(".market-sale-overlay")?.remove();
    const previousFocus = document.activeElement;
    const overlay = document.createElement("div");
    overlay.className = "market-sale-overlay";
    overlay.innerHTML = `
      <section class="market-sale-dialog" role="dialog" aria-modal="true" aria-labelledby="marketSaleTitle">
        <div class="market-sale-head">
          <div><small>确认成交信息</small><h2 id="marketSaleTitle">标记商品已售</h2></div>
          <button type="button" data-market-sale-cancel aria-label="关闭">×</button>
        </div>
        <p class="market-sale-product">${escapeHtml(listing.title || listing.speciesName || "龟集市商品")}</p>
        <form data-market-sale-form>
          <fieldset>
            <legend>售出方式</legend>
            <div class="market-sale-methods">
              ${["自有客户成交", "闲鱼成交", "壳友手账成交"].map(method => `
                <label><input type="radio" name="saleMethod" value="${method}"><span>${method}</span></label>
              `).join("")}
            </div>
          </fieldset>
          <label class="market-sale-price"><span>实际成交价格</span><div><b>¥</b><input type="number" name="salePrice" min="0" step="0.01" value="${money(listing.price)}" inputmode="decimal" required></div></label>
          <p class="market-sale-error" aria-live="polite"></p>
          <div class="market-sale-buttons"><button type="button" data-market-sale-cancel>取消</button><button type="submit">确认已售</button></div>
        </form>
      </section>
    `;
    document.body.appendChild(overlay);
    document.body.classList.add("market-sale-open");
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeydown);
      document.body.classList.remove("market-sale-open");
      overlay.remove();
      if (previousFocus?.isConnected) previousFocus.focus();
      resolve(value);
    };
    const onKeydown = event => {
      if (event.key === "Escape") finish(null);
    };
    overlay.querySelectorAll("[data-market-sale-cancel]").forEach(button => button.addEventListener("click", () => finish(null)));
    overlay.addEventListener("click", event => {
      if (event.target === overlay) finish(null);
    });
    overlay.querySelector("[data-market-sale-form]")?.addEventListener("submit", event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const saleMethod = String(form.get("saleMethod") || "");
      const salePrice = Number(form.get("salePrice"));
      const error = overlay.querySelector(".market-sale-error");
      if (!saleMethod) {
        if (error) error.textContent = "请选择售出方式";
        return;
      }
      if (!Number.isFinite(salePrice) || salePrice < 0) {
        if (error) error.textContent = "请填写正确的成交价格";
        return;
      }
      finish({ saleMethod, salePrice });
    });
    document.addEventListener("keydown", onKeydown);
    overlay.querySelector('input[name="saleMethod"]')?.focus();
  });
}

function marketLedgerFallbackPatch(listing, status) {
  const records = state.ledgerRecords || [];
  const turtles = state.turtles || [];
  const soldPriceValue = Number(listing.soldPrice);
  const soldPrice = Number.isFinite(soldPriceValue) && soldPriceValue >= 0 ? soldPriceValue : Number(listing.price || 0);
  const saleMethod = String(listing.saleMethod || "未填写");
  const turtle = listing.turtleId ? turtles.find(item => item.id === listing.turtleId) : null;
  const linkedRecord = records.find(item => item.marketListingId === listing.id)
    || (listing.turtleId ? records.find(item => item.type === "sold" && item.turtleId === listing.turtleId) : null);

  if (status === "sold") {
    let record = linkedRecord;
    let ledgerRecords = records;
    if (!record) {
      const photo = marketListingMediaItems(listing).find(item => item.type !== "video" && item.url)?.url || turtle?.photo || "";
      const snapshot = turtle ? { ...turtle } : {
        id: listing.turtleId || "",
        code: listing.title || listing.speciesName || "龟集市商品",
        speciesCode: listing.speciesCode || "",
        speciesName: listing.speciesName || "未填写品种",
        gender: listing.gender || "未知",
        weight: listing.weight || "",
        carapaceLength: listing.shellLength || "",
        status: "已转让",
        health: "",
        source: "龟集市",
        price: Number(listing.price || 0),
        photo,
        createdAt: listing.createdAt || new Date().toISOString(),
        measureHistory: []
      };
      record = {
        id: crypto.randomUUID(),
        type: "sold",
        turtleId: listing.turtleId || "",
        title: turtle ? turtleLabel(turtle) : (listing.title || listing.speciesName || "龟集市商品"),
        amount: soldPrice,
        recordDate: formatDate(new Date()),
        weight: listing.weight || turtle?.weight || "",
        carapaceLength: listing.shellLength || turtle?.carapaceLength || "",
        carapaceWidth: turtle?.carapaceWidth || "",
        shellHeight: turtle?.shellHeight || "",
        plastronLength: turtle?.plastronLength || "",
        note: `成交方式：${saleMethod}；由龟集市标记已售自动生成`,
        saleMethod,
        photo,
        turtleSnapshot: snapshot,
        marketListingId: listing.id,
        autoMarketRecord: true,
        createdAt: new Date().toISOString()
      };
      ledgerRecords = [record, ...records];
    } else if (!record.marketListingId) {
      record = { ...record, marketListingId: listing.id };
      ledgerRecords = records.map(item => item.id === record.id ? record : item);
    }
    if (record.autoMarketRecord && (record.amount !== soldPrice || record.saleMethod !== saleMethod)) {
      record = {
        ...record,
        amount: soldPrice,
        saleMethod,
        note: `成交方式：${saleMethod}；由龟集市标记已售自动生成`
      };
      ledgerRecords = ledgerRecords.map(item => item.id === record.id ? record : item);
    }
    return {
      ledgerRecords,
      turtles: listing.turtleId && turtle ? turtles.filter(item => item.id !== listing.turtleId) : turtles,
      activityLogs: logActivity(`龟集市已售自动记账：${record.title}，${saleMethod}，成交价 ${money(record.amount)} 元`, "账本")
    };
  }

  const autoRecord = records.find(item => item.marketListingId === listing.id && item.autoMarketRecord);
  const shouldRestore = listing.turtleId && autoRecord?.turtleSnapshot && !turtles.some(item => item.id === listing.turtleId);
  return {
    ledgerRecords: autoRecord ? records.filter(item => item.id !== autoRecord.id) : records,
    turtles: shouldRestore ? [{ ...autoRecord.turtleSnapshot }, ...turtles] : turtles,
    activityLogs: logActivity(`龟集市恢复在售：${listing.title || listing.speciesName || "商品"}`, "账本")
  };
}

async function toggleMarketSold(listingId) {
  const listing = (state.marketListings || []).find(item => item.id === listingId);
  if (!listing) return;
  const status = listing.status === "sold" ? "active" : "sold";
  const saleDetails = status === "sold" ? await requestMarketSaleDetails(listing) : null;
  if (status === "sold" && !saleDetails) return;
  const ledgerListing = status === "sold" ? {
    ...listing,
    saleMethod: saleDetails.saleMethod,
    soldPrice: saleDetails.salePrice
  } : listing;
  if (listing.pendingLocal) {
    setState({
      ...marketLedgerFallbackPatch(ledgerListing, status),
      page: status === "sold" ? "market" : state.page,
      selectedMarketListingId: status === "sold" ? "" : state.selectedMarketListingId,
      marketListings: status === "sold"
        ? (state.marketListings || []).filter(item => item.id !== listingId)
        : (state.marketListings || []).map(item => item.id === listingId ? { ...item, status } : item)
    });
    toast(status === "sold" ? "已售出并自动记入账本" : "已恢复在售并撤销自动账本记录");
    return;
  }
  try {
    const result = await apiPost("/api/market/status", marketAuthPayload({
      listingId,
      status,
      saleMethod: saleDetails?.saleMethod || "",
      salePrice: saleDetails?.salePrice ?? ""
    }));
    const accountPatch = result.accountData
      ? normalizeAccountData(result.accountData)
      : marketLedgerFallbackPatch(ledgerListing, status);
    setState({
      ...accountPatch,
      page: status === "sold" ? "market" : state.page,
      selectedMarketListingId: status === "sold" ? "" : state.selectedMarketListingId,
      marketListings: normalizeMarketListings(result.listings || []).filter(item => item.status !== "sold"),
      myMarketListings: normalizeMarketListings(result.myListings || [])
    });
    toast(status === "sold" ? "已售出并自动记入账本" : "已恢复在售并撤销自动账本记录");
  } catch (error) {
    if (error.status === 405 || error.message === "方法不支持") {
      setState({
        ...marketLedgerFallbackPatch(ledgerListing, status),
        page: status === "sold" ? "market" : state.page,
        selectedMarketListingId: status === "sold" ? "" : state.selectedMarketListingId,
        marketListings: status === "sold"
          ? (state.marketListings || []).filter(item => item.id !== listingId)
          : (state.marketListings || []).map(item => item.id === listingId ? { ...item, status } : item)
      });
      toast(status === "sold" ? "已售出并自动记入账本" : "已恢复在售并撤销自动账本记录");
      return;
    }
    toast(error.message || "操作失败");
  }
}

async function deleteMarketListing(listingId) {
  if (!confirm("确定删除这件商品吗？")) return;
  const listing = (state.marketListings || []).find(item => item.id === listingId);
  if (listing?.pendingLocal) {
    setState({ page: "market", marketListings: (state.marketListings || []).filter(item => item.id !== listingId) }, { skipCloud: true });
    return;
  }
  try {
    const result = await apiPost("/api/market/delete", marketAuthPayload({ listingId }));
    setState({ page: "market", marketListings: normalizeMarketListings(result.listings || []) }, { skipCloud: true });
  } catch (error) {
    if (error.status === 405 || error.message === "方法不支持") {
      setState({ page: "market", marketListings: (state.marketListings || []).filter(item => item.id !== listingId) }, { skipCloud: true });
      return;
    }
    toast(error.message || "删除失败");
  }
}

function beginMarketListingEdit(listingId) {
  const listing = (state.myMarketListings || []).find(item => item.id === listingId)
    || (state.marketListings || []).find(item => item.id === listingId);
  if (!listing) return toast("商品信息不存在");
  const mediaItems = marketListingMediaItems(listing).map(media => ({ dataUrl: media.url, type: media.type || "image" }));
  setState({
    page: "marketAdd",
    editingMarketListingId: listing.id,
    marketDraftTurtleId: listing.turtleId || "",
    marketDraftPhoto: "",
    marketDraftMedia: mediaItems,
    marketDraftCity: "",
    marketDraftLatitude: "",
    marketDraftLongitude: "",
    marketDraftDescription: listing.description || "",
    marketDraftDescriptionTemplate: "",
    marketLocationStatus: "idle"
  }, { skipCloud: true });
}

async function refreshOwnMarketListing(listingId) {
  if (!canUseCommunity()) return;
  try {
    const result = await apiPost("/api/market/refresh", marketAuthPayload({ listingId }));
    marketLastLoadedAt = Date.now();
    setState({
      myMarketListings: normalizeMarketListings(result.myListings || []),
      marketListings: normalizeMarketListings(result.listings || [])
    }, { skipCloud: true });
    toast("商品已刷新，将继续展示 7 天");
  } catch (error) {
    toast(error.message || "刷新失败");
  }
}

async function offlineOwnMarketListing(listingId) {
  if (!canUseCommunity()) return;
  if (!confirm("下架后，其他用户将无法在龟集市看到该商品。确定下架吗？")) return;
  try {
    const result = await apiPost("/api/market/offline", marketAuthPayload({ listingId }));
    marketLastLoadedAt = Date.now();
    setState({
      myMarketListings: normalizeMarketListings(result.myListings || []),
      marketListings: normalizeMarketListings(result.listings || [])
    }, { skipCloud: true });
    toast("商品已下架");
  } catch (error) {
    toast(error.message || "下架失败");
  }
}

function openChatMarketListing(listingId) {
  const snapshot = normalizeCommunityChatListing(state.communityChatListing);
  if (snapshot?.id === listingId && isUnavailableChatListing(snapshot)) {
    toast(unavailableChatListingMessage(snapshot));
    return;
  }
  const liveListing = (state.marketListings || []).find(item => item.id === listingId);
  if (liveListing) {
    setState({ page: "marketDetail", selectedMarketListingId: listingId }, { skipCloud: true });
    return;
  }
  if (!snapshot || snapshot.id !== listingId) {
    toast("商品信息暂时不可查看");
    return;
  }
  const isOwn = Boolean(snapshot.sellerId && snapshot.sellerId !== state.selectedCommunityFriendId);
  const referenceListing = normalizeMarketListings([{
    ...snapshot,
    isOwn,
    isFriend: true,
    sellerFollowed: false,
    chatReference: true
  }])[0];
  setState({
    page: "marketDetail",
    selectedMarketListingId: listingId,
    marketListings: [referenceListing, ...(state.marketListings || []).filter(item => item.id !== listingId)]
  }, { skipCloud: true });
}

async function contactMarketSeller(listingId, buying = false) {
  const listing = (state.marketListings || []).find(item => item.id === listingId);
  if (!listing || listing.isOwn || listing.pendingLocal) return;
  if (!canUseCommunity()) return;
  void recordMarketWant(listingId);
  const buyMessage = `你好，我想咨询「${listing.title || listing.speciesName || "这只龟"}」，请问现在还在售吗？`;
  marketChatDraft = buyMessage;
  const initialFriend = (state.communityFriends || []).find(item => item.id === listing.sellerId) || {
    id: listing.sellerId,
    name: listing.sellerName,
    avatar: listing.sellerAvatar
  };
  const initialListing = normalizeCommunityChatListing({
    ...listing,
    mediaUrl: marketListingMediaItems(listing)[0]?.url || listing.photoUrl || "",
    mediaType: marketListingMediaItems(listing)[0]?.type || "image"
  });
  // Open the conversation before the automatic inquiry request finishes. The
  // old sequence waited on two network calls, so the tap could look ignored.
  communityChatOpening = true;
  communityChatLoading = true;
  pendingCommunityChatLatestScroll = false;
  setState({
    page: "communityChat",
    selectedCommunityFriendId: listing.sellerId,
    selectedCommunityFriend: initialFriend,
    communityChatMessages: [],
    communityChatListing: initialListing,
    communityChatToolsOpen: false
  }, { skipCloud: true, pageMotion: "chat" });
  try {
    const sent = await apiPost("/api/community/chat/send", communityAuthPayload({
      userId: listing.sellerId,
      content: buyMessage,
      marketListingId: listing.id
    }));
    const friend = sent.friend || initialFriend;
    const messages = sent.messages || [];
    const marketListing = normalizeCommunityChatListing(sent.marketListing) || initialListing;
    marketChatDraft = "";
    communityChatLoadedKey = `${listing.sellerId}:${Math.floor(Date.now() / 10000)}`;
    const chatStillVisible = state.page === "communityChat" && state.selectedCommunityFriendId === listing.sellerId;
    communityChatOpening = false;
    if (chatStillVisible) $app.classList.remove("community-chat-enter-motion");
    pendingCommunityChatLatestScroll = chatStillVisible;
    setState({
      page: "communityChat",
      selectedCommunityFriendId: listing.sellerId,
      selectedCommunityFriend: friend,
      communityChatMessages: messages,
      communityChatListing: marketListing,
      communityChatToolsOpen: false,
      communityFriends: communityFriendsWithPreview(listing.sellerId, friend, messages, { unreadCount: 0 })
    }, { skipCloud: true, pageMotion: "chat" });
    refreshMessageUnread(true);
  } catch (error) {
    communityChatOpening = false;
    if (state.page === "communityChat" && state.selectedCommunityFriendId === listing.sellerId) {
      $app.classList.remove("community-chat-enter-motion");
      render();
    }
    toast(error.message === "方法不支持" ? "联系卖家功能将在服务更新后开放" : (error.message || "暂时无法联系卖家"));
  } finally {
    communityChatLoading = false;
  }
}

function marketInquiryCode(listing) {
  const id = String(listing?.id || "").replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  return `KM-${id || "咨询"}`;
}

async function copyText(text, successText = "已复制") {
  const value = String(text || "");
  if (!value) return false;
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      if (!copied) throw new Error("copy failed");
    }
    toast(successText);
    return true;
  } catch {
    toast("复制失败，请手动复制");
    return false;
  }
}

async function openPlatformWeChat() {
  const copied = await copyText(PLATFORM_SERVICE_WECHAT, "客服微信号已复制，正在打开微信");
  if (!copied) return;
  // WeChat intentionally does not expose a URL that opens a personal account's
  // add-friend page. Opening WeChat after copying provides the shortest safe flow.
  window.location.href = "weixin://dl/chat";
  window.setTimeout(() => {
    if (document.visibilityState === "visible") toast("请在微信中粘贴并搜索客服微信号添加好友");
  }, 900);
}

function sharedMarketListingIdFromUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  try {
    const parsed = new URL(value, window.location.href);
    const queryId = String(parsed.searchParams.get("market") || "").trim();
    const pathMatch = parsed.pathname.match(/^\/market\/([^/?#]+)/i);
    const listingId = queryId || (pathMatch ? decodeURIComponent(pathMatch[1]) : "");
    return listingId && listingId.length <= 120 ? listingId : "";
  } catch (error) {
    return "";
  }
}

function openSharedMarketListing(rawUrl, options = {}) {
  const listingId = sharedMarketListingIdFromUrl(rawUrl);
  if (!listingId) return false;
  incomingMarketShareListingId = listingId;
  incomingMarketShareLoading = true;
  // A Universal Link must not be held back by the normal ten-second market
  // cache window: the requested listing might not be in the previous list.
  marketLastLoadedAt = 0;
  const marketHistoryIds = [listingId, ...(state.marketHistoryIds || []).filter(item => item !== listingId)].slice(0, 100);
  if (options.initial) {
    state = { ...state, page: "marketDetail", selectedMarketListingId: listingId, marketHistoryIds };
    return true;
  }
  if (state.page === "marketDetail" && String(state.selectedMarketListingId || "") === listingId) return true;
  setState({ page: "marketDetail", selectedMarketListingId: listingId, marketHistoryIds }, { pageMotion: "enter" });
  recordMarketView(listingId);
  return true;
}

function nativeAppLinkPlugin() {
  const capacitor = window.Capacitor;
  if (!capacitor || typeof capacitor.isNativePlatform !== "function" || !capacitor.isNativePlatform()) return null;
  const plugin = capacitor.Plugins?.App || capacitor.registerPlugin?.("App");
  return plugin && typeof plugin.addListener === "function" ? plugin : null;
}

function setupMarketShareDeepLinks() {
  if (nativeMarketShareLinksBound) return;
  nativeMarketShareLinksBound = true;
  const nativeApp = nativeAppLinkPlugin();
  if (nativeApp) {
    try {
      const listener = nativeApp.addListener("appUrlOpen", event => {
        openSharedMarketListing(event?.url);
      });
      listener?.catch?.(error => console.warn("商品链接监听失败", error));
      nativeApp.getLaunchUrl?.()
        .then(result => {
          if (result?.url) openSharedMarketListing(result.url);
        })
        .catch(error => console.warn("商品启动链接读取失败", error));
    } catch (error) {
      console.warn("商品链接初始化失败", error);
    }
  }
  window.addEventListener("popstate", () => openSharedMarketListing(window.location.href));
}

function marketShareUrl(listing) {
  const base = String(window.TURTLE_PUBLIC_APP_URL || "https://api.turtleworld.cn/").trim() || "https://api.turtleworld.cn/";
  const url = new URL(base, window.location.href);
  url.searchParams.set("market", String(listing?.id || ""));
  return url.toString();
}

async function shareMarketListing(listingId) {
  const listing = (state.marketListings || []).find(item => item.id === String(listingId || ""));
  if (!listing) return toast("商品信息不存在");
  const url = marketShareUrl(listing);
  const productTitle = listing.title || `${listing.speciesName || "乌龟"}在售`;
  // The server uses this same market link to render Open Graph metadata with
  // the listing title and its first photo, so WeChat shows a real product card
  // instead of a generic app-link placeholder.
  const title = `壳友手账｜${productTitle}`;
  const text = `${productTitle} · ${money(listing.price)}`;
  try {
    const nativeShare = window.Capacitor?.Plugins?.Share;
    if (nativeShare?.share) {
      await nativeShare.share({ title, text, url, dialogTitle: "分享商品" });
      return;
    }
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return;
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
  }
  copyText(url, "商品链接已复制，可发送给微信好友");
}

function openMarketDetailMore(listingId) {
  const listing = (state.marketListings || []).find(item => item.id === String(listingId || ""));
  if (!listing) return toast("商品信息不存在");
  document.querySelector(".market-detail-more-overlay")?.remove();
  const previousFocus = document.activeElement;
  const isOwn = Boolean(listing.isOwn || listing.pendingLocal);
  const overlay = document.createElement("div");
  overlay.className = "market-detail-more-overlay";
  overlay.innerHTML = `
    <section class="market-detail-more-sheet" role="dialog" aria-modal="true" aria-labelledby="marketDetailMoreTitle">
      <h2 id="marketDetailMoreTitle">分享至</h2>
      <div class="market-detail-more-actions">
        <button type="button" data-market-share-listing="${escapeHtml(listing.id)}"><span aria-hidden="true">↗</span><small>微信 / 其他</small></button>
        <button type="button" data-market-copy-listing="${escapeHtml(listing.id)}"><span aria-hidden="true">⌁</span><small>复制链接</small></button>
        ${isOwn ? "" : `<button type="button" class="danger" data-market-report-from-menu="${escapeHtml(listing.id)}"><span aria-hidden="true">!</span><small>举报</small></button><button type="button" class="danger" data-market-block-from-menu="${escapeHtml(listing.id)}" data-block-name="${escapeHtml(listing.sellerName || "该用户")}"><span aria-hidden="true">⊘</span><small>屏蔽</small></button>`}
      </div>
      <button class="market-detail-more-cancel" type="button" data-market-detail-more-close>取消</button>
    </section>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add("market-detail-more-open");
  const close = () => {
    document.body.classList.remove("market-detail-more-open");
    overlay.remove();
    if (previousFocus?.isConnected) previousFocus.focus();
  };
  overlay.addEventListener("click", event => {
    if (event.target === overlay) close();
  });
  overlay.querySelector("[data-market-detail-more-close]")?.addEventListener("click", close);
  overlay.querySelector("[data-market-share-listing]")?.addEventListener("click", () => shareMarketListing(listing.id));
  overlay.querySelector("[data-market-copy-listing]")?.addEventListener("click", () => copyText(marketShareUrl(listing), "商品链接已复制"));
  overlay.querySelector("[data-market-report-from-menu]")?.addEventListener("click", () => {
    close();
    openContentReportDialog("market", listing.id);
  });
  overlay.querySelector("[data-market-block-from-menu]")?.addEventListener("click", event => {
    close();
    confirmBlockUser({ targetType: "market", targetId: listing.id, name: event.currentTarget.dataset.blockName });
  });
  overlay.querySelector("[data-market-share-listing]")?.focus();
}

function openCommunityChatMore(userId, userName = "该用户") {
  if (!userId) return;
  document.querySelector(".community-chat-more-overlay")?.remove();
  const previousFocus = document.activeElement;
  const overlay = document.createElement("div");
  overlay.className = "market-detail-more-overlay community-chat-more-overlay";
  overlay.innerHTML = `
    <section class="market-detail-more-sheet community-chat-more-sheet" role="dialog" aria-modal="true" aria-labelledby="communityChatMoreTitle">
      <h2 id="communityChatMoreTitle">聊天设置</h2>
      <div class="market-detail-more-actions">
        <button type="button" data-chat-screen-user><span aria-hidden="true">⊘</span><small>屏蔽</small></button>
        <button type="button" class="danger" data-chat-block-user><span aria-hidden="true">!</span><small>拉黑</small></button>
        <button type="button" data-chat-contact-service><span aria-hidden="true">⌁</span><small>联系客服</small></button>
      </div>
      <button class="market-detail-more-cancel" type="button" data-chat-more-close>取消</button>
    </section>`;
  document.body.appendChild(overlay);
  document.body.classList.add("market-detail-more-open");
  const close = () => {
    document.body.classList.remove("market-detail-more-open");
    overlay.remove();
    if (previousFocus?.isConnected) previousFocus.focus();
  };
  overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
  overlay.querySelector("[data-chat-more-close]")?.addEventListener("click", close);
  const screen = () => {
    close();
    confirmBlockUser({ userId, name: userName, mode: "screen" });
  };
  const blacklist = () => {
    close();
    confirmBlockUser({ userId, name: userName, mode: "blacklist" });
  };
  overlay.querySelector("[data-chat-screen-user]")?.addEventListener("click", screen);
  overlay.querySelector("[data-chat-block-user]")?.addEventListener("click", blacklist);
  overlay.querySelector("[data-chat-contact-service]")?.addEventListener("click", () => {
    close();
    openMarketTopService();
  });
  overlay.querySelector("[data-chat-screen-user]")?.focus();
}

function openMarketTopService() {
  document.querySelector(".market-service-overlay")?.remove();
  const previousFocus = document.activeElement;
  const overlay = document.createElement("div");
  overlay.className = "market-service-overlay market-top-service-overlay";
  overlay.innerHTML = `
    <section class="market-service-dialog market-top-service-dialog" role="dialog" aria-modal="true" aria-labelledby="marketTopServiceTitle">
      <div class="market-service-head">
        <div><small>平台客服</small><h2 id="marketTopServiceTitle">联系平台客服</h2></div>
        <button type="button" data-market-service-close aria-label="关闭">×</button>
      </div>
      <div class="market-service-wechat"><span>平台客服微信</span><strong>${escapeHtml(PLATFORM_SERVICE_WECHAT)}</strong></div>
      <button class="market-top-service-copy" type="button" data-copy-market-wechat>复制微信号并打开微信</button>
    </section>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add("market-service-open");

  const close = () => {
    document.removeEventListener("keydown", onKeydown);
    document.body.classList.remove("market-service-open");
    overlay.remove();
    if (previousFocus?.isConnected) previousFocus.focus();
  };
  const onKeydown = event => {
    if (event.key === "Escape") close();
  };
  overlay.querySelector("[data-market-service-close]")?.addEventListener("click", close);
  overlay.addEventListener("click", event => {
    if (event.target === overlay) close();
  });
  overlay.querySelector("[data-copy-market-wechat]")?.addEventListener("click", openPlatformWeChat);
  document.addEventListener("keydown", onKeydown);
  overlay.querySelector("[data-copy-market-wechat]")?.focus();
}

function openMarketPlatformService(listingId) {
  const listing = (state.marketListings || []).find(item => item.id === listingId);
  if (!listing || listing.isOwn || listing.pendingLocal) return;
  if (state.loggedInPhone && currentCloudToken()) recordMarketWant(listingId);

  document.querySelector(".market-service-overlay")?.remove();
  const previousFocus = document.activeElement;
  const inquiryCode = marketInquiryCode(listing);
  const productName = listing.title || listing.speciesName || "龟集市商品";
  const consultation = `您好，我想咨询龟集市商品「${productName}」，商品咨询码：${inquiryCode}`;
  const overlay = document.createElement("div");
  overlay.className = "market-service-overlay";
  overlay.innerHTML = `
    <section class="market-service-dialog" role="dialog" aria-modal="true" aria-labelledby="marketServiceTitle">
      <div class="market-service-head">
        <div><small>购买前咨询</small><h2 id="marketServiceTitle">联系平台客服</h2></div>
        <button type="button" data-market-service-close aria-label="关闭">×</button>
      </div>
      <p class="market-service-product">${escapeHtml(productName)}</p>
      <div class="market-service-wechat"><span>平台客服微信</span><strong>${escapeHtml(PLATFORM_SERVICE_WECHAT)}</strong></div>
      <div class="market-service-code"><span>商品咨询码</span><b>${escapeHtml(inquiryCode)}</b></div>
      <p class="market-service-tip">添加客服微信后，请发送咨询内容或商品咨询码，以便确认商品、健康情况和交付方式。</p>
      <div class="market-service-buttons">
        <button type="button" data-copy-market-consultation>复制咨询内容</button>
        <button type="button" data-copy-market-wechat>复制微信号并打开微信</button>
      </div>
    </section>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add("market-service-open");

  const close = () => {
    document.removeEventListener("keydown", onKeydown);
    document.body.classList.remove("market-service-open");
    overlay.remove();
    if (previousFocus?.isConnected) previousFocus.focus();
  };
  const onKeydown = event => {
    if (event.key === "Escape") close();
  };
  overlay.querySelectorAll("[data-market-service-close]").forEach(button => button.addEventListener("click", close));
  overlay.addEventListener("click", event => {
    if (event.target === overlay) close();
  });
  overlay.querySelector("[data-copy-market-consultation]")?.addEventListener("click", () => copyText(consultation, "咨询内容已复制，去微信发送给客服"));
  overlay.querySelector("[data-copy-market-wechat]")?.addEventListener("click", openPlatformWeChat);
  document.addEventListener("keydown", onKeydown);
  overlay.querySelector("[data-copy-market-wechat]")?.focus();
}

function openContentReportDialog(targetType, targetId) {
  if (!canUseCommunity()) return;
  const type = targetType === "market" ? "market" : "community";
  const id = String(targetId || "");
  if (!id) return;
  document.querySelector(".content-report-overlay")?.remove();
  const previousFocus = document.activeElement;
  const overlay = document.createElement("div");
  overlay.className = "content-report-overlay";
  overlay.innerHTML = `
    <section class="content-report-dialog" role="dialog" aria-modal="true" aria-labelledby="contentReportTitle">
      <div class="content-report-head"><div><small>${type === "market" ? "龟集市商品" : "壳友圈动态"}</small><h2 id="contentReportTitle">举报内容</h2></div><button type="button" data-content-report-close aria-label="关闭">×</button></div>
      <p>请如实说明问题。恶意或重复举报可能影响账号使用。</p>
      <form data-content-report-form>
        <input type="hidden" name="targetType" value="${type}">
        <input type="hidden" name="targetId" value="${escapeHtml(id)}">
        <label><span>举报原因</span><select class="select" name="reason" required><option value="">请选择原因</option><option value="illegal_wildlife">疑似违法野生动物或来源不明</option><option value="fraud">虚假信息、诈骗或误导交易</option><option value="animal_welfare">健康、运输或动物福利风险</option><option value="infringement">侵权或泄露个人信息</option><option value="abuse">辱骂、骚扰或不当内容</option><option value="other">其他问题</option></select></label>
        <label><span>补充说明（选填）</span><textarea name="detail" maxlength="500" placeholder="可补充具体情况，便于平台核验"></textarea></label>
        <button class="primary" type="submit">提交举报</button>
      </form>
    </section>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add("content-report-open");
  const close = () => {
    document.removeEventListener("keydown", onKeydown);
    document.body.classList.remove("content-report-open");
    overlay.remove();
    if (previousFocus?.isConnected) previousFocus.focus();
  };
  const onKeydown = event => {
    if (event.key === "Escape") close();
  };
  overlay.querySelector("[data-content-report-close]")?.addEventListener("click", close);
  overlay.addEventListener("click", event => {
    if (event.target === overlay) close();
  });
  overlay.querySelector("[data-content-report-form]")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("reason") || "");
    const detail = String(form.get("detail") || "").trim();
    if (!reason) return toast("请选择举报原因");
    const submit = event.currentTarget.querySelector("button[type='submit']");
    if (submit) {
      submit.disabled = true;
      submit.textContent = "正在提交…";
    }
    try {
      await apiPost("/api/content-reports/create", communityAuthPayload({ targetType: type, targetId: id, reason, detail }));
      close();
      toast("举报已提交，平台会尽快审核");
    } catch (error) {
      toast(error.message || "举报提交失败");
      if (submit?.isConnected) {
        submit.disabled = false;
        submit.textContent = "提交举报";
      }
    }
  });
  document.addEventListener("keydown", onKeydown);
  overlay.querySelector("select")?.focus();
}

function confirmBlockUser({ targetType = "community", targetId = "", userId = "", name = "该用户", mode = "screen" } = {}) {
  if (!canUseCommunity()) return;
  document.querySelector(".safety-action-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "content-report-overlay safety-action-overlay";
  overlay.innerHTML = `
    <section class="content-report-dialog safety-action-dialog" role="dialog" aria-modal="true" aria-labelledby="blockUserTitle">
      <div class="content-report-head"><div><small>内容安全</small><h2 id="blockUserTitle">${mode === "blacklist" ? "拉黑" : "屏蔽"}${escapeHtml(name || "该用户")}？</h2></div><button type="button" data-safety-close aria-label="关闭">×</button></div>
      <p>${mode === "blacklist" ? "拉黑后，双方将无法继续聊天，现有聊天记录会被立即删除，对方的动态和商品也不会再显示。" : "屏蔽后，对方发布的动态、商品和消息会立即从你的页面移除；平台也会收到相关内容并进行核验。"}</p>
      <div class="safety-dialog-actions"><button class="secondary" type="button" data-safety-close>取消</button><button class="account-delete-button" type="button" data-confirm-block>${mode === "blacklist" ? "拉黑此用户" : "屏蔽此用户"}</button></div>
    </section>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelectorAll("[data-safety-close]").forEach(button => button.addEventListener("click", close));
  overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
  overlay.querySelector("[data-confirm-block]")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = mode === "blacklist" ? "正在拉黑…" : "正在屏蔽…";
    try {
      const result = await apiPost("/api/users/block", communityAuthPayload({ targetType, targetId, userId, mode }));
      close();
      setState({
        blockedUsers: Array.isArray(result.blockedUsers) ? result.blockedUsers : state.blockedUsers,
        communityPosts: Array.isArray(result.posts) ? normalizeCommunityPosts(result.posts) : state.communityPosts,
        marketListings: Array.isArray(result.listings) ? result.listings : state.marketListings,
        communityFriends: Array.isArray(result.friends) ? result.friends : state.communityFriends,
        selectedCommunityFriendId: "",
        selectedCommunityFriend: null,
        communityChatMessages: [],
        page: state.page === "marketDetail" ? "market" : state.page === "communityPostDetail" ? "community" : state.page === "communityChat" ? "messages" : state.page,
        openCommunityActionId: ""
      }, { skipCloud: true });
      toast(mode === "blacklist" ? "已拉黑此用户，账号与安全内可解除拉黑" : "已屏蔽此用户，账号与安全内可解除屏蔽");
    } catch (error) {
      button.disabled = false;
      button.textContent = mode === "blacklist" ? "拉黑此用户" : "屏蔽此用户";
      toast(error.message || (mode === "blacklist" ? "拉黑失败，请稍后重试" : "屏蔽失败，请稍后重试"));
    }
  });
  overlay.querySelector("[data-confirm-block]")?.focus();
}

async function refreshBlockedUsers(showToast = false) {
  if (!canUseCommunity()) return;
  try {
    const result = await apiPost("/api/users/blocked", communityAuthPayload());
    setState({ blockedUsers: Array.isArray(result.blockedUsers) ? result.blockedUsers : [] }, { skipCloud: true });
    if (showToast) toast("屏蔽名单已更新");
  } catch (error) {
    toast(error.message || "无法读取屏蔽名单");
  }
}

async function unblockUser(userId) {
  if (!canUseCommunity() || !userId) return;
  try {
    const result = await apiPost("/api/users/unblock", communityAuthPayload({ userId }));
    setState({ blockedUsers: Array.isArray(result.blockedUsers) ? result.blockedUsers : [] }, { skipCloud: true });
    toast("已解除屏蔽");
  } catch (error) {
    toast(error.message || "解除屏蔽失败");
  }
}

function openAccountDeleteDialog() {
  if (!state.loggedInPhone) return;
  document.querySelector(".account-delete-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "content-report-overlay account-delete-overlay";
  overlay.innerHTML = `
    <section class="content-report-dialog account-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="deleteAccountTitle">
      <div class="content-report-head"><div><small>不可恢复</small><h2 id="deleteAccountTitle">永久注销账号</h2></div><button type="button" data-delete-dialog-close aria-label="关闭">×</button></div>
      <div class="account-delete-warning"><strong>注销后以下内容将被永久删除：</strong><p>账号资料、乌龟档案、护理与繁殖记录、经营账本、动态、商品及聊天记录。</p></div>
      <form data-account-delete-form>
        <label><span>输入登录密码以验证身份</span><input class="field" type="password" name="password" minlength="6" autocomplete="current-password" required></label>
        <label class="account-delete-check"><input type="checkbox" name="confirmed" required><span>我了解注销完成后数据无法恢复</span></label>
        <button class="account-delete-button" type="submit" disabled>确认永久注销</button>
      </form>
    </section>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector("[data-delete-dialog-close]")?.addEventListener("click", close);
  overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
  const checkbox = overlay.querySelector("[name='confirmed']");
  const submit = overlay.querySelector("button[type='submit']");
  checkbox?.addEventListener("change", () => { submit.disabled = !checkbox.checked; });
  overlay.querySelector("[data-account-delete-form]")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    if (password.length < 6 || !form.get("confirmed")) return toast("请完成身份验证和注销确认");
    submit.disabled = true;
    submit.textContent = "正在永久注销…";
    const phone = state.loggedInPhone;
    const token = currentCloudToken();
    try {
      if (CONFIGURED_SMS_BACKEND) await apiPost("/api/account/delete", communityAuthPayload({ password, confirmation: "DELETE" }));
      else {
        const localUser = (state.registeredUsers || []).find(user => user.phone === phone);
        if (!localUser || localUser.password !== password) throw new Error("登录密码不正确");
      }
      void unregisterNativePushNotifications(phone, token);
      forgetCloudToken(phone);
      close();
      cloudHydrationComplete = false;
      setState({
        ...emptyAccountData(),
        registeredUsers: (state.registeredUsers || []).filter(user => user.phone !== phone),
        loggedInPhone: "", cloudToken: "", accountName: "未登录用户", accountAvatar: "",
        blockedUsers: [], communityPosts: [], communityFriends: [], communityChatMessages: [],
        marketListings: [], messageUnreadCount: 0, isCommunityAdmin: false,
        policyConsentRequired: false, page: "account"
      }, { skipCloud: true });
      toast("账号已永久注销");
    } catch (error) {
      submit.disabled = false;
      submit.textContent = "确认永久注销";
      toast(error.message || "注销失败，请稍后重试");
    }
  });
  overlay.querySelector("input[name='password']")?.focus();
}

function normalizeCommunityPosts(posts = []) {
  return posts.map(item => {
    const rawMediaItems = Array.isArray(item.mediaItems) && item.mediaItems.length
      ? item.mediaItems
      : (item.mediaUrl ? [{ url: item.mediaUrl, posterUrl: item.posterUrl || "", type: item.mediaType }] : []);
    const mediaItems = rawMediaItems
      .map(media => ({
        url: media?.url ? apiAssetUrl(media.url) : "",
        posterUrl: media?.posterUrl || media?.poster ? apiAssetUrl(media.posterUrl || media.poster) : "",
        type: media?.type === "video" ? "video" : "image"
      }))
      .filter(media => media.url)
      .slice(0, 9);
    const primaryMedia = mediaItems[0] || null;
    return {
      ...item,
      authorName: item.authorName || "壳友",
      // Built-in avatars live inside the iOS app bundle.  Do not turn their
      // relative asset path into an API URL, otherwise every tiny avatar waits
      // for the public server and makes the feed appear to load slowly.
      authorAvatar: item.authorAvatar ? accountAvatarSource(item.authorAvatar) : "",
      mediaUrl: primaryMedia?.url || "",
      posterUrl: primaryMedia?.posterUrl || "",
      mediaType: primaryMedia?.type || "",
      mediaItems,
      comments: Array.isArray(item.comments) ? item.comments.map(comment => ({
        ...comment,
        authorAvatar: comment.authorAvatar ? accountAvatarSource(comment.authorAvatar) : ""
      })) : []
    };
  });
}

async function refreshCommunity(force = false) {
  if (!hasCloudSession() || communityLoading) return;
  if (!force && Date.now() - communityLastLoadedAt < 10000) return;
  communityLoading = true;
  try {
    const result = await apiPost("/api/community/list", communityAuthPayload({ offset: 0, limit: 10 }));
    communityLastLoadedAt = Date.now();
    const friends = mergeCommunityFriends(Array.isArray(result.friends) ? result.friends : []);
    const messageUnreadCount = friends.reduce((sum, friend) => sum + Math.max(0, Number(friend.unreadCount || 0)), 0);
    const profileStats = result.profileStats && typeof result.profileStats === "object"
      ? {
        receivedLikes: Math.max(0, Number(result.profileStats.receivedLikes || 0)),
        followerCount: Math.max(0, Number(result.profileStats.followerCount || 0))
      }
      : state.communityProfileStats;
    if (deferMessageListRefreshWhileDragging()) return;
    const communityPosts = normalizeCommunityPosts(result.posts || []);
    const nextCommunityState = {
      communityPosts,
      communityFeedInitialized: true,
      communityFeedNextOffset: Math.max(0, Number(result.nextOffset ?? communityPosts.length)),
      communityFeedHasMore: Boolean(result.hasMore),
      communityFeedLoadingMore: false,
      communityProfileStats: profileStats,
      isCommunityAdmin: Boolean(result.isAdmin),
      communityFriends: friends,
      messageUnreadCount
    };
    if (state.page === "community") {
      const previousPosts = state.communityPosts || [];
      const feedChanged = communityFeedSignature(communityPosts) !== communityFeedSignature(previousPosts);
      // A community refresh arrives after the route has already opened. Keep
      // that page mounted and update only its feed; setState would reconstruct
      // the entire page and produced the visible render/flicker the user saw.
      state = { ...state, ...nextCommunityState };
      saveState({ skipCloud: true });
      if (feedChanged) patchVisibleCommunityFeed(communityPosts, previousPosts);
      syncPersistentBottomNav($app.querySelector(":scope > .bottom-nav"));
    } else {
      setState(nextCommunityState, { skipCloud: true });
    }
  } catch (error) {
    console.warn(error.message || "壳友圈读取失败");
  } finally {
    communityLoading = false;
  }
}

async function loadMoreCommunityPosts() {
  if (!hasCloudSession() || state.page !== "community" || communityLoading || state.communityFeedLoadingMore || !state.communityFeedHasMore) return;
  communityLoading = true;
  state = { ...state, communityFeedLoadingMore: true };
  saveState({ skipCloud: true });
  const status = $app.querySelector("[data-community-load-sentinel]");
  if (status) status.textContent = "正在加载更多动态…";
  try {
    const result = await apiPost("/api/community/list", communityAuthPayload({
      offset: Math.max(0, Number(state.communityFeedNextOffset || 0)),
      limit: 10
    }));
    const incoming = normalizeCommunityPosts(result.posts || []);
    const existingPosts = state.communityPosts || [];
    const existingIds = new Set(existingPosts.map(post => String(post.id)));
    const appended = incoming.filter(post => !existingIds.has(String(post.id)));
    const communityPosts = [...existingPosts, ...appended];
    state = {
      ...state,
      communityPosts,
      communityFeedInitialized: true,
      communityFeedNextOffset: Math.max(0, Number(result.nextOffset ?? (Number(state.communityFeedNextOffset || 0) + incoming.length))),
      communityFeedHasMore: Boolean(result.hasMore),
      communityFeedLoadingMore: false
    };
    saveState({ skipCloud: true });
    patchVisibleCommunityFeed(communityPosts, existingPosts);
  } catch (error) {
    state = { ...state, communityFeedLoadingMore: false };
    saveState({ skipCloud: true });
    console.warn(error.message || "加载更多壳友圈动态失败");
  } finally {
    communityLoading = false;
    const nextStatus = $app.querySelector("[data-community-load-sentinel]");
    if (nextStatus) nextStatus.textContent = state.communityFeedHasMore ? "继续上滑，加载更多" : "已经到底了";
    setupCommunityInfiniteScroll();
  }
}

function announcementDismissalKey() {
  return `turtlekeeper-announcements-dismissed-v1:${state.loggedInPhone || "guest"}`;
}

function dismissedAnnouncementIds() {
  try {
    const saved = JSON.parse(localStorage.getItem(announcementDismissalKey()));
    return new Set(Array.isArray(saved) ? saved.map(String) : []);
  } catch {
    return new Set();
  }
}

function systemAnnouncementOverlay() {
  if (state.policyConsentRequired && state.loggedInPhone) return "";
  const dismissed = dismissedAnnouncementIds();
  const item = (state.systemAnnouncements || []).find(announcement => announcement.status === "active" && !dismissed.has(String(announcement.id)));
  if (!item) return "";
  return `
    <div class="system-announcement-overlay" role="dialog" aria-modal="true" aria-labelledby="systemAnnouncementTitle">
      <section class="system-announcement-dialog">
        <p>壳友手账 · 系统公告</p>
        <h1 id="systemAnnouncementTitle">${escapeHtml(item.title || "系统公告")}</h1>
        <div>${escapeHtml(item.content || "").replace(/\n/g, "<br>")}</div>
        <small>${item.createdAt ? formatTime(item.createdAt) : ""}</small>
        <button class="primary" type="button" data-dismiss-system-announcement="${item.id}">我知道了</button>
      </section>
    </div>
  `;
}

function dismissSystemAnnouncement(id) {
  const ids = dismissedAnnouncementIds();
  ids.add(String(id));
  try { localStorage.setItem(announcementDismissalKey(), JSON.stringify([...ids].slice(-100))); } catch {}
  render();
}

function setupCommunityInfiniteScroll() {
  communityLoadObserver?.disconnect();
  communityLoadObserver = null;
  if (state.page !== "community" || !state.communityFeedHasMore || state.communityFeedLoadingMore) return;
  const sentinel = document.querySelector("[data-community-load-sentinel]");
  if (!sentinel || typeof IntersectionObserver === "undefined") return;
  communityLoadObserver = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) void loadMoreCommunityPosts();
  }, { root: null, rootMargin: "0px 0px 260px", threshold: 0.01 });
  communityLoadObserver.observe(sentinel);
}

async function refreshContentReports(force = false) {
  if (!CONFIGURED_SMS_BACKEND || contentReportsLoading || !state.isCommunityAdmin || !state.loggedInPhone || !currentCloudToken()) return;
  if (!force && Date.now() - contentReportsLastLoadedAt < 10000) return;
  contentReportsLoading = true;
  try {
    const result = await apiPost("/api/content-reports/list", communityAuthPayload({ force: Boolean(force) }));
    contentReportsLastLoadedAt = Date.now();
    setState({ contentReports: Array.isArray(result.reports) ? result.reports : [] }, { skipCloud: true });
  } catch (error) {
    if (error.status !== 403) console.warn(error.message || "举报列表读取失败");
  } finally {
    contentReportsLoading = false;
  }
}

async function refreshSystemAnnouncements(force = false) {
  if (!CONFIGURED_SMS_BACKEND || systemAnnouncementsLoading) return;
  if (!force && Date.now() - systemAnnouncementsLastLoadedAt < 30000) return;
  systemAnnouncementsLoading = true;
  try {
    const result = await apiPost("/api/announcements/list", hasCloudSession() ? communityAuthPayload() : {});
    systemAnnouncementsLastLoadedAt = Date.now();
    const patch = {
      systemAnnouncements: Array.isArray(result.announcements) ? result.announcements : []
    };
    if (state.isCommunityAdmin && Array.isArray(result.adminAnnouncements)) patch.adminSystemAnnouncements = result.adminAnnouncements;
    setState(patch, { skipCloud: true, pageScroll: "preserve" });
  } catch (error) {
    if (error.status !== 401) console.warn(error.message || "系统公告读取失败");
  } finally {
    systemAnnouncementsLoading = false;
  }
}

async function submitSystemAnnouncement(event) {
  event.preventDefault();
  if (!state.isCommunityAdmin || !requireLogin()) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const title = String(data.get("title") || "").trim();
  const content = String(data.get("content") || "").trim();
  if (!title || !content) return toast("请填写公告标题和内容");
  const button = form.querySelector("button[type='submit']");
  if (button) { button.disabled = true; button.textContent = "正在发布…"; }
  try {
    const result = await apiPost("/api/announcements/create", communityAuthPayload({
      title, content, pinned: data.get("pinned") === "on", expiresAt: String(data.get("expiresAt") || "")
    }));
    systemAnnouncementsLastLoadedAt = Date.now();
    setState({ adminSystemAnnouncements: Array.isArray(result.announcements) ? result.announcements : state.adminSystemAnnouncements }, { skipCloud: true });
    toast(result.message || "公告已发布");
  } catch (error) {
    toast(error.message || "公告发布失败");
    if (button?.isConnected) { button.disabled = false; button.textContent = "发布公告"; }
  }
}

async function manageSystemAnnouncement(announcementId, action) {
  if (!state.isCommunityAdmin || !announcementId) return;
  const verb = action === "delete" ? "删除" : "结束展示";
  if (!confirm(`确定${verb}这条公告吗？`)) return;
  try {
    const result = await apiPost("/api/announcements/action", communityAuthPayload({ announcementId, action }));
    systemAnnouncementsLastLoadedAt = Date.now();
    setState({ adminSystemAnnouncements: Array.isArray(result.announcements) ? result.announcements : state.adminSystemAnnouncements }, { skipCloud: true });
    toast(result.message || `公告已${verb}`);
  } catch (error) {
    toast(error.message || "公告操作失败");
  }
}

async function processContentReport(reportId, action) {
  if (!state.isCommunityAdmin) return toast("仅平台管理员可处理举报");
  const verb = action === "remove" ? "处置该内容" : "标记为已处理";
  if (!confirm(`确定${verb}吗？`)) return;
  try {
    const result = await apiPost("/api/content-reports/action", communityAuthPayload({ reportId, action }));
    setState({
      contentReports: Array.isArray(result.reports) ? result.reports : state.contentReports,
      communityPosts: Array.isArray(result.posts) ? normalizeCommunityPosts(result.posts) : state.communityPosts,
      marketListings: Array.isArray(result.listings) ? normalizeMarketListings(result.listings) : state.marketListings
    }, { skipCloud: true });
    contentReportsLastLoadedAt = Date.now();
    toast(action === "remove" ? "内容已处置" : "已标记处理");
  } catch (error) {
    toast(error.message || "处理举报失败");
  }
}

async function refreshFollowing(force = false) {
  if (!CONFIGURED_SMS_BACKEND || followingLoading || !state.loggedInPhone || !currentCloudToken()) return;
  if (!force && Date.now() - followingLastLoadedAt < 10000) return;
  followingLoading = true;
  try {
    const result = await apiPost("/api/community/following/list", communityAuthPayload());
    followingLastLoadedAt = Date.now();
    setState({
      communityFollowingUsers: Array.isArray(result.following) ? result.following : [],
      communityFollowingPosts: normalizeCommunityPosts(result.posts || []),
      communityFollowingListings: normalizeMarketListings(result.listings || [])
    }, { skipCloud: true });
  } catch (error) {
    if (error.status !== 405 && error.message !== "方法不支持") console.warn(error.message || "关注列表读取失败");
  } finally {
    followingLoading = false;
  }
}

function communityUserSnapshot(userId) {
  const id = String(userId || "");
  if (!id) return null;
  const post = (state.communityPosts || []).find(item => String(item.authorId || "") === id)
    || (state.communityFollowingPosts || []).find(item => String(item.authorId || "") === id);
  const friend = (state.communityFriends || []).find(item => String(item.id || "") === id);
  const listing = (state.marketListings || []).find(item => String(item.sellerId || "") === id)
    || (state.myMarketListings || []).find(item => String(item.sellerId || "") === id);
  const user = state.selectedCommunityUser && String(state.selectedCommunityUser.id || "") === id
    ? state.selectedCommunityUser
    : null;
  if (user) return user;
  if (!post && !friend && !listing) return { id, name: "壳友", avatar: "" };
  return {
    id,
    name: post?.authorName || friend?.name || listing?.sellerName || "壳友",
    avatar: post?.authorAvatar || friend?.avatar || listing?.sellerAvatar || "",
    isAdmin: Boolean(post?.authorIsAdmin || friend?.isAdmin || listing?.sellerIsAdmin),
    followed: Boolean(post?.followed || listing?.sellerFollowed),
    isOwn: Boolean(post?.isOwn || listing?.isOwn)
  };
}

function openCommunityUserProfile(userId) {
  const id = String(userId || "");
  if (!id) return;
  const user = communityUserSnapshot(id);
  const posts = (state.communityPosts || []).filter(item => String(item.authorId || "") === id);
  const listings = (state.marketListings || []).filter(item => String(item.sellerId || "") === id && item.status === "active");
  setState({
    page: "communityProfile",
    selectedCommunityUserId: id,
    selectedCommunityUser: user,
    communityUserPosts: posts,
    communityUserListings: listings,
    profileContentTab: "posts"
  }, { skipCloud: true });
}

async function refreshCommunityUserProfile(force = false) {
  const userId = String(state.selectedCommunityUserId || "");
  if (!userId || !hasCloudSession() || communityUserProfileLoading) return;
  const loadedKey = `${userId}:${Math.floor(Date.now() / 10000)}`;
  if (!force && communityUserProfileLoadedKey === loadedKey) return;
  communityUserProfileLoading = true;
  try {
    const result = await apiPost("/api/community/user/profile", communityAuthPayload({ userId }));
    communityUserProfileLoadedKey = loadedKey;
    setState({
      selectedCommunityUser: result.user || communityUserSnapshot(userId),
      communityUserPosts: normalizeCommunityPosts(result.posts || []),
      communityUserListings: normalizeMarketListings(result.listings || [])
    }, { skipCloud: true });
  } catch (error) {
    if (error.status !== 404) console.warn(error.message || "壳友主页读取失败");
  } finally {
    communityUserProfileLoading = false;
  }
}

async function toggleCommunityFollow(userId) {
  if (!canUseCommunity()) return;
  try {
    const result = await apiPost("/api/community/follow/toggle", communityAuthPayload({ userId }));
    followingLastLoadedAt = Date.now();
    const following = Array.isArray(result.following) ? result.following : [];
    const stillFollowing = following.some(item => item.id === userId);
    setState({
      communityPosts: normalizeCommunityPosts(result.posts || []),
      marketListings: normalizeMarketListings(result.listings || []),
      communityFollowingUsers: following,
      selectedCommunityUser: String(state.selectedCommunityUser?.id || "") === String(userId)
        ? { ...state.selectedCommunityUser, followed: Boolean(result.followed) }
        : state.selectedCommunityUser,
      page: state.page === "followingProfile" && !stillFollowing ? "following" : state.page
    }, { skipCloud: true, pageMotion: "none" });
    refreshFollowing(true);
    toast(result.followed ? "已关注" : "已取消关注");
  } catch (error) {
    toast(error.message || "关注操作失败");
  }
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function readVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
    };
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = Number(video.duration || 0);
      cleanup();
      if (!Number.isFinite(duration) || duration <= 0) reject(new Error("无法读取视频时长"));
      else resolve(duration);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("无法读取视频，请重新选择"));
    };
    video.src = objectUrl;
  });
}

function createVideoPoster(file) {
  return new Promise(resolve => {
    if (!file || localMediaFileKind(file) !== "video") return resolve(null);
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    let settled = false;
    let timer = 0;
    const finish = value => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
      resolve(value);
    };
    const capture = () => {
      const sourceWidth = Number(video.videoWidth || 0);
      const sourceHeight = Number(video.videoHeight || 0);
      if (!sourceWidth || !sourceHeight) return finish(null);
      try {
        const limit = 1280;
        const scale = Math.min(1, limit / Math.max(sourceWidth, sourceHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(sourceWidth * scale));
        canvas.height = Math.max(1, Math.round(sourceHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) return finish(null);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          if (!blob) return finish(null);
          const posterFile = new File([blob], `video-poster-${Date.now()}.jpg`, { type: "image/jpeg" });
          finish({ file: posterFile, previewUrl: URL.createObjectURL(posterFile) });
        }, "image/jpeg", 0.86);
      } catch {
        finish(null);
      }
    };
    const seekAndCapture = () => {
      const duration = Number(video.duration || 0);
      const target = Number.isFinite(duration) && duration > 0.2 ? Math.min(0.16, Math.max(0.04, duration - 0.04)) : 0;
      if (target > 0 && Math.abs(video.currentTime - target) > 0.01) {
        video.addEventListener("seeked", capture, { once: true });
        try {
          video.currentTime = target;
        } catch {
          capture();
        }
      } else {
        capture();
      }
    };
    timer = window.setTimeout(() => finish(null), 10000);
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.addEventListener("loadeddata", seekAndCapture, { once: true });
    video.addEventListener("error", () => finish(null), { once: true });
    video.src = objectUrl;
    video.load();
  });
}

function hydrateVideoFirstFrames() {
  document.querySelectorAll("video[data-video-first-frame]").forEach(video => {
    if (video.dataset.firstFrameReady === "true" || video.getAttribute("poster")) return;
    const capture = () => {
      if (video.dataset.firstFrameReady === "true" || video.getAttribute("poster") || !video.videoWidth || !video.videoHeight) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        video.poster = canvas.toDataURL("image/jpeg", 0.84);
        video.dataset.firstFrameReady = "true";
      } catch {
        // A remote video without CORS support can still play; it just cannot be drawn to a canvas.
      }
    };
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) capture();
    else {
      video.addEventListener("loadeddata", capture, { once: true });
      video.addEventListener("canplay", capture, { once: true });
    }
  });
}

function hydrateCommunityPostVideos() {
  communityVideoLoadObserver?.disconnect();
  communityVideoLoadObserver = null;
  const videos = [...document.querySelectorAll("video[data-community-video-autoload]")];
  if (!videos.length) return;

  const loadVideo = video => {
    if (!video || video.dataset.communityVideoLoaded === "true") return;
    video.dataset.communityVideoLoaded = "true";
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("autoplay", "");
    video.setAttribute("webkit-playsinline", "");
    video.autoplay = true;
    video.loop = true;
    // Prepare only the selected card.  The other videos stay at `none`, which
    // is how Moments avoids making several videos compete for the connection.
    video.preload = "metadata";
    if (video.readyState < HTMLMediaElement.HAVE_METADATA) video.load();
  };

  const shell = video => video.closest(".community-feed-media-button");
  const stopVideo = video => {
    video.pause();
    shell(video)?.classList.remove("is-playing");
  };
  const startVideo = video => {
    if (!video || video.dataset.communityVideoAutoplay !== "true") return;
    loadVideo(video);
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("autoplay", "");
    video.setAttribute("webkit-playsinline", "");
    video.autoplay = true;
    video.loop = true;
    const play = () => {
      const playback = video.play();
      if (playback?.then) {
        playback.then(() => shell(video)?.classList.add("is-playing"))
          .catch(() => shell(video)?.classList.remove("is-playing"));
      }
    };
    // For older posts without a stored poster, let the first-frame helper
    // capture the decoded frame before playback begins.  The user sees that
    // frame as the cover instead of a black native-player loading surface.
    if (!video.getAttribute("poster") && video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      video.addEventListener("loadeddata", play, { once: true });
      return;
    }
    play();
  };

  const selectCenteredVideo = () => {
    const visible = videos.filter(video => video.dataset.communityVideoVisible === "true");
    if (!visible.length) {
      videos.forEach(stopVideo);
      return;
    }
    const viewportCenter = window.innerHeight / 2;
    const selected = visible.reduce((best, video) => {
      const rect = video.getBoundingClientRect();
      const distance = Math.abs((rect.top + rect.height / 2) - viewportCenter);
      if (!best || distance < best.distance) return { video, distance };
      return best;
    }, null)?.video;
    videos.forEach(video => {
      if (video === selected) startVideo(video);
      else stopVideo(video);
    });
  };

  videos.forEach(video => {
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.addEventListener("playing", () => shell(video)?.classList.add("is-playing"));
    video.addEventListener("pause", () => shell(video)?.classList.remove("is-playing"));
    // A tap mirrors Moments: pause the currently playing card, or resume the
    // touched one while immediately pausing every other feed video.
    video.addEventListener("click", () => {
      if (video.paused) {
        videos.forEach(other => { if (other !== video) stopVideo(other); });
        startVideo(video);
      } else {
        stopVideo(video);
      }
    });
  });

  if (!("IntersectionObserver" in window)) {
    return;
  }

  communityVideoLoadObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      entry.target.dataset.communityVideoVisible = entry.isIntersecting ? "true" : "false";
    });
    selectCenteredVideo();
  }, { rootMargin: "-18% 0px -18%", threshold: [0, 0.25, 0.5, 0.75, 1] });
  videos.forEach(video => communityVideoLoadObserver.observe(video));
}

function hydrateMarketDetailVideos() {
  document.querySelectorAll("video[data-market-detail-video]").forEach(video => {
    const shell = video.closest(".market-detail-video-shell");
    if (!shell || video.dataset.detailVideoHydrated === "true") return;
    video.dataset.detailVideoHydrated = "true";
    const ready = () => {
      shell.classList.remove("is-loading");
      shell.classList.add("is-ready");
      if (!video.hasAttribute("data-market-detail-autoplay")) return;
      // iOS only permits automatic media playback when it is muted and inline.
      // Set both properties as well as attributes before explicitly starting it.
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.autoplay = true;
      const playback = video.play();
      if (playback?.catch) playback.catch(() => shell.classList.add("autoplay-blocked"));
    };
    const failed = () => shell.classList.add("has-error");
    video.addEventListener("loadeddata", ready, { once: true });
    video.addEventListener("canplay", ready, { once: true });
    video.addEventListener("error", failed, { once: true });
    // Keep secondary videos lightweight until the user plays them. Only the
    // first visible detail video may preload enough data to autoplay.
    const shouldAutoplay = video.hasAttribute("data-market-detail-autoplay");
    video.preload = shouldAutoplay ? "auto" : "metadata";
    const requiredState = shouldAutoplay ? HTMLMediaElement.HAVE_CURRENT_DATA : HTMLMediaElement.HAVE_METADATA;
    if (video.readyState < requiredState) video.load();
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) ready();
  });
}

function syncCommunityPublishButton() {
  const submit = document.querySelector(".community-compose-submit");
  if (!submit) return;
  const text = document.querySelector("#communityPostForm textarea")?.value.trim() || "";
  const hasMedia = communityDraftMediaItems.length > 0;
  const ready = Boolean(text || hasMedia);
  submit.classList.toggle("is-ready", ready);
  submit.dataset.ready = ready ? "true" : "false";
  if (ready) submit.removeAttribute("disabled");
  else submit.setAttribute("disabled", "");
  submit.setAttribute("aria-disabled", ready ? "false" : "true");
}

function syncCommunityDraftMediaLegacyState() {
  const first = communityDraftMediaItems[0] || null;
  communityDraftMedia = first?.previewUrl || "";
  communityDraftMediaType = first?.type || "";
  communityDraftMediaFile = first?.file || null;
  communityDraftMediaDuration = Number(first?.duration || 0);
}

function clearCommunityDraftMedia({ revoke = true } = {}) {
  if (revoke) {
    communityDraftMediaItems.forEach(media => {
      if (String(media?.previewUrl || "").startsWith("blob:")) URL.revokeObjectURL(media.previewUrl);
    });
  }
  communityDraftMediaItems = [];
  syncCommunityDraftMediaLegacyState();
}

function removeCommunityDraftMedia(index) {
  if (!Number.isInteger(index) || index < 0 || index >= communityDraftMediaItems.length) return;
  const [removed] = communityDraftMediaItems.splice(index, 1);
  if (String(removed?.previewUrl || "").startsWith("blob:")) URL.revokeObjectURL(removed.previewUrl);
  syncCommunityDraftMediaLegacyState();
  render();
}

async function readCommunityMedia(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  const openComposerAfterRead = event.currentTarget.hasAttribute("data-community-quick-media");
  communityDraftText = document.querySelector("#communityPostForm textarea")?.value || communityDraftText;
  event.target.value = "";
  const kinds = files.map(localMediaFileKind);
  if (kinds.some(kind => !kind)) {
    return toast("请选择 JPG、PNG、WebP、MP4、WebM 或 MOV");
  }
  const mediaType = kinds[0];
  if (kinds.some(kind => kind !== mediaType)) return toast("图片和视频不能混合发布，请重新选择");
  if (mediaType === "video" && files.length !== 1) return toast("壳友圈每条动态只能发布 1 个视频");
  if (communityDraftMediaItems.length && communityDraftMediaItems[0].type !== mediaType) {
    return toast("图片和视频不能混合发布，请先移除已选媒体");
  }
  if (mediaType === "video" && communityDraftMediaItems.length) return toast("壳友圈每条动态只能发布 1 个视频");
  const remaining = mediaType === "image" ? Math.max(0, 9 - communityDraftMediaItems.length) : 1;
  if (!remaining) return toast("图片最多可发布 9 张");
  const selectedFiles = files.slice(0, remaining);
  if (files.length > selectedFiles.length) toast("图片最多可发布 9 张，已保留前 9 张");
  if (selectedFiles.some(file => mediaType === "image" && file.size > 10 * 1024 * 1024)) return toast("每张图片不能超过 10MB");
  try {
    const addedMedia = [];
    for (const file of selectedFiles) {
      let duration = 0;
      if (mediaType === "video") {
        duration = await readVideoDuration(file);
        if (duration > 30) return toast("视频时长不能超过 30 秒");
      }
      addedMedia.push({
        file,
        type: mediaType,
        duration,
        previewUrl: URL.createObjectURL(file)
      });
    }
    communityDraftMediaItems = [...communityDraftMediaItems, ...addedMedia];
    syncCommunityDraftMediaLegacyState();
    if (openComposerAfterRead) setState({ page: "communityAdd" }, { skipCloud: true });
    else render();
  } catch (error) {
    toast(error.message || "文件读取失败");
  }
}

async function submitCommunityPost(event) {
  event.preventDefault();
  if (!canUseCommunity()) return;
  const form = new FormData(event.currentTarget);
  const content = String(form.get("content") || "").trim();
  const visibility = "public";
  const draftMedia = [...communityDraftMediaItems];
  if (!content && !draftMedia.length) return toast("写点内容，或添加图片、视频");
  try {
    const mediaItems = [];
    for (let index = 0; index < draftMedia.length; index += 1) {
      const media = draftMedia[index];
      const uploaded = await apiUploadMediaFile(media.file, media.duration || 0);
      if (!uploaded?.url) throw new Error("媒体上传失败，请稍后重试");
      let posterUrl = String(uploaded.posterUrl || "");
      if (media.type === "video" && !posterUrl) {
        const poster = await createVideoPoster(media.file);
        try {
          if (poster?.file) {
            const uploadedPoster = await apiUploadMediaFile(poster.file);
            posterUrl = String(uploadedPoster?.url || "");
          }
        } finally {
          if (String(poster?.previewUrl || "").startsWith("blob:")) URL.revokeObjectURL(poster.previewUrl);
        }
      }
      mediaItems.push({
        url: uploaded.url,
        posterUrl,
        type: uploaded.mediaType === "video" ? "video" : media.type
      });
    }
    const primaryMedia = mediaItems[0] || null;
    const result = await apiPost("/api/community/create", communityAuthPayload({
      content,
      mediaUrl: primaryMedia?.url || "",
      posterUrl: primaryMedia?.posterUrl || "",
      mediaType: primaryMedia?.type || "",
      mediaItems,
      visibility
    }));
    clearCommunityDraftMedia();
    communityDraftText = "";
    communityLastLoadedAt = Date.now();
    setState({ page: "community", communityPosts: normalizeCommunityPosts(result.posts || []), communityFriends: result.friends || state.communityFriends }, { skipCloud: true });
    toast("动态已发布");
  } catch (error) {
    if (error.status === 405 || error.message === "方法不支持") {
      const localMediaItems = draftMedia.map(media => ({
        url: media.previewUrl,
        posterUrl: "",
        type: media.type
      }));
      const primaryMedia = localMediaItems[0] || null;
      const localPost = {
        id: `local-${Date.now()}`,
        content,
        mediaUrl: primaryMedia?.url || "",
        mediaType: primaryMedia?.type || "",
        mediaItems: localMediaItems,
        visibility,
        authorId: state.loggedInPhone,
        authorName: state.accountName || "壳友",
        authorAvatar: state.accountAvatar || "",
        createdAt: new Date().toISOString(),
        likeCount: 0,
        liked: false,
        isOwn: true,
        isFriend: false,
        comments: [],
        pendingLocal: true
      };
      clearCommunityDraftMedia({ revoke: false });
      communityDraftText = "";
      setState({ page: "community", communityPosts: [localPost, ...(state.communityPosts || [])] }, { skipCloud: true });
      toast("动态已发布");
      return;
    }
    toast(error.message || "发布失败");
  }
}

async function toggleCommunityLike(postId) {
  if (!canUseCommunity()) return;
  try {
    const result = await apiPost("/api/community/like", communityAuthPayload({ postId }));
    setState({ communityPosts: normalizeCommunityPosts(result.posts || []), openCommunityActionId: "" }, { skipCloud: true });
  } catch (error) {
    if (error.status === 405 || error.message === "方法不支持") {
      const posts = (state.communityPosts || []).map(item => item.id === postId ? {
        ...item,
        liked: !item.liked,
        likeCount: Math.max(0, Number(item.likeCount || 0) + (item.liked ? -1 : 1))
      } : item);
      setState({ communityPosts: posts, openCommunityActionId: "" }, { skipCloud: true });
      return;
    }
    toast(error.message || "操作失败");
  }
}

async function submitCommunityComment(event) {
  event.preventDefault();
  if (!canUseCommunity()) return;
  const content = String(new FormData(event.currentTarget).get("content") || "").trim();
  if (!content) return;
  try {
    const result = await apiPost("/api/community/comment", communityAuthPayload({ postId: event.currentTarget.dataset.communityCommentForm, content }));
    setState({ communityPosts: normalizeCommunityPosts(result.posts || []), communityCommentPostId: "" }, { skipCloud: true });
  } catch (error) {
    if (error.status === 405 || error.message === "方法不支持") {
      const postId = event.currentTarget.dataset.communityCommentForm;
      const comment = {
        id: `local-comment-${Date.now()}`,
        content,
        authorName: state.accountName || "壳友",
        authorAvatar: state.accountAvatar || "",
        createdAt: new Date().toISOString()
      };
      const posts = (state.communityPosts || []).map(item => item.id === postId
        ? { ...item, comments: [...(item.comments || []), comment] }
        : item);
      setState({ communityPosts: posts, communityCommentPostId: "" }, { skipCloud: true });
      return;
    }
    toast(error.message || "评论失败");
  }
}

function latestCommunityMessagePreview(messages = []) {
  const validMessages = (Array.isArray(messages) ? messages : [])
    .filter(item => item && (item.content || item.createdAt))
    .slice()
    .sort((left, right) => new Date(left.createdAt || 0) - new Date(right.createdAt || 0));
  const last = validMessages[validMessages.length - 1];
  if (!last) return null;
  return {
    lastMessage: String(last.content || "").trim(),
    lastMessageAt: last.createdAt || ""
  };
}

function communityChatMessageKey(message) {
  if (!message || typeof message !== "object") return "";
  // Server-side messages always have an id. The fallback keeps older local
  // data comparable too, without treating an identical poll response as new.
  return String(message.id || [
    message.createdAt || "",
    message.senderId || message.fromPhone || "",
    message.content || "",
    message.mediaUrl || "",
    message.mediaType || ""
  ].join("\u0001"));
}

function communityChatMessageSignature(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .map(communityChatMessageKey)
    .join("\u0002");
}

function mergeCommunityChatMessages(existingMessages = [], incomingMessages = []) {
  const existing = Array.isArray(existingMessages) ? existingMessages : [];
  const incoming = Array.isArray(incomingMessages) ? incomingMessages : [];
  const incomingKeys = new Set(incoming.map(communityChatMessageKey));
  const newestIncomingAt = incoming.reduce((latest, item) => {
    const value = new Date(item?.createdAt || 0).getTime();
    return Number.isFinite(value) ? Math.max(latest, value) : latest;
  }, 0);
  // Requests are allowed to overlap the moment a push arrives. Retain only
  // messages newer than a delayed response, so a stale response cannot make
  // a just-received bubble disappear from the currently open chat.
  const missingNewerLocalMessages = existing.filter(item => {
    const key = communityChatMessageKey(item);
    if (!key || incomingKeys.has(key)) return false;
    const createdAt = new Date(item?.createdAt || 0).getTime();
    return Number.isFinite(createdAt) && createdAt > newestIncomingAt;
  });
  return incoming.concat(missingNewerLocalMessages).sort((left, right) => {
    const timeDiff = new Date(left?.createdAt || 0) - new Date(right?.createdAt || 0);
    return timeDiff || communityChatMessageKey(left).localeCompare(communityChatMessageKey(right));
  });
}

function communityPreviewTimestamp(item) {
  const timestamp = new Date(item?.lastMessageAt || item?.createdAt || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isCommunityPreviewAtLeastAsNew(candidate, current) {
  if (!candidate?.lastMessage) return false;
  const candidateAt = communityPreviewTimestamp(candidate);
  const currentAt = communityPreviewTimestamp(current);
  // If legacy data has no timestamp, a non-empty fresh preview is still more
  // useful than retaining the stale placeholder from the old list.
  return Boolean(candidateAt && (!currentAt || candidateAt >= currentAt)) || !current?.lastMessage;
}

function communityFriendsWithPreview(userId, friend, messages = [], options = {}) {
  const preview = latestCommunityMessagePreview(messages);
  const current = (state.communityFriends || []).find(item => item.id === userId);
  const useChatPreview = isCommunityPreviewAtLeastAsNew(preview, current);
  const mergedFriend = {
    ...(current || {}),
    ...(friend || {}),
    id: userId,
    unreadCount: Number(options.unreadCount ?? current?.unreadCount ?? friend?.unreadCount ?? 0),
    lastMessage: useChatPreview ? preview.lastMessage : (current?.lastMessage || friend?.lastMessage || ""),
    lastMessageAt: useChatPreview ? preview.lastMessageAt : (current?.lastMessageAt || friend?.lastMessageAt || "")
  };
  const nextFriends = (state.communityFriends || [])
    .filter(item => item.id !== userId)
    .concat(mergedFriend)
    .sort((left, right) => Number(right.pinned) - Number(left.pinned) || new Date(right.lastMessageAt || right.createdAt || 0) - new Date(left.lastMessageAt || left.createdAt || 0));
  return nextFriends;
}

function mergeCommunityFriends(incomingFriends = []) {
  const previous = state.communityFriends || [];
  const previousMap = new Map(previous.map(item => [item.id, item]));
  const incomingIds = new Set();
  const merged = (Array.isArray(incomingFriends) ? incomingFriends : []).map(friend => {
    incomingIds.add(friend.id);
    const old = previousMap.get(friend.id) || {};
    // A slower response from /community/list or /community/unread must never
    // overwrite the last message just obtained from /community/chat/list.
    const keepLocalPreview = isCommunityPreviewAtLeastAsNew(old, friend)
      && communityPreviewTimestamp(old) > communityPreviewTimestamp(friend);
    return {
      ...old,
      ...friend,
      lastMessage: keepLocalPreview ? old.lastMessage : (friend.lastMessage || old.lastMessage || ""),
      lastMessageAt: keepLocalPreview ? old.lastMessageAt : (friend.lastMessageAt || old.lastMessageAt || "")
    };
  });
  previous.forEach(friend => {
    if (!incomingIds.has(friend.id) && (friend.lastMessage || friend.lastMessageAt)) merged.push(friend);
  });
  return merged.sort((left, right) => Number(right.pinned) - Number(left.pinned) || new Date(right.lastMessageAt || right.createdAt || 0) - new Date(left.lastMessageAt || left.createdAt || 0));
}

async function openCommunityChat(userId) {
  if (!canUseCommunity()) return;
  marketChatDraft = "";
  communityChatLoadedKey = "";
  const previousFriend = (state.communityFriends || []).find(item => item.id === userId) || communityUserSnapshot(userId);
  // Do not leave a red unread badge visible while the network request is in
  // flight. The server remains the source of truth and will restore it on a
  // later refresh if the request cannot be completed.
  const locallyReadFriends = markCommunityConversationReadLocally(userId);
  const locallyReadUnreadCount = locallyReadFriends.reduce((total, friend) => total + Math.max(0, Number(friend.unreadCount || 0)), 0);
  if (!CONFIGURED_SMS_BACKEND) {
    communityChatOpening = false;
    pendingCommunityChatLatestScroll = true;
    setState({ page: "communityChat", selectedCommunityFriendId: userId, selectedCommunityFriend: previousFriend, communityChatMessages: [], communityChatListing: null, communityChatToolsOpen: false, communityFriends: locallyReadFriends, messageUnreadCount: locallyReadUnreadCount }, { skipCloud: true, pageMotion: "chat" });
    patchStoredMessageLists(locallyReadFriends);
    return;
  }
  const openingSameConversation = state.selectedCommunityFriendId === userId;
  const cachedMessages = openingSameConversation ? (state.communityChatMessages || []) : [];
  const cachedListing = openingSameConversation ? state.communityChatListing : null;
  // Enter immediately. Waiting for image/video metadata here used to add an
  // 850ms pause before the first chat frame was allowed to render.
  communityChatOpening = true;
  pendingCommunityChatLatestScroll = cachedMessages.length > 0;
  communityChatLoading = true;
  setState({
    page: "communityChat",
    selectedCommunityFriendId: userId,
    selectedCommunityFriend: previousFriend,
    communityChatMessages: cachedMessages,
    communityChatListing: cachedListing,
    communityChatToolsOpen: false,
    communityFriends: locallyReadFriends,
    messageUnreadCount: locallyReadUnreadCount
  }, { skipCloud: true, pageMotion: "chat" });
  patchStoredMessageLists(locallyReadFriends);
  try {
    const result = await apiPost("/api/community/chat/list", communityAuthPayload({ userId }));
    communityChatLoadedKey = `${userId}:${Math.floor(Date.now() / 10000)}`;
    const friend = result.friend || previousFriend;
    // Message media reserves a stable fallback aspect ratio in CSS. Do not
    // block the route on metadata probes; they were the visible one-second
    // delay before a conversation opened.
    const messages = result.messages || [];
    const chatStillVisible = state.page === "communityChat" && state.selectedCommunityFriendId === userId;
    communityChatOpening = false;
    if (chatStillVisible) $app.classList.remove("community-chat-enter-motion");
    pendingCommunityChatLatestScroll = chatStillVisible;
    const chatFriends = communityFriendsWithPreview(userId, friend, messages, { unreadCount: 0 });
    patchStoredMessageLists(chatFriends);
    const chatData = {
      selectedCommunityFriendId: userId,
      selectedCommunityFriend: friend,
      communityChatMessages: messages,
      communityChatListing: normalizeCommunityChatListing(result.marketListing),
      communityChatToolsOpen: false,
      communityFriends: chatFriends
    };
    if (chatStillVisible) {
      setState({ page: "communityChat", ...chatData }, { skipCloud: true, pageMotion: "chat" });
    } else {
      // The user has already gone back to the messages page. Keep that exact
      // page mounted; a late chat response must never reopen the conversation
      // or force the message list through a full render.
      state = { ...state, ...chatData };
      saveState({ skipCloud: true });
    }
    refreshMessageUnread(true);
    refreshCommunity(true);
  } catch (error) {
    communityChatOpening = false;
    if (state.page === "communityChat" && state.selectedCommunityFriendId === userId) {
      $app.classList.remove("community-chat-enter-motion");
      render();
    }
    toast(error.message || "聊天记录读取失败");
  } finally {
    communityChatLoading = false;
    if (communityChatRefreshPending && state.page === "communityChat" && state.selectedCommunityFriendId === userId) {
      communityChatRefreshPending = false;
      void refreshCommunityChat(true, { scrollLatest: true, silent: true });
    }
  }
}

async function toggleCommunityConversationPin(userId) {
  if (!canUseCommunity() || communityConversationActionPending.has(userId)) return;
  const previousFriends = state.communityFriends || [];
  const target = previousFriends.find(item => item.id === userId);
  if (!target) return;
  communityConversationActionPending.add(userId);
  // Reflect the action immediately. This also keeps the row stable while its
  // native horizontal scroll is settling after the user taps the action.
  const nextFriends = previousFriends
    .map(item => item.id === userId ? { ...item, pinned: !item.pinned } : item)
    .sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) ||
      new Date(right.lastMessageAt || right.createdAt || 0) - new Date(left.lastMessageAt || left.createdAt || 0));
  setState({ communityFriends: nextFriends }, { skipCloud: true });
  try {
    const result = await apiPost("/api/community/chat/pin", communityAuthPayload({ userId }));
    if (!result?.ok || !Array.isArray(result.friends)) throw new Error(result?.message || "置顶失败，请重试");
    setState({ communityFriends: result.friends }, { skipCloud: true });
    toast(target.pinned ? "已取消置顶" : "已置顶");
  } catch (error) {
    setState({ communityFriends: previousFriends }, { skipCloud: true });
    console.error("切换会话置顶失败", error);
    toast(error.message || "操作失败，请重试");
  } finally {
    communityConversationActionPending.delete(userId);
  }
}

async function deleteCommunityConversation(userId) {
  const friend = (state.communityFriends || []).find(item => item.id === userId);
  const name = String(friend?.name || "该用户").trim();
  if (!canUseCommunity() || communityConversationActionPending.has(userId)) return;
  if (!window.confirm(`确认删除与“${name}”的聊天记录吗？\n\n删除后将不再显示此会话；收到对方新消息时会再次出现。`)) return;
  const previousFriends = state.communityFriends || [];
  communityConversationActionPending.add(userId);
  // Remove it optimistically so pressing “OK” always gives immediate, visible
  // feedback instead of waiting for a network round trip.
  setState({ communityFriends: previousFriends.filter(item => item.id !== userId) }, { skipCloud: true });
  try {
    const result = await apiPost("/api/community/chat/delete", communityAuthPayload({ userId }));
    if (!result?.ok || !Array.isArray(result.friends)) throw new Error(result?.message || "删除失败，请重试");
    setState({ communityFriends: result.friends }, { skipCloud: true });
    toast("聊天记录已删除");
  } catch (error) {
    setState({ communityFriends: previousFriends }, { skipCloud: true });
    console.error("删除会话失败", error);
    toast(error.message || "删除失败，请重试");
  } finally {
    communityConversationActionPending.delete(userId);
  }
}

async function refreshMessageUnread(force = false, options = {}) {
  if (options.renderMessages) messageUnreadRenderRequested = true;
  if (!CONFIGURED_SMS_BACKEND) return;
  if (messageUnreadLoading) return;
  if (!state.loggedInPhone || !currentCloudToken()) {
    if (state.messageUnreadCount) setState({ messageUnreadCount: 0 }, { skipCloud: true });
    return;
  }
  if (!force && Date.now() - messageUnreadLastLoadedAt < 10000) return;
  messageUnreadLoading = true;
  try {
    const result = await apiPost("/api/community/unread", communityAuthPayload());
    const unreadCount = Math.max(0, Number(result.unreadCount || 0));
    messageUnreadLastLoadedAt = Date.now();
    const friends = Array.isArray(result.friends) ? mergeCommunityFriends(result.friends) : state.communityFriends;
    const friendSignature = items => JSON.stringify((items || []).map(item => [item.id, item.name, item.avatar, item.lastMessage, item.lastMessageAt, Number(item.unreadCount || 0)]));
    // Consume the current render request before comparing data. If a new push
    // lands during this request it will set the flag again and the finally
    // block will run one follow-up request instead of creating a refresh loop.
    const shouldRenderMessages = Boolean(messageUnreadRenderRequested);
    messageUnreadRenderRequested = false;
    if (unreadCount !== Number(state.messageUnreadCount || 0) || friendSignature(friends) !== friendSignature(state.communityFriends)) {
      if (deferMessageListRefreshWhileDragging()) return;
      if (state.page === "communityChat") {
        // The badge is not visible in a conversation. Keep its data current
        // without replacing the chat DOM while the user is reading it.
        state = { ...state, messageUnreadCount: unreadCount, communityFriends: friends };
        saveState({ skipCloud: true });
        patchStoredMessageLists(friends);
      } else if (state.page === "messages" && patchVisibleMessageList(friends)) {
        // A chat can return to an exact preserved messages DOM. Patch its
        // changed rows in place so a push never looks like the whole page was
        // refreshed just to update one preview or unread badge.
        state = { ...state, messageUnreadCount: unreadCount, communityFriends: friends };
        saveState({ skipCloud: true });
        syncPersistentBottomNav($app.querySelector(":scope > .bottom-nav"));
      } else if (state.page === "community") {
        // 壳友圈 does not render the unread number. Updating it must not tear
        // down the newly opened feed just because the unread request resolved
        // after the community request.
        state = { ...state, messageUnreadCount: unreadCount, communityFriends: friends };
        saveState({ skipCloud: true });
        syncPersistentBottomNav($app.querySelector(":scope > .bottom-nav"));
      } else {
        setState({ messageUnreadCount: unreadCount, communityFriends: friends }, { skipCloud: true, forceRender: shouldRenderMessages || state.page === "messages" });
      }
    }
  } catch (error) {
    // A 401 has already cleared the stale local credential in apiPost().  It
    // is not a transient unread-message error and must not keep filling the
    // console every polling interval.
    if (error.status !== 401 && error.status !== 405 && error.message !== "方法不支持") console.warn(error.message || "未读消息读取失败");
  } finally {
    messageUnreadLoading = false;
    if (messageUnreadRenderRequested) {
      const renderMessages = messageUnreadRenderRequested;
      messageUnreadRenderRequested = false;
      void refreshMessageUnread(true, { renderMessages });
    }
  }
}

function markCommunityConversationReadLocally(userId) {
  const id = String(userId || "");
  if (!id) return state.communityFriends || [];
  return (state.communityFriends || []).map(friend => String(friend.id || "") === id
    ? { ...friend, unreadCount: 0 }
    : friend);
}

function patchVisibleMessageList(friends) {
  if (state.page !== "messages" || messageListSwipeIsActive()) return false;
  return patchMessageListInRoot($app, friends);
}

function patchStoredMessageLists(friends) {
  edgeBackSnapshots
    .filter(snapshot => snapshot?.page === "messages")
    .forEach(snapshot => {
      if (snapshot.liveDom?.hasChildNodes?.()) patchMessageListInRoot(snapshot.liveDom, friends);
      if (!snapshot.html) return;
      const template = document.createElement("template");
      template.innerHTML = snapshot.html;
      if (!patchMessageListInRoot(template.content, friends)) return;
      snapshot.html = template.innerHTML;
      snapshot.previewHtml = buildEdgeBackPreviewHtml(snapshot.html);
    });
}

function patchMessageListInRoot(root, friends) {
  const list = root?.querySelector?.(".message-friend-list");
  if (!list) return false;
  const rows = [...list.querySelectorAll(":scope > .message-friend-swipe")];
  const rowIds = rows.map(row => String(row.dataset.conversationId || ""));
  const friendIds = (friends || []).map(friend => String(friend.id || ""));
  if (rowIds.length !== friendIds.length || rowIds.some((id, index) => id !== friendIds[index])) return false;
  rows.forEach((row, index) => {
    const friend = friends[index] || {};
    const copy = row.querySelector(".message-friend-copy");
    const title = copy?.querySelector("strong");
    const preview = copy?.querySelector("span");
    if (title) title.textContent = friend.name || "壳友";
    if (preview) preview.textContent = friend.lastMessage || "暂无消息";
    const avatarWrap = row.querySelector(".message-friend-avatar-wrap");
    let badge = avatarWrap?.querySelector(":scope > i");
    const unread = Math.max(0, Number(friend.unreadCount || 0));
    if (unread && avatarWrap && !badge) {
      badge = document.createElement("i");
      avatarWrap.appendChild(badge);
    }
    if (badge) {
      if (unread) badge.textContent = unread > 99 ? "99+" : String(unread);
      else badge.remove();
    }
    const time = row.querySelector(".message-friend-time");
    if (time && friend.lastMessageAt) {
      time.dateTime = friend.lastMessageAt;
      time.textContent = formatMessagePreviewTime(friend.lastMessageAt);
    }
  });
  return true;
}

function startMessageUnreadPolling() {
  if (messageUnreadTimer) return;
  messageUnreadTimer = setInterval(() => {
    if (document.hidden) return;
    refreshMessageUnread(true);
    if (state.page === "communityChat") void refreshCommunityChat(true, { scrollLatest: true, silent: true });
  }, 5000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    refreshMessageUnread(true);
    if (state.page === "communityChat") void refreshCommunityChat(true, { scrollLatest: true, silent: true });
  });
}

function messageListSwipeIsActive() {
  return state.page === "messages" && Boolean(document.querySelector(".message-friend-swipe.is-native-scrolling"));
}

function messageListHasOpenNativeRow(root = document) {
  return Boolean([...root.querySelectorAll?.(".message-friend-swipe") || []]
    .some(row => row.scrollLeft > Math.max(4, (row.scrollWidth - row.clientWidth) * 0.25)));
}

function setupNativeMessageRowSwipes(root = document) {
  const rows = root?.querySelectorAll?.(".message-friend-swipe") || [];
  rows.forEach(row => {
    if (row.dataset.nativeSwipeBound === "true") return;
    row.dataset.nativeSwipeBound = "true";
    let settleTimer = 0;
    const finishNativeScroll = () => {
      settleTimer = 0;
      row.classList.remove("is-native-scrolling");
      // Do not decide or animate the release point in JavaScript. The row is
      // a native WebKit snap scroller, so its own momentum handles opening,
      // closing and reversing the action rail without fighting the finger.
      if (row.scrollLeft <= 1) scheduleDeferredMessageListRefresh();
    };
    row.addEventListener("scroll", () => {
      row.classList.add("is-native-scrolling");
      if (settleTimer) window.clearTimeout(settleTimer);
      // `scrollend` is used where available; this is only the compatibility
      // fallback and never writes scrollLeft or starts another animation.
      settleTimer = window.setTimeout(finishNativeScroll, 220);
    }, { passive: true });
    if ("onscrollend" in row) {
      row.addEventListener("scrollend", () => {
        if (settleTimer) window.clearTimeout(settleTimer);
        finishNativeScroll();
      }, { passive: true });
    }
  });
}

function deferMessageListRefreshWhileDragging() {
  if (!messageListSwipeIsActive()) return false;
  // Never replace the row currently following the user's finger. A server
  // response may arrive at any time, but applying it during a drag destroys
  // that row's compositor layer and is perceived as a sharp stutter.
  messageListRefreshDeferred = true;
  return true;
}

function flushDeferredMessageListRefresh() {
  if (!messageListRefreshDeferred || messageListSwipeIsActive()) return;
  // Keep an opened action rail stable for the follow-up tap. The newest data
  // will be fetched once the user closes it or performs the action.
  if (messageListHasOpenNativeRow()) return;
  messageListRefreshDeferred = false;
  if (state.page !== "messages") return;
  void refreshCommunity(true);
  void refreshMessageUnread(true, { renderMessages: true });
}

function scheduleDeferredMessageListRefresh() {
  if (messageListRefreshFlushTimer) window.clearTimeout(messageListRefreshFlushTimer);
  messageListRefreshFlushTimer = window.setTimeout(() => {
    messageListRefreshFlushTimer = 0;
    flushDeferredMessageListRefresh();
  }, 0);
}

async function refreshCommunityChat(force = false, options = {}) {
  const userId = state.selectedCommunityFriendId;
  if (!userId || !hasCloudSession()) return;
  if (communityChatLoading) {
    if (force) communityChatRefreshPending = true;
    return;
  }
  const key = `${userId}:${Math.floor(Date.now() / 10000)}`;
  if (!force && communityChatLoadedKey === key) return;
  communityChatLoading = true;
  try {
    const result = await apiPost("/api/community/chat/list", communityAuthPayload({ userId }));
    communityChatLoadedKey = key;
    const friend = result.friend || state.selectedCommunityFriend;
    const messages = mergeCommunityChatMessages(state.selectedCommunityFriendId === userId ? state.communityChatMessages : [], result.messages || []);
    const chatFriends = communityFriendsWithPreview(userId, friend, messages, { unreadCount: 0 });
    patchStoredMessageLists(chatFriends);
    const chatStillVisible = state.page === "communityChat" && state.selectedCommunityFriendId === userId;
    const messagesChanged = communityChatMessageSignature(messages) !== communityChatMessageSignature(state.communityChatMessages || []);
    if (chatStillVisible && messagesChanged && options.scrollLatest) pendingCommunityChatLatestScroll = true;
    if (chatStillVisible && messagesChanged) {
      setState({
        selectedCommunityFriend: friend,
        communityChatMessages: messages,
        communityChatListing: normalizeCommunityChatListing(result.marketListing),
        communityFriends: chatFriends
      }, { skipCloud: true });
    } else if (chatStillVisible) {
      // Keep the open conversation DOM intact when polling found no new
      // message. This removes the periodic flash users were seeing.
      state = {
        ...state,
        selectedCommunityFriend: friend,
        communityChatListing: normalizeCommunityChatListing(result.marketListing),
        communityFriends: chatFriends
      };
      saveState({ skipCloud: true });
    } else {
      // A late reply for an old conversation may update the list preview, but
      // must never overwrite whichever conversation the user opened next.
      state = { ...state, communityFriends: chatFriends };
      saveState({ skipCloud: true });
    }
    refreshMessageUnread(true);
  } catch (error) {
    if (!options.silent) toast(error.message || "聊天记录读取失败");
  } finally {
    communityChatLoading = false;
    if (communityChatRefreshPending && state.page === "communityChat" && state.selectedCommunityFriendId === userId) {
      communityChatRefreshPending = false;
      void refreshCommunityChat(true, { scrollLatest: true, silent: true });
    }
  }
}

async function sendCommunityMessage(event) {
  event.preventDefault();
  if (!canUseCommunity()) return;
  const content = String(new FormData(event.currentTarget).get("content") || "").trim();
  if (!content) return;
  try {
    const result = await apiPost("/api/community/chat/send", communityAuthPayload({ userId: state.selectedCommunityFriendId, content }));
    applyCommunityChatSendResult(result);
  } catch (error) {
    toast(error.message || "消息发送失败");
  }
}

function closeCommunityChatMessageMenu() {
  communityChatMessageMenuDismiss?.();
}

async function copyCommunityChatText(text) {
  const value = String(text || "");
  if (!value) return;
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
    else {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    toast("已复制");
  } catch {
    toast("复制失败，请重试");
  }
}

function quoteCommunityChatMessage(message) {
  const source = String(message?.rawContent || message?.content || "").trim();
  if (!source) return;
  const input = document.querySelector("#communityChatForm input[name='content']");
  if (!input) return;
  const quote = `「引用：${source.slice(0, 160)}」\n`;
  input.value = quote;
  marketChatDraft = quote;
  input.focus();
  input.setSelectionRange(quote.length, quote.length);
}

async function recallCommunityChatMessage(message) {
  if (!message?.id || !canUseCommunity()) return;
  try {
    const result = await apiPost("/api/community/chat/recall", communityAuthPayload({
      userId: state.selectedCommunityFriendId,
      messageId: message.id
    }));
    applyCommunityChatSendResult(result);
    toast("已撤回消息");
  } catch (error) {
    toast(error.message || "撤回失败，请重试");
  }
}

function openCommunityChatMessageMenu(messageId, anchor) {
  const message = (state.communityChatMessages || []).find(item => item.id === messageId);
  if (!message || message.recalled || message.mediaUrl) return;
  const sentAt = new Date(message.createdAt || 0).getTime();
  if (message.mine && (!Number.isFinite(sentAt) || Date.now() - sentAt > 2 * 60 * 1000)) {
    toast("消息发送超过 2 分钟，无法撤回");
    return;
  }
  closeCommunityChatMessageMenu();
  const menu = document.createElement("div");
  menu.className = "community-chat-message-menu";
  menu.setAttribute("role", "menu");
  menu.innerHTML = message.mine
    ? `<button type="button" data-chat-message-recall>撤回</button>`
    : `<button type="button" data-chat-message-copy>复制</button><button type="button" data-chat-message-quote>引用</button>`;
  document.body.appendChild(menu);
  const close = () => {
    document.removeEventListener("pointerdown", onOutsidePointer, true);
    document.removeEventListener("keydown", onKeyDown, true);
    menu.remove();
    if (communityChatMessageMenuElement === menu) {
      communityChatMessageMenuElement = null;
      communityChatMessageMenuDismiss = null;
    }
  };
  const onOutsidePointer = event => {
    if (!menu.contains(event.target) && event.target !== anchor) close();
  };
  const onKeyDown = event => { if (event.key === "Escape") close(); };
  communityChatMessageMenuElement = menu;
  communityChatMessageMenuDismiss = close;
  menu.querySelector("[data-chat-message-copy]")?.addEventListener("click", async () => {
    close();
    await copyCommunityChatText(message.rawContent || message.content);
  });
  menu.querySelector("[data-chat-message-quote]")?.addEventListener("click", () => {
    close();
    quoteCommunityChatMessage(message);
  });
  menu.querySelector("[data-chat-message-recall]")?.addEventListener("click", async () => {
    close();
    await recallCommunityChatMessage(message);
  });
  const rect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const left = Math.max(10, Math.min(window.innerWidth - menuRect.width - 10, rect.left + (rect.width - menuRect.width) / 2));
  const above = rect.top - menuRect.height - 10;
  menu.style.left = `${left}px`;
  menu.style.top = `${Math.max(10, above >= 10 ? above : rect.bottom + 10)}px`;
  requestAnimationFrame(() => {
    document.addEventListener("pointerdown", onOutsidePointer, true);
    document.addEventListener("keydown", onKeyDown, true);
    menu.classList.add("is-visible");
  });
}

function bindCommunityChatTextMessageMenus() {
  document.querySelectorAll("[data-community-chat-text-message]").forEach(element => {
    let timer = null;
    let startX = 0;
    let startY = 0;
    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    element.addEventListener("pointerdown", event => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      startX = event.clientX;
      startY = event.clientY;
      clear();
      timer = setTimeout(() => {
        timer = null;
        event.preventDefault();
        openCommunityChatMessageMenu(element.dataset.communityChatTextMessage, element);
      }, 480);
    });
    element.addEventListener("pointermove", event => {
      if (Math.abs(event.clientX - startX) > 10 || Math.abs(event.clientY - startY) > 10) clear();
    });
    element.addEventListener("pointerup", clear);
    element.addEventListener("pointercancel", clear);
    element.addEventListener("contextmenu", event => {
      event.preventDefault();
      openCommunityChatMessageMenu(element.dataset.communityChatTextMessage, element);
    });
  });
}

function applyCommunityChatSendResult(result, options = {}) {
  marketChatDraft = "";
  communityChatLoadedKey = `${state.selectedCommunityFriendId}:${Math.floor(Date.now() / 10000)}`;
  pendingCommunityChatLatestScroll = true;
  const friend = result.friend || state.selectedCommunityFriend;
  const messages = result.messages || [];
  const chatFriends = communityFriendsWithPreview(state.selectedCommunityFriendId, friend, messages, { unreadCount: 0 });
  patchStoredMessageLists(chatFriends);
  setState({
    selectedCommunityFriend: friend,
    communityChatMessages: messages,
    communityChatListing: normalizeCommunityChatListing(result.marketListing) || state.communityChatListing,
    communityChatToolsOpen: Boolean(options.keepToolsOpen),
    communityFriends: chatFriends
  }, { skipCloud: true });
  refreshMessageUnread(true);
}

function bindCommunityChatCameraButton() {
  const button = document.querySelector("[data-community-chat-camera-button]");
  const photoInput = document.querySelector("[data-community-chat-camera-photo-input]");
  const videoInput = document.querySelector("[data-community-chat-camera-video-input]");
  if (!button || !photoInput || !videoInput) return;

  const longPressMs = 480;
  let holdTimer = null;
  let pressStartedAt = 0;
  let isLongPress = false;
  let suppressNextClick = false;

  const clearPress = () => {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
    pressStartedAt = 0;
    button.classList.remove("is-holding");
  };
  const openCapture = type => {
    const input = type === "video" ? videoInput : photoInput;
    input.value = "";
    input.click();
  };

  button.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    button.setPointerCapture?.(event.pointerId);
    clearPress();
    pressStartedAt = Date.now();
    isLongPress = false;
    holdTimer = setTimeout(() => {
      if (!pressStartedAt) return;
      isLongPress = true;
      button.classList.add("is-holding");
      try { navigator.vibrate?.(12); } catch (_) {}
    }, longPressMs);
  });
  button.addEventListener("pointerup", event => {
    if (!pressStartedAt) return;
    const captureType = isLongPress || Date.now() - pressStartedAt >= longPressMs ? "video" : "photo";
    clearPress();
    suppressNextClick = true;
    event.preventDefault();
    openCapture(captureType);
    setTimeout(() => { suppressNextClick = false; }, 0);
  });
  button.addEventListener("pointercancel", clearPress);
  button.addEventListener("lostpointercapture", clearPress);
  button.addEventListener("click", event => {
    if (suppressNextClick) {
      event.preventDefault();
      return;
    }
    openCapture("photo");
  });
}

function collapseCommunityChatTools() {
  if (!state.communityChatToolsOpen) return;
  setState({ communityChatToolsOpen: false }, { skipCloud: true });
}

function updateCommunityChatMediaUploadProgress(patch = {}) {
  communityChatMediaUploadProgress = { ...communityChatMediaUploadProgress, ...patch, active: true };
  let panel = document.querySelector("[data-community-chat-upload-progress]");
  if (!panel) {
    panel = document.createElement("aside");
    panel.className = "community-chat-upload-progress";
    panel.dataset.communityChatUploadProgress = "";
    panel.setAttribute("role", "status");
    panel.setAttribute("aria-live", "polite");
    document.body.append(panel);
  }
  const total = Math.max(1, Number(communityChatMediaUploadProgress.total || 1));
  const current = Math.min(total, Math.max(1, Number(communityChatMediaUploadProgress.current || 1)));
  panel.innerHTML = `<i aria-hidden="true"></i><span><strong>正在发送${total > 1 ? `（${current}/${total}）` : ""}</strong><small>${escapeHtml(communityChatMediaUploadProgress.stage || "正在准备媒体…")}</small></span><b>${Math.max(0, Math.min(100, Number(communityChatMediaUploadProgress.percent || 0)))}%</b>`;
}

function clearCommunityChatMediaUploadProgress() {
  communityChatMediaUploadProgress = { active: false, current: 0, total: 0, percent: 0, stage: "" };
  document.querySelector("[data-community-chat-upload-progress]")?.remove();
}

async function sendCommunityChatMediaBatch(event) {
  const input = event.currentTarget;
  const files = Array.from(input.files || []);
  input.value = "";
  if (!files.length || !canUseCommunity()) return;
  const kinds = files.map(localMediaFileKind);
  if (kinds.some(kind => !kind)) return toast("请选择图片或不超过 30 秒的视频");
  if (kinds.includes("video") && files.length !== 1) return toast("视频一次只能发送 1 个，图片最多可选择 9 张");
  if (kinds.some(kind => kind === "image") && files.length > 9) return toast("图片一次最多可选择 9 张");
  for (const file of files) {
    if (localMediaFileKind(file) === "image" && file.size > 10 * 1024 * 1024) return toast("图片不能超过 10MB");
  }
  const total = files.length;
  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const mediaKind = kinds[index];
      const duration = mediaKind === "video" ? await readVideoDuration(file) : 0;
      if (duration > 30) throw new Error("视频时长不能超过 30 秒");
      updateCommunityChatMediaUploadProgress({ current: index + 1, total, percent: 0, stage: mediaKind === "video" ? "正在上传高清原视频…" : "正在上传图片…" });
      const uploaded = await apiUploadMediaFile(file, duration, {
        onProgress: ({ percent }) => updateCommunityChatMediaUploadProgress({ current: index + 1, total, percent, stage: mediaKind === "video" ? "正在上传高清原视频…" : "正在上传图片…" })
      });
      let posterUrl = "";
      const poster = mediaKind === "video" ? await createVideoPoster(file) : null;
      try {
        if (poster?.file) {
          updateCommunityChatMediaUploadProgress({ current: index + 1, total, percent: 100, stage: "正在生成视频封面…" });
          const uploadedPoster = await apiUploadMediaFile(poster.file);
          posterUrl = uploadedPoster.url || "";
        }
      } finally {
        if (String(poster?.previewUrl || "").startsWith("blob:")) URL.revokeObjectURL(poster.previewUrl);
      }
      updateCommunityChatMediaUploadProgress({ current: index + 1, total, percent: 100, stage: "正在发送消息…" });
      const result = await apiPost("/api/community/chat/send", communityAuthPayload({
        userId: state.selectedCommunityFriendId,
        content: "",
        mediaUrl: uploaded.url || "",
        mediaType: uploaded.mediaType || mediaKind,
        posterUrl
      }));
      applyCommunityChatSendResult(result);
    }
    collapseCommunityChatTools();
    toast(total > 1 ? `已发送 ${total} 张图片` : (kinds[0] === "video" ? "视频已发送" : "图片已发送"));
  } catch (error) {
    toast(error?.message || "媒体发送失败");
  } finally {
    clearCommunityChatMediaUploadProgress();
  }
}

async function sendCommunityChatMedia(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  if (!canUseCommunity()) {
    input.value = "";
    return;
  }
  const mediaKind = localMediaFileKind(file);
  if (!mediaKind) {
    input.value = "";
    return toast("请选择图片或不超过30秒的视频");
  }
  if (mediaKind === "image" && file.size > 10 * 1024 * 1024) {
    input.value = "";
    return toast("图片不能超过 10MB");
  }
  try {
    const duration = mediaKind === "video" ? await readVideoDuration(file) : 0;
    if (duration > 30) return toast("视频时长不能超过30秒");
    const uploaded = await apiUploadMediaFile(file, duration);
    const poster = mediaKind === "video" ? await createVideoPoster(file) : null;
    let posterUrl = "";
    try {
      if (poster?.file) {
        const uploadedPoster = await apiUploadMediaFile(poster.file);
        posterUrl = uploadedPoster.url || "";
      }
    } finally {
      if (String(poster?.previewUrl || "").startsWith("blob:")) URL.revokeObjectURL(poster.previewUrl);
    }
    const result = await apiPost("/api/community/chat/send", communityAuthPayload({
      userId: state.selectedCommunityFriendId,
      content: "",
      mediaUrl: uploaded.url || "",
      mediaType: uploaded.mediaType || mediaKind,
      posterUrl
    }));
    // 成功发送后先收起相册／拍摄面板，避免其遮住刚发送的媒体消息。
    collapseCommunityChatTools();
    applyCommunityChatSendResult(result);
    toast(mediaKind === "video" ? "视频已发送" : "图片已发送");
  } catch (error) {
    toast(error.message === "请输入消息" ? "服务器尚未同步聊天媒体接口，请部署服务器后重试" : (error.message || "媒体发送失败"));
  } finally {
    input.value = "";
  }
}

async function deleteCommunityPost(postId) {
  if (!canUseCommunity() || !confirm("确定删除这条动态吗？")) return;
  try {
    const result = await apiPost("/api/community/delete", communityAuthPayload({ postId }));
    setState({ communityPosts: normalizeCommunityPosts(result.posts || []) }, { skipCloud: true });
    toast("动态已删除");
  } catch (error) {
    if (error.status === 405 || error.message === "方法不支持") {
      setState({ communityPosts: (state.communityPosts || []).filter(item => item.id !== postId) }, { skipCloud: true });
      toast("动态已删除");
      return;
    }
    toast(error.message || "删除失败");
  }
}

async function refreshPublicFeedback(force = false) {
  if (!CONFIGURED_SMS_BACKEND || publicFeedbackLoading) return;
  if (!state.loggedInPhone || !currentCloudToken()) {
    if ((state.publicFeedbackItems || []).length) setState({ publicFeedbackItems: [] }, { skipCloud: true });
    return;
  }
  if (!force && Date.now() - publicFeedbackLastLoadedAt < 10000 && (state.publicFeedbackItems || []).length) return;
  publicFeedbackLoading = true;
  try {
    const result = await apiPost("/api/feedback/list", feedbackAuthPayload());
    publicFeedbackLastLoadedAt = Date.now();
    setState({ publicFeedbackItems: Array.isArray(result.feedbacks) ? result.feedbacks : [] }, { skipCloud: true });
  } catch (error) {
    console.warn(error.message || "反馈读取失败");
  } finally {
    publicFeedbackLoading = false;
  }
}

async function submitPublicFeedback(event) {
  event.preventDefault();
  if (!canUsePublicFeedback()) return;
  const form = new FormData(event.currentTarget);
  const type = String(form.get("type") || "其他");
  const content = String(form.get("content") || "").trim();
  if (!content) return toast("请填写反馈内容");
  try {
    const result = await apiPost("/api/feedback/create", feedbackAuthPayload({ type, content }));
    publicFeedbackLastLoadedAt = Date.now();
    setState({
      page: "feedback",
      publicFeedbackItems: Array.isArray(result.feedbacks) ? result.feedbacks : state.publicFeedbackItems,
      activityLogs: logActivity(`发布意见反馈：${type}`, "空间")
    });
    toast("反馈已发布");
  } catch (error) {
    toast(error.message || "反馈发布失败");
  }
}

async function toggleFeedbackLike(feedbackId) {
  if (!canUsePublicFeedback()) return;
  try {
    const result = await apiPost("/api/feedback/like", feedbackAuthPayload({ feedbackId }));
    publicFeedbackLastLoadedAt = Date.now();
    setState({ publicFeedbackItems: Array.isArray(result.feedbacks) ? result.feedbacks : state.publicFeedbackItems, openFeedbackMenuId: "" }, { skipCloud: true });
  } catch (error) {
    toast(error.message || "操作失败");
  }
}

async function submitFeedbackComment(event) {
  event.preventDefault();
  if (!canUsePublicFeedback()) return;
  const feedbackId = event.currentTarget.dataset.feedbackId;
  const form = new FormData(event.currentTarget);
  const content = String(form.get("content") || "").trim();
  if (!content) return toast("请填写评论内容");
  try {
    const result = await apiPost("/api/feedback/comment", feedbackAuthPayload({ feedbackId, content }));
    publicFeedbackLastLoadedAt = Date.now();
    setState({
      publicFeedbackItems: Array.isArray(result.feedbacks) ? result.feedbacks : state.publicFeedbackItems,
      activityLogs: logActivity("评论了一条意见反馈", "空间")
    });
    toast("评论已发布");
  } catch (error) {
    toast(error.message || "评论失败");
  }
}

async function deletePublicFeedback(feedbackId) {
  if (!canUsePublicFeedback()) return;
  if (!confirm("确定删除这条反馈吗？")) return;
  try {
    const result = await apiPost("/api/feedback/delete", feedbackAuthPayload({ feedbackId }));
    publicFeedbackLastLoadedAt = Date.now();
    const remaining = Array.isArray(result.feedbacks) ? result.feedbacks : state.publicFeedbackItems;
    setState({
      publicFeedbackItems: remaining,
      page: state.page === "feedbackDetail" ? "feedback" : state.page,
      openFeedbackMenuId: "",
      selectedFeedbackId: state.selectedFeedbackId === feedbackId ? "" : state.selectedFeedbackId
    }, { skipCloud: true });
    toast("反馈已删除");
  } catch (error) {
    toast(error.message || "删除失败");
  }
}

async function deletePublicFeedbackComment(feedbackId, commentId) {
  if (!canUsePublicFeedback()) return;
  if (!confirm("确定删除这条评论吗？")) return;
  try {
    const result = await apiPost("/api/feedback/comment/delete", feedbackAuthPayload({ feedbackId, commentId }));
    publicFeedbackLastLoadedAt = Date.now();
    setState({ publicFeedbackItems: Array.isArray(result.feedbacks) ? result.feedbacks : state.publicFeedbackItems }, { skipCloud: true });
    toast("评论已删除");
  } catch (error) {
    toast(error.message || "删除失败");
  }
}

function submitSatisfaction(event) {
  event.preventDefault();
  if (!requireLogin()) return;
  const form = new FormData(event.currentTarget);
  const comment = String(form.get("comment") || "").trim();
  const rating = Number(form.get("rating") || state.satisfactionRating || 5);
  if (!comment) return toast("请填写评价内容");
  const review = { id: crypto.randomUUID(), rating, comment, createdAt: new Date().toISOString() };
  setState({
    satisfactionReviews: [review, ...(state.satisfactionReviews || [])],
    activityLogs: logActivity(`提交满意度评价：${rating} 分`, "空间")
  });
  toast("评价已提交");
}

function submitFeedback(event) {
  event.preventDefault();
  if (!requireLogin()) return;
  const form = new FormData(event.currentTarget);
  const type = String(form.get("type") || "其他");
  const content = String(form.get("content") || "").trim();
  if (!content) return toast("请填写反馈内容");
  const item = { id: crypto.randomUUID(), type, content, createdAt: new Date().toISOString() };
  setState({
    feedbackItems: [item, ...(state.feedbackItems || [])],
    activityLogs: logActivity(`提交意见反馈：${type}`, "空间")
  });
  toast("反馈已提交");
}

async function submitAccount(event) {
  event.preventDefault();
  if (accountSubmitInFlight) return;
  const submitButton = event.currentTarget.querySelector("button[type='submit']");
  const originalText = submitButton?.textContent || "";
  accountSubmitInFlight = true;
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = event.currentTarget.dataset.authForm === "register" ? "正在验证并登录…" : "正在登录…";
  }
  try {
    await submitAccountInner(event);
  } finally {
    accountSubmitInFlight = false;
    if (submitButton?.isConnected) {
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  }
}

async function submitAccountInner(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const mode = event.currentTarget.dataset.authForm || state.accountMode;
  const phone = String(form.get("phone") || "").trim();
  const password = String(form.get("password") || "");
  const confirmPassword = String(form.get("confirmPassword") || "");
  if (!/^1[3-9]\d{9}$/.test(phone)) return toast("请输入正确的 11 位手机号");
  if (password.length < 6) return toast("密码至少需要 6 位");
  if (!form.get("termsAccepted")) return toast("请先阅读并同意服务规则和隐私政策");

  if (mode === "login") {
    if (CONFIGURED_SMS_BACKEND) {
      try {
        const result = await apiPost("/api/account/login", { phone, password, termsAccepted: true, termsVersion: POLICY_VERSION });
        if (!result.user) throw new Error("登录失败，请稍后重试");
        applyCloudUser(result.user, `手机号登录：${maskPhone(phone)}`, { skipCloud: true, skipMigration: true });
        void requestLocationPermissionOnLogin();
        toast("登录成功");
        return;
      } catch (error) {
        toast(error.message || "手机号或密码不正确");
        return;
      }
    }
    const user = (state.registeredUsers || []).find(item => item.phone === phone && item.password === password);
    if (!user) return toast("手机号或密码不正确");
    const acceptedAt = new Date().toISOString();
    const registeredUsers = (state.registeredUsers || []).map(item => item.phone === phone
      ? { ...item, termsAcceptedAt: acceptedAt, termsVersion: POLICY_VERSION }
      : item);
    const accountData = normalizeAccountData(user.data || {});
    setState({
      ...accountData,
      loggedInPhone: phone,
      accountName: user.accountName || maskPhone(phone),
      accountAvatar: user.accountAvatar || "",
      accountDraftPhone: "",
      accountDraftPassword: "",
      accountDraftConfirmPassword: "",
      registeredUsers,
      policyConsentRequired: false,
      page: "mine",
      activityLogs: [makeActivity(`手机号登录：${maskPhone(phone)}`, "空间"), ...(accountData.activityLogs || [])]
    });
    void requestLocationPermissionOnLogin();
    toast("登录成功");
    return;
  }

  const code = String(form.get("code") || "").trim();
  if (!confirmPassword) return toast("请先填写核对密码");
  if (password !== confirmPassword) return toast("密码不一致");
  if (!CONFIGURED_SMS_BACKEND && (state.registeredUsers || []).some(item => item.phone === phone)) return toast("手机号已注册，请直接登录");
  if (state.pendingAuthPhone !== phone || !Number(state.authCodeExpiresAt || 0)) return toast("请先获取验证码");
  if (Date.now() > Number(state.authCodeExpiresAt || 0)) return toast("验证码已过期，请重新获取");

  if (CONFIGURED_SMS_BACKEND) {
    try {
      const localAccount = (state.registeredUsers || []).find(item => item.phone === phone);
      const initialCloudData = normalizeAccountData(
        localAccount?.data || (state.loggedInPhone === phone ? accountDataSnapshot(state) : emptyAccountData())
      );
      const result = await apiPost("/api/account/register", {
        phone,
        password,
        code,
        termsAccepted: true,
        accountName: maskPhone(phone),
        accountAvatar: randomDefaultAccountAvatar(),
        data: initialCloudData
      });
      if (!result.user) throw new Error("注册失败，请稍后重试");
      applyCloudUser(result.user, `注册并登录：${maskPhone(phone)}`, { skipCloud: true, skipMigration: true });
      void requestLocationPermissionOnLogin();
      toast("注册成功，已登录");
      return;
    } catch (error) {
      toast(error.message || "注册失败，请稍后重试");
      return;
    }
  }

  if (!(await verifyServerSmsCode(phone, code))) return toast("验证码不正确");

  const accountData = emptyAccountData();
  const user = { id: crypto.randomUUID(), phone, password, accountName: maskPhone(phone), accountAvatar: randomDefaultAccountAvatar(), data: accountData, termsAcceptedAt: new Date().toISOString(), termsVersion: POLICY_VERSION, createdAt: new Date().toISOString() };
  setState({
    ...accountData,
    registeredUsers: [user, ...(state.registeredUsers || [])],
    loggedInPhone: phone,
    accountName: user.accountName,
    accountAvatar: user.accountAvatar,
    pendingAuthCode: "",
    pendingAuthPhone: "",
    authCodeExpiresAt: "",
    accountCodeCooldownUntil: "",
    accountDraftPhone: "",
    accountDraftPassword: "",
    accountDraftConfirmPassword: "",
    policyConsentRequired: false,
    page: "mine",
    activityLogs: [makeActivity(`注册并登录：${maskPhone(phone)}`, "空间")]
  });
  void requestLocationPermissionOnLogin();
  toast("注册成功，已登录");
}

async function sendAccountCode() {
  const form = document.querySelector("#accountForm");
  const phone = String(form?.querySelector("[name='phone']")?.value || "").trim();
  const password = String(form?.querySelector("[name='password']")?.value || "");
  const confirmPassword = String(form?.querySelector("[name='confirmPassword']")?.value || "");
  const cooldownRemaining = accountCodeCooldownRemaining();
  if (cooldownRemaining > 0) return toast(`请在 ${cooldownRemaining} 秒后再获取验证码`);
  if (!/^1[3-9]\d{9}$/.test(phone)) return toast("先填写正确的手机号");
  if (password.length < 6) return toast("请先创建至少 6 位密码");
  if (!confirmPassword) return toast("请先填写核对密码");
  if (password !== confirmPassword) return toast("密码不一致");
  if (!CONFIGURED_SMS_BACKEND && (state.registeredUsers || []).some(item => item.phone === phone)) return toast("手机号已注册，请直接登录");
  if (hasSmsBackend()) {
    try {
      const result = await apiPost("/api/sms/send", { phone, purpose: "register" });
      setState({
        accountDraftPhone: phone,
        accountDraftPassword: password,
        accountDraftConfirmPassword: confirmPassword,
        pendingAuthCode: result.code || SERVER_SMS_CODE,
        pendingAuthPhone: phone,
        authCodeExpiresAt: String(Date.now() + Number(result.expiresIn || 300) * 1000),
        accountCodeCooldownUntil: String(Date.now() + 60 * 1000)
      });
      toast(result.code ? `验证码已发送：${result.code}` : "验证码已发送");
      return;
    } catch (error) {
      if (CONFIGURED_SMS_BACKEND) {
        setState({
          accountDraftPhone: phone,
          accountDraftPassword: password,
          accountDraftConfirmPassword: confirmPassword,
          pendingAuthCode: "",
          pendingAuthPhone: "",
          authCodeExpiresAt: "",
          accountCodeCooldownUntil: ""
        });
        toast(error.message || "短信服务暂不可用，请稍后重试");
        return;
      }
      toast(`短信服务暂不可用，已切换原型验证码`);
    }
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  setState({
    accountDraftPhone: phone,
    accountDraftPassword: password,
    accountDraftConfirmPassword: confirmPassword,
    pendingAuthCode: code,
    pendingAuthPhone: phone,
    authCodeExpiresAt: String(Date.now() + 5 * 60 * 1000),
    accountCodeCooldownUntil: String(Date.now() + 60 * 1000)
  });
  toast(`验证码已发送：${code}`);
}

function validateAccountPasswordMatch() {
  const form = document.querySelector("#accountForm");
  const passwordInput = form?.querySelector("[name='password']");
  const confirmInput = form?.querySelector("[name='confirmPassword']");
  const error = form?.querySelector("[data-password-error]");
  if (!confirmInput) return true;
  const password = String(passwordInput?.value || "");
  const confirmPassword = String(confirmInput.value || "");
  const valid = !confirmPassword || password === confirmPassword;
  confirmInput.setCustomValidity(valid ? "" : "密码不一致");
  if (error) error.hidden = valid;
  return valid;
}

async function readAccountAvatar(event) {
  if (!requireLogin()) return;
  const input = event.target;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const photo = await readImageForLocalUse(file, "avatar");
    input.value = "";
    setState({ accountAvatar: photo }, { skipCloud: true });
    scheduleCloudImageMigration();
  } catch (error) {
    input.value = "";
    toast(error.message || "图片读取失败");
  }
}

function submitProfile(event) {
  event.preventDefault();
  if (!requireLogin()) return;
  const form = new FormData(event.currentTarget);
  const nickname = String(form.get("nickname") || "").trim() || maskPhone(state.loggedInPhone);
  const registeredUsers = (state.registeredUsers || []).map(user => user.phone === state.loggedInPhone ? {
    ...user,
    accountName: nickname,
    accountAvatar: state.accountAvatar
  } : user);
  setState({
    accountName: nickname,
    registeredUsers,
    page: "mine",
    activityLogs: logActivity(`更新账号资料：${nickname}`, "空间")
  });
  toast("昵称和头像已保存");
}

async function acceptLatestPolicies() {
  if (!state.loggedInPhone) return;
  const check = document.querySelector("[data-policy-consent-check]");
  if (!check?.checked) return;
  const submit = document.querySelector("[data-policy-consent-submit]");
  if (submit) {
    submit.disabled = true;
    submit.textContent = "正在确认…";
  }
  try {
    if (CONFIGURED_SMS_BACKEND && currentCloudToken()) {
      const result = await apiPost("/api/account/terms/accept", communityAuthPayload({
        accepted: true,
        termsVersion: POLICY_VERSION
      }));
      if (!result.user) throw new Error("协议确认失败，请稍后重试");
      applyCloudUser(result.user, "已同意最新版服务协议和隐私政策", { skipCloud: true, skipMigration: true });
      setState({ policyConsentRequired: false }, { skipCloud: true });
    } else {
      const acceptedAt = new Date().toISOString();
      const registeredUsers = (state.registeredUsers || []).map(user => user.phone === state.loggedInPhone
        ? { ...user, termsAcceptedAt: acceptedAt, termsVersion: POLICY_VERSION }
        : user);
      setState({ registeredUsers, policyConsentRequired: false }, { skipCloud: true });
    }
    toast("已确认协议，欢迎继续使用");
  } catch (error) {
    const message = error.message || "协议确认失败，请稍后重试";
    const errorBox = document.querySelector("[data-policy-consent-error]");
    if (errorBox) {
      errorBox.hidden = false;
      errorBox.textContent = message;
    }
    if (submit?.isConnected) {
      submit.disabled = false;
      submit.textContent = "同意并继续使用";
    }
    toast(message);
  }
}

function logoutAccount() {
  const pushAccount = state.loggedInPhone;
  const pushToken = currentCloudToken();
  if (!confirm("确定要退出当前账号吗？")) return;
  cloudHydrationComplete = false;
  void unregisterNativePushNotifications(pushAccount, pushToken);
  forgetCloudToken(state.loggedInPhone);
  const registeredUsers = syncRegisteredUsers(state);
  setState({
    ...emptyAccountData(),
    registeredUsers,
    loggedInPhone: "",
    accountName: "未登录用户",
    accountAvatar: "",
    communityPosts: [],
    communityProfileStats: { receivedLikes: 0, followerCount: 0 },
    contentReports: [],
    blockedUsers: [],
    isCommunityAdmin: false,
    communityFriends: [],
    communityChatMessages: [],
    messageUnreadCount: 0,
    marketListings: [],
    selectedMarketListingId: "",
    selectedCommunityFriendId: "",
    selectedCommunityFriend: null,
    policyConsentRequired: false,
    page: "mine"
  });
  toast("已退出账号");
}

function maskPhone(phone) {
  return phone ? `${phone.slice(0, 3)}****${phone.slice(7)}` : "未登录用户";
}

function accountAvatarMarkup(className = "avatar") {
  return state.accountAvatar
    ? `<img class="${className} avatar-img" src="${accountAvatarSource(state.accountAvatar)}" alt="头像">`
    : `<div class="${className}">龟</div>`;
}

function hasSmsBackend() {
  return CONFIGURED_SMS_BACKEND || location.protocol === "http:" || location.protocol === "https:";
}

function nativePushNotifications() {
  const capacitor = window.Capacitor;
  if (!capacitor || typeof capacitor.isNativePlatform !== "function" || !capacitor.isNativePlatform()) return null;
  return capacitor.Plugins?.PushNotifications || null;
}

async function saveNativePushDeviceToken(deviceToken) {
  const token = String(deviceToken || "").trim();
  if (!token || !state.loggedInPhone || !currentCloudToken()) return;
  nativePushDeviceToken = token;
  try {
    await apiPost("/api/notifications/device/register", communityAuthPayload({
      deviceToken: token,
      platform: "ios"
    }));
  } catch (error) {
    // Do not interrupt chat or login when a device is temporarily offline.
    console.warn(error.message || "消息通知设备注册失败");
  }
}

function bindNativePushListeners(push) {
  if (nativePushListenersAttached || !push) return;
  nativePushListenersAttached = true;
  try {
    push.addListener("registration", event => {
      saveNativePushDeviceToken(event?.value);
    });
    push.addListener("registrationError", event => {
      console.warn(event?.error || "消息通知注册失败");
    });
    push.addListener("pushNotificationReceived", event => {
      // The native banner/sound is presented by the iOS PushNotifications setting.
      // Refresh both state and the visible row. A preserved messages DOM is
      // patched in place by refreshMessageUnread, so this has no page-flash.
      refreshMessageUnread(true, { renderMessages: true });
      // Capacitor passes the notification directly for foreground delivery,
      // while an action callback wraps it in `notification`.
      const data = nativePushData(event?.notification || event);
      const senderId = String(data.senderId || data.senderID || data.sender_id || "").trim();
      if (senderId && state.page === "communityChat" && senderId === String(state.selectedCommunityFriendId || "")) {
        void refreshCommunityChat(true, { scrollLatest: true, silent: true });
      }
    });
    push.addListener("pushNotificationActionPerformed", event => {
      queueNativePushAction(event?.notification);
    });
  } catch (error) {
    nativePushListenersAttached = false;
    console.warn(error.message || "消息通知监听初始化失败");
  }
}

async function setupNativePushNotifications() {
  if (nativePushSetupInFlight || !state.loggedInPhone || !currentCloudToken()) return;
  const push = nativePushNotifications();
  if (!push) return;
  nativePushSetupInFlight = true;
  try {
    bindNativePushListeners(push);
    let permission = await push.checkPermissions();
    if (permission?.receive === "prompt") permission = await push.requestPermissions();
    if (permission?.receive !== "granted") return;
    await push.register();
  } catch (error) {
    console.warn(error.message || "消息通知权限初始化失败");
  } finally {
    nativePushSetupInFlight = false;
    consumePendingNativePushAction();
  }
}

function nativePushData(notification) {
  const raw = notification?.data;
  if (!raw) return {};
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch (_) { return {}; }
  }
  return typeof raw === "object" ? raw : {};
}

function queueNativePushAction(notification) {
  const data = nativePushData(notification);
  const senderId = String(data.senderId || data.senderID || data.sender_id || "").trim();
  const route = String(data.route || "").trim();
  pendingNativePushAction = { senderId, route, receivedAt: Date.now() };
  consumePendingNativePushAction();
}

function consumePendingNativePushAction() {
  const action = pendingNativePushAction;
  if (!action) return;
  if (action.route === "memos") {
    pendingNativePushAction = null;
    setState({ page: "memos" }, { skipCloud: true });
    return;
  }
  if (!action.senderId || !state.loggedInPhone || !currentCloudToken()) {
    // Keep the action for a short cold-start window. Showing Messages is a
    // safe fallback, but it must not discard the target conversation.
    if (Date.now() - Number(action.receivedAt || 0) > 30000) pendingNativePushAction = null;
    setState({ page: "messages" }, { skipCloud: true });
    void refreshMessageUnread(true, { renderMessages: true });
    return;
  }
  pendingNativePushAction = null;
  void openCommunityChat(action.senderId);
}

async function unregisterNativePushNotifications(phone, token) {
  const deviceToken = nativePushDeviceToken;
  const push = nativePushNotifications();
  nativePushDeviceToken = "";
  try {
    if (phone && token && deviceToken) {
      await apiPost("/api/notifications/device/unregister", {
        phone,
        token,
        deviceToken
      });
    }
  } catch (error) {
    console.warn(error.message || "消息通知设备解绑失败");
  }
  try {
    await push?.unregister?.();
  } catch {
    // A failed local unregister must not prevent the account from logging out.
  }
}

async function testNativePushNotification() {
  if (!state.isCommunityAdmin || !requireLogin()) return;
  const button = document.querySelector("[data-test-push-notification]");
  if (button) {
    button.disabled = true;
    button.textContent = "正在发送…";
  }
  try {
    const result = await apiPost("/api/notifications/test", communityAuthPayload({ delayMs: 5000 }));
    toast(result.message || "测试通知已提交，请将 App 切到后台确认系统通知");
  } catch (error) {
    toast(error.message || "推送测试失败，请检查通知权限和服务器配置");
  } finally {
    if (button?.isConnected) {
      button.disabled = false;
      button.textContent = "发送测试通知";
    }
  }
}

async function apiPost(path, payload) {
  const base = window.TURTLE_API_BASE_URL || "";
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    clearExpiredCloudSession();
  }
  if (path === "/api/upload/image" && response.status === 401) {
    throw new Error("登录状态已过期，请重新登录后再上传图片");
  }
  if (path === "/api/upload/image" && response.status === 405) {
    throw new Error("云端服务器未更新图片上传接口，请先部署最新版后端并重启服务");
  }
  if (path === "/api/upload/image" && data.message === "方法不支持") {
    throw new Error("云端服务器未更新图片上传接口，请先部署最新版后端并重启服务");
  }
  if (path === "/api/account/terms/accept" && response.status === 405) {
    throw new Error("服务器尚未部署协议确认接口，请同步服务器后重试");
  }
  if (path.startsWith("/api/users/") && (response.status === 405 || data.message === "方法不支持")) {
    throw new Error("服务器版本过旧，请先部署最新版后端并重启服务");
  }
  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || "服务暂时不可用");
    error.status = response.status;
    error.code = data.code || "";
    throw error;
  }
  return data;
}

function isRetryableMediaUploadError(error) {
  const status = Number(error?.status || 0);
  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  const message = String(error?.message || "");
  return error?.name === "TypeError" || /load failed|failed to fetch|network|network request failed|timeout|timed out|abort/i.test(message);
}

function waitForMediaUploadRetry(delayMs) {
  return new Promise(resolve => window.setTimeout(resolve, delayMs));
}

async function apiUploadMediaFile(file, duration = 0, options = {}) {
  const base = window.TURTLE_API_BASE_URL || "";
  const mediaKind = localMediaFileKind(file);
  const contentType = localMediaUploadMimeType(file, mediaKind);
  const maxAttempts = mediaKind === "video" ? 3 : 2;
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      if (typeof options.onProgress === "function") {
        return await uploadMediaFileRequest(`${base}/api/upload/media`, file, { contentType, duration, onProgress: options.onProgress });
      }
      const response = await fetch(`${base}/api/upload/media`, {
        method: "POST",
        headers: {
          "Content-Type": contentType,
          "X-Auth-Phone": state.loggedInPhone,
          "X-Auth-Token": currentCloudToken(),
          "X-Media-Duration": String(Math.max(0, Number(duration || 0)))
        },
        body: file
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) clearExpiredCloudSession();
      if (!response.ok || data.ok === false) {
        const error = new Error(data.message || "视频上传失败");
        error.status = response.status;
        throw error;
      }
      return data;
    } catch (error) {
      lastError = error;
      if (!isRetryableMediaUploadError(error) || attempt >= maxAttempts - 1) break;
      options.onRetry?.({ attempt: attempt + 1, maxAttempts, error });
      await waitForMediaUploadRetry(800 * (attempt + 1));
    }
  }
  throw lastError || new Error("视频上传失败");
}

function uploadMediaFileRequest(url, file, { contentType, duration = 0, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url, true);
    request.responseType = "text";
    request.setRequestHeader("Content-Type", contentType || "application/octet-stream");
    request.setRequestHeader("X-Auth-Phone", state.loggedInPhone || "");
    request.setRequestHeader("X-Auth-Token", currentCloudToken() || "");
    request.setRequestHeader("X-Media-Duration", String(Math.max(0, Number(duration || 0))));
    request.upload.onprogress = event => {
      if (!event.lengthComputable) return;
      const total = Math.max(1, Number(event.total || file?.size || 1));
      const loaded = Math.min(total, Math.max(0, Number(event.loaded || 0)));
      onProgress?.({ loaded, total, percent: Math.min(100, Math.round((loaded / total) * 100)) });
    };
    request.onerror = () => reject(new TypeError("网络连接中断"));
    request.onabort = () => reject(new Error("上传已取消"));
    request.onload = () => {
      let data = {};
      try { data = JSON.parse(request.responseText || "{}"); } catch {}
      if (request.status === 401) clearExpiredCloudSession();
      if (request.status < 200 || request.status >= 300 || data.ok === false) {
        const error = new Error(data.message || "媒体上传失败");
        error.status = request.status;
        reject(error);
        return;
      }
      onProgress?.({ loaded: Number(file?.size || 1), total: Number(file?.size || 1), percent: 100 });
      resolve(data);
    };
    request.send(file);
  });
}

function localMediaFileKind(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  if (/^image\/(jpeg|png|webp)$/.test(type) || /\.(?:jpe?g|png|webp)$/.test(name)) return "image";
  if (/^video\/(mp4|webm|quicktime|x-m4v)$/.test(type) || /\.(?:mp4|m4v|mov|webm)$/.test(name)) return "video";
  return "";
}

function localMediaUploadMimeType(file, kind = localMediaFileKind(file)) {
  const type = String(file?.type || "").toLowerCase();
  if (kind === "image" && /^image\/(jpeg|png|webp)$/.test(type)) return type;
  if (kind === "video" && /^video\/(mp4|webm|quicktime|x-m4v)$/.test(type)) return type;
  const name = String(file?.name || "").toLowerCase();
  if (/\.mov$/.test(name)) return "video/quicktime";
  if (/\.webm$/.test(name)) return "video/webm";
  if (/\.(?:mp4|m4v)$/.test(name)) return "video/mp4";
  if (/\.png$/.test(name)) return "image/png";
  if (/\.webp$/.test(name)) return "image/webp";
  if (/\.jpe?g$/.test(name)) return "image/jpeg";
  return "application/octet-stream";
}

function currentCloudToken() {
  const activeUser = (state.registeredUsers || []).find(user => user.phone === state.loggedInPhone);
  return state.cloudToken || activeUser?.cloudToken || readSavedCloudToken(state.loggedInPhone) || "";
}

function cloudUserToLocal(user, fallbackToken = "") {
  const phone = String(user.phone || "");
  return {
    id: user.id || phone || crypto.randomUUID(),
    phone,
    password: "",
    accountName: user.accountName || maskPhone(phone),
    accountAvatar: user.accountAvatar || "",
    cloudToken: user.token || fallbackToken || "",
    data: normalizeAccountData(user.data || {}),
    termsAcceptedAt: user.termsAcceptedAt || "",
    termsVersion: user.termsVersion || "",
    isCommunityAdmin: Boolean(user.isCommunityAdmin),
    blockedUsers: Array.isArray(user.blockedUsers) ? user.blockedUsers : [],
    createdAt: user.createdAt || new Date().toISOString()
  };
}

function applyCloudUser(user, activityText = "", options = {}) {
  const localUser = cloudUserToLocal(user, currentCloudToken());
  // From this point the account data came from an authenticated server
  // response, so subsequent edits may safely use the normal save pipeline.
  cloudHydrationComplete = true;
  // Loading cloud data is a data refresh, not navigation. In particular, a
  // cold launch starts on the dashboard and must not jump to the Space tab
  // when the asynchronous account request comes back.
  const destinationPage = Object.prototype.hasOwnProperty.call(options, "page") ? options.page : "mine";
  if (localUser.phone && localUser.cloudToken) rememberCloudToken(localUser.phone, localUser.cloudToken);
  const accountData = normalizeAccountData(localUser.data || {});
  const activityLogs = activityText
    ? [makeActivity(activityText, "空间"), ...(accountData.activityLogs || [])]
    : accountData.activityLogs;
  setState({
    ...accountData,
    communityPosts: [],
    communityFriends: [],
    blockedUsers: localUser.blockedUsers,
    communityChatMessages: [],
    messageUnreadCount: 0,
    marketListings: [],
    selectedMarketListingId: "",
    selectedCommunityFriendId: "",
    selectedCommunityFriend: null,
    activityLogs,
    registeredUsers: [localUser, ...(state.registeredUsers || []).filter(item => item.phone !== localUser.phone)],
    loggedInPhone: localUser.phone,
    cloudToken: localUser.cloudToken,
    accountName: localUser.accountName,
    accountAvatar: localUser.accountAvatar,
    isCommunityAdmin: localUser.isCommunityAdmin,
    policyConsentRequired: localUser.termsVersion !== POLICY_VERSION,
    accountDraftPhone: "",
    accountDraftPassword: "",
    accountDraftConfirmPassword: "",
    pendingAuthCode: "",
    pendingAuthPhone: "",
    authCodeExpiresAt: "",
    accountCodeCooldownUntil: "",
    page: destinationPage
  }, options);
  if (!options.skipMigration && CONFIGURED_SMS_BACKEND && localUser.cloudToken) {
    scheduleCloudImageMigration(600);
  }
  window.setTimeout(setupNativePushNotifications, 0);
}

function queueCloudSave() {
  if (!CONFIGURED_SMS_BACKEND || !state.loggedInPhone || !currentCloudToken()) return;
  if (!cloudHydrationComplete) {
    // Preserve genuine offline edits, but never turn the empty startup shell
    // into an account/save request before the authoritative cloud data lands.
    if (accountHasContent(state)) persistPendingCloudData();
    return;
  }
  if (accountHasEmbeddedImages(state)) {
    persistPendingCloudData();
    scheduleCloudImageMigration();
    return;
  }
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(pushCloudDataNow, CLOUD_SYNC_DEBOUNCE_MS);
}

async function pushCloudDataNow(throwOnError = false) {
  if (!CONFIGURED_SMS_BACKEND || !state.loggedInPhone || !currentCloudToken()) return;
  if (!cloudHydrationComplete) {
    if (accountHasContent(state)) persistPendingCloudData();
    return;
  }
  if (cloudSyncInFlight) {
    cloudSyncQueued = true;
    return;
  }
  cloudSyncInFlight = true;
  try {
    await apiPost("/api/account/save", {
      phone: state.loggedInPhone,
      token: currentCloudToken(),
      accountName: state.accountName,
      accountAvatar: state.accountAvatar,
      data: accountDataSnapshot(state)
    });
    if (!accountHasEmbeddedImages(state)) clearPendingCloudData();
  } catch (error) {
    console.warn(error.message || "云端同步失败");
    // Never retry a rejected stale-history write automatically: doing so can
    // turn a recoverable multi-device conflict into repeated overwrites.  The
    // local journal stays intact, and the person gets a clear instruction.
    if (error?.code === "GROWTH_HISTORY_CONFLICT") {
      persistPendingCloudData();
      toast("云端有更新的成长记录，本机修改已保留；刷新后再继续编辑");
    }
    if (throwOnError) throw error;
  } finally {
    cloudSyncInFlight = false;
    if (cloudSyncQueued) {
      cloudSyncQueued = false;
      queueCloudSave();
    }
  }
}

async function refreshCloudAccountFromServer() {
  if (!CONFIGURED_SMS_BACKEND || !state.loggedInPhone || !currentCloudToken()) return;
  const pendingBeforeLoad = readPendingCloudData();
  try {
    const result = await apiPost("/api/account/load", {
      phone: state.loggedInPhone,
      token: currentCloudToken()
    });
    // Keep the route that is already on screen. During boot this is "home";
    // during a normal refresh it is the page the person is currently using.
    if (result.user) {
      // The request may have been in flight while the person edited their
      // profile. Read the journal after the response arrives; using a snapshot
      // captured before the request would miss that edit and let the older
      // server nickname/avatar visibly overwrite it.
      const pendingAfterLoad = readPendingCloudData();
      const localEditDuringLoad = pendingAfterLoad?.phone === result.user.phone &&
        pendingAfterLoad.updatedAt !== pendingBeforeLoad?.updatedAt;
      applyCloudUser(result.user, "", { skipCloud: true, page: state.page });
      // A journal newer than the server is an interrupted local save. Restore
      // it after the authoritative account shell is applied, then retry the
      // normal save pipeline. A stale journal is discarded so an older device
      // never overwrites a newer cloud edit.
      if ((localEditDuringLoad || pendingCloudDataIsNewerThan(result.user.updatedAt, pendingAfterLoad)) && restorePendingCloudData()) {
        setState({}, { skipCloud: true });
        queueCloudSave();
      } else if (pendingAfterLoad?.phone === result.user.phone) {
        clearPendingCloudData(result.user.phone);
      }
      return true;
    }
    return false;
  } catch (error) {
    console.warn(error.message || "云端数据读取失败");
    return false;
  }
}

async function startCloudSessionHydration() {
  if (cloudHydrationStarted || !hasCloudSession()) return;
  cloudHydrationStarted = true;
  try {
    // Loading always happens before saving. In particular, never upload the
    // empty account shell created during a cold start over real cloud data.
    const loaded = await refreshCloudAccountFromServer();
    if (!loaded) return;
    await migrateEmbeddedImagesToCloud({ silent: true });
  } catch (error) {
    console.warn(error.message || "云端数据初始化失败");
  } finally {
    consumePendingNativePushAction();
  }
}

async function verifyServerSmsCode(phone, code) {
  if (!CONFIGURED_SMS_BACKEND && state.pendingAuthCode !== SERVER_SMS_CODE) return code === state.pendingAuthCode;
  try {
    const result = await apiPost("/api/sms/verify", { phone, code });
    return Boolean(result.ok);
  } catch (error) {
    toast(error.message || "短信验证码核对失败");
    return false;
  }
}

function addKeptSpecies(code) {
  if (!requireLogin()) return;
  const species = speciesByCode(code);
  if (!species) return;
  if (state.keptSpecies.includes(code)) {
    setState({ keptSpecies: state.keptSpecies.filter(item => item !== code) });
    toast(`${species.name} 已取消`);
    return;
  }
  const keptSpecies = state.keptSpecies.includes(code) ? state.keptSpecies : [...state.keptSpecies, code];
  if (state.speciesPickerForAdd) {
    setState({ keptSpecies, selectedSpeciesCode: code, formDraft: { ...turtleFormDraft(), speciesCode: code }, speciesPickerForAdd: false, page: "add", search: "" });
  } else {
    setState({ keptSpecies });
  }
  toast(`${species.name} 已加入常用品种`);
}

function filterSpeciesRows(value) {
  const query = String(value || "").trim().toLowerCase();
  document.querySelectorAll(".species-section").forEach(section => {
    let visible = 0;
    section.querySelectorAll(".species-row").forEach(row => {
      const matched = !query || String(row.dataset.speciesKeywords || "").includes(query);
      row.hidden = !matched;
      row.style.display = matched ? "" : "none";
      if (matched) visible += 1;
    });
    section.hidden = visible === 0;
    section.style.display = visible ? "" : "none";
  });
}

function removeKeptSpecies(code) {
  if (!requireLogin()) return;
  if (!confirm("要把这个品种移出常用品种吗？已有档案会保留。")) return;
  setState({ keptSpecies: state.keptSpecies.filter(item => item !== code), activityLogs: logActivity(`移除常用品种：${speciesByCode(code)?.name || code}`, "品种") });
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function exportNickname(value) {
  return String(value ?? "").split("·")[0].trim();
}

function downloadTextFile(filename, content, type = "text/plain;charset=utf-8") {
  const blob = new Blob([`\ufeff${content}`], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 800);
}

function exportAccountData(kind = "account") {
  if (!requireLogin()) return;
  const lines = [];
  lines.push(["类型", "名称", "日期", "品种", "金额", "体重", "背甲", "备注"].map(csvCell).join(","));
  state.turtles.forEach(turtle => {
    lines.push(["档案", exportNickname(turtle.code || "未命名"), turtle.acquiredDate, turtle.speciesName, turtle.price, turtle.weight, turtle.carapaceLength, turtle.note].map(csvCell).join(","));
  });
  state.ledgerRecords.forEach(record => {
    lines.push([ledgerTypeText(record.type), exportNickname(record.title), record.recordDate || record.createdAt, "", record.amount, record.weight, record.carapaceLength, record.note].map(csvCell).join(","));
  });
  state.breedingRecords.forEach(record => {
    lines.push(["繁殖", exportNickname(record.motherName), record.date, "", "", "", "", `产蛋${record.eggCount || 0} 受精${record.fertileCount || 0} 孵化${record.hatchCount || 0} ${record.note || ""}`].map(csvCell).join(","));
  });
  const fileName = kind === "business" ? `壳友手账-经营报表-${formatDate(new Date())}.csv` : `壳友手账-数据导出-${formatDate(new Date())}.csv`;
  downloadTextFile(fileName, lines.join("\n"), "text/csv;charset=utf-8");
  toast("导出文件已生成");
}

function submitBatchImport(event) {
  event.preventDefault();
  if (!requireLogin()) return;
  const form = new FormData(event.currentTarget);
  const rows = String(form.get("batchTurtles") || "").split(/\n+/).map(row => row.trim()).filter(Boolean);
  if (!rows.length) return toast("请先填写要导入的档案");
  const imported = [];
  const ledgerRecords = [];
  const keptSpecies = new Set(state.keptSpecies);
  const skippedRows = [];
  rows.forEach((row, index) => {
    const parts = row.split(/[,，\t]/).map(part => part.trim());
    const [code, speciesCodeRaw, genderRaw, weightRaw, lengthRaw, priceRaw] = parts;
    const species = speciesByImportName(speciesCodeRaw);
    const weight = numberFromImport(weightRaw);
    const carapaceLength = numberFromImport(lengthRaw);
    if (parts.length < 5) {
      skippedRows.push(`第 ${index + 1} 行字段不完整`);
      return;
    }
    if (!code) {
      skippedRows.push(`第 ${index + 1} 行缺少昵称`);
      return;
    }
    if (!species) {
      skippedRows.push(`第 ${index + 1} 行品种未识别：${speciesCodeRaw || "-"}`);
      return;
    }
    if (!weight || !carapaceLength) {
      skippedRows.push(`第 ${index + 1} 行体重或背甲长度无效`);
      return;
    }
    keptSpecies.add(species.code);
    const price = numberFromImport(priceRaw);
    const turtle = {
      id: crypto.randomUUID(),
      code,
      speciesCode: species.code,
      speciesName: species.name,
      gender: ["公", "母", "未知"].includes(genderRaw) ? genderRaw : "未知",
      weight,
      carapaceLength,
      carapaceWidth: "",
      shellHeight: "",
      plastronLength: "",
      status: "正常饲养",
      health: "健康",
      acquiredDate: formatDate(new Date()),
      source: price > 0 ? "购买" : "其他",
      price: price > 0 ? price : "",
      note: "批量导入",
      photo: speciesPhoto(species) || defaultPhoto,
      createdAt: new Date().toISOString(),
      measureHistory: []
    };
    imported.push(turtle);
    if (price > 0) {
      ledgerRecords.push({
        id: crypto.randomUUID(),
        type: "purchase",
        turtleId: turtle.id,
        title: turtleLabel(turtle),
        amount: price,
        recordDate: turtle.acquiredDate,
        weight: turtle.weight,
        carapaceLength: turtle.carapaceLength,
        carapaceWidth: "",
        shellHeight: "",
        plastronLength: "",
        note: turtle.note,
        photo: turtle.photo,
        turtleSnapshot: { ...turtle },
        createdAt: new Date().toISOString()
      });
    }
  });
  if (!imported.length) return toast(skippedRows[0] || "没有可导入的数据，请检查格式");
  setState({
    turtles: [...imported, ...state.turtles],
    keptSpecies: [...keptSpecies],
    ledgerRecords: [...ledgerRecords, ...state.ledgerRecords],
    activityLogs: logActivity(`批量导入 ${imported.length} 只乌龟${skippedRows.length ? `，跳过 ${skippedRows.length} 行` : ""}`, "档案")
  });
  toast(`已导入 ${imported.length} 只乌龟${skippedRows.length ? `，${skippedRows.slice(0, 2).join("；")}` : ""}`);
}

function submitDeliveryNote(event) {
  event.preventDefault();
  if (!requireLogin()) return;
  const form = new FormData(event.currentTarget);
  const turtle = state.turtles.find(item => item.id === form.get("turtleId"));
  if (!turtle) return toast("请先选择一只乌龟");
  const note = String(form.get("customerNote") || "").trim();
  const output = [
    `交付档案：${turtleLabel(turtle)}`,
    `品种：${turtle.speciesName || "-"}`,
    `体重：${turtle.weight || "-"}g，背甲：${turtle.carapaceLength || "-"}cm`,
    `健康状态：${turtle.health || "-"}，饲养状态：${turtle.status || "-"}`,
    `入手日期：${turtle.acquiredDate || "-"}`,
    note ? `客户备注：${note}` : "",
    "交付提醒：到家后先静养，保持水温稳定，观察开食和排便情况。"
  ].filter(Boolean).join("\n");
  setState({
    professionalOutput: output,
    activityLogs: logActivity(`生成交付说明：${turtleLabel(turtle)}`, "档案")
  });
  toast("交付说明已生成");
}

function deleteTurtle(id) {
  if (!requireLogin()) return;
  const turtle = state.turtles.find(t => t.id === id);
  if (!turtle || !confirm("要删除这份乌龟档案吗？")) return;
  setState({
    turtles: state.turtles.filter(t => t.id !== id),
    page: state.page === "turtleDetail" ? "list" : state.page,
    openTurtleMenuId: "",
    activityLogs: logActivity(`删除档案：${turtleLabel(turtle)}`, "档案")
  });
}

async function readPhoto(event) {
  if (!requireLogin()) return;
  const input = event.target;
  const file = input.files?.[0];
  if (!file) return;
  const draft = captureTurtleFormDraft();
  try {
    const photo = await readImageForLocalUse(file, "turtle");
    input.value = "";
    setState({ formDraft: draft, formPhoto: photo }, { skipCloud: true });
  } catch (error) {
    input.value = "";
    toast(error.message || "图片读取失败");
  }
}

async function readUpdatePhoto(event) {
  if (!requireLogin()) return;
  const input = event.target;
  const file = input.files?.[0];
  if (!file) return;
  const draft = captureTurtleDetailDraft();
  try {
    const photo = await readImageForLocalUse(file, "turtle");
    input.value = "";
    setState({
      turtleDetailDraftId: state.selectedTurtleId,
      turtleDetailDraft: draft,
      updateDraftPhoto: photo
    }, { skipCloud: true });
  } catch (error) {
    input.value = "";
    toast(error.message || "图片读取失败");
  }
}

function applyGrowthSnapshotToTurtle(turtle, snapshot = {}, photo = "") {
  const next = { ...turtle };
  ["code", "weight", "carapaceLength", "status", "health", "poolId"].forEach(field => {
    if (snapshot[field] !== undefined && snapshot[field] !== null && snapshot[field] !== "") next[field] = snapshot[field];
  });
  if (photo) next.photo = photo;
  return next;
}

function deleteGrowthRecordAndRebuild(turtle, historyId) {
  const newestFirst = Array.isArray(turtle?.measureHistory) ? turtle.measureHistory : [];
  const chronological = [...newestFirst].reverse();
  const removedIndex = chronological.findIndex(item => item?.id === historyId);
  if (removedIndex < 0) return null;
  const removed = chronological[removedIndex];
  const baseline = { ...(removedIndex === 0 ? removed.oldSnapshot : chronological[0]?.oldSnapshot || {}) };
  let previousSnapshot = baseline;
  let previousPhoto = removedIndex === 0 ? removed.oldPhoto || "" : chronological[0]?.oldPhoto || "";
  const rebuilt = [];

  chronological.forEach(item => {
    if (item?.id === historyId) return;
    const next = {
      ...item,
      oldSnapshot: { ...previousSnapshot },
      oldLength: Number(previousSnapshot.carapaceLength || 0),
      oldPhoto: previousPhoto || item.oldPhoto || ""
    };
    rebuilt.push(next);
    previousSnapshot = { ...(next.newSnapshot || previousSnapshot) };
    previousPhoto = next.newPhoto || previousPhoto;
  });

  return {
    removed,
    turtle: {
      ...applyGrowthSnapshotToTurtle(turtle, previousSnapshot, previousPhoto),
      measureHistory: rebuilt.reverse()
    }
  };
}

async function deleteGrowthUpdate(turtleId, historyId) {
  if (!requireLogin()) return;
  const turtle = (state.turtles || []).find(item => item.id === turtleId);
  const record = turtle?.measureHistory?.find(item => item.id === historyId);
  if (!turtle || !record) return toast("未找到这条成长记录");
  const label = growthDateLabel(record.updatedAt);
  const before = record.oldSnapshot || {};
  if (!window.confirm(`确认删除 ${label} 的这一次成长更新吗？\n\n删除后无法恢复，当前档案将回退至更新前：体重 ${growthSnapshotMetric(before, "weight", "g")}、背甲 ${growthSnapshotMetric(before, "carapaceLength", "cm")}。`)) return;

  try {
    // Deliberate history deletion uses a dedicated endpoint. It is separate
    // from the normal full-account save so the stale-device protection can
    // keep rejecting accidental history rollback while this explicit action
    // still works safely.
    if (CONFIGURED_SMS_BACKEND && state.loggedInPhone && currentCloudToken()) {
      const result = await apiPost("/api/account/growth-record/delete", {
        phone: state.loggedInPhone,
        token: currentCloudToken(),
        turtleId,
        historyId
      });
      if (result.user) {
        applyCloudUser(result.user, "", { skipCloud: true, skipMigration: true, page: "growth" });
        toast("已删除这一次成长更新，档案数据已回退");
        return;
      }
    }
    const rebuilt = deleteGrowthRecordAndRebuild(turtle, historyId);
    if (!rebuilt) return toast("未找到这条成长记录");
    setState({
      turtles: state.turtles.map(item => item.id === turtleId ? rebuilt.turtle : item),
      activityLogs: logActivity(`删除成长记录：${turtleLabel(turtle)} · ${label}`, "档案")
    }, { page: "growth" });
    toast("已删除这一次成长更新，档案数据已回退");
  } catch (error) {
    console.warn(error.message || "删除成长记录失败");
    // The deployed server may temporarily be older than this web build and
    // not yet expose the dedicated deletion endpoint.  Keep deletion usable
    // during a rolling upgrade: the legacy save path still carries the fully
    // rebuilt timeline and will be replaced by the protected endpoint as soon
    // as the server is updated.
    if (Number(error?.status) === 405 || String(error?.message || "") === "方法不支持") {
      const rebuilt = deleteGrowthRecordAndRebuild(turtle, historyId);
      if (!rebuilt) return toast("未找到这条成长记录");
      setState({
        turtles: state.turtles.map(item => item.id === turtleId ? rebuilt.turtle : item),
        activityLogs: logActivity(`删除成长记录：${turtleLabel(turtle)} · ${label}`, "档案")
      }, { page: "growth" });
      toast("已删除这一次成长更新，档案数据已回退");
      return;
    }
    toast(error.message || "删除失败，请稍后重试");
  }
}

function submitTurtleDetail(event) {
  event.preventDefault();
  if (!requireLogin()) return;
  const turtle = state.turtles.find(t => t.id === state.selectedTurtleId);
  if (!turtle) return;
  const form = new FormData(event.currentTarget);
  const species = speciesByCode(form.get("speciesCode"));
  if (!species) return toast("请先选择品种");
  const weight = Number(form.get("weight"));
  const carapaceLength = Number(form.get("carapaceLength"));
  if (Number.isNaN(weight) || weight <= 0) return toast("当前体重需要填写大于 0 的数字");
  if (Number.isNaN(carapaceLength) || carapaceLength <= 0) return toast("背甲长度需要填写大于 0 的数字");
  const sameWeight = Math.abs(weight - Number(turtle.weight || 0)) < 0.000001;
  const sameCarapaceLength = Math.abs(carapaceLength - Number(turtle.carapaceLength || 0)) < 0.000001;
  if (sameWeight && sameCarapaceLength) {
    return toast("体重和背甲长度均未变化，本次不新增成长更新");
  }
  const updated = {
    ...turtle,
    code: String(form.get("code") || "").trim() || turtle.code,
    speciesCode: species.code,
    speciesName: species.name,
    poolId: (state.turtlePools || []).some(pool => pool.id === String(form.get("poolId") || "")) ? String(form.get("poolId") || "") : "",
    gender: String(form.get("gender") || "未知"),
    weight,
    carapaceLength,
    carapaceWidth: String(form.get("carapaceWidth") || ""),
    shellHeight: String(form.get("shellHeight") || ""),
    plastronLength: String(form.get("plastronLength") || ""),
    status: turtle.status || "正常饲养",
    // 以下字段是建档基础资料，不应在成长记录中被重置。
    health: turtle.health || "健康",
    acquiredDate: turtle.acquiredDate || "",
    source: turtle.source || "购买",
    price: turtle.price || "",
    note: String(form.get("note") || ""),
    photo: state.updateDraftPhoto === "__CLEAR__" ? "" : state.updateDraftPhoto || turtle.photo || speciesPhoto(species) || defaultPhoto
  };
  const historyItem = {
    id: crypto.randomUUID(),
    oldLength: Number(turtle.carapaceLength || 0),
    newLength: carapaceLength,
    oldPhoto: turtle.photo || defaultPhoto,
    newPhoto: updated.photo || defaultPhoto,
    oldSnapshot: {
      code: turtle.code,
      weight: turtle.weight,
      carapaceLength: turtle.carapaceLength,
      status: turtle.status,
      health: turtle.health,
      poolId: turtle.poolId || "",
      poolName: turtlePoolName(turtle.poolId)
    },
    newSnapshot: {
      code: updated.code,
      weight: updated.weight,
      carapaceLength: updated.carapaceLength,
      status: updated.status,
      health: updated.health,
      poolId: updated.poolId || "",
      poolName: turtlePoolName(updated.poolId)
    },
    updatedAt: new Date().toISOString()
  };
  const keptSpecies = state.keptSpecies.includes(species.code) ? state.keptSpecies : [...state.keptSpecies, species.code];
  saveWithDeferredImages({
    turtles: state.turtles.map(t => t.id === turtle.id ? {
      ...updated,
      measureHistory: [historyItem, ...(t.measureHistory || [])]
    } : t),
    keptSpecies,
    updatingTurtleId: "",
    turtleDetailDraftId: "",
    turtleDetailDraft: null,
    updateDraftPhoto: "",
    activityLogs: logActivity(`更新档案：${turtleLabel(updated)}，背甲 ${historyItem.oldLength}cm → ${carapaceLength}cm${state.updateDraftPhoto ? "，并更换照片" : ""}`, "档案")
  }, [updated.photo, historyItem.newPhoto]);
  toast("档案已更新，旧记录已经留存");
}

function submitTurtle(event) {
  event.preventDefault();
  if (!requireArchiveCapacity()) return;
  const form = new FormData(event.currentTarget);
  const species = speciesByCode(form.get("speciesCode"));
  if (!species) return toast("先选择一个品种，再保存档案");
  const code = form.get("code") || `${species.code}-${state.turtles.filter(t => t.speciesCode === species.code).length + 1}`;
  const turtle = {
    id: crypto.randomUUID(),
    code,
    speciesCode: species.code,
    speciesName: species.name,
    poolId: (state.turtlePools || []).some(pool => pool.id === String(form.get("poolId") || "")) ? String(form.get("poolId") || "") : "",
    gender: state.formGender,
    weight: Number(form.get("weight")),
    carapaceLength: Number(form.get("carapaceLength")),
    carapaceWidth: form.get("carapaceWidth"),
    shellHeight: form.get("shellHeight"),
    plastronLength: form.get("plastronLength"),
    status: form.get("status"),
    health: form.get("health"),
    acquiredDate: form.get("acquiredDate"),
    source: form.get("source"),
    price: form.get("price"),
    note: form.get("note"),
    photo: state.formPhoto || speciesPhoto(species),
    createdAt: new Date().toISOString(),
    measureHistory: []
  };
  const keptSpecies = state.keptSpecies.includes(species.code) ? state.keptSpecies : [...state.keptSpecies, species.code];
  const ledgerRecords = [...state.ledgerRecords];
  const logs = [makeActivity(`新增档案：${turtleLabel(turtle)}`, "档案")];
  if (turtle.source === "购买") {
    ledgerRecords.unshift({
      id: crypto.randomUUID(),
      type: "purchase",
      turtleId: turtle.id,
      title: turtleLabel(turtle),
      amount: Number(turtle.price || 0),
      recordDate: turtle.acquiredDate,
      weight: turtle.weight,
      carapaceLength: turtle.carapaceLength,
      carapaceWidth: turtle.carapaceWidth,
      shellHeight: turtle.shellHeight,
      plastronLength: turtle.plastronLength,
      note: turtle.note,
      photo: turtle.photo,
      turtleSnapshot: { ...turtle },
      createdAt: new Date().toISOString()
    });
    logs.unshift(makeActivity(`购买入账：${turtleLabel(turtle)}，金额 ${money(turtle.price)} 元`, "账本"));
  }
  saveWithDeferredImages({
    turtles: [turtle, ...state.turtles],
    keptSpecies,
    ledgerRecords,
    formPhoto: "",
    formGender: "未知",
    formDraft: {},
    selectedSpeciesCode: "",
    page: "home",
    activityLogs: [...logs, ...(state.activityLogs || [])]
  }, [turtle.photo]);
  toast(turtle.source === "购买" ? "档案已保存，并已同步到收购账本" : "档案已保存");
}

function submitMemoForm(event) {
  event.preventDefault();
  if (!requireLogin()) return;
  const form = new FormData(event.currentTarget);
  const title = String(form.get("title") || "").trim();
  if (!title) return toast("先写一个护理事项名称");
  const content = String(form.get("content") || "").trim();
  const remindTime = String(form.get("remindTime") || "").trim();
  const repeat = form.get("repeat") === "true";
  const weekdays = form.getAll("weekdays").map(String);
  const now = new Date().toISOString();
  const editingMemo = state.memos.find(m => m.id === state.memoEditingId);
  const savedMemo = editingMemo
    ? { ...editingMemo, title, content, remindTime, repeat, weekdays, updatedAt: now }
    : { id: crypto.randomUUID(), title, content, remindTime, repeat, weekdays, updatedAt: now };
  const nextMemos = editingMemo
    ? state.memos.map(m => m.id === editingMemo.id ? savedMemo : m)
    : [savedMemo, ...state.memos];
  setState({
    memos: nextMemos,
    memoDraftOpen: false,
    memoEditingId: "",
    activityLogs: logActivity(`${editingMemo ? "调整护理" : "新增护理"}：${title}`, "护理")
  });
  activateCareReminder(savedMemo);
}

function deleteMemo(id) {
  if (!requireLogin()) return;
  const memo = state.memos.find(m => m.id === id);
  if (!memo || !confirm("要删除这条护理提醒吗？")) return;
  cancelNativeCareReminder(memo);
  setState({ memos: state.memos.filter(m => m.id !== id), activityLogs: logActivity(`删除护理：${memo.title}`, "护理") });
}

function submitTurtlePool(event) {
  event.preventDefault();
  if (!requireLogin()) return;
  const form = new FormData(event.currentTarget);
  const name = String(form.get("name") || "").trim();
  const type = String(form.get("type") || "");
  if (!name || !type) return toast("请填写龟池名称并选择龟池类型");
  const parseOptionalSize = field => {
    const value = String(form.get(field) || "").trim();
    return value && Number(value) >= 0 ? value : "";
  };
  const rawCount = String(form.get("count") || "").trim();
  const count = rawCount === "" ? 0 : Number(rawCount);
  if (!Number.isFinite(count) || count < 0) return toast("养殖数量请填写为不小于 0 的数字");
  const existing = (state.turtlePools || []).find(pool => pool.id === state.editingTurtlePoolId);
  const now = new Date().toISOString();
  const pool = {
    id: existing?.id || crypto.randomUUID(),
    name,
    type,
    length: parseOptionalSize("length"),
    width: parseOptionalSize("width"),
    height: parseOptionalSize("height"),
    count: Math.floor(count),
    note: String(form.get("note") || "").trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  const turtlePools = existing
    ? (state.turtlePools || []).map(item => item.id === existing.id ? pool : item)
    : [pool, ...(state.turtlePools || [])];
  setState({
    turtlePools,
    editingTurtlePoolId: "",
    page: "pools",
    activityLogs: logActivity(`${existing ? "更新" : "新增"}龟池：${name}，${turtlePoolTypeLabel(type)}，${pool.count} 只`, "龟池")
  });
  toast(existing ? "龟池已更新" : "龟池已添加");
}

function deleteTurtlePool(id) {
  if (!requireLogin()) return;
  const pool = (state.turtlePools || []).find(item => item.id === id);
  if (!pool || !confirm(`要删除龟池“${pool.name || "未命名"}”吗？`)) return;
  setState({
    turtlePools: (state.turtlePools || []).filter(item => item.id !== id),
    editingTurtlePoolId: "",
    page: "pools",
    activityLogs: logActivity(`删除龟池：${pool.name || "未命名龟池"}`, "龟池")
  });
  toast("龟池已删除");
}

function openLedgerForm(type, turtleId = "") {
  if (!requireLogin()) return;
  // 收购始终新建档案；只有售出、损耗才可以操作既有档案。
  const linkedTurtleId = ["sold", "loss"].includes(type) ? turtleId : "";
  const turtle = state.turtles.find(t => t.id === linkedTurtleId);
  const initialPoolId = (type === "purchase" || type === "loss") ? (turtle?.poolId || "") : "";
  setState({ page: "ledger", ledgerDraftType: type, ledgerDraftPhoto: turtle?.photo || "", ledgerDraftTurtleId: linkedTurtleId, ledgerDraftForm: linkedTurtleId ? { turtleId: linkedTurtleId, poolId: initialPoolId } : { poolId: initialPoolId, otherCategory: type === "other" ? "龟粮" : "" }, ledgerPurchaseGender: "未知", ledgerTab: type, openTurtleMenuId: "" }, { pageScroll: "preserve" });
  requestAnimationFrame(() => requestAnimationFrame(scrollLedgerFormIntoView));
}

function scrollLedgerFormIntoView() {
  const form = document.querySelector("#ledgerForm");
  if (!form) return;
  const topbarHeight = document.querySelector(".topbar")?.getBoundingClientRect().height || 0;
  const targetTop = window.scrollY + form.getBoundingClientRect().top - topbarHeight - 10;
  window.scrollTo({ top: Math.max(0, targetTop), left: 0, behavior: "smooth" });
}

async function readLedgerPhoto(event) {
  if (!requireLogin()) return;
  const input = event.target;
  const file = input.files?.[0];
  if (!file) return;
  const draft = captureLedgerFormDraft();
  try {
    const photo = await readImageForLocalUse(file, "ledger");
    input.value = "";
    setState({ ledgerDraftForm: draft, ledgerDraftPhoto: photo, ledgerDraftTurtleId: draft.turtleId || state.ledgerDraftTurtleId, ledgerPurchaseGender: draft.purchaseGender || state.ledgerPurchaseGender }, { skipCloud: true });
  } catch (error) {
    input.value = "";
    toast(error.message || "图片读取失败");
  }
}

async function readBreedingPhoto(event) {
  if (!requireLogin()) return;
  const input = event.target;
  const file = input.files?.[0];
  if (!file) return;
  const draft = readBreedingDraft();
  try {
    const photo = await readImageForLocalUse(file, "breeding");
    input.value = "";
    setState({ ...draft, breedingDraftPhoto: photo }, { skipCloud: true });
  } catch (error) {
    input.value = "";
    toast(error.message || "图片读取失败");
  }
}

async function readBreedingEditPhoto(event) {
  if (!requireLogin()) return;
  const input = event.target;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const photo = await readImageForLocalUse(file, "breeding");
    input.value = "";
    setState({ breedingEditPhoto: photo }, { skipCloud: true });
  } catch (error) {
    input.value = "";
    toast(error.message || "图片读取失败");
  }
}

function readBreedingDraft() {
  const form = document.querySelector("#breedingForm");
  if (!form) return {};
  const data = new FormData(form);
  return {
    breedingDraftDate: String(data.get("date") || ""),
    breedingPoolId: String(data.get("poolId") || ""),
    breedingManualMother: String(data.get("manualMother") || ""),
    breedingEggCount: String(data.get("eggCount") || ""),
    breedingFertileCount: String(data.get("fertileCount") || ""),
    breedingHatchCount: String(data.get("hatchCount") || ""),
    breedingNote: String(data.get("note") || "")
  };
}

function submitBreedingDetail(event) {
  event.preventDefault();
  if (!requireLogin()) return;
  const form = new FormData(event.currentTarget);
  const record = (state.breedingRecords || []).find(item => item.id === state.selectedBreedingId);
  if (!record) return;
  const motherId = String(form.get("mother") || "manual");
  const mother = state.turtles.find(t => t.id === motherId);
  const poolId = (state.turtlePools || []).some(pool => pool.id === String(form.get("poolId") || "")) ? String(form.get("poolId") || "") : "";
  const poolName = turtlePoolName(poolId);
  const manualMother = String(form.get("manualMother") || "").trim();
  const eggCount = Number(form.get("eggCount"));
  const fertileCount = Number(form.get("fertileCount"));
  const hatchCount = Number(form.get("hatchCount") || 0);
  if (Number.isNaN(eggCount) || Number.isNaN(fertileCount) || Number.isNaN(hatchCount)) return toast("请填写正确的产蛋数、受精数和孵化数");
  if (motherId === "manual" && !manualMother) return toast("请填写种母备注");
  const photo = state.breedingEditPhoto === "__CLEAR__" ? "" : state.breedingEditPhoto || record.photo || "";
  const nextMotherName = mother ? turtleLabel(mother) : manualMother;
  const historyItem = {
    id: crypto.randomUUID(),
    oldPhoto: record.photo || "",
    newPhoto: photo || "",
    oldSnapshot: {
      date: record.date,
      motherName: record.motherName,
      eggCount: record.eggCount,
      fertileCount: record.fertileCount,
      hatchCount: record.hatchCount || 0,
      poolId: record.poolId || "",
      poolName: record.poolName || turtlePoolName(record.poolId),
      note: record.note || ""
    },
    newSnapshot: {
      date: form.get("date"),
      motherName: nextMotherName,
      eggCount,
      fertileCount,
      hatchCount,
      poolId,
      poolName,
      note: String(form.get("note") || "")
    },
    updatedAt: new Date().toISOString()
  };
  const updated = {
    ...record,
    date: form.get("date"),
    motherId,
    motherName: nextMotherName,
    poolId,
    poolName,
    eggCount,
    fertileCount,
    hatchCount,
    note: form.get("note"),
    photo,
    updatedAt: historyItem.updatedAt,
    editHistory: [historyItem, ...(record.editHistory || [])]
  };
  saveWithDeferredImages({
    breedingRecords: (state.breedingRecords || []).map(item => item.id === record.id ? updated : item),
    breedingEditPhoto: "",
    page: "breedingDetail",
    activityLogs: logActivity(`修改繁殖记录：${updated.motherName}，产蛋 ${eggCount} 枚，受精 ${fertileCount} 枚，孵化 ${hatchCount} 只`, "繁殖")
  }, [photo, historyItem.newPhoto]);
  toast("繁殖记录已更新");
}

function submitBreedingRecord(event) {
  event.preventDefault();
  if (!requireLogin()) return;
  const form = new FormData(event.currentTarget);
  const motherId = form.get("mother");
  const mother = state.turtles.find(t => t.id === motherId);
  const poolId = (state.turtlePools || []).some(pool => pool.id === String(form.get("poolId") || "")) ? String(form.get("poolId") || "") : "";
  const manualMother = String(form.get("manualMother") || "").trim();
  const eggCount = Number(form.get("eggCount"));
  const fertileCount = Number(form.get("fertileCount"));
  const hatchCount = Number(form.get("hatchCount") || 0);
  if (motherId === "manual" && !manualMother) {
    toast("请填写种母的手动备注");
    return;
  }
  if (Number.isNaN(eggCount) || Number.isNaN(fertileCount) || Number.isNaN(hatchCount)) {
    toast("请填写正确的产蛋数、受精数和孵化数");
    return;
  }
  const record = {
    id: crypto.randomUUID(),
    date: form.get("date"),
    motherId,
    motherName: mother ? turtleLabel(mother) : manualMother,
    poolId,
    poolName: turtlePoolName(poolId),
    eggCount,
    fertileCount,
    hatchCount,
    note: form.get("note"),
    photo: state.breedingDraftPhoto,
    createdAt: new Date().toISOString(),
    editHistory: []
  };
  saveWithDeferredImages({
    breedingRecords: [record, ...(state.breedingRecords || [])],
    breedingDraftPhoto: "",
    breedingMotherMode: "archive",
    breedingMotherValue: "",
    breedingPoolId: "",
    breedingDraftDate: "",
    breedingManualMother: "",
    breedingEggCount: "",
    breedingFertileCount: "",
    breedingHatchCount: "",
    breedingNote: "",
    page: "breeding",
    activityLogs: logActivity(`新增繁殖记录：${record.motherName}，产蛋 ${eggCount} 枚，受精 ${fertileCount} 枚，孵化 ${hatchCount} 只`, "繁殖")
  }, [record.photo]);
  toast("繁殖记录已保存");
}

function deleteBreedingRecord(id) {
  if (!requireLogin()) return;
  const record = (state.breedingRecords || []).find(item => item.id === id);
  if (!record || !confirm("要删除这条繁殖记录吗？")) return;
  setState({
    breedingRecords: (state.breedingRecords || []).filter(item => item.id !== id),
    openBreedingMenuId: "",
    activityLogs: logActivity(`删除繁殖记录：${record.motherName || "未填写种母"}`, "繁殖")
  });
}

function submitLedgerRecord(event) {
  event.preventDefault();
  if (!requireLogin()) return;
  const form = new FormData(event.currentTarget);
  const type = state.ledgerDraftType;
  // 收购一定产生一条新档案，绝不复用已有档案。
  let turtle = type === "purchase" ? null : state.turtles.find(t => t.id === form.get("turtleId"));
  const poolId = (state.turtlePools || []).some(pool => pool.id === String(form.get("poolId") || "")) ? String(form.get("poolId") || "") : "";
  const poolName = turtlePoolName(poolId);
  const amount = Number(form.get("amount"));
  if (!type || Number.isNaN(amount) || amount < 0) return toast("请填写正确的金额");
  const otherTitle = String(form.get("otherTitle") || "").trim();
  const otherCategory = String(form.get("otherCategory") || "其他").trim();
  if (type === "other" && !otherTitle) return toast("请填写记账事项");
  let nextTurtles = state.turtles;
  let nextKeptSpecies = state.keptSpecies;
  if (type === "purchase" && !turtle) {
    if (!requireArchiveCapacity()) return;
    const species = speciesByCode(form.get("purchaseSpeciesCode"));
    if (!species) return toast("收购记录需要选择品种");
    const code = form.get("purchaseCode") || `${species.code}-${state.turtles.filter(t => t.speciesCode === species.code).length + 1}`;
    turtle = {
      id: crypto.randomUUID(),
      code,
      speciesCode: species.code,
      speciesName: species.name,
      gender: form.get("purchaseGender") || "未知",
      weight: Number(form.get("weight") || 0),
      carapaceLength: Number(form.get("carapaceLength") || 0),
      carapaceWidth: form.get("carapaceWidth"),
      shellHeight: form.get("shellHeight"),
      plastronLength: form.get("plastronLength"),
      status: form.get("purchaseStatus") || "正常饲养",
      health: form.get("purchaseHealth") || "健康",
      acquiredDate: form.get("recordDate"),
      source: "购买",
      poolId,
      price: amount,
      note: form.get("note"),
      photo: state.ledgerDraftPhoto || speciesPhoto(species),
      createdAt: new Date().toISOString(),
      measureHistory: []
    };
    nextTurtles = [turtle, ...state.turtles];
    nextKeptSpecies = state.keptSpecies.includes(species.code) ? state.keptSpecies : [...state.keptSpecies, species.code];
  }
  if (type === "purchase" && turtle && poolId && nextTurtles.some(item => item.id === turtle.id)) {
    turtle = { ...turtle, poolId };
    nextTurtles = nextTurtles.map(item => item.id === turtle.id ? turtle : item);
  }
  if ((type === "sold" || type === "loss") && turtle) nextTurtles = nextTurtles.filter(t => t.id !== turtle.id);
  const title = type === "other" ? otherTitle : (turtle ? turtleLabel(turtle) : (String(form.get("note") || "").trim().split(/[，。\n]/)[0] || "未关联档案"));
  const record = {
    id: crypto.randomUUID(),
    type,
    turtleId: turtle?.id || (type === "purchase" ? "" : form.get("turtleId")),
    poolId,
    poolName,
    title,
    category: type === "other" ? otherCategory : "",
    amount,
    recordDate: form.get("recordDate"),
    weight: form.get("weight"),
    carapaceLength: form.get("carapaceLength"),
    carapaceWidth: form.get("carapaceWidth"),
    shellHeight: form.get("shellHeight"),
    plastronLength: form.get("plastronLength"),
    note: form.get("note"),
    photo: state.ledgerDraftPhoto,
    turtleSnapshot: turtle ? { ...turtle } : null,
    createdAt: new Date().toISOString()
  };
  const movedText = (type === "sold" || type === "loss") && turtle ? "，已从档案移出" : "";
  saveWithDeferredImages({
    turtles: nextTurtles,
    keptSpecies: nextKeptSpecies,
    ledgerRecords: [record, ...state.ledgerRecords],
    ledgerTab: type,
    ledgerDraftType: "",
    ledgerDraftPhoto: "",
    ledgerDraftTurtleId: "",
    ledgerDraftForm: {},
    ledgerPurchaseGender: "未知",
    activityLogs: logActivity(`${ledgerTypeText(type)}记录：${title}，金额 ${money(amount)} 元${movedText}`, "账本")
  }, [record.photo, turtle?.photo]);
  toast(`${ledgerTypeText(type)}记录已保存`);
}

function deleteLedgerRecord(id) {
  if (!requireLogin()) return;
  const record = state.ledgerRecords.find(item => item.id === id);
  if (!record || !confirm("要删除这条账本记录吗？")) return;
  setState({ ledgerRecords: state.ledgerRecords.filter(item => item.id !== id), openLedgerMenuId: "", activityLogs: logActivity(`删除账本记录：${record.title}`, "账本") });
}

function toast(text) {
  const now = Date.now();
  if (text === lastToastText && now - lastToastAt < 1500) return;
  lastToastText = text;
  lastToastAt = now;
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function attachPreviewZoom(stage, media, { onSwipe, canSwipe, onSwipeMove, onSwipeSettle, nativePager = false } = {}) {
  const pointers = new Map();
  // A gallery preview uses the WebKit scroll view for paging.  `media` is a
  // resolver in that case because the visible slide changes while the stage
  // itself remains mounted.  Pinch/pan always applies only to that slide.
  const resolveMedia = () => typeof media === "function" ? media() : media;
  const maxScale = 4;
  let scale = 1;
  let translateX = 0;
  let translateY = 0;
  let primaryGesture = null;
  let pinchGesture = null;
  let moved = false;
  let suppressBlankClickUntil = 0;
  let lastTapAt = 0;
  let paintFrame = 0;
  let swipePaintFrame = 0;
  let pendingSwipeX = 0;
  let stageWidth = Math.max(1, stage.clientWidth || 1);
  let stageHeight = Math.max(1, stage.clientHeight || 1);
  let stageCenterX = 0;
  let stageCenterY = 0;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const pointDistance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
  const pointMidpoint = (first, second) => ({ x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 });
  const refreshStageMetrics = () => {
    stageWidth = Math.max(1, stage.clientWidth || 1);
    stageHeight = Math.max(1, stage.clientHeight || 1);
    const bounds = stage.getBoundingClientRect();
    stageCenterX = bounds.left + bounds.width / 2;
    stageCenterY = bounds.top + bounds.height / 2;
  };
  refreshStageMetrics();
  const stageResizeObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver(refreshStageMetrics)
    : null;
  stageResizeObserver?.observe(stage);
  const limitTranslation = () => {
    const maxX = Math.max(0, (stageWidth * (scale - 1)) / 2);
    const maxY = Math.max(0, (stageHeight * (scale - 1)) / 2);
    translateX = clamp(translateX, -maxX, maxX);
    translateY = clamp(translateY, -maxY, maxY);
  };
  const paintNow = (animate = false) => {
    const targetMedia = resolveMedia();
    if (!targetMedia) return;
    if (scale <= 1.005) {
      scale = 1;
      translateX = 0;
      translateY = 0;
      stage.classList.remove("is-zoomed", "is-zooming");
      targetMedia.style.removeProperty("transform");
      targetMedia.style.removeProperty("transition");
      return;
    }
    limitTranslation();
    stage.classList.add("is-zoomed", "is-zooming");
    targetMedia.style.transition = animate ? "transform .18s ease" : "none";
    targetMedia.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`;
  };
  // Pointer events can arrive far faster than the screen can draw.  Coalesce
  // all move updates into one compositor transform per frame instead of
  // forcing a layout/style update for every touch sample.
  const paint = (animate = false, immediate = false) => {
    if (paintFrame && (animate || immediate || scale <= 1.005)) {
      cancelAnimationFrame(paintFrame);
      paintFrame = 0;
    }
    if (animate || immediate || scale <= 1.005) {
      paintNow(animate);
      return;
    }
    if (paintFrame) return;
    paintFrame = requestAnimationFrame(() => {
      paintFrame = 0;
      paintNow(false);
    });
  };
  const paintSwipe = (translateX, immediate = false) => {
    const targetMedia = resolveMedia();
    if (!targetMedia) return;
    pendingSwipeX = translateX;
    const paintNow = () => {
      swipePaintFrame = 0;
      targetMedia.style.transition = "none";
      targetMedia.style.transform = `translate3d(${Math.round(pendingSwipeX)}px, 0, 0)`;
    };
    if (immediate) {
      if (swipePaintFrame) cancelAnimationFrame(swipePaintFrame);
      paintNow();
      return;
    }
    if (!swipePaintFrame) swipePaintFrame = requestAnimationFrame(paintNow);
  };
  const clearSwipePaint = () => {
    const targetMedia = resolveMedia();
    if (swipePaintFrame) cancelAnimationFrame(swipePaintFrame);
    swipePaintFrame = 0;
    pendingSwipeX = 0;
    targetMedia?.style.removeProperty("transform");
    targetMedia?.style.removeProperty("transition");
  };
  const reset = (animate = true) => {
    if (scale <= 1.005) {
      paint(false, true);
      return;
    }
    scale = 1;
    translateX = 0;
    translateY = 0;
    if (!animate) {
      paint(false, true);
      return;
    }
    stage.classList.remove("is-zoomed", "is-zooming");
    const targetMedia = resolveMedia();
    if (!targetMedia) return;
    targetMedia.style.transition = "transform .18s ease";
    targetMedia.style.transform = "translate3d(0, 0, 0) scale(1)";
    window.setTimeout(() => {
      if (!stage.isConnected || scale > 1.005) return;
      const currentMedia = resolveMedia();
      currentMedia?.style.removeProperty("transform");
      currentMedia?.style.removeProperty("transition");
    }, 190);
  };
  const beginPinch = () => {
    const [first, second] = [...pointers.values()];
    if (!first || !second) return;
    const midpoint = pointMidpoint(first, second);
    refreshStageMetrics();
    pinchGesture = {
      distance: Math.max(1, pointDistance(first, second)),
      midpoint,
      scale,
      translateX,
      translateY,
      centerX: stageCenterX,
      centerY: stageCenterY
    };
    primaryGesture = null;
    moved = true;
    stage.classList.add("is-dragging");
  };
  const setPointer = event => pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const pointerDown = event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    refreshStageMetrics();
    setPointer(event);
    // Pointer capture would steal the native iOS pager from the first finger.
    // Take ownership only once a pinch is in progress.
    if (!nativePager || pointers.size >= 2) {
      try { stage.setPointerCapture(event.pointerId); } catch {}
    }
    if (pointers.size >= 2) {
      beginPinch();
      event.preventDefault();
      return;
    }
    primaryGesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      lastAt: performance.now(),
      velocityX: 0
    };
    moved = false;
  };
  const pointerMove = event => {
    if (!pointers.has(event.pointerId)) return;
    setPointer(event);
    if (pointers.size >= 2) {
      if (!pinchGesture) beginPinch();
      const [first, second] = [...pointers.values()];
      const midpoint = pointMidpoint(first, second);
      const ratio = pointDistance(first, second) / Math.max(1, pinchGesture.distance);
      const nextScale = clamp(pinchGesture.scale * ratio, 1, maxScale);
      const scaleRatio = nextScale / Math.max(1, pinchGesture.scale);
      scale = nextScale;
      translateX = pinchGesture.translateX + (pinchGesture.midpoint.x - pinchGesture.centerX) * (1 - scaleRatio) + (midpoint.x - pinchGesture.midpoint.x);
      translateY = pinchGesture.translateY + (pinchGesture.midpoint.y - pinchGesture.centerY) * (1 - scaleRatio) + (midpoint.y - pinchGesture.midpoint.y);
      paint(false);
      event.preventDefault();
      return;
    }
    if (!primaryGesture || event.pointerId !== primaryGesture.pointerId) return;
    const deltaX = event.clientX - primaryGesture.startX;
    const deltaY = event.clientY - primaryGesture.startY;
    const now = performance.now();
    const elapsed = Math.max(1, now - primaryGesture.lastAt);
    primaryGesture.velocityX = (event.clientX - primaryGesture.lastX) / elapsed;
    primaryGesture.lastX = event.clientX;
    primaryGesture.lastY = event.clientY;
    primaryGesture.lastAt = now;
    if (Math.hypot(deltaX, deltaY) > 4) moved = true;
    if (!moved) return;
    // At normal scale, paging is owned by the WebKit UIScrollView.  Do not
    // transform or cancel its touch stream from JavaScript.
    if (nativePager && scale <= 1.005) return;
    stage.classList.add("is-dragging");
    if (scale > 1.005) {
      if (primaryGesture.panStartX === undefined) {
        primaryGesture.panStartX = primaryGesture.startX;
        primaryGesture.panStartY = primaryGesture.startY;
        primaryGesture.panBaseX = translateX;
        primaryGesture.panBaseY = translateY;
      }
      translateX = primaryGesture.panBaseX + (event.clientX - primaryGesture.panStartX);
      translateY = primaryGesture.panBaseY + (event.clientY - primaryGesture.panStartY);
      paint(false);
      event.preventDefault();
      return;
    }
    const supportsSwipe = typeof onSwipe === "function" || typeof onSwipeMove === "function" || typeof onSwipeSettle === "function";
    if (!supportsSwipe) return;
    const atLeadingEdge = typeof canSwipe === "function" && !canSwipe(-1);
    const atTrailingEdge = typeof canSwipe === "function" && !canSwipe(1);
    // Between valid neighbours the preview must be 1:1 with the finger so
    // the next picture is revealed by exactly the amount the user drags.
    // Keep resistance only when there is no picture beyond the current edge.
    const resistance = (atLeadingEdge && deltaX > 0) || (atTrailingEdge && deltaX < 0) ? 0.28 : 1;
    const swipeTranslateX = deltaX * resistance;
    if (typeof onSwipeMove === "function") onSwipeMove({ translateX: swipeTranslateX, rawDeltaX: deltaX, width: stageWidth });
    else paintSwipe(swipeTranslateX);
    event.preventDefault();
  };
  const finishPointer = event => {
    if (!pointers.has(event.pointerId)) return;
    const current = pointers.get(event.pointerId);
    const wasPrimary = primaryGesture?.pointerId === event.pointerId;
    try { stage.releasePointerCapture(event.pointerId); } catch {}
    pointers.delete(event.pointerId);
    if (pointers.size >= 2) {
      beginPinch();
      return;
    }
    if (pointers.size === 1 && pinchGesture) {
      const [remainingId, remaining] = pointers.entries().next().value;
      primaryGesture = {
        pointerId: remainingId,
        startX: remaining.x,
        startY: remaining.y,
        lastX: remaining.x,
        lastY: remaining.y,
        lastAt: performance.now(),
        velocityX: 0,
        panStartX: remaining.x,
        panStartY: remaining.y,
        panBaseX: translateX,
        panBaseY: translateY
      };
      pinchGesture = null;
      return;
    }
    if (pointers.size) return;
    stage.classList.remove("is-dragging");
    const gesture = wasPrimary ? primaryGesture : null;
    primaryGesture = null;
    pinchGesture = null;
    if (moved) suppressBlankClickUntil = Date.now() + 300;
    if (scale > 1.005) {
      limitTranslation();
      paint(true);
      return;
    }
    if (nativePager && moved) {
      clearSwipePaint();
      return;
    }
    const supportsSwipe = typeof onSwipe === "function" || typeof onSwipeMove === "function" || typeof onSwipeSettle === "function";
    if (gesture && moved && supportsSwipe) {
      const distance = (current?.x ?? gesture.lastX) - gesture.startX;
      const projected = distance + (gesture.velocityX * 160);
      const threshold = Math.max(44, stageWidth * 0.14);
      const travel = Math.abs(projected) >= threshold ? projected : distance;
      const offset = Math.abs(travel) >= threshold ? (travel < 0 ? 1 : -1) : 0;
      const handled = typeof onSwipeSettle === "function"
        ? onSwipeSettle({ offset, distance, width: stageWidth, velocityX: gesture.velocityX }) === true
        : false;
      if (!handled) clearSwipePaint();
      if (offset && !handled && typeof onSwipe === "function") onSwipe(offset);
      return;
    }
    clearSwipePaint();
    if (!moved && event.pointerType !== "mouse") {
      const now = Date.now();
      if (now - lastTapAt < 280) {
        scale = 2.35;
        translateX = (stageCenterX - (current?.x ?? stageCenterX)) * .4;
        translateY = (stageCenterY - (current?.y ?? stageCenterY)) * .4;
        paint(true);
        suppressBlankClickUntil = now + 320;
        lastTapAt = 0;
      } else {
        lastTapAt = now;
      }
    }
  };
  const doubleClick = event => {
    event.preventDefault();
    if (scale > 1.005) reset(true);
    else {
      scale = 2.35;
      refreshStageMetrics();
      translateX = (stageCenterX - event.clientX) * .4;
      translateY = (stageCenterY - event.clientY) * .4;
      paint(true);
    }
    suppressBlankClickUntil = Date.now() + 320;
  };
  stage.addEventListener("pointerdown", pointerDown, { passive: false });
  stage.addEventListener("pointermove", pointerMove, { passive: false });
  stage.addEventListener("pointerup", finishPointer);
  stage.addEventListener("pointercancel", finishPointer);
  stage.addEventListener("dblclick", doubleClick);
  return {
    reset,
    isZoomed: () => scale > 1.005,
    shouldIgnoreBlankClick: () => Date.now() < suppressBlankClickUntil,
    destroy: () => {
      if (paintFrame) cancelAnimationFrame(paintFrame);
      if (swipePaintFrame) cancelAnimationFrame(swipePaintFrame);
      stageResizeObserver?.disconnect();
      stage.removeEventListener("pointerdown", pointerDown);
      stage.removeEventListener("pointermove", pointerMove);
      stage.removeEventListener("pointerup", finishPointer);
      stage.removeEventListener("pointercancel", finishPointer);
      stage.removeEventListener("dblclick", doubleClick);
    }
  };
}

function openImagePreview(src, alt = "图片预览", options = {}) {
  const existing = document.querySelector(".image-preview-overlay");
  if (typeof existing?.__closePreview === "function") existing.__closePreview();
  else existing?.remove();

  const gallery = (Array.isArray(options.gallery) ? options.gallery : [{ src, alt }])
    .map(item => ({ src: String(item?.src || ""), alt: String(item?.alt || alt) }))
    .filter(item => item.src);
  if (!gallery.length) return;
  let activeIndex = Math.max(0, Math.min(gallery.length - 1, Number(options.index) || 0));
  const isGallery = gallery.length > 1;

  const overlay = document.createElement("div");
  overlay.className = `image-preview-overlay${isGallery ? " image-preview-gallery-overlay" : ""}`;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", alt);

  const closeButton = document.createElement("button");
  closeButton.className = "image-preview-close";
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "关闭图片预览");
  closeButton.textContent = "×";

  const stage = document.createElement("div");
  stage.className = "image-preview-stage";
  let image;
  let currentSlide;
  let neighbourSlide;
  let neighbourImage;
  let nativePreviewImages = [];
  if (isGallery) {
    // Safari's own paging scroll view is the only layer that moves images at
    // normal scale. It is intentionally separate from the pinch layer below.
    stage.classList.add("uses-native-preview-gallery");
    const nativeTrack = document.createElement("div");
    nativeTrack.className = "image-preview-native-track";
    nativeTrack.style.setProperty("--image-preview-slide-count", String(gallery.length));
    nativePreviewImages = gallery.map((item, index) => {
      const slide = document.createElement("div");
      slide.className = "image-preview-native-slide";
      const previewImage = document.createElement("img");
      previewImage.src = item.src;
      previewImage.alt = item.alt;
      previewImage.decoding = "async";
      previewImage.draggable = false;
      previewImage.fetchPriority = index < 2 ? "high" : "auto";
      slide.appendChild(previewImage);
      nativeTrack.appendChild(slide);
      return previewImage;
    });
    stage.appendChild(nativeTrack);
    image = nativePreviewImages[activeIndex];
  } else {
    currentSlide = document.createElement("div");
    currentSlide.className = "image-preview-slide image-preview-current-slide";
    image = document.createElement("img");
    image.decoding = "async";
    currentSlide.appendChild(image);
    neighbourSlide = document.createElement("div");
    neighbourSlide.className = "image-preview-slide image-preview-neighbour-slide";
    neighbourSlide.hidden = true;
    neighbourImage = document.createElement("img");
    neighbourImage.decoding = "async";
    neighbourImage.alt = "";
    neighbourSlide.appendChild(neighbourImage);
    stage.append(currentSlide, neighbourSlide);
  }

  const caption = document.createElement("span");
  caption.className = "image-preview-caption";
  const previous = document.createElement("button");
  previous.className = "image-preview-gallery-arrow prev";
  previous.type = "button";
  previous.textContent = "‹";
  previous.setAttribute("aria-label", "查看上一张图片");
  const next = document.createElement("button");
  next.className = "image-preview-gallery-arrow next";
  next.type = "button";
  next.textContent = "›";
  next.setAttribute("aria-label", "查看下一张图片");

  overlay.append(closeButton, stage, caption);
  if (isGallery) overlay.append(previous, next);
  document.body.appendChild(overlay);
  document.body.classList.add("image-preview-open");

  let switchTimer = 0;
  let switchSequence = 0;
  let previewDrag = null;
  let previewDragTimer = 0;
  let previewDragFrame = 0;
  let pendingPreviewDrag = null;
  let previewZoom = null;
  const update = (direction = 0, animate = false) => {
    previewZoom?.reset(false);
    const item = gallery[activeIndex];
    if (isGallery) {
      image = nativePreviewImages[activeIndex] || nativePreviewImages[0];
      caption.textContent = `${item.alt}  ${activeIndex + 1}/${gallery.length}`;
      previous.disabled = activeIndex === 0;
      next.disabled = activeIndex === gallery.length - 1;
      warmAdjacentPreviewImages();
      return;
    }
    image.src = item.src;
    image.alt = item.alt;
    caption.textContent = isGallery ? `${item.alt}  ${activeIndex + 1}/${gallery.length}` : item.alt;
    previous.disabled = activeIndex === 0;
    next.disabled = activeIndex === gallery.length - 1;
    if (isGallery) warmAdjacentPreviewImages();
    if (!animate) return;
    image.classList.remove("is-entering-from-left", "is-entering-from-right");
    image.classList.add(direction > 0 ? "is-entering-from-right" : "is-entering-from-left");
    requestAnimationFrame(() => image.classList.remove("is-entering-from-left", "is-entering-from-right"));
  };
  const previewPreloads = new Map();
  const preloadPreviewImage = source => {
    const existing = previewPreloads.get(source);
    if (existing) return existing;
    const pending = new Promise(resolve => {
    const cachedImage = new Image();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    cachedImage.addEventListener("load", () => {
      if (typeof cachedImage.decode === "function") {
        cachedImage.decode().catch(() => {}).then(finish);
      } else {
        finish();
      }
    }, { once: true });
    cachedImage.addEventListener("error", finish, { once: true });
    cachedImage.src = source;
    if (cachedImage.complete) {
      if (typeof cachedImage.decode === "function") {
        cachedImage.decode().catch(() => {}).then(finish);
      } else {
        finish();
      }
    }
    });
    previewPreloads.set(source, pending);
    return pending;
  };
  const warmAdjacentPreviewImages = () => {
    [activeIndex - 1, activeIndex + 1].forEach(index => {
      if (gallery[index]?.src) void preloadPreviewImage(gallery[index].src);
    });
  };
  const clearPreviewDrag = () => {
    window.clearTimeout(previewDragTimer);
    previewDragTimer = 0;
    if (previewDragFrame) cancelAnimationFrame(previewDragFrame);
    previewDragFrame = 0;
    pendingPreviewDrag = null;
    previewDrag = null;
    if (!currentSlide || !neighbourSlide) return;
    currentSlide.style.removeProperty("transition");
    currentSlide.style.removeProperty("transform");
    neighbourSlide.style.removeProperty("transition");
    neighbourSlide.style.removeProperty("transform");
    neighbourSlide.hidden = true;
  };
  const preparePreviewDrag = (direction, width) => {
    const target = activeIndex + direction;
    if (!isGallery || !gallery[target]) return null;
    if (previewDrag?.direction === direction && previewDrag.target === target) return previewDrag;
    previewDrag = { direction, target, width: Math.max(1, width) };
    neighbourImage.src = gallery[target].src;
    neighbourImage.alt = gallery[target].alt;
    neighbourSlide.hidden = false;
    return previewDrag;
  };
  const paintPreviewDrag = ({ translateX, rawDeltaX, width }) => {
    if (!isGallery) return;
    const direction = rawDeltaX < 0 ? 1 : -1;
    const drag = preparePreviewDrag(direction, width);
    const offset = Math.max(-width, Math.min(width, translateX));
    currentSlide.style.transition = "none";
    currentSlide.style.transform = `translate3d(${offset}px, 0, 0)`;
    if (!drag) return;
    neighbourSlide.style.transition = "none";
    neighbourSlide.style.transform = `translate3d(${offset + (drag.direction * drag.width)}px, 0, 0)`;
  };
  // Touch hardware can send many more samples than the display can render.
  // Keep only the latest sample and move both slide layers once per frame.
  const movePreviewDrag = payload => {
    pendingPreviewDrag = payload;
    if (previewDragFrame) return;
    previewDragFrame = requestAnimationFrame(() => {
      previewDragFrame = 0;
      const next = pendingPreviewDrag;
      pendingPreviewDrag = null;
      if (next) paintPreviewDrag(next);
    });
  };
  const flushPreviewDrag = () => {
    if (previewDragFrame) cancelAnimationFrame(previewDragFrame);
    previewDragFrame = 0;
    const next = pendingPreviewDrag;
    pendingPreviewDrag = null;
    if (next) paintPreviewDrag(next);
  };
  const settlePreviewDrag = ({ offset, velocityX = 0 }) => {
    flushPreviewDrag();
    if (!previewDrag) {
      currentSlide.style.transition = "transform 230ms cubic-bezier(.18,.82,.28,1)";
      currentSlide.style.transform = "translate3d(0, 0, 0)";
      window.setTimeout(() => {
        currentSlide.style.removeProperty("transition");
        currentSlide.style.removeProperty("transform");
      }, 250);
      return true;
    }
    const drag = previewDrag;
    const shouldSwitch = offset === drag.direction && activeIndex + offset === drag.target;
    // Keep the physical drag 1:1, then let the final few pixels settle with
    // a velocity-aware curve. This removes the stiff, mechanical snap while
    // preserving the one-neighbour-at-a-time rule.
    const speed = Math.min(2.4, Math.abs(Number(velocityX) || 0));
    const duration = Math.round(Math.max(165, 270 - speed * 46));
    const easing = "cubic-bezier(.18,.82,.28,1)";
    currentSlide.style.transition = `transform ${duration}ms ${easing}`;
    neighbourSlide.style.transition = `transform ${duration}ms ${easing}`;
    currentSlide.style.transform = `translate3d(${shouldSwitch ? -drag.direction * drag.width : 0}px, 0, 0)`;
    neighbourSlide.style.transform = `translate3d(${shouldSwitch ? 0 : drag.direction * drag.width}px, 0, 0)`;
    previewDragTimer = window.setTimeout(() => {
      if (!overlay.isConnected) return;
      if (shouldSwitch) {
        activeIndex = drag.target;
        image.src = gallery[activeIndex].src;
        image.alt = gallery[activeIndex].alt;
        update(0, false);
      }
      clearPreviewDrag();
    }, duration + 20);
    return true;
  };
  const switchImage = offset => {
    if (isGallery) {
      const target = Math.max(0, Math.min(gallery.length - 1, activeIndex + offset));
      if (target === activeIndex) return;
      stage.scrollTo({ left: target * Math.max(1, stage.clientWidth), behavior: "smooth" });
      return;
    }
    clearPreviewDrag();
    const target = Math.max(0, Math.min(gallery.length - 1, activeIndex + offset));
    if (target === activeIndex) {
      stage.classList.remove("is-bouncing");
      requestAnimationFrame(() => stage.classList.add("is-bouncing"));
      return;
    }
    const direction = target > activeIndex ? 1 : -1;
    const sequence = ++switchSequence;
    // Keep the current image visible until the target has decoded. This avoids
    // the black flash caused by assigning a still-loading image source.
    void preloadPreviewImage(gallery[target].src).then(() => {
      if (!overlay.isConnected || sequence !== switchSequence) return;
      image.classList.add(direction > 0 ? "is-leaving-to-left" : "is-leaving-to-right");
      window.clearTimeout(switchTimer);
      switchTimer = window.setTimeout(() => {
        if (!overlay.isConnected || sequence !== switchSequence) return;
        activeIndex = target;
        image.classList.remove("is-leaving-to-left", "is-leaving-to-right");
        update(direction, true);
      }, 110);
    });
  };
  let nativeScrollFrame = 0;
  let nativeScrollTimer = 0;
  const syncNativePreviewIndex = () => {
    nativeScrollFrame = 0;
    if (!isGallery || previewZoom?.isZoomed()) return;
    const width = Math.max(1, stage.clientWidth);
    const nextIndex = Math.max(0, Math.min(gallery.length - 1, Math.round(stage.scrollLeft / width)));
    if (nextIndex === activeIndex) return;
    activeIndex = nextIndex;
    update();
  };
  const scheduleNativePreviewIndex = () => {
    if (!isGallery || nativeScrollFrame) return;
    nativeScrollFrame = requestAnimationFrame(syncNativePreviewIndex);
  };
  if (isGallery) {
    stage.addEventListener("scroll", scheduleNativePreviewIndex, { passive: true });
    if ("onscrollend" in stage) stage.addEventListener("scrollend", syncNativePreviewIndex, { passive: true });
    else {
      stage.addEventListener("scroll", () => {
        window.clearTimeout(nativeScrollTimer);
        nativeScrollTimer = window.setTimeout(syncNativePreviewIndex, 180);
      }, { passive: true });
    }
  }
  update();
  previewZoom = attachPreviewZoom(stage, isGallery ? () => nativePreviewImages[activeIndex] : image, isGallery
    ? { nativePager: true }
    : {
        onSwipe: offset => switchImage(offset),
        canSwipe: offset => activeIndex + offset >= 0 && activeIndex + offset < gallery.length,
        onSwipeMove: movePreviewDrag,
        onSwipeSettle: settlePreviewDrag
      });
  if (isGallery) {
    requestAnimationFrame(() => {
      const left = activeIndex * Math.max(1, stage.clientWidth);
      stage.style.scrollBehavior = "auto";
      stage.scrollLeft = left;
      stage.style.removeProperty("scroll-behavior");
      syncNativePreviewIndex();
    });
  }

  const close = () => {
    if (!overlay.isConnected) return;
    switchSequence += 1;
    window.clearTimeout(switchTimer);
    window.clearTimeout(nativeScrollTimer);
    if (nativeScrollFrame) cancelAnimationFrame(nativeScrollFrame);
    clearPreviewDrag();
    previewZoom?.destroy();
    document.removeEventListener("keydown", handleKeydown);
    document.body.classList.remove("image-preview-open");
    overlay.remove();
  };
  const handleKeydown = event => {
    if (event.key === "Escape") close();
    if (event.key === "ArrowLeft") switchImage(-1);
    if (event.key === "ArrowRight") switchImage(1);
  };

  if (isGallery) {
    previous.addEventListener("click", () => switchImage(-1));
    next.addEventListener("click", () => switchImage(1));
  }

  const suppressCloseClickThrough = () => {
    const swallowFollowUpClick = event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      document.removeEventListener("click", swallowFollowUpClick, true);
    };
    document.addEventListener("click", swallowFollowUpClick, true);
    window.setTimeout(() => document.removeEventListener("click", swallowFollowUpClick, true), 360);
  };
  const closeFromButton = event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    // On iOS the synthetic click follows pointerup after the overlay has been
    // removed. Consume that one click so it cannot trigger the product's
    // share button underneath the close control.
    if (event.type === "pointerup") suppressCloseClickThrough();
    close();
  };
  // Use pointerup as well as click so the close control responds reliably on
  // both touch devices and desktop browsers.
  closeButton.addEventListener("pointerup", closeFromButton);
  closeButton.addEventListener("click", closeFromButton);
  overlay.addEventListener("click", event => {
    if (event.target === stage && (previewZoom?.shouldIgnoreBlankClick() || previewZoom?.isZoomed())) {
      return;
    }
    // The stage deliberately fills the empty area around a contained image.
    // Treat that empty area exactly like the dark overlay when closing.
    if (event.target === overlay || event.target === stage) close();
  });
  overlay.__closePreview = close;
  document.addEventListener("keydown", handleKeydown);
  closeButton.focus();
}

function openVideoPreview(src, alt = "视频预览", poster = "") {
  const existing = document.querySelector(".image-preview-overlay");
  if (typeof existing?.__closePreview === "function") existing.__closePreview();
  else existing?.remove();

  const overlay = document.createElement("div");
  overlay.className = "image-preview-overlay video-preview-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", alt);

  const closeButton = document.createElement("button");
  closeButton.className = "image-preview-close";
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "关闭视频预览");
  closeButton.textContent = "×";

  const video = document.createElement("video");
  video.src = src;
  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  if (poster) video.poster = poster;

  const stage = document.createElement("div");
  stage.className = "image-preview-stage video-preview-stage";
  stage.appendChild(video);

  const caption = document.createElement("span");
  caption.className = "image-preview-caption";
  caption.textContent = alt;

  overlay.append(closeButton, stage, caption);
  document.body.appendChild(overlay);
  document.body.classList.add("image-preview-open");
  const previewZoom = attachPreviewZoom(stage, video);
  video.play().catch(() => {});

  const close = () => {
    if (!overlay.isConnected) return;
    previewZoom.destroy();
    document.removeEventListener("keydown", handleKeydown);
    video.pause();
    video.removeAttribute("src");
    video.load();
    document.body.classList.remove("image-preview-open");
    overlay.remove();
  };
  const handleKeydown = event => {
    if (event.key === "Escape") close();
  };

  const suppressCloseClickThrough = () => {
    const swallowFollowUpClick = event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      document.removeEventListener("click", swallowFollowUpClick, true);
    };
    document.addEventListener("click", swallowFollowUpClick, true);
    window.setTimeout(() => document.removeEventListener("click", swallowFollowUpClick, true), 360);
  };
  const closeFromButton = event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    // iOS can dispatch a synthetic click after pointerup.  The preview is
    // already gone by then, so consume that click before it reaches the
    // community camera/publish control underneath this close button.
    if (event.type === "pointerup") suppressCloseClickThrough();
    close();
  };
  closeButton.addEventListener("pointerup", closeFromButton);
  closeButton.addEventListener("click", closeFromButton);
  overlay.addEventListener("click", event => {
    if (event.target === stage && (previewZoom.isZoomed() || previewZoom.shouldIgnoreBlankClick())) return;
    if (event.target === overlay || event.target === stage) close();
  });
  overlay.__closePreview = close;
  document.addEventListener("keydown", handleKeydown);
  closeButton.focus();
}

let inlineVideoPreviewBound = false;
function setupInlineVideoPreviewControls() {
  if (inlineVideoPreviewBound) return;
  inlineVideoPreviewBound = true;
  document.addEventListener("click", event => {
    const trigger = event.target instanceof Element ? event.target.closest("[data-open-video-preview]") : null;
    if (!trigger || !$app.contains(trigger)) return;
    const source = String(trigger.dataset.openVideoPreview || "");
    if (!source) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openVideoPreview(source, trigger.dataset.videoPreviewTitle || "视频预览", trigger.dataset.videoPreviewPoster || "");
  }, true);
}

let universalMediaPreviewBound = false;
function setupUniversalMediaPreview() {
  if (universalMediaPreviewBound) return;
  universalMediaPreviewBound = true;
  document.addEventListener("click", event => {
    const origin = event.target instanceof Element ? event.target : null;
    const media = origin?.closest("img, video");
    // Video playback remains inline. It enters the larger viewer only through
    // the visible “放大” button supplied above the player.
    if (!(media instanceof HTMLImageElement)) return;
    if (!$app.contains(media) || media.closest(".image-preview-overlay")) return;
    // Controls with their own preview/navigation action keep their dedicated
    // handler.  The capture listener is only a safe fallback for content
    // media that otherwise has no click behaviour.
    if (media.closest("button, a, label, input, textarea, select, [contenteditable='true'], [data-preview-community-media], [data-preview-chat-media], [data-preview-market-image], [data-growth-photo-preview], .photo-uploader, .media-picker, .default-avatar-option, .avatar-picker")) return;
    if (media.classList.contains("species-thumbnail") || media.classList.contains("turtle-icon") || media.classList.contains("app-icon")) return;
    const source = media.currentSrc || media.src;
    if (!source || source.startsWith("data:image/svg+xml")) return;
    event.preventDefault();
    event.stopPropagation();
    openImagePreview(source, media.alt || media.getAttribute("aria-label") || media.title || "图片预览");
  }, true);
}

function syncMobileKeyboardUI() {
  const active = document.activeElement;
  const editable = active instanceof HTMLElement && active.matches("input, textarea, [contenteditable='true']");
  const viewport = window.visualViewport;
  const layoutHeight = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
  const coveredHeight = viewport ? layoutHeight - viewport.height : 0;
  const touchDevice = navigator.maxTouchPoints > 0 || "ontouchstart" in window;
  document.documentElement.classList.toggle("keyboard-open", Boolean(editable && (touchDevice || coveredHeight > 120)));
}

function setupMobileKeyboardGuard() {
  document.addEventListener("focusin", () => requestAnimationFrame(syncMobileKeyboardUI));
  document.addEventListener("focusout", () => window.setTimeout(syncMobileKeyboardUI, 80));
  window.visualViewport?.addEventListener("resize", syncMobileKeyboardUI);
  window.visualViewport?.addEventListener("scroll", syncMobileKeyboardUI);
  window.addEventListener("resize", syncMobileKeyboardUI);
}

function pullRefreshSupportedPage() {
  return ["market", "messages", "community"].includes(state.page);
}

function pageAtTop() {
  return Math.max(window.scrollY || 0, document.documentElement.scrollTop || 0, document.body.scrollTop || 0) <= 2;
}

function pullRefreshIndicator() {
  let indicator = pullRefreshIndicatorElement || document.querySelector(".pull-refresh-indicator");
  if (indicator) return indicator;
  indicator = document.createElement("div");
  indicator.className = "pull-refresh-indicator";
  indicator.setAttribute("aria-live", "polite");
  indicator.innerHTML = `<i aria-hidden="true"></i><span>下拉刷新</span>`;
  document.body.appendChild(indicator);
  pullRefreshIndicatorElement = indicator;
  pullRefreshIndicatorLabel = indicator.querySelector("span");
  return indicator;
}

function setPullRefreshIndicator({ distance = 0, ready = false, refreshing = false } = {}) {
  const indicator = pullRefreshIndicator();
  // Do not translate the page while a pull is in progress.  WKWebView keeps
  // ownership of vertical scrolling, inertia and the iOS rubber-band; this
  // overlay only reports the refresh state in the exposed area.
  const pageOffset = 0;
  const indicatorOffset = refreshing
    ? 58
    : Math.min(PULL_REFRESH_MAX_OFFSET, Math.round(104 * (1 - Math.exp(-Math.max(0, distance) / 80))));
  const indicatorHeight = 36;
  // The indicator is vertically centred in the newly exposed blank area.
  const indicatorDistance = indicatorOffset > 0 ? (indicatorOffset + indicatorHeight) / 2 : 0;
  const label = refreshing ? "正在刷新中···" : ready ? "松开即可刷新" : "下拉刷新";
  indicator.style.setProperty("--pull-refresh-distance", `${indicatorDistance}px`);
  document.body.style.setProperty("--pull-refresh-page-offset", `${pageOffset}px`);
  const visualState = `${refreshing ? "refreshing" : ready ? "ready" : indicatorOffset > 0 ? "dragging" : "idle"}:${label}`;
  if (visualState === pullRefreshVisualState) return;
  pullRefreshVisualState = visualState;
  indicator.classList.toggle("is-visible", refreshing || indicatorOffset > 0);
  indicator.classList.toggle("is-ready", Boolean(ready) && !refreshing);
  indicator.classList.toggle("is-refreshing", Boolean(refreshing));
  (pullRefreshIndicatorLabel || indicator.querySelector("span")).textContent = label;
  document.body.classList.toggle("pull-refresh-active", indicatorOffset > 0);
  document.body.classList.toggle("pull-refresh-dragging", indicatorOffset > 0 && !refreshing);
}

function schedulePullRefreshIndicator(nextState) {
  pullRefreshPendingState = nextState || pullRefreshState;
  if (pullRefreshAnimationFrame) return;
  pullRefreshAnimationFrame = requestAnimationFrame(() => {
    pullRefreshAnimationFrame = 0;
    setPullRefreshIndicator(pullRefreshPendingState || pullRefreshState);
    pullRefreshPendingState = null;
  });
}

function cancelScheduledPullRefreshIndicator() {
  if (!pullRefreshAnimationFrame) return;
  cancelAnimationFrame(pullRefreshAnimationFrame);
  pullRefreshAnimationFrame = 0;
  pullRefreshPendingState = null;
}

function resetPullRefreshIndicator() {
  cancelScheduledPullRefreshIndicator();
  pullRefreshState = { ...pullRefreshState, tracking: false, startX: 0, startY: 0, distance: 0, ready: false, direction: "" };
  setPullRefreshIndicator();
}

async function runPullRefresh() {
  if (pullRefreshState.refreshing || !pullRefreshSupportedPage()) return;
  cancelScheduledPullRefreshIndicator();
  pullRefreshState = { ...pullRefreshState, tracking: false, refreshing: true, ready: false };
  setPullRefreshIndicator({ refreshing: true });
  const startedAt = Date.now();
  try {
    if (state.page === "market") {
      marketLastLoadedAt = 0;
      await refreshMarket(true);
    } else {
      communityLastLoadedAt = 0;
      await Promise.all([refreshCommunity(true), refreshMessageUnread(true)]);
    }
  } catch (error) {
    console.warn(error?.message || "下拉刷新失败");
  } finally {
    const remaining = Math.max(0, 420 - (Date.now() - startedAt));
    window.setTimeout(() => {
      pullRefreshState = { tracking: false, refreshing: false, startX: 0, startY: 0, distance: 0, ready: false, direction: "" };
      setPullRefreshIndicator();
    }, remaining);
  }
}

function setupPullToRefresh() {
  if (document.body.dataset.pullRefreshBound === "true") return;
  document.body.dataset.pullRefreshBound = "true";

  document.addEventListener("touchstart", event => {
    if (pullRefreshState.refreshing || !pullRefreshSupportedPage() || !pageAtTop() || event.touches.length !== 1) return;
    if (event.target.closest("input, textarea, select, [contenteditable='true'], .image-preview-overlay, .modal-overlay")) return;
    // A conversation row owns horizontal tracking from the very first touch.
    // Do not initialise pull-to-refresh for that gesture, even if the list is
    // at its top edge.
    if (event.target.closest(".message-friend-swipe")) return;
    if (document.documentElement.classList.contains("keyboard-open")) return;
    const headerBottom = document.querySelector(".topbar")?.getBoundingClientRect().bottom || 0;
    document.body.style.setProperty("--pull-refresh-header-bottom", `${Math.max(0, headerBottom)}px`);
    pullRefreshState = {
      ...pullRefreshState,
      tracking: true,
      startX: event.touches[0].clientX,
      startY: event.touches[0].clientY,
      distance: 0,
      ready: false,
      direction: ""
    };
  }, { passive: true });

  document.addEventListener("touchmove", event => {
    if (!pullRefreshState.tracking || pullRefreshState.refreshing || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const horizontalDistance = touch.clientX - pullRefreshState.startX;
    const distance = touch.clientY - pullRefreshState.startY;
    if (!pullRefreshState.direction && Math.max(Math.abs(horizontalDistance), Math.abs(distance)) > 8) {
      pullRefreshState.direction = Math.abs(horizontalDistance) > Math.abs(distance) ? "horizontal" : "vertical";
    }
    if (pullRefreshState.direction === "horizontal") {
      resetPullRefreshIndicator();
      return;
    }
    if (distance <= 0) {
      // Keep the same gesture alive as the finger returns upward. Resetting
      // here used to add a CSS rebound halfway through a single drag.
      pullRefreshState = { ...pullRefreshState, distance: 0, ready: false };
      schedulePullRefreshIndicator();
      return;
    }
    pullRefreshState = { ...pullRefreshState, distance, ready: distance >= PULL_REFRESH_THRESHOLD };
    schedulePullRefreshIndicator();
  }, { passive: true });

  const finish = () => {
    if (!pullRefreshState.tracking || pullRefreshState.refreshing) return;
    if (pullRefreshState.ready) void runPullRefresh();
    else resetPullRefreshIndicator();
  };
  document.addEventListener("touchend", finish, { passive: true });
  document.addEventListener("touchcancel", resetPullRefreshIndicator, { passive: true });
}

function buildEdgeBackPreviewHtml(html) {
  if (!html) return "";
  // The preview must retain exactly the same layout as the page restored by
  // the back button.  A shortened preview (missing rows, images or fixed
  // navigation) looked acceptable while moving, but visibly jumped when the
  // complete saved page replaced it at the end of an edge swipe.  It remains
  // inert: identifiers, handlers and expensive moving-video decoders are
  // removed, while the visual layout stays intact.
  const template = document.createElement("template");
  template.innerHTML = html;
  const previewRoot = template.content;
  previewRoot.querySelectorAll("video, audio, source, iframe, canvas").forEach(node => {
    const placeholder = document.createElement("span");
    placeholder.className = "edge-back-media-placeholder";
    node.replaceWith(placeholder);
  });
  previewRoot.querySelectorAll("*").forEach(node => {
    node.removeAttribute("id");
    node.removeAttribute("name");
    node.removeAttribute("for");
    node.removeAttribute("autofocus");
    node.removeAttribute("contenteditable");
    node.removeAttribute("href");
    node.setAttribute("tabindex", "-1");
    [...node.attributes].forEach(attribute => {
      if (attribute.name.startsWith("data-")) node.removeAttribute(attribute.name);
    });
  });
  return template.innerHTML;
}

function showEdgeBackPreview(snapshot) {
  clearEdgeBackPreview();
  const preview = document.createElement("div");
  // The snapshot is mounted beside #app while it is being revealed.  It must
  // still carry the same phone-shell variables (notably the fixed top-bar
  // height); without them the preview content starts at y=0 and jumps when
  // the real messages page is restored.
  preview.className = "edge-back-preview phone-shell";
  if (snapshot?.liveDom?.hasChildNodes()) {
    // The preview is deliberately a clone. The previous implementation moved
    // the visible Messages DOM out of this layer at the end of a back swipe;
    // iOS then recomposited the entire screen and it looked like a refresh.
    // Keeping the clone visible while the original DOM is restored offscreen
    // gives a seamless one-frame hand-off instead.
    preview.__edgeBackSnapshot = snapshot;
    preview.__edgeBackUsesClone = true;
    preview.appendChild(snapshot.liveDom.cloneNode(true));
    const bottomNav = bottomNavFromHtml(snapshot.bottomNavHtml);
    if (bottomNav) {
      preview.__edgeBackBottomNav = bottomNav;
      preview.appendChild(bottomNav);
    }
  } else {
    const previewHtml = snapshot?.previewHtml || buildEdgeBackPreviewHtml(snapshot?.html || "");
    if (!previewHtml) return null;
    preview.innerHTML = previewHtml;
  }
  document.body.insertBefore(preview, $app);
  // Match the page position that was visible when the user entered the child
  // module. Without this, the preview starts at the document top and then the
  // restored page suddenly jumps down to its saved scroll offset.
  preview.scrollTop = Math.max(0, Number(snapshot?.scrollY || 0));
  return preview;
}

function clearEdgeBackPreview() {
  const preview = document.querySelector(".edge-back-preview");
  if (!preview) return;
  restoreLiveSnapshotToStash(preview);
  preview.remove();
}

function setupEdgeBackAndConversationSwipe() {
  if (document.body.dataset.edgeGesturesBound === "true") return;
  document.body.dataset.edgeGesturesBound = "true";
  let gesture = null;
  let gestureAnimationFrame = 0;
  let edgeSettleTimer = 0;
  let edgeSettleCleanup = null;
  const rootPages = new Set(["home", "ledger", "market", "messages", "mine"]);
  const edgePinnedProperties = ["position", "top", "left", "right", "bottom", "width", "transform"];
  const pinEdgeFixedLayers = active => {
    if (active?.edgePinnedLayers?.length) return;
    const appBounds = $app.getBoundingClientRect();
    active.edgePinnedLayers = Array.from($app.querySelectorAll(".topbar, .community-chat-product-context, .community-chat-form, .community-chat-tools, .bottom-nav"))
      .filter(layer => getComputedStyle(layer).position === "fixed")
      .map(layer => {
        const bounds = layer.getBoundingClientRect();
        const previous = edgePinnedProperties.map(property => ({
          property,
          value: layer.style.getPropertyValue(property),
          priority: layer.style.getPropertyPriority(property)
        }));
        // A transformed parent turns fixed descendants into scrolling layers on
        // iOS.  Pin them to their current coordinates before #app follows the
        // finger so the chat name, product card and composer cannot disappear.
        layer.style.setProperty("position", "absolute", "important");
        layer.style.setProperty("top", `${bounds.top - appBounds.top}px`, "important");
        layer.style.setProperty("left", `${bounds.left - appBounds.left}px`, "important");
        layer.style.setProperty("right", "auto", "important");
        layer.style.setProperty("bottom", "auto", "important");
        layer.style.setProperty("width", `${bounds.width}px`, "important");
        layer.style.setProperty("transform", "none", "important");
        return { layer, previous };
      });
  };
  const unpinEdgeFixedLayers = active => {
    active?.edgePinnedLayers?.forEach(({ layer, previous }) => {
      if (!layer?.isConnected) return;
      previous.forEach(({ property, value, priority }) => {
        if (value) layer.style.setProperty(property, value, priority);
        else layer.style.removeProperty(property);
      });
    });
    if (active) active.edgePinnedLayers = [];
  };
  const clearPendingEdgeBack = () => {
    if (edgeSettleTimer) window.clearTimeout(edgeSettleTimer);
    edgeSettleTimer = 0;
    edgeSettleCleanup?.();
    edgeSettleCleanup = null;
    if (gestureAnimationFrame) window.cancelAnimationFrame(gestureAnimationFrame);
    gestureAnimationFrame = 0;
    $app.style.transition = "";
    $app.style.transform = "";
    $app.classList.remove("edge-back-dragging");
    unpinEdgeFixedLayers(gesture);
    clearEdgeBackPreview();
  };
  const releasePointer = active => {
    const target = active?.captureTarget;
    if (target?.hasPointerCapture?.(active.pointerId)) target.releasePointerCapture(active.pointerId);
  };
  const cancelActiveGesture = () => {
    releasePointer(gesture);
    clearPendingEdgeBack();
    gesture = null;
  };
  const paintGesture = active => {
    gestureAnimationFrame = 0;
    if (!active) return;
    if (active.mode === "edge") {
      $app.style.transform = `translate3d(${active.edgeOffset}px, 0, 0)`;
      active.preview?.style.setProperty("transform", `translate3d(${-22 + (active.edgeProgress * 22)}%, 0, 0)`);
    }
  };
  const scheduleGesturePaint = () => {
    if (!gestureAnimationFrame) gestureAnimationFrame = window.requestAnimationFrame(() => paintGesture(gesture));
  };
  const flushGesturePaint = active => {
    if (gestureAnimationFrame) window.cancelAnimationFrame(gestureAnimationFrame);
    gestureAnimationFrame = 0;
    paintGesture(active);
  };
  const claimPointer = (active, target) => {
    active.captureTarget = target;
    target?.setPointerCapture?.(active.pointerId);
  };
  document.addEventListener("pointerdown", event => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    // A new touch must never inherit a previous drag or its delayed rebound.
    if (gesture || edgeSettleTimer) cancelActiveGesture();
    if (event.target.closest("input, textarea, select, [contenteditable='true'], .modal-overlay, .image-preview-overlay")) return;
    // A native product gallery owns every horizontal gesture except the thin
    // left-edge shield rendered above it. This prevents the page-back path
    // from competing with an image page while the finger is already on it.
    if (event.target.closest(".market-detail-gallery") && event.clientX > 24) return;
    // Growth history is a native horizontal scroller.  It must not compete
    // with the app-level swipe/back recognizer on iOS.
    if (event.target.closest("[data-growth-history-flow]")) return;
    // Conversation rows are native horizontal scrollers.  Do not let the
    // document-level edge/drag handler claim their pointer: that would turn a
    // UIKit-style inertial swipe back into a JavaScript drag.
    if (event.target.closest(".message-friend-swipe")) return;
    gesture = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastAt: performance.now(),
      velocityX: 0,
      mode: "pending"
    };
  }, { passive: true });
  document.addEventListener("pointermove", event => {
    const active = gesture;
    if (!active || event.pointerId !== active.pointerId || !event.isPrimary) return;
    const dx = event.clientX - active.x;
    const dy = event.clientY - active.y;
    const now = performance.now();
    const elapsed = Math.max(1, now - active.lastAt);
    const sampleVelocity = (event.clientX - active.lastX) / elapsed;
    if (Number.isFinite(sampleVelocity) && Math.abs(event.clientX - active.lastX) > .1) {
      active.velocityX = active.velocityX && Math.sign(active.velocityX) === Math.sign(sampleVelocity)
        ? (active.velocityX * .62) + (sampleVelocity * .38)
        : sampleVelocity;
    }
    active.lastX = event.clientX;
    active.lastAt = now;
    if (active.mode === "pending") {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      if (Math.abs(dx) <= Math.abs(dy)) {
        active.mode = "vertical";
        return;
      }
      if (active.x <= 24 && dx > 0 && !rootPages.has(state.page) && edgeBackSnapshots.length) {
        active.mode = "edge";
        active.preview = showEdgeBackPreview(edgeBackSnapshots[edgeBackSnapshots.length - 1]);
        claimPointer(active, $app);
        pinEdgeFixedLayers(active);
        $app.classList.add("edge-back-dragging");
      } else {
        active.mode = "horizontal";
        return;
      }
    }
    if (active.mode === "edge") {
      active.edgeOffset = Math.max(0, dx);
      active.edgeProgress = Math.min(1, active.edgeOffset / Math.max(1, window.innerWidth));
      scheduleGesturePaint();
      if (event.cancelable) event.preventDefault();
    }
  }, { passive: false });
  document.addEventListener("pointerup", event => {
    const active = gesture;
    if (!active || event.pointerId !== active.pointerId) return;
    const dx = event.clientX - active.x;
    const dy = event.clientY - active.y;
    flushGesturePaint(active);
    releasePointer(active);
    if (active.mode === "edge") {
      const width = Math.max(1, window.innerWidth);
      const edgeOffset = Math.max(0, Math.min(width, active.edgeOffset ?? dx));
      const hasForwardFling = active.velocityX > .48 && dx > 26;
      const shouldComplete = (dx > Math.max(78, width * .18) || hasForwardFling) && Math.abs(dx) > Math.abs(dy);
      // A UIKit interactive-pop transition continues with the release
      // velocity. Keep the same principle here: the final leg is calculated
      // from distance and finger speed instead of one fixed, mechanical time.
      const remaining = shouldComplete ? width - edgeOffset : edgeOffset;
      const releaseSpeed = Math.max(.42, Math.min(2.35, Math.abs(active.velocityX || 0)));
      const settleDuration = Math.round(Math.max(145, Math.min(310, remaining / releaseSpeed)));
      $app.classList.remove("edge-back-dragging");
      $app.style.transition = `transform ${settleDuration}ms cubic-bezier(.18,.78,.2,1)`;
      $app.style.transform = shouldComplete ? "translate3d(100vw, 0, 0)" : "translate3d(0, 0, 0)";
      if (active.preview) {
        active.preview.style.transition = `transform ${settleDuration}ms cubic-bezier(.18,.78,.2,1)`;
        active.preview.style.transform = shouldComplete ? "translate3d(0, 0, 0)" : "translate3d(-22%, 0, 0)";
      }
      // Do not guess when the transition has finished.  The old 190 ms timer
      // ran before the 200 ms transform animation had reached its final
      // frame, so the real Messages DOM replaced the preview for one visible
      // frame and looked exactly like a page refresh.  Wait for the actual
      // transform transition, with a short fallback only for browsers that
      // fail to emit transitionend.
      let edgeSettled = false;
      const finishEdgeSettle = () => {
        if (edgeSettled) return;
        edgeSettled = true;
        if (edgeSettleTimer) window.clearTimeout(edgeSettleTimer);
        edgeSettleTimer = 0;
        edgeSettleCleanup?.();
        edgeSettleCleanup = null;
        if (shouldComplete && !rootPages.has(state.page)) {
          // navigateBack owns the offscreen-to-previous-page hand-off.
          unpinEdgeFixedLayers(active);
          navigateBack({ fromEdgeGesture: true });
        } else {
          $app.style.transition = "";
          $app.style.transform = "";
          unpinEdgeFixedLayers(active);
          clearEdgeBackPreview();
        }
      };
      const handleEdgeTransitionEnd = transitionEvent => {
        if (transitionEvent.target !== $app || transitionEvent.propertyName !== "transform") return;
        finishEdgeSettle();
      };
      edgeSettleCleanup = () => $app.removeEventListener("transitionend", handleEdgeTransitionEnd);
      $app.addEventListener("transitionend", handleEdgeTransitionEnd);
      edgeSettleTimer = window.setTimeout(finishEdgeSettle, settleDuration + 90);
    }
    gesture = null;
  }, { passive: true });
  document.addEventListener("pointercancel", event => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    cancelActiveGesture();
  }, { passive: true });
  window.addEventListener("pagehide", cancelActiveGesture);
  window.addEventListener("blur", cancelActiveGesture);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelActiveGesture();
  });
}

restorePendingCloudData();
// Browser share links already contain their target in location. Route before
// the first render so a shared product never flashes the dashboard first.
openSharedMarketListing(window.location.href, { initial: true });
setupMobileKeyboardGuard();
setupPullToRefresh();
setupEdgeBackAndConversationSwipe();
setupNativeMediaPicker();
setupInlineVideoPreviewControls();
setupUniversalMediaPreview();
setupBottomNavForegroundRecovery();
setupMarketShareDeepLinks();
render();
checkRequiredAppUpdate();
startMarketNetworkMonitoring();
refreshCareReminderTimers();
startCloudSessionHydration();
setupNativePushNotifications();
startMessageUnreadPolling();
refreshMessageUnread(true);
