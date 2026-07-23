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
const POLICY_VERSION = "2026-07-17";
const APP_BUILD = Math.max(0, Number.parseInt(String(window.TURTLE_APP_BUILD || "0"), 10) || 0);
const APP_STORE_URL = String(window.TURTLE_APP_STORE_URL || "https://apps.apple.com/app/id6783481335");
let forceUpdateState = { required: false, checking: false, minimumBuild: 0, latestBuild: 0, message: "", appStoreUrl: "" };
// 龟集市的购买咨询统一由平台客服承接；修改此处即可同步更新商品页和“关于”页。
const PLATFORM_SERVICE_WECHAT = "Czjxcw";
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
const PULL_REFRESH_THRESHOLD = 72;
const PULL_REFRESH_MAX_OFFSET = 72;
let pullRefreshState = { tracking: false, refreshing: false, startX: 0, startY: 0, distance: 0, ready: false, direction: "" };
let pullRefreshAnimationFrame = 0;

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
  communityProfileStats: { receivedLikes: 0, followerCount: 0 },
  contentReports: [],
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
let communityChatLoading = false;
let communityChatLoadedKey = "";
let followingLoading = false;
let followingLastLoadedAt = 0;
let communityUserProfileLoading = false;
let communityUserProfileLoadedKey = "";
let messageUnreadLoading = false;
let messageUnreadLastLoadedAt = 0;
let contentReportsLoading = false;
let contentReportsLastLoadedAt = 0;
let marketNetworkType = "unknown";
let marketNetworkMonitoringStarted = false;
let messageUnreadTimer = null;
let communityDraftMedia = "";
let communityDraftMediaType = "";
let communityDraftMediaFile = null;
let communityDraftMediaDuration = 0;
let communityDraftText = "";
let marketLoading = false;
let marketLastLoadedAt = 0;
let marketLoadObserver = null;
let marketChatDraft = "";
let pendingCommunityChatLatestScroll = false;
let pendingPageEnterMotion = false;
let pendingCommunityChatEnterMotion = false;
let pageEnterMotionTimer = null;
let pendingPageScrollReset = false;
let nativePushListenersAttached = false;
let nativePushSetupInFlight = false;
let nativePushDeviceToken = "";

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

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE));
    return saved ? normalizeState({ ...initialState, ...saved }) : { ...initialState };
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
  const accountData = loggedInPhone ? normalizeAccountData(activeUser?.data || {}) : emptyAccountData();
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
    communityProfileStats: {
      receivedLikes: Math.max(0, Number(base.communityProfileStats?.receivedLikes || 0)),
      followerCount: Math.max(0, Number(base.communityProfileStats?.followerCount || 0))
    },
    contentReports: Array.isArray(base.contentReports) ? base.contentReports : [],
    isCommunityAdmin: Boolean(base.isCommunityAdmin),
    communityFriends: Array.isArray(base.communityFriends) ? base.communityFriends : [],
    communityFollowingUsers: Array.isArray(base.communityFollowingUsers) ? base.communityFollowingUsers : [],
    communityFollowingPosts: Array.isArray(base.communityFollowingPosts) ? base.communityFollowingPosts : [],
    communityFollowingListings: Array.isArray(base.communityFollowingListings) ? base.communityFollowingListings : [],
    marketListings: Array.isArray(base.marketListings) ? base.marketListings : [],
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
  const accountData = state.loggedInPhone && !cloudSession ? accountDataSnapshot(state) : emptyAccountData();
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
  if (!options.skipCloud) queueCloudSave();
}

function setState(patch, options = {}) {
  const pageChanged = Object.prototype.hasOwnProperty.call(patch, "page") && patch.page && patch.page !== state.page;
  if (pageChanged) {
    pendingCommunityChatEnterMotion = options.pageMotion === "chat";
    // Full-page scale/fade on every navigation causes visible reflow on long
    // lists and media-heavy pages. Navigation is instant by default; gestures
    // retain their own compositor-driven motion.
    pendingPageEnterMotion = options.pageMotion === "enter";
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
  render();
  refreshCareReminderTimers();
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
  return speciesImageCache[item.code] || item.image || defaultPhoto;
}

function wikimediaImageApi(query) {
  if (!query) return "";
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrnamespace: "6",
    gsrlimit: "1",
    gsrsearch: `"${query}"`,
    prop: "imageinfo",
    iiprop: "url",
    iiurlwidth: "260",
    format: "json",
    origin: "*"
  });
  return `https://commons.wikimedia.org/w/api.php?${params.toString()}`;
}

function wikipediaImageApi(query) {
  return query ? `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}` : "";
}

async function resolveSpeciesImage(item) {
  if (!item || speciesImageCache[item.code]) return speciesImageCache[item?.code] || "";
  const candidates = speciesSearchCandidates(item);

  for (const query of candidates) {
    try {
      const response = await fetch(wikipediaImageApi(query));
      const data = await response.json();
      const image = data?.thumbnail?.source || data?.originalimage?.source || "";
      if (image) {
        speciesImageCache = { ...speciesImageCache, [item.code]: image };
        saveSpeciesImageCache();
        return image;
      }
    } catch {
      // Try the next source below.
    }
  }

  for (const query of candidates) {
    try {
      const response = await fetch(wikimediaImageApi(query));
      const data = await response.json();
      const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
      const image = pages[0]?.imageinfo?.[0]?.thumburl || pages[0]?.imageinfo?.[0]?.url || "";
      if (image) {
        speciesImageCache = { ...speciesImageCache, [item.code]: image };
        saveSpeciesImageCache();
        return image;
      }
    } catch {
      // Keep the calm placeholder when every source fails.
    }
  }

  return "";
}

function hydrateSpeciesImages() {
  document.querySelectorAll("[data-fallback-photo]").forEach(img => {
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
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
  if (!value || /^(https?:|data:|blob:)/i.test(value)) return value;
  const base = String(window.TURTLE_API_BASE_URL || "").replace(/\/+$/, "");
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
        ${back ? `<button class="icon-btn" data-back>‹</button>` : (leading || `<span></span>`)}
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

function communityAvatar(item, className = "community-avatar") {
  if (item.authorAvatar || item.avatar) return `<img class="${className}" src="${item.authorAvatar || item.avatar}" alt="头像">`;
  return `<span class="${className} fallback-avatar">${escapeHtml(String(item.authorName || item.name || "壳").slice(0, 1))}</span>`;
}

function marketSellerAvatar(item, className) {
  if (item.sellerAvatar) return `<img class="${className}" src="${item.sellerAvatar}" alt="卖家头像">`;
  return `<span class="${className} market-default-avatar">龟</span>`;
}

function communityMedia(item, compact = false) {
  if (!item.mediaUrl) return `<div class="community-media-placeholder"><span>壳友动态</span></div>`;
  if (item.mediaType === "video") return `<video class="community-media" src="${item.mediaUrl}" ${compact ? "muted playsinline preload=\"metadata\"" : "controls playsinline preload=\"metadata\""}></video>`;
  return `<img class="community-media" src="${item.mediaUrl}" alt="动态图片" loading="lazy">`;
}

function communityCompactCard(item) {
  return `
    <article class="community-tile">
      <button class="community-tile-media" type="button" data-page="community">${communityMedia(item, true)}${item.mediaType === "video" ? `<span class="community-video-mark">▶</span>` : ""}</button>
      <div class="community-tile-body">
        <p>${escapeHtml(item.content || "分享了一条新动态")}</p>
        <div class="community-tile-author">${communityAvatar(item, "community-mini-avatar")}<span>${escapeHtml(item.authorName || "壳友")}</span><b>♡ ${item.likeCount || 0}</b></div>
      </div>
    </article>
  `;
}

function communityFeedCard(item) {
  const comments = Array.isArray(item.comments) ? item.comments : [];
  const isOwn = Boolean(item.isOwn || item.pendingLocal);
  return `
    <article class="community-moment" data-view-community-post="${item.id}" tabindex="0" role="button" aria-label="查看${escapeHtml(item.authorName || "壳友")}发布的动态">
      <button class="community-profile-avatar-button" type="button" data-view-community-user="${escapeHtml(item.authorId || "")}" aria-label="查看${escapeHtml(item.authorName || "壳友")}的主页">${communityAvatar(item)}</button>
      <div class="community-moment-main">
        <div class="community-moment-author"><button class="community-profile-name-button" type="button" data-view-community-user="${escapeHtml(item.authorId || "")}">${escapeHtml(item.authorName || "壳友")}</button>${!isOwn ? `<span class="community-author-actions"><button class="community-follow-button ${item.followed ? "active" : ""}" type="button" data-toggle-community-follow="${item.authorId}">${item.followed ? "已关注" : "关注"}</button><button type="button" data-open-community-chat="${item.authorId}">聊天</button></span>` : ""}</div>
        ${item.content ? `<p class="community-post-copy">${escapeHtml(item.content)}</p>` : ""}
        ${item.mediaUrl ? `<div class="community-post-media">${communityMedia(item, true)}${item.mediaType === "video" ? `<i class="community-detail-play-mark">▶</i>` : ""}</div>` : ""}
        ${item.location ? `<span class="community-post-location">${escapeHtml(item.location)}</span>` : ""}
        <div class="community-moment-meta"><span>${formatTime(item.createdAt)}${isOwn ? `<button class="community-post-delete" type="button" data-delete-community-post="${item.id}">删除</button>` : ""}</span><div class="community-moment-action-wrap"><button type="button" data-community-more="${item.id}">••</button>${state.openCommunityActionId === item.id ? `<div class="community-moment-popover"><button class="${item.liked ? "active" : ""}" type="button" data-like-community-post="${item.id}">${item.liked ? "取消" : "赞"}</button><button type="button" data-show-community-comment="${item.id}">评论</button>${!isOwn ? `<button type="button" data-open-content-report data-report-type="community" data-report-id="${item.id}">举报</button>` : ""}</div>` : ""}</div></div>
        ${(item.likeCount || comments.length) ? `<div class="community-social-panel">${item.likeCount ? `<p class="community-like-line">♡ ${item.likeCount} 人觉得很赞</p>` : ""}${comments.map(comment => `<p><strong>${escapeHtml(comment.authorName || "壳友")}</strong>：${escapeHtml(comment.content)}</p>`).join("")}</div>` : ""}
        ${state.communityCommentPostId === item.id ? `<form class="community-comment-form" data-community-comment-form="${item.id}"><input name="content" placeholder="评论" maxlength="500" autofocus><button type="submit">发送</button></form>` : ""}
      </div>
    </article>
  `;
}

function findCommunityPost(postId) {
  const id = String(postId || "");
  return [...(state.communityPosts || []), ...(state.communityFollowingPosts || [])]
    .find(item => String(item.id) === id) || null;
}

function communityDetailMedia(item) {
  if (!item?.mediaUrl) return "";
  const label = item.mediaType === "video" ? "放大播放视频" : "放大查看图片";
  return `
    <button class="community-detail-media-button" type="button" data-preview-community-media="${item.id}" aria-label="${label}">
      ${communityMedia(item, true)}
      ${item.mediaType === "video" ? `<i class="community-detail-play-mark">▶</i>` : `<i class="community-detail-zoom-mark">⤢</i>`}
    </button>
  `;
}

function pageCommunityPostDetail() {
  const item = findCommunityPost(state.selectedCommunityPostId);
  if (!item) return `${topbar("动态详情", true)}<main class="content page-fresh"><div class="empty small-empty"><div><strong>这条动态不存在</strong></div></div></main>${bottomNav()}`;
  const comments = Array.isArray(item.comments) ? item.comments : [];
  const isOwn = Boolean(item.isOwn || item.pendingLocal);
  return `
    ${topbar("动态详情", true)}
    <main class="content page-fresh community-detail-page">
      <article class="community-detail-card fresh-card">
        <header class="community-detail-head">
          <button class="community-profile-avatar-button" type="button" data-view-community-user="${escapeHtml(item.authorId || "")}" aria-label="查看${escapeHtml(item.authorName || "壳友")}的主页">${communityAvatar(item)}</button>
          <button class="community-detail-author-button" type="button" data-view-community-user="${escapeHtml(item.authorId || "")}"><strong>${escapeHtml(item.authorName || "壳友")}</strong><span>${formatTime(item.createdAt)}</span></button>
          ${!isOwn ? `<div class="community-author-actions"><button class="${item.followed ? "active" : ""}" type="button" data-toggle-community-follow="${item.authorId}">${item.followed ? "已关注" : "关注"}</button><button type="button" data-open-community-chat="${item.authorId}">聊天</button></div>` : ""}
        </header>
        ${item.content ? `<p class="community-detail-copy">${escapeHtml(item.content)}</p>` : ""}
        ${communityDetailMedia(item)}
        ${item.location ? `<span class="community-post-location">${escapeHtml(item.location)}</span>` : ""}
        <div class="community-detail-actions">
          <button class="${item.liked ? "active" : ""}" type="button" data-like-community-post="${item.id}">${item.liked ? "已赞" : "♡ 赞"}${item.likeCount ? ` ${item.likeCount}` : ""}</button>
          <button type="button" data-show-community-comment="${item.id}">评论${comments.length ? ` ${comments.length}` : ""}</button>
          ${!isOwn ? `<button type="button" data-open-content-report data-report-type="community" data-report-id="${item.id}">举报</button>` : ""}
          ${isOwn ? `<button class="community-post-delete" type="button" data-delete-community-post="${item.id}">删除</button>` : ""}
        </div>
        ${(item.likeCount || comments.length) ? `<section class="community-detail-social">${item.likeCount ? `<p class="community-like-line">♡ ${item.likeCount} 人觉得很赞</p>` : ""}${comments.map(comment => `<p><strong>${escapeHtml(comment.authorName || "壳友")}</strong>：${escapeHtml(comment.content)}</p>`).join("")}</section>` : ""}
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
      if (index >= 0 && !rows[index].lastMessage) rows[index] = { ...rows[index], ...previewPatch };
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
      <section class="message-friend-list">${friends.map(friend => `<article class="message-friend-swipe" data-conversation-id="${escapeHtml(friend.id)}"><div class="message-friend-actions"><button type="button" data-toggle-conversation-pin="${escapeHtml(friend.id)}">${friend.pinned ? "取消置顶" : "置顶"}</button><button class="delete" type="button" data-delete-conversation="${escapeHtml(friend.id)}">删除</button></div><button class="message-friend-row" type="button" data-open-community-chat="${friend.id}"><span class="message-friend-avatar-wrap">${communityAvatar(friend)}${friend.unreadCount ? `<i>${friend.unreadCount > 99 ? "99+" : friend.unreadCount}</i>` : ""}</span><div><strong>${escapeHtml(friend.name || "壳友")}</strong><span>${escapeHtml(friend.lastMessage || "暂无消息")}</span></div>${friend.lastMessageAt ? `<time class="message-friend-time" datetime="${escapeHtml(friend.lastMessageAt)}">${formatMessagePreviewTime(friend.lastMessageAt)}</time>` : ""}<b>›</b></button></article>`).join("") || `<div class="message-empty"><strong>暂无消息</strong><span>在龟集市联系卖家后，可在这里继续沟通</span></div>`}</section>
    </main>
    ${bottomNav()}
  `;
}

function pageCommunity() {
  const posts = state.communityPosts || [];
  return `
    ${topbar("壳友圈", true, `<button class="community-camera-button" type="button" data-community-camera-button aria-label="拍摄或从相册选择"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z"></path><circle cx="12" cy="13.5" r="3.5"></circle></svg></button>`)}
    <main class="content page-fresh community-page community-moments-page">
      <input class="hidden-file" type="file" accept="image/*,video/*" data-community-quick-media>
      <section class="community-feed">${posts.map(communityFeedCard).join("") || `<div class="empty small-empty"><div><strong>暂时还没有动态</strong><br>点击右上角相机发布第一条内容</div></div>`}</section>
    </main>
    ${bottomNav()}
  `;
}

function pageCommunityAdd() {
  const canPublish = Boolean(communityDraftText.trim() || communityDraftMedia);
  return `
    <div class="community-compose-nav"><button type="button" data-back>取消</button><button class="community-compose-submit ${canPublish ? "is-ready" : ""}" type="submit" form="communityPostForm" data-ready="${canPublish ? "true" : "false"}" aria-disabled="${canPublish ? "false" : "true"}" ${canPublish ? "" : "disabled"}>发表</button></div>
    <main class="community-compose-page">
      <form class="community-publish-form" id="communityPostForm">
        <textarea name="content" maxlength="1200" placeholder="这一刻的想法…">${escapeHtml(communityDraftText)}</textarea>
        <button class="community-media-preview" type="button" data-community-media-button>${communityDraftMedia ? (communityDraftMediaType === "video" ? `<video src="${communityDraftMedia}" muted playsinline></video><i>▶</i>` : `<img src="${communityDraftMedia}" alt="待发布图片">`) : `<span>＋<small>添加图片或视频</small></span>`}</button>
        <input class="hidden-file" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" data-community-media-input>
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
      <section class="community-friend-list">${friends.map(friend => `<article class="community-friend-row fresh-card">${communityAvatar(friend)}<div><strong>${escapeHtml(friend.name || "壳友")}</strong><small>${escapeHtml(friend.phone || "")}</small></div><button type="button" data-open-community-chat="${friend.id}">聊天</button></article>`).join("") || `<div class="empty small-empty"><div><strong>还没有联系人</strong><br>在龟集市联系卖家后即可继续聊天</div></div>`}</section>
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
      ? `<button class="community-message-media ${mediaType === "video" ? "is-video" : ""}" type="button" data-preview-chat-media="${escapeHtml(mediaUrl)}" data-chat-media-poster="${escapeHtml(mediaPosterUrl)}" data-chat-media-type="${mediaType}" aria-label="查看聊天${mediaType === "video" ? "视频" : "图片"}">${mediaType === "video" ? `<video src="${escapeHtml(mediaUrl)}"${videoPosterAttribute({ posterUrl: mediaPosterUrl })} muted playsinline preload="auto" crossorigin="anonymous" data-video-first-frame></video><i aria-hidden="true">▶</i>` : `<img src="${escapeHtml(mediaUrl)}" alt="聊天图片">`}</button>`
      : "";
    const showTime = shouldShowCommunityMessageTime(visibleMessages, index);
    const sender = { id: message.senderId || friend?.id || state.selectedCommunityFriendId, avatar: message.senderAvatar || friend?.avatar || "", name: friend?.name || "壳友" };
    const senderMark = !message.mine
      ? (showTime
        ? `<button class="community-chat-message-avatar" type="button" data-view-community-user="${escapeHtml(sender.id)}" aria-label="查看${escapeHtml(sender.name)}的主页">${communityAvatar(sender, "community-chat-avatar")}</button>`
        : `<span class="community-chat-avatar-spacer" aria-hidden="true"></span>`)
      : "";
    return `<div class="community-message ${message.mine ? "mine" : "theirs"}">${showTime ? `<small>${formatTime(message.createdAt)}</small>` : ""}<div class="community-message-body">${senderMark}<div class="community-message-content">${text ? `<p>${escapeHtml(text)}</p>` : ""}${media}</div></div></div>`;
  };
  const chatHeader = `
    <div class="topbar community-chat-topbar">
      <div class="community-chat-nav"><button class="icon-btn" type="button" data-back aria-label="返回">‹</button><button class="community-chat-user-link" type="button" data-view-community-user="${escapeHtml(friend?.id || state.selectedCommunityFriendId || "")}" aria-label="查看对方主页">${escapeHtml(friend?.name || "聊天")}</button></div>
      <button class="community-chat-service" type="button" data-open-platform-service-dialog aria-label="联系平台客服"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 13.2v-1.1a7.5 7.5 0 0 1 15 0v1.1"></path><path d="M4.5 12.6H3.8a1.8 1.8 0 0 0-1.8 1.8v2.1a1.8 1.8 0 0 0 1.8 1.8h1.7v-5.7ZM19.5 12.6h.7a1.8 1.8 0 0 1 1.8 1.8v2.1a1.8 1.8 0 0 1-1.8 1.8h-1.7v-5.7ZM19.5 18.1c0 1.3-1.2 2.4-2.7 2.4h-1.5"></path><path d="M13.2 20.5h2.4"></path></svg><span>客服</span></button>
    </div>
  `;
  return `
    ${chatHeader}
    <main class="content page-fresh community-chat-page ${marketListing ? "has-chat-product-context" : ""} ${toolsOpen ? "chat-tools-open" : ""}">
      <section class="community-chat-list">${visibleMessages.map(messageMarkup).join("") || (marketListing ? "" : `<div class="community-chat-empty">打个招呼，开始聊天吧</div>`)}</section>
      <form class="community-chat-form" id="communityChatForm">
        <input name="content" maxlength="1000" value="${escapeHtml(marketChatDraft)}" placeholder="输入消息…" autocomplete="off" enterkeyhint="send">
        <button class="community-chat-plus-btn ${toolsOpen ? "is-open" : ""}" type="button" data-toggle-community-chat-tools aria-label="${toolsOpen ? "收起更多功能" : "更多功能"}" aria-expanded="${toolsOpen ? "true" : "false"}">${toolsOpen ? "×" : "+"}</button>
        <input class="community-chat-media-input" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,video/x-m4v" data-community-chat-media-input hidden>
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

function pageFollowing() {
  const users = state.communityFollowingUsers || [];
  return `
    ${topbar("我的关注", true)}
    <main class="content page-fresh following-page">
      <section class="section-title"><span>关注的壳友</span><small>${users.length} 人</small></section>
      <section class="following-user-list">
        ${users.map(user => `<button class="following-user-card fresh-card" type="button" data-view-following-user="${user.id}">${communityAvatar(user, "following-user-avatar")}<div><strong>${escapeHtml(user.name || "壳友")}</strong><span>${Number(user.postCount || 0)} 条动态 · ${Number(user.listingCount || 0)} 件在售</span></div><b>›</b></button>`).join("") || `<div class="empty small-empty"><div><strong>${followingLoading ? "正在加载关注" : "还没有关注壳友"}</strong><br>可以在壳友圈或商品详情中关注对方</div></div>`}
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
      <section class="following-profile-head fresh-card">${communityAvatar(user, "following-profile-avatar")}<div><h2>${escapeHtml(user.name || "壳友")}</h2><p>${posts.length} 条动态 · ${listings.length} 件在售商品</p></div><button class="active" type="button" data-toggle-community-follow="${user.id}">已关注</button></section>
      ${profileContentTabs(posts.length, listings.length, activeTab)}
      <section class="profile-content-panel ${activeTab === "posts" ? "is-posts" : "is-listings"}">${activeTab === "posts"
        ? `<section class="community-feed following-posts">${posts.map(communityFeedCard).join("") || `<div class="empty small-empty"><div><strong>暂时没有动态</strong></div></div>`}</section>`
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
      <section class="following-profile-head fresh-card">${communityAvatar(user, "following-profile-avatar")}<div><h2>${escapeHtml(user.name || "壳友")}</h2><p>${Number(user.postCount ?? posts.length)} 条动态 · ${Number(user.listingCount ?? listings.length)} 件在售商品</p></div>${user.isOwn ? "" : `<button class="${user.followed ? "active" : ""}" type="button" data-toggle-community-follow="${user.id}">${user.followed ? "已关注" : "关注"}</button>`}</section>
      ${profileContentTabs(posts.length, listings.length, activeTab)}
      <section class="profile-content-panel ${activeTab === "posts" ? "is-posts" : "is-listings"}">${activeTab === "posts"
        ? `<section class="community-feed following-posts">${posts.map(communityFeedCard).join("") || `<div class="empty small-empty"><div><strong>暂时没有动态</strong></div></div>`}</section>`
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
      <span class="market-media-drag-handle" title="长按拖动调整顺序" aria-hidden="true">⠿</span>
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
  return listings.map(item => ({
    ...item,
    price: Number(item.price || 0),
    viewCount: Math.max(0, Number(item.viewCount || 0)),
    wantCount: Math.max(0, Number(item.wantCount || 0)),
    photoUrl: item.photoUrl ? apiAssetUrl(item.photoUrl) : "",
    mediaItems: Array.isArray(item.mediaItems) ? item.mediaItems.slice(0, 9).map(media => ({
      ...media,
      url: media.url ? apiAssetUrl(media.url) : "",
      posterUrl: media.posterUrl || media.poster ? apiAssetUrl(media.posterUrl || media.poster) : ""
    })) : []
  }));
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
        <span class="market-card-seller">${marketSellerAvatar(item, "market-seller-avatar")}<i>${escapeHtml(item.sellerName || "壳友卖家")}</i>${item.delivery ? `<b class="market-card-delivery">${escapeHtml(item.delivery)}</b>` : ""}<em>${escapeHtml(item.city || "全国")}</em></span>
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
    if (item.status === "sold") return false;
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

function pageMarket() {
  const keyword = String(state.marketSearch || "").trim().toLowerCase();
  const stage = state.marketStage || "all";
  const listings = marketSearchResultListings();
  const regions = [...new Set((state.marketListings || []).map(item => String(item.city || "").trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, "zh-CN"));
  const showAssistSearch = Boolean(keyword || state.marketPriceOrder || state.marketFreshOnly || state.marketRegion || state.marketDelivery);
  return `
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
      <section class="market-grid">
        ${listings.map(marketListingCard).join("") || `<div class="market-empty"><span>龟</span><strong>${keyword || stage !== "all" ? "没有找到合适的商品" : "龟集市还没有商品"}</strong><p>从自己的乌龟档案一键发布，尺寸和状态会自动带入。</p><button type="button" data-page="marketAdd">发布第一只</button></div>`}
      </section>
      ${listings.length ? `<div class="market-feed-status" data-market-load-sentinel>${state.marketFeedLoadingMore ? "正在加载更多商品…" : state.marketFeedHasMore ? "继续上滑，加载更多" : "已经到底了"}</div>` : ""}
    </main>
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
          <input class="hidden-file" type="file" accept="image/*,video/mp4,video/webm,video/quicktime,video/x-m4v,.mp4,.mov,.m4v,.webm" multiple data-market-media-input>
          <p>长按右下角拖动图标可调整顺序，第一项会作为展示首图；最多添加9个，视频不得超过30秒，不限制文件大小。</p>
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
            <label><span>当前克重</span><input class="field" name="weight" type="number" min="0" step="0.1" value="${escapeHtml(formValue("weight"))}" placeholder="g"></label>
            <label><span>背甲长度<i class="required-mark" aria-hidden="true">*</i></span><input class="field" name="shellLength" type="number" min="0.1" step="0.1" value="${escapeHtml(formValue("shellLength", "carapaceLength"))}" placeholder="cm" required></label>
          </div>
          <label><span>出售价格</span><div class="market-price-input"><b>¥</b><input name="price" type="number" min="0" step="0.01" value="${escapeHtml(editingListing?.price ?? "")}" placeholder="0.00" required></div></label>
          <label class="market-check"><input name="negotiable" type="checkbox" ${editingListing?.negotiable ? "checked" : ""}><span>接受合理议价</span></label>
          <div class="market-form-two market-city-delivery-row">
            <div class="market-city-field">
              <div class="market-city-label"><span>所在城市<i class="required-mark" aria-hidden="true">*</i></span><button type="button" data-market-city-locate>⌖ 定位</button></div>
              <input class="field" name="city" maxlength="24" value="${escapeHtml(state.marketDraftCity || editingListing?.city || "")}" placeholder="正在获取所在城市" data-market-city required>
              <small data-market-city-hint>将自动填写您所在的城市</small>
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
  if (!item) return `${topbar("商品详情", true)}<main class="content page-fresh market-detail-page"><div class="empty"><strong>商品已下架</strong></div></main>`;
  const isOwn = Boolean(item.isOwn || item.pendingLocal);
  const sold = item.status === "sold";
  const mediaItems = marketListingMediaItems(item);
  const firstMediaIsVideo = mediaItems[0]?.type === "video";
  const primaryMediaItems = firstMediaIsVideo ? mediaItems.slice(0, 1) : mediaItems.filter(media => media.type !== "video");
  const secondaryMediaItems = firstMediaIsVideo ? mediaItems.slice(1) : [];
  const detailVideosAfterDescription = firstMediaIsVideo ? [] : mediaItems.filter(media => media.type === "video");
  const hasPrimaryGalleryControls = primaryMediaItems.length > 1;
  const detailMoreAction = `<button class="market-detail-more-button" type="button" data-market-detail-more="${escapeHtml(item.id)}" aria-label="商品更多操作" aria-haspopup="dialog">•••</button>`;
  return `
    ${topbar("商品详情", true, detailMoreAction)}
    <main class="content page-fresh market-detail-page">
      <section class="market-detail-gallery-wrap">
        <section class="market-detail-gallery" id="marketDetailGallery" data-market-detail-gallery>${primaryMediaItems.length ? primaryMediaItems.map((media, index) => `<div class="market-detail-photo">${media.type === "video" ? `<video src="${media.url}"${videoPosterAttribute(media)} controls playsinline preload="auto" crossorigin="anonymous" data-video-first-frame></video>` : `<img src="${media.url}" alt="${escapeHtml(item.title || "出售乌龟")} ${index + 1}" data-preview-market-image tabindex="0" role="button">`}${sold ? `<span>已售出</span>` : ""}</div>`).join("") : `<div class="market-detail-photo"><img src="${defaultPhoto}" alt="暂无实拍图" data-preview-market-image tabindex="0" role="button">${sold ? `<span>已售出</span>` : ""}</div>`}</section>
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
      ${secondaryMediaItems.length ? `<section class="market-detail-secondary-media">${secondaryMediaItems.map((media, index) => `<div class="market-detail-secondary-photo">${media.type === "video" ? `<video src="${media.url}"${videoPosterAttribute(media)} controls playsinline preload="auto" crossorigin="anonymous" data-video-first-frame></video>` : `<img src="${media.url}" alt="${escapeHtml(item.title || "出售乌龟")} 实拍 ${index + 2}" data-preview-market-image tabindex="0" role="button">`}</div>`).join("")}</section>` : ""}
      ${item.description ? `<section class="market-detail-description"><h3>卖家说明</h3><p>${escapeHtml(item.description)}</p></section>` : ""}
      ${detailVideosAfterDescription.length ? `<section class="market-detail-secondary-media market-detail-video-media">${detailVideosAfterDescription.map(media => `<div class="market-detail-secondary-photo"><video src="${media.url}"${videoPosterAttribute(media)} controls playsinline preload="auto" crossorigin="anonymous" data-video-first-frame></video></div>`).join("")}</section>` : ""}
      <section class="market-seller-card">
        <button class="market-seller-avatar-slot market-seller-profile-link" type="button" data-view-market-seller="${escapeHtml(item.sellerId || "")}" aria-label="查看${escapeHtml(item.sellerName || "卖家")}发布的商品">${marketSellerAvatar(item, "market-detail-avatar")}</button>
        <button class="market-seller-profile-link market-seller-name" type="button" data-view-market-seller="${escapeHtml(item.sellerId || "")}"><strong>${escapeHtml(item.sellerName || "壳友卖家")}</strong><span>${isOwn ? "这是我发布的商品" : "已通过账号认证"}</span></button>
        ${isOwn ? "" : `<div class="market-seller-actions"><button class="${item.sellerFollowed ? "active" : ""}" type="button" data-toggle-community-follow="${item.sellerId}">${item.sellerFollowed ? "已关注" : "关注"}</button><button type="button" data-market-contact="${item.id}">聊一聊</button></div>`}
      </section>
      <section class="market-safe-note"><b>交易咨询</b><p>先看近期实拍或视频，再确认健康、尺寸与交付方式；如需购买，请联系平台客服并发送商品咨询码，活体运输责任以双方确认内容为准。</p></section>
    </main>
    <div class="market-detail-actions">
      ${marketFavoriteButton(item, "market-detail-favorite")}
      ${!isOwn ? `<button class="market-contact-action" type="button" data-market-contact="${item.id}">联系卖家</button>` : ""}
      ${isOwn ? `<button class="market-delete-action" type="button" data-delete-market="${item.id}">删除</button><button class="market-sold-action" type="button" data-market-sold="${item.id}">${sold ? "恢复在售" : "标记已售"}</button>` : sold ? `<button class="market-sold-disabled" type="button" disabled>该商品已售出</button>` : `<button class="market-want-action" type="button" data-market-platform-service="${item.id}">联系平台客服</button>`}
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
        <div><h2>${escapeHtml(seller.sellerName || "壳友卖家")}</h2><p>${escapeHtml(seller.city || "全国")} · ${listings.length} 件在售商品</p></div>
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
    <section class="home-archive-section">
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
    <article class="turtle-row fresh-card ${menuOpen ? "menu-open" : ""}" data-view-turtle="${t.id}">
      <img src="${t.photo || defaultPhoto}" alt="${t.speciesName}">
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
      <img src="${photo}" alt="${species.name || t.speciesName}">
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
  const draftStatus = turtleFormValue("status", "正常饲养");
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
          <button class="text-green" type="button" data-page="species" style="margin-top:8px;">没有这个品种？去图鉴添加</button>
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
          <div class="label">饲养状态</div>
          <input type="hidden" name="status" value="${draftStatus}">
          <div class="radio-row status-choice-row">
            ${["正常饲养", "已转让", "已死亡"].map(value => `<button class="choice ${draftStatus === value ? "active" : ""}" type="button" data-turtle-choice="status" data-choice-value="${value}">${value}</button>`).join("")}
          </div>
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
  const profit = soldTotal - purchaseTotal - lossTotal;
  const profitLabel = profit > 0 ? "当前盈利" : profit < 0 ? "当前亏损" : "当前结余";
  const profitPrefix = profit > 0 ? "+" : profit < 0 ? "-" : "±";
  const dateText = dateRange.label;
  return `
    ${topbar("经营账本")}
    <main class="content page-fresh">
      <section class="page-intro ledger-intro"><div><p class="eyebrow dark">经营</p><h2>${records.length} 条资金明细</h2><p>${dateText}，收购、售出、损耗都可以留图、留尺寸。</p></div></section>
      <section class="ledger-profit-card ${profit < 0 ? "negative" : "positive"}">
        <div><span>${profitLabel}</span><strong><i>${profitPrefix}</i><em>${money(Math.abs(profit))}</em></strong><small>售出收入 − 收购投入 − 损耗金额</small></div>
        <mark>${dateText}</mark>
      </section>
      <section class="ledger-summary">
        <div class="purchase"><span>收购投入</span><strong class="ledger-summary-value"><i>-</i><em>${money(purchaseTotal)}</em></strong><small>${allRecords.filter(item => item.type === "purchase").length} 条</small></div>
        <div class="sold"><span>售出收入</span><strong class="ledger-summary-value"><i>+</i><em>${money(soldTotal)}</em></strong><small>${allRecords.filter(item => item.type === "sold").length} 条</small></div>
        <div class="loss"><span>损耗金额</span><strong class="ledger-summary-value"><i>-</i><em>${money(lossTotal)}</em></strong><small>${allRecords.filter(item => item.type === "loss").length} 条</small></div>
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
            ["sold", "记录售出"],
            ["loss", "记录损耗"]
          ].map(([key, label]) => `<button class="ledger-command-button ${state.ledgerDraftType === key ? "active" : ""}" type="button" data-new-ledger="${key}">${label}</button>`).join("")}
        </div>
      </section>
      ${state.ledgerDraftType ? ledgerForm() : ""}
      <section class="memo-tabs">
        ${["all:全部", "purchase:收购", "sold:售出", "loss:损耗"].map(item => {
          const [key, label] = item.split(":");
          return `<button class="tab ${state.ledgerTab === key ? "active" : ""}" data-ledger-tab="${key}">${label}</button>`;
        }).join("")}
      </section>
      ${records.map(ledgerRow).join("") || `<div class="empty"><div><strong>还没有账本记录</strong></div></div>`}
    </main>
    ${bottomNav()}
  `;
}

function ledgerForm() {
  const type = state.ledgerDraftType;
  const isPurchase = type === "purchase";
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
          <div><button class="secondary" type="button" data-ledger-photo-button>上传照片</button><p class="muted">和新建档案一样，可以上传这只龟当时的照片。</p></div>
        </div>
        <input class="hidden-file" type="file" accept="image/*" lang="zh-CN" title="选择图片" aria-label="选择图片" data-ledger-photo-input>
        ${!isPurchase ? `
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

      <section class="form-block fresh-card">
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
      </section>

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
        <h3>${isPurchase ? "入手记录" : `${ledgerTypeText(type)}记录`}</h3>
        <div class="label">${isPurchase ? "入手日期" : "日期"}</div><input class="field" name="recordDate" type="date" value="${today}">
        <div class="label">${isPurchase ? "花费(元)" : "金额(元)"}</div><input class="field" name="amount" type="number" min="0" step="0.01" required value="${escapeHtml(amountValue)}">
        <div class="label">备注</div><textarea name="note" placeholder="${isPurchase ? "性格、食欲、卖家、到家表现等都可以写在这里" : "客户、损耗原因、交接情况等都可以写在这里"}">${escapeHtml(ledgerFormValue("note"))}</textarea>
      </section>
      <button class="primary" type="submit">保存${ledgerTypeText(type)}</button>
    </form>
  `;
}

function ledgerRow(item) {
  const turtle = state.turtles.find(t => t.id === item.turtleId) || item.turtleSnapshot;
  const typeText = ledgerTypeText(item.type);
  const nickname = turtle?.code || String(item.title || "未关联档案").split(" · ")[0] || "未关联档案";
  const speciesName = turtle?.speciesName || item.speciesName || String(item.title || "").split(" · ").slice(1).join(" · ") || "未填写品种";
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
        <div class="ledger-turtle-meta"><span>${escapeHtml(String(weightText))}</span><span>${escapeHtml(carapaceText)}</span></div>
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
  return `
    ${topbar("账本详情", true)}
    <main class="content page-fresh">
      <section class="ledger-detail-hero">${item.photo ? `<img src="${item.photo}" alt="${typeText}照片">` : `<div class="ledger-detail-empty">${typeText}</div>`}</section>
      <section class="fresh-card ledger-detail-card">
        <div class="ledger-detail-head"><span class="ledger-inline-type ${item.type}">${typeText}</span><strong class="${item.type !== "sold" ? "danger-text" : ""}">${amountPrefix}${money(item.amount)}</strong></div>
        <h2>${turtle ? `${turtle.code} · ${turtle.speciesName}` : (item.title || "未关联档案")}</h2>
        <p class="muted">${item.recordDate || formatDate(item.createdAt)}</p>
        <div class="detail-grid">
          <div><span>档案状态</span><strong>${turtle ? "已保留快照" : "未关联"}</strong></div>
          <div><span>性别</span><strong>${turtle?.gender || "-"}</strong></div>
          <div><span>体重</span><strong>${item.weight || turtle?.weight || "-"}g</strong></div>
          <div><span>背甲长</span><strong>${item.carapaceLength || turtle?.carapaceLength || "-"}cm</strong></div>
          <div><span>背甲宽</span><strong>${item.carapaceWidth || turtle?.carapaceWidth || "-"}cm</strong></div>
          <div><span>背高</span><strong>${item.shellHeight || turtle?.shellHeight || "-"}cm</strong></div>
          <div><span>腹甲长</span><strong>${item.plastronLength || turtle?.plastronLength || "-"}cm</strong></div>
          <div><span>记录时间</span><strong>${formatTime(item.createdAt)}</strong></div>
          ${item.type === "sold" ? `<div><span>成交方式</span><strong>${escapeHtml(item.saleMethod || "未填写")}</strong></div>` : ""}
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
        <p>你可在“我的空间—账号与安全”中修改昵称和头像，并删除自己发布的动态或商品。对于访问、更正、导出或删除账号数据、注销账号等请求，请联系平台客服微信：<strong>${PLATFORM_SERVICE_WECHAT}</strong>，我们会在核验身份后处理。</p>
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
  $app.innerHTML = (pages[state.page] || pageHome)() + policyConsentGate();
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
  requestAnimationFrame(hydrateVideoFirstFrames);
  if (state.page === "communityChat") scrollCommunityChatToLatest();
  hydrateSpeciesImages();
  startAccountCodeCooldownTimer();
  if (state.page === "satisfaction") refreshPublicReviews();
  if (["feedback", "feedbackAdd", "feedbackDetail"].includes(state.page)) refreshPublicFeedback();
  if (["messages", "community", "communityFriends", "communityProfile", "mine"].includes(state.page)) refreshCommunity();
  if (["mine", "following", "followingProfile"].includes(state.page)) refreshFollowing();
  if (state.page === "moderation") refreshContentReports();
  if (state.page === "communityProfile" && state.selectedCommunityUserId) refreshCommunityUserProfile();
  if (state.page === "communityChat" && state.selectedCommunityFriendId) refreshCommunityChat();
  if (["market", "marketDetail", "marketSeller", "marketMy", "marketFavorites", "marketHistory", "following", "followingProfile", "mine"].includes(state.page)) refreshMarket();
  if (state.page === "marketAdd") requestMarketCityAutofill();
  if (state.page === "market") requestAnimationFrame(syncMarketWifiVideos);
  refreshMessageUnread();
}

function policyConsentGate() {
  if (!state.policyConsentRequired || !state.loggedInPhone) return "";
  return `
    <div class="policy-consent-overlay" role="dialog" aria-modal="true" aria-labelledby="policyConsentTitle">
      <section class="policy-consent-dialog">
        <p class="policy-consent-kicker">服务协议更新</p>
        <h1 id="policyConsentTitle">请阅读并同意服务协议</h1>
        <p>为继续使用壳友手账，请阅读最新版《服务与社区规则》和《隐私政策》。本次更新生效日期为 2026 年 7 月 17 日。</p>
        <div class="policy-consent-links">
          <a href="https://api.turtleworld.cn/terms.html" target="_blank" rel="noopener noreferrer">查看服务与社区规则 <b>›</b></a>
          <a href="https://api.turtleworld.cn/privacy.html" target="_blank" rel="noopener noreferrer">查看隐私政策 <b>›</b></a>
        </div>
        <label class="policy-consent-check"><input type="checkbox" data-policy-consent-check><span>我已阅读并同意上述协议</span></label>
        <p class="policy-consent-error" data-policy-consent-error hidden aria-live="polite"></p>
        <button class="primary policy-consent-submit" type="button" data-policy-consent-submit disabled>同意并继续使用</button>
        <button class="policy-consent-logout" type="button" data-policy-consent-logout>暂不同意，退出账号</button>
      </section>
    </div>
  `;
}

function scrollCommunityChatToLatest() {
  if (!pendingCommunityChatLatestScroll || state.page !== "communityChat") return;
  if (!communityChatLoadedKey && !(state.communityChatMessages || []).length) return;
  const scrollToBottom = () => {
    if (state.page !== "communityChat") return;
    const list = document.querySelector(".community-chat-list");
    if (!list) return;
    const top = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, list.scrollHeight);
    window.scrollTo({ top, left: 0, behavior: "auto" });
  };
  requestAnimationFrame(() => requestAnimationFrame(scrollToBottom));
  // Images and videos gain their final height after the first layout pass. Recheck
  // the bottom briefly so re-entering a conversation always lands on the newest media.
  [120, 420, 950].forEach(delay => window.setTimeout(scrollToBottom, delay));
  pendingCommunityChatLatestScroll = false;
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
    if (el.dataset.pageNavigationBound === "true") return;
    el.dataset.pageNavigationBound = "true";
    el.addEventListener("click", event => {
    event.preventDefault();
    const targetPage = el.dataset.page;
    if (targetPage === "add" && !requireArchiveCapacity()) return;
    if (["breedingAdd", "feedbackAdd", "communityAdd", "communityFriends", "marketAdd", "poolAdd"].includes(targetPage) && !requireLogin()) return;
    if (targetPage === "reports" && !requireLogin()) return;
    if (targetPage === "moderation" && !state.isCommunityAdmin) return toast("仅平台管理员可审核举报");
    const navigationState = { page: targetPage, openTurtleMenuId: "", openLedgerMenuId: "", openBreedingMenuId: "", openFeedbackMenuId: "", updatingTurtleId: "", turtleDetailDraftId: "", turtleDetailDraft: null, updateDraftPhoto: "" };
    if (targetPage === "poolAdd") navigationState.editingTurtlePoolId = "";
    if (targetPage === "marketAdd") {
      navigationState.editingMarketListingId = "";
      navigationState.marketDraftTurtleId = "";
      navigationState.marketDraftMedia = [];
      navigationState.marketDraftCity = "";
      navigationState.marketDraftDescription = "";
      navigationState.marketDraftDescriptionTemplate = "";
      navigationState.marketLocationStatus = "idle";
    }
    if (targetPage === "market" && state.page !== "market") {
      marketLastLoadedAt = 0;
      Object.assign(navigationState, {
        marketListings: [],
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
      setState(navigationState);
    });
  });
  document.querySelectorAll("[data-open-platform-wechat]").forEach(button => button.addEventListener("click", openPlatformWeChat));
  document.querySelectorAll("[data-open-platform-service-dialog]").forEach(button => button.addEventListener("click", openMarketTopService));
  document.querySelectorAll("[data-back]").forEach(el => el.addEventListener("click", () => setState(backNavigationState(), { pageMotion: "none" })));
  document.querySelectorAll("[data-view-turtle]").forEach(el => el.addEventListener("click", () => setState({ page: "turtleDetail", selectedTurtleId: el.dataset.viewTurtle, openTurtleMenuId: "", updatingTurtleId: "", turtleDetailDraftId: "", turtleDetailDraft: null, updateDraftPhoto: "" })));
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
  document.querySelectorAll("[data-preview-market-image]").forEach(img => {
    const openPreview = () => openImagePreview(img.currentSrc || img.src, img.alt || "商品实拍图");
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
  document.querySelector("[data-community-media-button]")?.addEventListener("click", () => document.querySelector("[data-community-media-input]")?.click());
  document.querySelector("[data-community-media-input]")?.addEventListener("change", readCommunityMedia);
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
      if (event.target.closest("button, input, textarea, select, form")) return;
      setState({ page: "communityPostDetail", selectedCommunityPostId: card.dataset.viewCommunityPost, openCommunityActionId: "", communityCommentPostId: "" }, { skipCloud: true });
    };
    card.addEventListener("click", openDetail);
    card.addEventListener("keydown", event => {
      if (event.target !== card || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      openDetail(event);
    });
  });
  document.querySelectorAll("[data-preview-community-media]").forEach(button => button.addEventListener("click", () => {
    const post = findCommunityPost(button.dataset.previewCommunityMedia);
    if (!post?.mediaUrl) return;
    if (post.mediaType === "video") openVideoPreview(post.mediaUrl, "动态视频");
    else openImagePreview(post.mediaUrl, "动态图片");
  }));
  document.querySelectorAll("[data-like-community-post]").forEach(btn => btn.addEventListener("click", () => toggleCommunityLike(btn.dataset.likeCommunityPost)));
  document.querySelectorAll("[data-community-more]").forEach(btn => btn.addEventListener("click", () => setState({ openCommunityActionId: state.openCommunityActionId === btn.dataset.communityMore ? "" : btn.dataset.communityMore }, { skipCloud: true })));
  document.querySelectorAll("[data-open-content-report]").forEach(btn => btn.addEventListener("click", event => {
    event.stopPropagation();
    openContentReportDialog(btn.dataset.reportType, btn.dataset.reportId);
  }));
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
    event.stopPropagation();
    toggleCommunityConversationPin(btn.dataset.toggleConversationPin);
  }));
  document.querySelectorAll("[data-delete-conversation]").forEach(btn => btn.addEventListener("click", event => {
    event.stopPropagation();
    deleteCommunityConversation(btn.dataset.deleteConversation);
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
  document.querySelector("[data-toggle-community-chat-tools]")?.addEventListener("click", () => {
    document.querySelector("#communityChatForm input[name='content']")?.blur();
    setState({ communityChatToolsOpen: !state.communityChatToolsOpen }, { skipCloud: true });
  });
  document.querySelector("[data-community-chat-media-button]")?.addEventListener("click", () => {
    document.querySelector("[data-community-chat-media-input]")?.click();
  });
  bindCommunityChatCameraButton();
  document.querySelector("[data-community-chat-media-input]")?.addEventListener("change", sendCommunityChatMedia);
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
  if (marketDetailGallery) {
    const slides = Array.from(marketDetailGallery.querySelectorAll(".market-detail-photo"));
    const previous = document.querySelector("[data-market-gallery-prev]");
    const next = document.querySelector("[data-market-gallery-next]");
    const count = document.querySelector("[data-market-gallery-count]");
    const updateGalleryControls = () => {
      const index = Math.max(0, Math.min(slides.length - 1, Math.round(marketDetailGallery.scrollLeft / Math.max(1, marketDetailGallery.clientWidth))));
      if (previous) previous.disabled = index === 0;
      if (next) next.disabled = index >= slides.length - 1;
      if (count) count.textContent = `${index + 1}/${slides.length}`;
    };
    const moveGallery = offset => {
      const current = Math.round(marketDetailGallery.scrollLeft / Math.max(1, marketDetailGallery.clientWidth));
      const target = Math.max(0, Math.min(slides.length - 1, current + offset));
      marketDetailGallery.scrollTo({ left: target * marketDetailGallery.clientWidth, behavior: "smooth" });
    };
    previous?.addEventListener("click", () => moveGallery(-1));
    next?.addEventListener("click", () => moveGallery(1));
    marketDetailGallery.addEventListener("scroll", updateGalleryControls, { passive: true });
    window.addEventListener("resize", updateGalleryControls, { once: true });
    requestAnimationFrame(updateGalleryControls);
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
  document.querySelector("[data-market-city]")?.addEventListener("input", event => {
    state.marketDraftCity = event.target.value;
    state.marketLocationStatus = "manual";
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
  const policyConsentCheck = document.querySelector("[data-policy-consent-check]");
  const policyConsentSubmit = document.querySelector("[data-policy-consent-submit]");
  policyConsentCheck?.addEventListener("change", () => {
    if (policyConsentSubmit) policyConsentSubmit.disabled = !policyConsentCheck.checked;
  });
  policyConsentSubmit?.addEventListener("click", acceptLatestPolicies);
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
  if (!CONFIGURED_SMS_BACKEND || marketLoading) return;
  if (isMarketFeed && state.marketFeedInitialized && !force) return;
  if (!force && Date.now() - marketLastLoadedAt < 10000) return;
  marketLoading = true;
  try {
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
  if (!CONFIGURED_SMS_BACKEND || state.page !== "market" || marketLoading || state.marketFeedLoadingMore || !state.marketFeedHasMore) return;
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

  const mediaItems = Array.from(document.querySelectorAll("[data-market-media-index]"));
  let desktopDragIndex = null;
  const clearDragState = () => mediaItems.forEach(item => item.classList.remove("is-dragging", "is-drag-over"));
  const itemAtPoint = (x, y) => document.elementFromPoint(x, y)?.closest("[data-market-media-index]");

  mediaItems.forEach(item => {
    const index = Number(item.dataset.marketMediaIndex);
    const handle = item.querySelector(".market-media-drag-handle");

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

    if (!handle) return;
    let pressTimer = null;
    let pointerId = null;
    let active = false;
    let destinationIndex = index;

    const clearTouchDrag = () => {
      if (pressTimer) window.clearTimeout(pressTimer);
      pressTimer = null;
      pointerId = null;
      active = false;
      clearDragState();
    };

    handle.addEventListener("pointerdown", event => {
      if (!event.isPrimary || event.pointerType === "mouse") return;
      event.preventDefault();
      pointerId = event.pointerId;
      destinationIndex = index;
      pressTimer = window.setTimeout(() => {
        active = true;
        item.classList.add("is-dragging");
        handle.setPointerCapture?.(pointerId);
        navigator.vibrate?.(12);
      }, 180);
    });
    handle.addEventListener("pointermove", event => {
      if (event.pointerId !== pointerId || !active) return;
      event.preventDefault();
      const target = itemAtPoint(event.clientX, event.clientY);
      const targetIndex = Number(target?.dataset.marketMediaIndex);
      if (!Number.isInteger(targetIndex)) return;
      destinationIndex = targetIndex;
      mediaItems.forEach(entry => entry.classList.toggle("is-drag-over", entry === target && entry !== item));
    });
    handle.addEventListener("pointerup", event => {
      if (event.pointerId !== pointerId) return;
      const shouldMove = active && destinationIndex !== index;
      const targetIndex = destinationIndex;
      clearTouchDrag();
      if (shouldMove) moveMarketDraftMedia(index, targetIndex);
    });
    handle.addEventListener("pointercancel", clearTouchDrag);
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
  try {
    for (const file of files) {
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
    }
    state.marketDraftMedia = [...current, ...nextItems].slice(0, 9);
    renderMarketMediaDraft();
  } catch (error) {
    toast(error.message || "媒体读取失败");
  }
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
    success: ["重新定位", "已按当前位置自动填写，可手动修改"],
    error: ["重新定位", "定位失败，请手动填写或重新定位"],
    manual: ["重新定位", "已手动填写；可重新定位覆盖"],
    idle: ["定位", "将自动填写您所在的城市"]
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
  if (!force && String(state.marketDraftCity || "").trim()) {
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
    if (force || !String(state.marketDraftCity || "").trim()) {
      state.marketDraftCity = city;
      if (input) input.value = city;
    }
    state.marketLocationStatus = "success";
    updateMarketCityLocationUi();
  } catch {
    state.marketLocationStatus = "error";
    updateMarketCityLocationUi();
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
  if (!canUseCommunity()) return;
  const editingListingId = state.editingMarketListingId;
  const form = new FormData(event.currentTarget);
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
    delivery: String(form.get("delivery") || ""),
    description: String(form.get("description") || "").trim()
  };
  const missingFields = [
    !payload.title && "出售标题",
    !payload.speciesName && "品种",
    !payload.stage && "阶段",
    !payload.shellLength && "背甲长度",
    payload.shellLength && (!Number.isFinite(Number(payload.shellLength)) || Number(payload.shellLength) <= 0) && "背甲长度",
    !payload.city && "所在城市",
    !payload.delivery && "交付方式",
    !payload.description && "详细说明"
  ].filter(Boolean);
  if (missingFields.length || payload.price < 0) return toast(`请填写必填项：${[...new Set(missingFields)].join("、") || "出售价格"}`);
  if (!localMedia.length) return toast("请至少添加一张实拍图片或一段视频");
  try {
    const mediaItems = [];
    for (const media of localMedia) {
      const source = media.dataUrl || media.url || "";
      if (!source) continue;
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
        const uploaded = await apiUploadMediaFile(media.file, media.duration || 0);
        mediaItems.push({ url: uploaded.url || source, type: uploaded.mediaType || media.type || "video", posterUrl });
      } else if (source.startsWith("data:")) {
        const uploaded = await apiPost("/api/upload/media", marketAuthPayload({ media: source }));
        mediaItems.push({ url: uploaded.url || source, type: uploaded.mediaType || media.type || "image", posterUrl });
      } else {
        mediaItems.push({ url: source, type: media.type || "image", posterUrl });
      }
    }
    const photoUrl = mediaItems[0]?.url || "";
    const result = await apiPost(editingListingId ? "/api/market/update" : "/api/market/create", marketAuthPayload({
      ...payload,
      listingId: editingListingId,
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
    state.marketDraftDescription = "";
    state.marketDraftDescriptionTemplate = "";
    state.marketLocationStatus = "idle";
    state.editingMarketListingId = "";
    marketLastLoadedAt = Date.now();
    setState({
      page: editingListingId ? "marketMy" : "market",
      marketListings: normalizeMarketListings(result.listings || []),
      myMarketListings: normalizeMarketListings(result.myListings || [])
    }, { skipCloud: true });
    toast(editingListingId ? "商品已保存并刷新" : "商品已发布，7 天未刷新将自动下架");
  } catch (error) {
    if (error.status === 405 || error.message === "方法不支持") {
      toast("服务器尚未更新，暂时无法发布九宫格商品");
      return;
    }
    toast(error.message || "发布失败");
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
    marketDraftCity: listing.city || "",
    marketDraftDescription: listing.description || "",
    marketDraftDescriptionTemplate: "",
    marketLocationStatus: "manual"
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
  await recordMarketWant(listingId);
  const buyMessage = `你好，我想咨询「${listing.title || listing.speciesName || "这只龟"}」，请问现在还在售吗？`;
  marketChatDraft = buyMessage;
  try {
    let friend = (state.communityFriends || []).find(item => item.id === listing.sellerId) || {
      id: listing.sellerId,
      name: listing.sellerName,
      avatar: listing.sellerAvatar
    };
    const sent = await apiPost("/api/community/chat/send", communityAuthPayload({
      userId: listing.sellerId,
      content: buyMessage,
      marketListingId: listing.id
    }));
    friend = sent.friend || friend;
    const messages = sent.messages || [];
    const marketListing = normalizeCommunityChatListing(sent.marketListing) || normalizeCommunityChatListing({
      ...listing,
      mediaUrl: marketListingMediaItems(listing)[0]?.url || listing.photoUrl || "",
      mediaType: marketListingMediaItems(listing)[0]?.type || "image"
    });
    marketChatDraft = "";
    communityChatLoadedKey = `${listing.sellerId}:${Math.floor(Date.now() / 10000)}`;
    pendingCommunityChatLatestScroll = true;
    setState({
      page: "communityChat",
      selectedCommunityFriendId: listing.sellerId,
      selectedCommunityFriend: friend,
      communityChatMessages: messages,
      communityChatListing: marketListing,
      communityChatToolsOpen: false,
      communityFriends: communityFriendsWithPreview(listing.sellerId, friend, messages, { unreadCount: 0 })
    }, { skipCloud: true });
    refreshMessageUnread(true);
  } catch (error) {
    toast(error.message === "方法不支持" ? "联系卖家功能将在服务更新后开放" : (error.message || "暂时无法联系卖家"));
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

function marketShareUrl(listing) {
  const base = String(window.TURTLE_PUBLIC_APP_URL || "https://api.turtleworld.cn/").replace(/\/?$/, "/");
  return `${base}?market=${encodeURIComponent(String(listing?.id || ""))}`;
}

async function shareMarketListing(listingId) {
  const listing = (state.marketListings || []).find(item => item.id === String(listingId || ""));
  if (!listing) return toast("商品信息不存在");
  const url = marketShareUrl(listing);
  const title = listing.title || `${listing.speciesName || "乌龟"}在售`;
  const text = `${title} · ${money(listing.price)}`;
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
        ${isOwn ? "" : `<button type="button" class="danger" data-market-report-from-menu="${escapeHtml(listing.id)}"><span aria-hidden="true">!</span><small>举报</small></button>`}
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
  overlay.querySelector("[data-market-share-listing]")?.focus();
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

function normalizeCommunityPosts(posts = []) {
  return posts.map(item => ({
    ...item,
    authorName: item.authorName || "壳友",
    authorAvatar: item.authorAvatar ? apiAssetUrl(item.authorAvatar) : "",
    mediaUrl: item.mediaUrl ? apiAssetUrl(item.mediaUrl) : "",
    comments: Array.isArray(item.comments) ? item.comments.map(comment => ({
      ...comment,
      authorAvatar: comment.authorAvatar ? apiAssetUrl(comment.authorAvatar) : ""
    })) : []
  }));
}

async function refreshCommunity(force = false) {
  if (!CONFIGURED_SMS_BACKEND || communityLoading) return;
  if (!force && Date.now() - communityLastLoadedAt < 10000) return;
  communityLoading = true;
  try {
    const result = await apiPost("/api/community/list", communityAuthPayload());
    communityLastLoadedAt = Date.now();
    const friends = mergeCommunityFriends(Array.isArray(result.friends) ? result.friends : []);
    const messageUnreadCount = friends.reduce((sum, friend) => sum + Math.max(0, Number(friend.unreadCount || 0)), 0);
    const profileStats = result.profileStats && typeof result.profileStats === "object"
      ? {
        receivedLikes: Math.max(0, Number(result.profileStats.receivedLikes || 0)),
        followerCount: Math.max(0, Number(result.profileStats.followerCount || 0))
      }
      : state.communityProfileStats;
    setState({
      communityPosts: normalizeCommunityPosts(result.posts || []),
      communityProfileStats: profileStats,
      isCommunityAdmin: Boolean(result.isAdmin),
      communityFriends: friends,
      messageUnreadCount
    }, { skipCloud: true });
  } catch (error) {
    console.warn(error.message || "壳友圈读取失败");
  } finally {
    communityLoading = false;
  }
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
  if (!userId || !CONFIGURED_SMS_BACKEND || communityUserProfileLoading) return;
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

function syncCommunityPublishButton() {
  const submit = document.querySelector(".community-compose-submit");
  if (!submit) return;
  const text = document.querySelector("#communityPostForm textarea")?.value.trim() || "";
  const hasMedia = Boolean(
    communityDraftMedia ||
    document.querySelector(".community-media-preview img, .community-media-preview video")
  );
  const ready = Boolean(text || hasMedia);
  submit.classList.toggle("is-ready", ready);
  submit.dataset.ready = ready ? "true" : "false";
  if (ready) submit.removeAttribute("disabled");
  else submit.setAttribute("disabled", "");
  submit.setAttribute("aria-disabled", ready ? "false" : "true");
}

async function readCommunityMedia(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const openComposerAfterRead = event.currentTarget.hasAttribute("data-community-quick-media");
  communityDraftText = document.querySelector("#communityPostForm textarea")?.value || communityDraftText;
  if (!/^(image\/(jpeg|png|webp)|video\/(mp4|webm|quicktime))$/i.test(file.type)) {
    event.target.value = "";
    return toast("请选择 JPG、PNG、WebP、MP4、WebM 或 MOV");
  }
  const isVideo = file.type.startsWith("video/");
  if (!isVideo && file.size > 10 * 1024 * 1024) {
    event.target.value = "";
    return toast("图片不能超过 10MB");
  }
  try {
    let duration = 0;
    if (isVideo) {
      duration = await readVideoDuration(file);
      if (duration > 30) {
        event.target.value = "";
        return toast("视频时长不能超过30秒");
      }
    }
    if (communityDraftMediaFile && communityDraftMedia.startsWith("blob:")) URL.revokeObjectURL(communityDraftMedia);
    communityDraftMedia = isVideo ? URL.createObjectURL(file) : await fileAsDataUrl(file);
    communityDraftMediaType = isVideo ? "video" : "image";
    communityDraftMediaFile = isVideo ? file : null;
    communityDraftMediaDuration = duration;
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
  if (!content && !communityDraftMedia) return toast("写点内容，或添加图片、视频");
  try {
    let mediaUrl = "";
    let mediaType = "";
    if (communityDraftMedia) {
      const uploaded = communityDraftMediaFile
        ? await apiUploadMediaFile(communityDraftMediaFile, communityDraftMediaDuration)
        : await apiPost("/api/upload/media", communityAuthPayload({ media: communityDraftMedia }));
      mediaUrl = uploaded.url || "";
      mediaType = uploaded.mediaType || communityDraftMediaType;
    }
    const result = await apiPost("/api/community/create", communityAuthPayload({ content, mediaUrl, mediaType, visibility }));
    if (communityDraftMediaFile && communityDraftMedia.startsWith("blob:")) URL.revokeObjectURL(communityDraftMedia);
    communityDraftMedia = "";
    communityDraftMediaType = "";
    communityDraftMediaFile = null;
    communityDraftMediaDuration = 0;
    communityDraftText = "";
    communityLastLoadedAt = Date.now();
    setState({ page: "community", communityPosts: normalizeCommunityPosts(result.posts || []), communityFriends: result.friends || state.communityFriends }, { skipCloud: true });
    toast("动态已发布");
  } catch (error) {
    if (error.status === 405 || error.message === "方法不支持") {
      const localPost = {
        id: `local-${Date.now()}`,
        content,
        mediaUrl: communityDraftMedia,
        mediaType: communityDraftMediaType,
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
      communityDraftMedia = "";
      communityDraftMediaType = "";
      communityDraftMediaFile = null;
      communityDraftMediaDuration = 0;
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

function communityFriendsWithPreview(userId, friend, messages = [], options = {}) {
  const preview = latestCommunityMessagePreview(messages);
  const current = (state.communityFriends || []).find(item => item.id === userId);
  const mergedFriend = {
    ...(current || {}),
    ...(friend || {}),
    id: userId,
    unreadCount: Number(options.unreadCount ?? current?.unreadCount ?? friend?.unreadCount ?? 0),
    lastMessage: preview?.lastMessage || current?.lastMessage || friend?.lastMessage || "",
    lastMessageAt: preview?.lastMessageAt || current?.lastMessageAt || friend?.lastMessageAt || ""
  };
  const nextFriends = (state.communityFriends || [])
    .filter(item => item.id !== userId)
    .concat(mergedFriend)
    .sort((left, right) => new Date(right.lastMessageAt || right.createdAt || 0) - new Date(left.lastMessageAt || left.createdAt || 0));
  return nextFriends;
}

function mergeCommunityFriends(incomingFriends = []) {
  const previous = state.communityFriends || [];
  const previousMap = new Map(previous.map(item => [item.id, item]));
  const incomingIds = new Set();
  const merged = (Array.isArray(incomingFriends) ? incomingFriends : []).map(friend => {
    incomingIds.add(friend.id);
    const old = previousMap.get(friend.id) || {};
    return {
      ...old,
      ...friend,
      lastMessage: friend.lastMessage || old.lastMessage || "",
      lastMessageAt: friend.lastMessageAt || old.lastMessageAt || ""
    };
  });
  previous.forEach(friend => {
    if (!incomingIds.has(friend.id) && (friend.lastMessage || friend.lastMessageAt)) merged.push(friend);
  });
  return merged.sort((left, right) => Number(right.pinned) - Number(left.pinned) || new Date(right.lastMessageAt || right.createdAt || 0) - new Date(left.lastMessageAt || left.createdAt || 0));
}

function openCommunityChat(userId) {
  if (!canUseCommunity()) return;
  marketChatDraft = "";
  communityChatLoadedKey = "";
  pendingCommunityChatLatestScroll = true;
  setState({ page: "communityChat", selectedCommunityFriendId: userId, selectedCommunityFriend: (state.communityFriends || []).find(item => item.id === userId) || communityUserSnapshot(userId), communityChatMessages: [], communityChatListing: null, communityChatToolsOpen: false }, { skipCloud: true, pageMotion: "chat" });
}

async function toggleCommunityConversationPin(userId) {
  if (!canUseCommunity()) return;
  try {
    const result = await apiPost("/api/community/chat/pin", communityAuthPayload({ userId }));
    setState({ communityFriends: Array.isArray(result.friends) ? result.friends : [] }, { skipCloud: true });
  } catch (error) {
    toast(error.message || "操作失败，请重试");
  }
}

async function deleteCommunityConversation(userId) {
  const friend = (state.communityFriends || []).find(item => item.id === userId);
  const name = String(friend?.name || "该用户").trim();
  if (!canUseCommunity() || !confirm(`确认删除与“${name}”的聊天记录吗？\n\n删除后将不再显示此会话；收到对方新消息时会再次出现。`)) return;
  try {
    const result = await apiPost("/api/community/chat/delete", communityAuthPayload({ userId }));
    setState({ communityFriends: Array.isArray(result.friends) ? result.friends : [] }, { skipCloud: true });
  } catch (error) {
    toast(error.message || "删除失败，请重试");
  }
}

async function refreshMessageUnread(force = false) {
  if (!CONFIGURED_SMS_BACKEND || messageUnreadLoading) return;
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
    if (unreadCount !== Number(state.messageUnreadCount || 0) || friendSignature(friends) !== friendSignature(state.communityFriends)) {
      setState({ messageUnreadCount: unreadCount, communityFriends: friends }, { skipCloud: true });
    }
  } catch (error) {
    if (error.status !== 405 && error.message !== "方法不支持") console.warn(error.message || "未读消息读取失败");
  } finally {
    messageUnreadLoading = false;
  }
}

function startMessageUnreadPolling() {
  if (messageUnreadTimer) return;
  messageUnreadTimer = setInterval(() => {
    if (!document.hidden) refreshMessageUnread(true);
  }, 5000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshMessageUnread(true);
  });
}

async function refreshCommunityChat(force = false) {
  const userId = state.selectedCommunityFriendId;
  if (!userId || !CONFIGURED_SMS_BACKEND || communityChatLoading) return;
  const key = `${userId}:${Math.floor(Date.now() / 10000)}`;
  if (!force && communityChatLoadedKey === key) return;
  communityChatLoading = true;
  try {
    const result = await apiPost("/api/community/chat/list", communityAuthPayload({ userId }));
    communityChatLoadedKey = key;
    const friend = result.friend || state.selectedCommunityFriend;
    const messages = result.messages || [];
    setState({
      selectedCommunityFriend: friend,
      communityChatMessages: messages,
      communityChatListing: normalizeCommunityChatListing(result.marketListing),
      communityFriends: communityFriendsWithPreview(userId, friend, messages, { unreadCount: 0 })
    }, { skipCloud: true });
    refreshMessageUnread(true);
    refreshCommunity(true);
  } catch (error) {
    toast(error.message || "聊天记录读取失败");
  } finally {
    communityChatLoading = false;
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

function applyCommunityChatSendResult(result, options = {}) {
  marketChatDraft = "";
  communityChatLoadedKey = `${state.selectedCommunityFriendId}:${Math.floor(Date.now() / 10000)}`;
  pendingCommunityChatLatestScroll = true;
  const friend = result.friend || state.selectedCommunityFriend;
  const messages = result.messages || [];
  setState({
    selectedCommunityFriend: friend,
    communityChatMessages: messages,
    communityChatListing: normalizeCommunityChatListing(result.marketListing) || state.communityChatListing,
    communityChatToolsOpen: Boolean(options.keepToolsOpen),
    communityFriends: communityFriendsWithPreview(state.selectedCommunityFriendId, friend, messages, { unreadCount: 0 })
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

  if (mode === "login") {
    if (CONFIGURED_SMS_BACKEND) {
      try {
        const result = await apiPost("/api/account/login", { phone, password });
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
    const accountData = normalizeAccountData(user.data || {});
    setState({
      ...accountData,
      loggedInPhone: phone,
      accountName: user.accountName || maskPhone(phone),
      accountAvatar: user.accountAvatar || "",
      accountDraftPhone: "",
      accountDraftPassword: "",
      accountDraftConfirmPassword: "",
      policyConsentRequired: user.termsVersion !== POLICY_VERSION,
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
  if (!form.get("termsAccepted")) return toast("请先阅读并同意服务规则和隐私政策");
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
    activityLogs: logActivity(`更新账号资料：${nickname}`, "空间")
  });
  toast("昵称和头像已保存");
}

async function acceptLatestPolicies() {
  if (!state.loggedInPhone) return;
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
    push.addListener("pushNotificationReceived", () => {
      // The native banner/sound is presented by the iOS PushNotifications setting.
      refreshMessageUnread(true);
    });
    push.addListener("pushNotificationActionPerformed", event => {
      const senderId = String(event?.notification?.data?.senderId || "");
      const route = String(event?.notification?.data?.route || "");
      if (route === "memos") setState({ page: "memos" }, { skipCloud: true });
      else if (senderId && state.loggedInPhone && currentCloudToken()) openCommunityChat(senderId);
      else setState({ page: "messages" }, { skipCloud: true });
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
  }
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
  if (path === "/api/upload/image" && response.status === 401) {
    forgetCloudToken(state.loggedInPhone);
    state.cloudToken = "";
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
  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || "服务暂时不可用");
    error.status = response.status;
    throw error;
  }
  return data;
}

async function apiUploadMediaFile(file, duration = 0) {
  const base = window.TURTLE_API_BASE_URL || "";
  const mediaKind = localMediaFileKind(file);
  const contentType = localMediaUploadMimeType(file, mediaKind);
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
  if (response.status === 401) {
    forgetCloudToken(state.loggedInPhone);
    state.cloudToken = "";
  }
  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || "视频上传失败");
    error.status = response.status;
    throw error;
  }
  return data;
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
    createdAt: user.createdAt || new Date().toISOString()
  };
}

function applyCloudUser(user, activityText = "", options = {}) {
  const localUser = cloudUserToLocal(user, currentCloudToken());
  if (localUser.phone && localUser.cloudToken) rememberCloudToken(localUser.phone, localUser.cloudToken);
  const accountData = normalizeAccountData(localUser.data || {});
  const activityLogs = activityText
    ? [makeActivity(activityText, "空间"), ...(accountData.activityLogs || [])]
    : accountData.activityLogs;
  setState({
    ...accountData,
    communityPosts: [],
    communityFriends: [],
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
    page: "mine"
  }, options);
  if (!options.skipMigration && CONFIGURED_SMS_BACKEND && localUser.cloudToken) {
    scheduleCloudImageMigration(600);
  }
  window.setTimeout(setupNativePushNotifications, 0);
}

function queueCloudSave() {
  if (!CONFIGURED_SMS_BACKEND || !state.loggedInPhone || !currentCloudToken()) return;
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
  try {
    const result = await apiPost("/api/account/load", {
      phone: state.loggedInPhone,
      token: currentCloudToken()
    });
    if (result.user) applyCloudUser(result.user, "", { skipCloud: true });
  } catch (error) {
    console.warn(error.message || "云端数据读取失败");
  }
}

async function startCloudSessionHydration() {
  if (cloudHydrationStarted || !hasCloudSession()) return;
  cloudHydrationStarted = true;
  try {
    if (accountHasContent(state)) {
      const hadEmbeddedImages = accountHasEmbeddedImages(state);
      const migratedImages = await migrateEmbeddedImagesToCloud({ silent: true });
      if (hadEmbeddedImages && !migratedImages) return;
      await pushCloudDataNow(true);
    }
    await refreshCloudAccountFromServer();
    await migrateEmbeddedImagesToCloud({ silent: true });
  } catch (error) {
    console.warn(error.message || "云端数据初始化失败");
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
  const linkedTurtleId = type === "purchase" ? "" : turtleId;
  const turtle = state.turtles.find(t => t.id === linkedTurtleId);
  const initialPoolId = (type === "purchase" || type === "loss") ? (turtle?.poolId || "") : "";
  setState({ page: "ledger", ledgerDraftType: type, ledgerDraftPhoto: turtle?.photo || "", ledgerDraftTurtleId: linkedTurtleId, ledgerDraftForm: linkedTurtleId ? { turtleId: linkedTurtleId, poolId: initialPoolId } : { poolId: initialPoolId }, ledgerPurchaseGender: "未知", ledgerTab: type, openTurtleMenuId: "" }, { pageScroll: "preserve" });
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
  const title = turtle ? turtleLabel(turtle) : (String(form.get("note") || "").trim().split(/[，。\n]/)[0] || "未关联档案");
  const record = {
    id: crypto.randomUUID(),
    type,
    turtleId: turtle?.id || (type === "purchase" ? "" : form.get("turtleId")),
    poolId,
    poolName,
    title,
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

function openImagePreview(src, alt = "图片预览") {
  document.querySelector(".image-preview-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "image-preview-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", alt);

  const closeButton = document.createElement("button");
  closeButton.className = "image-preview-close";
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "关闭图片预览");
  closeButton.textContent = "×";

  const image = document.createElement("img");
  image.src = src;
  image.alt = alt;

  const caption = document.createElement("span");
  caption.className = "image-preview-caption";
  caption.textContent = alt;

  overlay.append(closeButton, image, caption);
  document.body.appendChild(overlay);
  document.body.classList.add("image-preview-open");

  const close = () => {
    document.removeEventListener("keydown", handleKeydown);
    document.body.classList.remove("image-preview-open");
    overlay.remove();
  };
  const handleKeydown = event => {
    if (event.key === "Escape") close();
  };

  closeButton.addEventListener("click", close);
  overlay.addEventListener("click", event => {
    if (event.target === overlay) close();
  });
  document.addEventListener("keydown", handleKeydown);
  closeButton.focus();
}

function openVideoPreview(src, alt = "视频预览", poster = "") {
  document.querySelector(".image-preview-overlay")?.remove();

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

  const caption = document.createElement("span");
  caption.className = "image-preview-caption";
  caption.textContent = alt;

  overlay.append(closeButton, video, caption);
  document.body.appendChild(overlay);
  document.body.classList.add("image-preview-open");
  video.play().catch(() => {});

  const close = () => {
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

  closeButton.addEventListener("click", close);
  overlay.addEventListener("click", event => {
    if (event.target === overlay) close();
  });
  document.addEventListener("keydown", handleKeydown);
  closeButton.focus();
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
  let indicator = document.querySelector(".pull-refresh-indicator");
  if (indicator) return indicator;
  indicator = document.createElement("div");
  indicator.className = "pull-refresh-indicator";
  indicator.setAttribute("aria-live", "polite");
  indicator.innerHTML = `<i aria-hidden="true">↓</i><span>下拉刷新</span>`;
  document.body.appendChild(indicator);
  return indicator;
}

function setPullRefreshIndicator({ distance = 0, ready = false, refreshing = false } = {}) {
  const indicator = pullRefreshIndicator();
  const visibleDistance = refreshing ? 62 : Math.min(PULL_REFRESH_MAX_OFFSET, Math.max(0, distance * .56));
  const pageOffset = refreshing ? 54 : Math.min(PULL_REFRESH_MAX_OFFSET, Math.max(0, distance * .42));
  const label = refreshing ? "正在刷新中" : ready ? "松开即可刷新" : "下拉刷新";
  indicator.style.setProperty("--pull-refresh-distance", `${visibleDistance}px`);
  indicator.classList.toggle("is-visible", visibleDistance > 0);
  indicator.classList.toggle("is-ready", Boolean(ready) && !refreshing);
  indicator.classList.toggle("is-refreshing", Boolean(refreshing));
  indicator.querySelector("span").textContent = label;

  document.body.style.setProperty("--pull-refresh-page-offset", `${pageOffset}px`);
  document.body.classList.toggle("pull-refresh-active", pageOffset > 0);
  document.body.classList.toggle("pull-refresh-dragging", pageOffset > 0 && !refreshing);
}

function schedulePullRefreshIndicator(nextState) {
  if (pullRefreshAnimationFrame) return;
  pullRefreshAnimationFrame = requestAnimationFrame(() => {
    pullRefreshAnimationFrame = 0;
    setPullRefreshIndicator(nextState || pullRefreshState);
  });
}

function cancelScheduledPullRefreshIndicator() {
  if (!pullRefreshAnimationFrame) return;
  cancelAnimationFrame(pullRefreshAnimationFrame);
  pullRefreshAnimationFrame = 0;
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
    if (document.documentElement.classList.contains("keyboard-open")) return;
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
      resetPullRefreshIndicator();
      return;
    }
    if (event.cancelable) event.preventDefault();
    pullRefreshState = { ...pullRefreshState, distance, ready: distance >= PULL_REFRESH_THRESHOLD };
    schedulePullRefreshIndicator();
  }, { passive: false });

  const finish = () => {
    if (!pullRefreshState.tracking || pullRefreshState.refreshing) return;
    if (pullRefreshState.ready) runPullRefresh();
    else resetPullRefreshIndicator();
  };
  document.addEventListener("touchend", finish, { passive: true });
  document.addEventListener("touchcancel", resetPullRefreshIndicator, { passive: true });
}

function setupEdgeBackAndConversationSwipe() {
  if (document.body.dataset.edgeGesturesBound === "true") return;
  document.body.dataset.edgeGesturesBound = "true";
  let gesture = null;
  const rootPages = new Set(["home", "ledger", "market", "messages", "mine"]);
  document.addEventListener("touchstart", event => {
    if (event.touches.length !== 1 || event.target.closest("input, textarea, select, [contenteditable='true'], .modal-overlay")) return;
    const touch = event.touches[0];
    gesture = { x: touch.clientX, y: touch.clientY, row: event.target.closest(".message-friend-swipe"), moved: false };
  }, { passive: true });
  document.addEventListener("touchmove", event => {
    if (!gesture || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - gesture.x;
    const dy = touch.clientY - gesture.y;
    if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy)) return;
    gesture.moved = true;
    if (gesture.row && Math.abs(dx) > Math.abs(dy)) {
      const currentOpen = gesture.row.classList.contains("is-open");
      const actionWidth = 144;
      const rawReveal = Math.max(0, (currentOpen ? actionWidth : 0) - dx);
      const reveal = rawReveal > actionWidth
        ? actionWidth + ((rawReveal - actionWidth) * .16)
        : rawReveal;
      gesture.row.classList.add("is-dragging");
      gesture.row.querySelector(".message-friend-row")?.style.setProperty("transform", `translate3d(${-reveal}px, 0, 0)`);
      gesture.row.style.setProperty("--message-swipe-reveal", `${Math.min(actionWidth, reveal)}px`);
      gesture.row.dataset.swipeReveal = String(Math.min(actionWidth, reveal));
      if (event.cancelable) event.preventDefault();
      return;
    }
    if (gesture.x <= 24 && dx > 0 && Math.abs(dx) > Math.abs(dy) && !rootPages.has(state.page)) {
      gesture.edgeBack = true;
      const offset = Math.min(Math.max(0, dx), Math.max(96, window.innerWidth * .42));
      $app.classList.add("edge-back-dragging");
      $app.style.transform = `translate3d(${offset}px, 0, 0)`;
      if (event.cancelable) event.preventDefault();
    }
  }, { passive: false });
  document.addEventListener("touchend", event => {
    if (!gesture) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - gesture.x;
    const dy = touch.clientY - gesture.y;
    if (gesture.row && gesture.row.classList.contains("is-dragging")) {
      const reveal = Number(gesture.row.dataset.swipeReveal || 0);
      const shouldOpen = reveal >= 72;
      gesture.row.classList.remove("is-dragging");
      gesture.row.classList.toggle("is-open", shouldOpen);
      const row = gesture.row.querySelector(".message-friend-row");
      if (row) row.style.transform = "";
      gesture.row.style.removeProperty("--message-swipe-reveal");
      delete gesture.row.dataset.swipeReveal;
    } else if (gesture.edgeBack) {
      const shouldComplete = dx > Math.max(78, window.innerWidth * .18) && Math.abs(dx) > Math.abs(dy);
      $app.classList.remove("edge-back-dragging");
      $app.style.transition = "transform .2s cubic-bezier(.2,.72,.25,1)";
      $app.style.transform = shouldComplete ? "translate3d(100vw, 0, 0)" : "translate3d(0, 0, 0)";
      window.setTimeout(() => {
        $app.style.transition = "";
        $app.style.transform = "";
        if (shouldComplete && !rootPages.has(state.page)) setState(backNavigationState(), { pageMotion: "none" });
      }, shouldComplete ? 190 : 210);
    } else if (!gesture.row && document.querySelector(".message-friend-swipe.is-open") && Math.abs(dx) > Math.abs(dy)) {
      document.querySelectorAll(".message-friend-swipe.is-open").forEach(row => row.classList.remove("is-open"));
    }
    gesture = null;
  }, { passive: true });
}

restorePendingCloudData();
setupMobileKeyboardGuard();
setupPullToRefresh();
setupEdgeBackAndConversationSwipe();
render();
checkRequiredAppUpdate();
startMarketNetworkMonitoring();
refreshCareReminderTimers();
startCloudSessionHydration();
setupNativePushNotifications();
startMessageUnreadPolling();
refreshMessageUnread(true);
