const $app = document.querySelector("#app");
const STORAGE = "turtlekeeper-state-v1";
const SERVER_SMS_CODE = "__SERVER_SMS__";
const CONFIGURED_SMS_BACKEND = Boolean(window.TURTLE_API_BASE_URL);
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
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const SPECIES_IMAGE_CACHE = "turtlekeeper-species-image-cache-v1";
let speciesImageObserver = null;
let speciesImageCache = loadSpeciesImageCache();

const initialState = {
  page: "home",
  search: "",
  turtleFilter: "all",
  turtleSort: "default",
  memoTab: "all",
  memoDraftOpen: false,
  memoEditingId: "",
  ledgerTab: "all",
  ledgerDraftType: "",
  ledgerDraftPhoto: "",
  ledgerDraftTurtleId: "",
  ledgerPurchaseGender: "未知",
  ledgerDateFrom: "",
  ledgerDateTo: "",
  breedingDraftPhoto: "",
  breedingMotherMode: "archive",
  breedingMotherValue: "",
  breedingDraftDate: "",
  breedingManualMother: "",
  breedingEggCount: "",
  breedingFertileCount: "",
  breedingHatchCount: "",
  breedingNote: "",
  selectedTurtleId: "",
  selectedLedgerId: "",
  selectedBreedingId: "",
  selectedSpeciesCode: "",
  openTurtleMenuId: "",
  updatingTurtleId: "",
  turtleDetailDraftId: "",
  turtleDetailDraft: null,
  updateDraftPhoto: "",
  breedingEditPhoto: "",
  formPhoto: "",
  formGender: "未知",
  themeColor: "teal",
  turtles: [],
  keptSpecies: [],
  memos: [],
  ledgerRecords: [],
  breedingRecords: [],
  satisfactionRating: 5,
  satisfactionReviews: [],
  feedbackItems: [],
  accountName: "未登录用户",
  accountAvatar: "",
  accountMode: "login",
  accountDraftPhone: "",
  accountDraftPassword: "",
  accountDraftConfirmPassword: "",
  loggedInPhone: "",
  registeredUsers: [],
  pendingAuthCode: "",
  pendingAuthPhone: "",
  authCodeExpiresAt: "",
  accountCodeCooldownUntil: "",
  syncEnabled: false,
  activityLogs: []
};

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
    syncEnabled: false,
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
    syncEnabled: Boolean(next.syncEnabled),
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
    syncEnabled: source.syncEnabled,
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
    data: accountDataSnapshot(source)
  } : user);
}

let state = loadState();
let accountCooldownTimer = null;

if (CONFIGURED_SMS_BACKEND && state.pendingAuthCode && state.pendingAuthCode !== SERVER_SMS_CODE) {
  state = { ...state, pendingAuthCode: "", pendingAuthPhone: "", authCodeExpiresAt: "" };
  saveState();
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE));
    return saved ? normalizeState({ ...initialState, ...saved }) : { ...initialState };
  } catch {
    return { ...initialState };
  }
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
  const loggedInPhone = next.loggedInPhone && registeredUsers.some(user => user.phone === next.loggedInPhone)
    ? next.loggedInPhone
    : "";
  const activeUser = registeredUsers.find(user => user.phone === loggedInPhone);
  const accountData = loggedInPhone ? normalizeAccountData(activeUser?.data || {}) : emptyAccountData();
  const base = {
    ...next,
    ...accountData,
    registeredUsers,
    loggedInPhone,
    accountName: loggedInPhone ? (activeUser?.accountName || next.accountName || maskPhone(loggedInPhone)) : "未登录用户",
    accountAvatar: loggedInPhone ? (activeUser?.accountAvatar || next.accountAvatar || "") : ""
  };
  return {
    ...base,
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
      turtleSnapshot: item.turtleSnapshot ? {
        ...item.turtleSnapshot,
        speciesName: cleanText(item.turtleSnapshot.speciesName),
        gender: cleanText(item.turtleSnapshot.gender),
        status: cleanText(item.turtleSnapshot.status),
        health: cleanText(item.turtleSnapshot.health),
        source: cleanText(item.turtleSnapshot.source)
      } : item.turtleSnapshot
    }))
  };
}

function saveState() {
  const registeredUsers = syncRegisteredUsers(state);
  const accountData = state.loggedInPhone ? accountDataSnapshot(state) : emptyAccountData();
  state.registeredUsers = registeredUsers;
  localStorage.setItem(STORAGE, JSON.stringify({
    ...accountData,
    accountName: state.accountName,
    accountAvatar: state.accountAvatar,
    accountMode: state.accountMode,
    loggedInPhone: state.loggedInPhone,
    registeredUsers,
    pendingAuthCode: state.pendingAuthCode,
    pendingAuthPhone: state.pendingAuthPhone,
    authCodeExpiresAt: state.authCodeExpiresAt,
    accountCodeCooldownUntil: state.accountCodeCooldownUntil,
    themeColor: accountData.themeColor
  }));
}

function setState(patch) {
  state = { ...state, ...patch };
  saveState();
  render();
}

function requireLogin() {
  if (state.loggedInPhone) return true;
  toast("请先登录账号");
  return false;
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
  return speciesImageCache[item.code] || defaultPhoto;
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

function formatTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

function money(value) {
  return Number(value || 0).toFixed(2);
}

function valueOrFallback(value, fallback = "") {
  return value === undefined || value === null ? fallback : value;
}

function turtleDraftValue(turtle, key) {
  const draft = state.turtleDetailDraftId === turtle.id ? (state.turtleDetailDraft || {}) : {};
  return valueOrFallback(draft[key], valueOrFallback(turtle[key], ""));
}

function captureTurtleDetailDraft() {
  const form = document.querySelector("#turtleDetailForm");
  if (!form) return null;
  const data = new FormData(form);
  return {
    speciesCode: String(data.get("speciesCode") || ""),
    code: String(data.get("code") || ""),
    gender: String(data.get("gender") || "未知"),
    weight: String(data.get("weight") || ""),
    carapaceLength: String(data.get("carapaceLength") || ""),
    carapaceWidth: String(data.get("carapaceWidth") || ""),
    shellHeight: String(data.get("shellHeight") || ""),
    plastronLength: String(data.get("plastronLength") || ""),
    status: String(data.get("status") || "正常饲养"),
    health: String(data.get("health") || "健康"),
    acquiredDate: String(data.get("acquiredDate") || ""),
    source: String(data.get("source") || "购买"),
    price: String(data.get("price") || ""),
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

function describeBreedingSnapshot(snapshot = {}) {
  return [
    snapshot.date || "-",
    `种母 ${snapshot.motherName || "未填写"}`,
    `产蛋 ${snapshot.eggCount || 0} 枚`,
    `受精 ${snapshot.fertileCount || 0} 枚`,
    `孵化 ${snapshot.hatchCount || 0} 只`
  ].join(" · ");
}

function topbar(title, back = false) {
  return `
    <div class="topbar">
      <div class="nav-title">
        ${back ? `<button class="icon-btn" data-back>‹</button>` : `<span></span>`}
        <h1>${title}</h1>
        <span></span>
      </div>
    </div>
  `;
}

function bottomNav() {
  const minePages = ["mine", "calendar", "satisfaction", "feedback", "account", "sync", "about"];
  return `
    <nav class="bottom-nav">
      <button class="${state.page === "home" ? "active" : ""}" data-page="home"><span>⌂</span>看板</button>
      <button class="${state.page === "list" || state.page === "turtleDetail" ? "active" : ""}" data-page="list"><span>▣</span>档案</button>
      <button class="${state.page === "breeding" || state.page === "breedingAdd" || state.page === "breedingDetail" ? "active" : ""}" data-page="breeding"><span>◎</span>繁殖</button>
      <button class="${state.page === "ledger" || state.page === "ledgerDetail" ? "active" : ""}" data-page="ledger"><span>¥</span>账本</button>
      <button class="${minePages.includes(state.page) ? "active" : ""}" data-page="mine"><span>●</span>空间</button>
    </nav>
  `;
}

function pageHome() {
  const s = stats();
  const turtles = [...state.turtles].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
      <section class="action-panel">
        <button data-page="species"><span>◇</span><strong>品种</strong><small>选择常用品种</small></button>
        <button data-page="memos"><span>✓</span><strong>护理</strong><small>备忘与提醒</small></button>
        <button data-page="breeds"><span>◎</span><strong>饲养品种</strong><small>管理常用品种</small></button>
      </section>
      <section class="home-turtles">
        <div class="section-title"><span>全部新增档案</span></div>
        <div class="home-turtle-grid">
          ${turtles.map(turtleCard).join("") || `<div class="empty"><div><strong>还没有乌龟档案</strong><br>点击新建开始记录</div></div>`}
        </div>
      </section>
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
  if (state.turtleSort === "latest") list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (state.turtleSort === "weight") list.sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0));
  return list;
}

function pageList() {
  const speciesOptions = [...new Set(state.turtles.map(t => t.speciesCode))]
    .map(code => speciesByCode(code) || { code, name: code });
  const s = stats();
  return `
    ${topbar("乌龟档案")}
    <main class="content page-fresh">
      <section class="page-intro">
        <div><p class="eyebrow dark">档案夹</p><h2>${state.turtles.length} 份成长记录</h2><p>筛选、排序和维护每一只乌龟的资料。</p></div>
        <button class="round-action" data-page="add">+</button>
      </section>
      <section class="archive-strip">
        <div><strong>${s.active}</strong><span>在养</span></div>
        <div><strong>${s.healthy}</strong><span>健康</span></div>
        <div><strong>${s.sick}</strong><span>需关注</span></div>
      </section>
      <section class="filter-dock">
        <select class="select" data-filter-species>
          <option value="all">全部品种</option>
          ${speciesOptions.map(s => `<option value="${s.code}" ${state.turtleFilter === s.code ? "selected" : ""}>${s.name}</option>`).join("")}
        </select>
        <select class="select" data-sort-turtles>
          <option value="default" ${state.turtleSort === "default" ? "selected" : ""}>默认排序</option>
          <option value="latest" ${state.turtleSort === "latest" ? "selected" : ""}>最新添加</option>
          <option value="weight" ${state.turtleSort === "weight" ? "selected" : ""}>体重排序</option>
        </select>
      </section>
      ${sortedTurtles().map(turtleListRow).join("") || `<div class="empty"><div><strong>没有符合条件的档案</strong></div></div>`}
    </main>
    ${bottomNav()}
  `;
}

function turtleListRow(t) {
  return `
    <article class="turtle-row fresh-card ${state.openTurtleMenuId === t.id ? "menu-open" : ""}" data-view-turtle="${t.id}">
      <img src="${t.photo || defaultPhoto}" alt="${t.speciesName}">
      <div><strong>${t.code}</strong><p>${t.speciesName}</p><small>${t.weight || "-"}g · 背甲 ${t.carapaceLength || "-"}cm</small></div>
      <button class="more-btn" data-toggle-turtle-menu="${t.id}">•••</button>
      ${state.openTurtleMenuId === t.id ? `
        <div class="turtle-menu" style="top:52px;right:0;width:118px;min-width:118px;border-radius:0;box-shadow:0 18px 38px rgba(31,42,51,.16);overflow:hidden;">
          <button data-update-turtle="${t.id}">更新</button>
          <button data-ledger-for-turtle="sold:${t.id}">售出</button>
          <button data-ledger-for-turtle="loss:${t.id}">损耗</button>
          <button class="danger-link" data-delete-turtle="${t.id}">删除</button>
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
  const historyList = t.measureHistory || [];
  return `
    ${topbar("档案详情", true)}
    <main class="content page-fresh">
      <section class="page-intro compact-intro detail-summary-card">
        <div>
          <p class="eyebrow dark">明细</p>
          <h2>${nickname || "未命名档案"}</h2>
          <p>${species.name || t.speciesName} · ${turtleDraftValue(t, "status") || t.status} · ${turtleDraftValue(t, "health") || t.health}</p>
        </div>
        <button class="detail-more" style="z-index:120;" data-toggle-turtle-menu="${t.id}">•••</button>
        ${state.openTurtleMenuId === t.id ? `
          <div class="turtle-menu detail-menu" style="top:92px;right:0;width:118px;min-width:118px;border-radius:0;box-shadow:0 18px 38px rgba(31,42,51,.16);overflow:hidden;z-index:90;">
            <button data-update-turtle="${t.id}">更新</button>
            <button data-ledger-for-turtle="sold:${t.id}">售出</button>
            <button data-ledger-for-turtle="loss:${t.id}">损耗</button>
            <button class="danger-link" data-delete-turtle="${t.id}">删除</button>
          </div>
        ` : ""}
      </section>
      ${isEditing ? `
      <form class="breeding-form fresh-card" id="turtleDetailForm">
        <div class="photo-uploader breeding-photo-box">
          <img src="${photo}" alt="${species.name || t.speciesName}">
          <div>
            <button class="secondary" type="button" data-update-photo-button>更换图片</button>
            <button class="danger-link" type="button" data-clear-update-photo>清除图片</button>
          </div>
        </div>
        <input class="hidden-file" type="file" accept="image/*" lang="zh-CN" title="选择图片" aria-label="选择图片" data-update-photo-input>
        <div class="breeding-form-grid">
          <label><span>品种代码</span><select class="select" name="speciesCode" required>${speciesList.map(item => `<option value="${item.code}" ${item.code === speciesCode ? "selected" : ""}>${item.code} · ${item.name}</option>`).join("")}</select></label>
          <label><span>龟龟昵称</span><input class="field" name="code" value="${nickname || ""}" placeholder="例如：小核桃、黑豆、将军"></label>
          <label><span>性别</span><select class="select" name="gender"><option ${turtleDraftValue(t, "gender") === "公" ? "selected" : ""}>公</option><option ${turtleDraftValue(t, "gender") === "母" ? "selected" : ""}>母</option><option ${turtleDraftValue(t, "gender") === "未知" ? "selected" : ""}>未知</option></select></label>
          <label><span>当前体重(g)</span><input class="field" name="weight" type="number" min="0" step="0.1" required value="${turtleDraftValue(t, "weight")}"></label>
          <label><span>背甲长度(cm)</span><input class="field" name="carapaceLength" type="number" min="0" step="0.1" required value="${turtleDraftValue(t, "carapaceLength")}"></label>
          <label><span>背甲宽度(cm)</span><input class="field" name="carapaceWidth" type="number" min="0" step="0.1" value="${turtleDraftValue(t, "carapaceWidth")}"></label>
          <label><span>背高(cm)</span><input class="field" name="shellHeight" type="number" min="0" step="0.1" value="${turtleDraftValue(t, "shellHeight")}"></label>
          <label><span>腹甲长度(cm)</span><input class="field" name="plastronLength" type="number" min="0" step="0.1" value="${turtleDraftValue(t, "plastronLength")}"></label>
          <label><span>饲养状态</span><select class="select" name="status"><option ${turtleDraftValue(t, "status") === "正常饲养" ? "selected" : ""}>正常饲养</option><option ${turtleDraftValue(t, "status") === "已转让" ? "selected" : ""}>已转让</option><option ${turtleDraftValue(t, "status") === "已死亡" ? "selected" : ""}>已死亡</option></select></label>
          <label><span>健康状态</span><select class="select" name="health"><option ${turtleDraftValue(t, "health") === "健康" ? "selected" : ""}>健康</option><option ${turtleDraftValue(t, "health") === "生病" ? "selected" : ""}>生病</option></select></label>
          <label><span>入手日期</span><input class="field" name="acquiredDate" type="date" value="${turtleDraftValue(t, "acquiredDate") || formatDate(t.acquiredDate || new Date())}"></label>
          <label><span>来源</span><select class="select" name="source"><option ${turtleDraftValue(t, "source") === "购买" ? "selected" : ""}>购买</option><option ${turtleDraftValue(t, "source") === "孵化" ? "selected" : ""}>孵化</option><option ${turtleDraftValue(t, "source") === "其他" ? "selected" : ""}>其他</option></select></label>
          <label><span>购入价(元)</span><input class="field" name="price" type="number" min="0" step="0.01" value="${turtleDraftValue(t, "price")}"></label>
        </div>
        <label class="breeding-note"><span>备注</span><textarea name="note" placeholder="性格、饮食、状态变化、到家表现等">${turtleDraftValue(t, "note") || ""}</textarea></label>
        <button class="primary" type="submit">保存修改</button>
      </form>
      ` : turtleReadOnlyDetail(t, species, photo)}
      <section class="section-title"><h3>更新留存</h3></section>
      ${historyList.map(h => `
        <article class="history-card fresh-card">
          <div class="history-photos">
            <img src="${h.oldPhoto || defaultPhoto}" alt="旧照片">
            <img src="${h.newPhoto || defaultPhoto}" alt="新照片">
          </div>
          <p>${h.oldSnapshot && h.newSnapshot ? `${describeTurtleSnapshot(h.oldSnapshot)} → ${describeTurtleSnapshot(h.newSnapshot)}` : `背甲 ${h.oldLength || "-"}cm → ${h.newLength || "-"}cm`}</p>
          <small>${formatTime(h.updatedAt)}</small>
        </article>
      `).join("") || `<div class="empty small-empty"><div><strong>暂时还没有更新留存</strong></div></div>`}
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
    </section>
    ${t.note ? `<section class="fresh-card note-card">${t.note}</section>` : ""}
  `;
}

function pageSpecies() {
  const query = state.search.trim();
  const list = speciesList
    .filter(item => !query || item.name.includes(query) || item.code.toLowerCase().includes(query.toLowerCase()))
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
        <input class="field fresh-search" data-species-search placeholder="搜索中文名称或代码" value="${state.search}">
      </section>
      <nav class="species-alpha-nav" aria-label="品种首字母导航">
        ${ALPHABET.map(letter => `<button class="${availableLetters.has(letter) ? "" : "muted"}" data-scroll-letter="${letter}" type="button">${letter}</button>`).join("")}
      </nav>
      ${groups.map(([letter, items]) => `
        <section class="species-section" data-letter-section="${letter}">
          <div class="species-letter"><h3>${letter}</h3><span>${items.length} 个品种</span></div>
          ${items.map(item => `
            <article class="species-row fresh-card ${state.keptSpecies.includes(item.code) ? "selected" : ""}">
              <img class="species-photo" src="${speciesPhoto(item)}" alt="${item.name}" data-species-img="${item.code}" data-fallback-photo loading="lazy">
              <div><strong>${item.name}</strong><small>${item.code}</small></div>
              <button class="species-add ${state.keptSpecies.includes(item.code) ? "selected" : ""}" data-add-species="${item.code}">${state.keptSpecies.includes(item.code) ? "已选" : "加入"}</button>
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
          <div class="label">品种代码</div>
          <select class="select" name="speciesCode" required>
            <option value="">请选择品种</option>
            ${kept.map(s => `<option value="${s.code}" ${state.selectedSpeciesCode === s.code ? "selected" : ""}>${s.code} · ${s.name}</option>`).join("")}
          </select>
          <button class="text-green" type="button" data-page="species" style="margin-top:8px;">没有这个品种？去图鉴添加</button>
          <div class="label">龟龟昵称</div>
          <input class="field" name="code" placeholder="例如：小核桃、黑豆、将军">
          <div class="label">性别 <span class="required">*</span></div>
          <div class="radio-row">
            ${["公", "母", "未知"].map(g => `<button class="choice ${state.formGender === g ? "active" : ""}" type="button" data-gender="${g}">${g}</button>`).join("")}
          </div>
        </section>
        <section class="form-block fresh-card">
          <h3>体测数据</h3>
          <div class="label">当前体重(g) <span class="required">*</span></div>
          <input class="field" name="weight" type="number" min="0" step="0.1" required>
          <div class="label">背甲长度(cm) <span class="required">*</span></div>
          <input class="field" name="carapaceLength" type="number" min="0" step="0.1" required>
          <div class="label">背甲宽度(cm)</div><input class="field" name="carapaceWidth" type="number" min="0" step="0.1">
          <div class="label">背高(cm)</div><input class="field" name="shellHeight" type="number" min="0" step="0.1">
          <div class="label">腹甲长度(cm)</div><input class="field" name="plastronLength" type="number" min="0" step="0.1">
        </section>
        <section class="form-block fresh-card">
          <h3>当前状态</h3>
          <div class="label">饲养状态</div>
          <select class="select" name="status"><option>正常饲养</option><option>已转让</option><option>已死亡</option></select>
          <div class="label">健康状态</div>
          <select class="select" name="health"><option>健康</option><option>生病</option></select>
        </section>
        <section class="form-block fresh-card">
          <h3>入手记录</h3>
          <div class="label">入手日期</div><input class="field" name="acquiredDate" type="date" value="${today}">
          <div class="label">来到你家的方式</div>
          <select class="select" name="source"><option>购买</option><option>孵化</option><option>其他</option></select>
          <div class="label">花费(元)</div><input class="field" name="price" type="number" min="0" step="0.01">
          <div class="label">备注</div><textarea name="note" placeholder="性格、食欲、卖家、到家表现等都可以写在这里"></textarea>
        </section>
        <button class="primary" type="submit">保存档案</button>
      </form>
    </main>
  `;
}

function pageMemos() {
  const list = state.memoTab === "all" ? state.memos : state.memos.filter(m => state.memoTab === "repeat" ? m.repeat : !m.repeat);
  const editingMemo = state.memos.find(m => m.id === state.memoEditingId);
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
          <label><span>事项名称</span><input class="field" name="title" required placeholder="例如：换水、喂食、晒背" value="${editingMemo?.title || ""}"></label>
          <label><span>补充说明</span><textarea name="content" placeholder="可以写频率、用量、注意事项">${editingMemo?.content || ""}</textarea></label>
          <label><span>提醒类型</span><select class="select" name="repeat"><option value="false" ${!editingMemo?.repeat ? "selected" : ""}>单次护理</option><option value="true" ${editingMemo?.repeat ? "selected" : ""}>循环护理</option></select></label>
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
          <div><strong>${m.title}</strong><p>${m.content || "无备注"}</p><small class="muted">上次操作 ${formatTime(m.updatedAt)} · ${m.repeat ? "循环提醒" : "单次提醒"}</small></div>
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

function pageLedger() {
  const inDateRange = item => {
    const date = item.recordDate || formatDate(item.createdAt);
    if (state.ledgerDateFrom && date < state.ledgerDateFrom) return false;
    if (state.ledgerDateTo && date > state.ledgerDateTo) return false;
    return true;
  };
  const allRecords = (state.ledgerRecords || []).filter(inDateRange);
  const records = allRecords.filter(item => state.ledgerTab === "all" || item.type === state.ledgerTab);
  const purchaseTotal = allRecords.filter(item => item.type === "purchase").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const soldTotal = allRecords.filter(item => item.type === "sold").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const lossTotal = allRecords.filter(item => item.type === "loss").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const dateText = state.ledgerDateFrom || state.ledgerDateTo ? `${state.ledgerDateFrom || "不限"} 至 ${state.ledgerDateTo || "不限"}` : "全部日期";
  return `
    ${topbar("经营账本")}
    <main class="content page-fresh">
      <section class="page-intro ledger-intro"><div><p class="eyebrow dark">经营</p><h2>${records.length} 条资金明细</h2><p>${dateText}，收购、售出、损耗都可以留图、留尺寸。</p></div></section>
      <section class="ledger-summary">
        <div><span>收购投入</span><strong>-¥${money(purchaseTotal)}</strong><small>${allRecords.filter(item => item.type === "purchase").length} 条</small></div>
        <div><span>售出收入</span><strong>¥${money(soldTotal)}</strong><small>${allRecords.filter(item => item.type === "sold").length} 条</small></div>
        <div><span>损耗金额</span><strong>-¥${money(lossTotal)}</strong><small>${allRecords.filter(item => item.type === "loss").length} 条</small></div>
      </section>
      <section class="ledger-date-filter fresh-card">
        <label><span>开始日期</span><input class="field" type="date" data-ledger-date-from value="${state.ledgerDateFrom}"></label>
        <label><span>结束日期</span><input class="field" type="date" data-ledger-date-to value="${state.ledgerDateTo}"></label>
        <button class="secondary" type="button" data-ledger-date-clear>全部日期</button>
      </section>
      <section class="ledger-actions">
        <button class="secondary" data-new-ledger="purchase">记录收购</button>
        <button class="secondary" data-new-ledger="sold">记录售出</button>
        <button class="secondary" data-new-ledger="loss">记录损耗</button>
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
  const today = formatDate(new Date());
  const turtle = state.turtles.find(t => t.id === state.ledgerDraftTurtleId);
  const defaultAmount = type === "loss" && turtle?.price ? turtle.price : "";
  const isPurchase = type === "purchase";
  return `
    <form class="ledger-shell" id="ledgerForm">
      <section class="form-block fresh-card">
        <div class="form-head"><div><p class="eyebrow dark">${ledgerTypeText(type)}</p><h3>基础信息</h3></div><button type="button" class="danger-link" data-cancel-ledger>取消</button></div>
        <div class="photo-uploader">
          ${state.ledgerDraftPhoto ? `<img src="${state.ledgerDraftPhoto}" alt="${ledgerTypeText(type)}照片">` : `<span>照片</span>`}
          <div><button class="secondary" type="button" data-ledger-photo-button>上传照片</button><p class="muted">和新建档案一样，可以上传这只龟当时的照片。</p></div>
        </div>
        <input class="hidden-file" type="file" accept="image/*" lang="zh-CN" title="选择图片" aria-label="选择图片" data-ledger-photo-input>
        <div class="label">关联档案</div>
        <select class="select" name="turtleId">
          <option value="">${isPurchase ? "收购后新建档案" : "不关联档案"}</option>
          ${state.turtles.map(t => `<option value="${t.id}" ${state.ledgerDraftTurtleId === t.id ? "selected" : ""}>${t.code} · ${t.speciesName}</option>`).join("")}
        </select>
        ${isPurchase ? `
          <div class="label">品种代码</div>
          <select class="select" name="purchaseSpeciesCode" required><option value="">请选择品种</option>${speciesList.map(s => `<option value="${s.code}">${s.code} · ${s.name}</option>`).join("")}</select>
          <button class="text-green" type="button" data-page="species" style="margin-top:8px;">没有这个品种？去图鉴添加</button>
          <div class="label">龟龟昵称</div>
          <input class="field" name="purchaseCode" placeholder="例如：小核桃、黑豆、将军">
          <div class="label">性别 <span class="required">*</span></div>
          <div class="radio-row">
            ${["公", "母", "未知"].map(g => `<button class="choice ${state.ledgerPurchaseGender === g ? "active" : ""}" type="button" data-purchase-gender="${g}">${g}</button>`).join("")}
          </div>
          <input type="hidden" name="purchaseGender" value="${state.ledgerPurchaseGender}">
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
        <input class="field" name="weight" type="number" min="0" step="0.1" value="${turtle?.weight || ""}" ${isPurchase ? "required" : ""}>
        <div class="label">背甲长度(cm) ${isPurchase ? `<span class="required">*</span>` : ""}</div>
        <input class="field" name="carapaceLength" type="number" min="0" step="0.1" value="${turtle?.carapaceLength || ""}" ${isPurchase ? "required" : ""}>
        <div class="label">背甲宽度(cm)</div><input class="field" name="carapaceWidth" type="number" min="0" step="0.1" value="${turtle?.carapaceWidth || ""}">
        <div class="label">背高(cm)</div><input class="field" name="shellHeight" type="number" min="0" step="0.1" value="${turtle?.shellHeight || ""}">
        <div class="label">腹甲长度(cm)</div><input class="field" name="plastronLength" type="number" min="0" step="0.1" value="${turtle?.plastronLength || ""}">
      </section>

      ${isPurchase ? `
        <section class="form-block fresh-card">
          <h3>当前状态</h3>
          <div class="label">饲养状态</div>
          <select class="select" name="purchaseStatus"><option>正常饲养</option><option>已转让</option><option>已死亡</option></select>
          <div class="label">健康状态</div>
          <select class="select" name="purchaseHealth"><option>健康</option><option>生病</option></select>
          <input type="hidden" name="purchaseSource" value="购买">
        </section>
      ` : ""}

      <section class="form-block fresh-card">
        <h3>${isPurchase ? "入手记录" : `${ledgerTypeText(type)}记录`}</h3>
        <div class="label">${isPurchase ? "入手日期" : "日期"}</div><input class="field" name="recordDate" type="date" value="${today}">
        <div class="label">${isPurchase ? "花费(元)" : "金额(元)"}</div><input class="field" name="amount" type="number" min="0" step="0.01" required value="${defaultAmount}">
        <div class="label">备注</div><textarea name="note" placeholder="${isPurchase ? "性格、食欲、卖家、到家表现等都可以写在这里" : "客户、损耗原因、交接情况等都可以写在这里"}"></textarea>
      </section>
      <button class="primary" type="submit">保存${ledgerTypeText(type)}</button>
    </form>
  `;
}

function ledgerRow(item) {
  const turtle = state.turtles.find(t => t.id === item.turtleId) || item.turtleSnapshot;
  const typeText = ledgerTypeText(item.type);
  const showType = state.ledgerTab === "all";
  const title = turtle ? `${turtle.code} · ${turtle.speciesName}` : (item.title || "未关联档案");
  const dims = [
    item.weight ? `${item.weight}g` : "",
    item.carapaceLength ? `背甲${item.carapaceLength}cm` : "",
    item.carapaceWidth ? `宽${item.carapaceWidth}cm` : "",
    item.shellHeight ? `背高${item.shellHeight}cm` : "",
    item.plastronLength ? `腹甲${item.plastronLength}cm` : ""
  ].filter(Boolean).join(" · ");
  return `
    <article class="fresh-card ledger-row" data-view-ledger="${item.id}">
      ${item.photo ? `<img class="ledger-thumb" src="${item.photo}" alt="${typeText}照片">` : `<div class="ledger-type ${item.type}">${typeText}</div>`}
      <div class="ledger-row-main">
        <strong class="ledger-row-title">${showType ? `<span class="ledger-inline-type ${item.type}">${typeText}</span>` : ""}${title}</strong>
        ${dims ? `<p class="ledger-dims">${dims}</p>` : ""}
        <small class="muted">${item.recordDate || formatDate(item.createdAt)}${item.note ? ` · ${item.note}` : ""}</small>
      </div>
      <div class="ledger-amount ${item.type !== "sold" ? "danger" : ""}">${item.type === "sold" ? "+" : "-"}¥${money(item.amount)}</div>
      <button class="danger-link ledger-delete" data-delete-ledger="${item.id}">移除</button>
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
        <div class="ledger-detail-head"><span class="ledger-inline-type ${item.type}">${typeText}</span><strong class="${item.type !== "sold" ? "danger-text" : ""}">${amountPrefix}¥${money(item.amount)}</strong></div>
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
    ${topbar("繁殖记录")}
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

function pageBreedingAdd() {
  const today = state.breedingDraftDate || formatDate(new Date());
  const manualMotherSelected = state.breedingMotherMode === "manual";
  const females = state.turtles.filter(t => t.gender === "母" || t.gender === "未知");
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
          <label><span>日期</span><input class="field" name="date" type="date" value="${today}" required></label>
          <label><span>种母</span>
            <select class="select" name="mother" data-breeding-mother required>
              <option value="" ${!state.breedingMotherValue ? "selected" : ""}>选择种母</option>
              ${females.map(t => `<option value="${t.id}" ${state.breedingMotherValue === t.id ? "selected" : ""}>${t.code} · ${t.speciesName}</option>`).join("")}
              <option value="manual" ${manualMotherSelected ? "selected" : ""}>手动备注</option>
            </select>
          </label>
          ${manualMotherSelected ? `<label class="breeding-manual-mother"><span>手动备注</span><input class="field" name="manualMother" value="${state.breedingManualMother || ""}" placeholder="例如：黑豆 / 未建档种母 / 2024 组母龟" required></label>` : ""}
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
  return `
    <article class="breeding-row fresh-card" data-view-breeding="${record.id}">
      ${record.photo ? `<img src="${record.photo}" alt="繁殖附图">` : `<div class="breeding-thumb">繁</div>`}
      <div>
        <strong>${record.motherName || "未填写种母"}</strong>
        <p>${record.date || "-"} · 产蛋 ${record.eggCount || 0} 枚 · 受精 ${record.fertileCount || 0} 枚 · 孵化 ${record.hatchCount || 0} 只</p>
        ${record.note ? `<small>${record.note}</small>` : ""}
      </div>
      <button class="danger-link" data-delete-breeding="${record.id}">删除</button>
    </article>
  `;
}

function pageBreedingDetail() {
  const record = (state.breedingRecords || []).find(item => item.id === state.selectedBreedingId);
  if (!record) return `${topbar("繁殖详情", true)}<main class="content page-fresh"><div class="empty"><strong>没有找到这条繁殖记录</strong></div></main>${bottomNav()}`;
  const females = state.turtles.filter(t => t.gender === "母" || t.gender === "未知");
  const currentPhoto = state.breedingEditPhoto === "__CLEAR__" ? "" : state.breedingEditPhoto || record.photo || "";
  const isManual = !record.motherId || record.motherId === "manual";
  const historyList = record.editHistory || [];
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
          <label><span>日期</span><input class="field" name="date" type="date" value="${record.date || formatDate(new Date())}" required></label>
          <label><span>种母</span>
            <select class="select" name="mother">
              <option value="manual" ${isManual ? "selected" : ""}>手动备注</option>
              ${females.map(t => `<option value="${t.id}" ${record.motherId === t.id ? "selected" : ""}>${t.code} · ${t.speciesName}</option>`).join("")}
            </select>
          </label>
          <label class="breeding-manual-mother"><span>种母备注</span><input class="field" name="manualMother" value="${isManual ? (record.motherName || "") : ""}" placeholder="例如：黑豆 / 2024 组母龟"></label>
          <label><span>产蛋数</span><input class="field" name="eggCount" type="number" min="0" step="1" required value="${record.eggCount || 0}"></label>
          <label><span>受精数</span><input class="field" name="fertileCount" type="number" min="0" step="1" required value="${record.fertileCount || 0}"></label>
          <label><span>孵化数</span><input class="field" name="hatchCount" type="number" min="0" step="1" value="${record.hatchCount || 0}"></label>
        </div>
        <label class="breeding-note"><span>备注</span><textarea name="note" placeholder="产蛋位置、状态、孵化盒编号、温度等">${record.note || ""}</textarea></label>
        <button class="primary" type="submit">保存修改</button>
      </form>
      <section class="section-title"><h3>更新留存</h3></section>
      ${historyList.map(item => `
        <article class="history-card fresh-card">
          ${(item.oldPhoto || item.newPhoto) ? `
            <div class="history-photos">
              <img src="${item.oldPhoto || defaultPhoto}" alt="旧附图">
              <img src="${item.newPhoto || defaultPhoto}" alt="新附图">
            </div>
          ` : ""}
          <p>${item.oldSnapshot && item.newSnapshot ? `${describeBreedingSnapshot(item.oldSnapshot)} → ${describeBreedingSnapshot(item.newSnapshot)}` : "本次留存已记录"}</p>
          <small>${formatTime(item.updatedAt)}</small>
        </article>
      `).join("") || `<div class="empty small-empty"><div><strong>暂时还没有更新留存</strong></div></div>`}
    </main>
    ${bottomNav()}
  `;
}

function pageMine() {
  const loggedIn = Boolean(state.loggedInPhone);
  const profileTitle = loggedIn ? (state.accountName || maskPhone(state.loggedInPhone)) : "未登录用户";
  const profileSub = loggedIn ? maskPhone(state.loggedInPhone) : "登录后同步你的档案和账本";
  return `
    ${topbar("我的空间")}
    <section class="profile fresh-profile account-profile">${accountAvatarMarkup()}<div><h2>${profileTitle}</h2><p class="profile-phone">${profileSub}</p></div></section>
    <main class="content page-fresh">
      <button class="primary account-login" data-page="account">${loggedIn ? "编辑资料" : "登录 / 注册账号"}</button>
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
      <section class="fresh-card mine-list">
        <button class="mine-row" data-page="calendar"><span>◷</span><strong>操作日志</strong></button>
        <button class="mine-row" data-page="satisfaction"><span>☆</span><strong>满意度调查</strong></button>
        <button class="mine-row" data-page="feedback"><span>✎</span><strong>意见反馈</strong></button>
        <button class="mine-row" data-page="account"><span>⚙</span><strong>账号与安全</strong></button>
        <button class="mine-row" data-page="sync"><span>⇄</span><strong>数据同步设置</strong></button>
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

function pageFeedback() {
  const items = state.feedbackItems || [];
  return `
    ${topbar("意见反馈", true)}
    <main class="content page-fresh">
      <section class="page-intro compact-intro">
        <div><p class="eyebrow dark">反馈</p><h2>记录你的想法</h2><p>可以写问题、建议、页面调整或新功能需求。</p></div>
      </section>
      <form class="fresh-card survey-form" id="feedbackForm">
        <label class="survey-field"><span>反馈类型</span><select class="select" name="type"><option>功能建议</option><option>界面问题</option><option>使用问题</option><option>其他</option></select></label>
        <label class="survey-field"><span>反馈内容</span><textarea name="content" required placeholder="请描述你遇到的问题或希望调整的地方"></textarea></label>
        <button class="primary" type="submit">提交反馈</button>
      </form>
      <section class="section-title"><span>反馈记录</span><small>${items.length} 条</small></section>
      ${items.map(item => `
        <article class="fresh-card survey-record">
          <strong>${item.type}</strong>
          <p>${item.content}</p>
          <small>${formatTime(item.createdAt)}</small>
        </article>
      `).join("") || `<div class="empty small-empty"><div><strong>还没有反馈</strong></div></div>`}
    </main>
    ${bottomNav()}
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
          <form id="profileForm" class="profile-form-inner">
            <label class="survey-field"><span>昵称</span><input class="field" name="nickname" value="${state.accountName || ""}" placeholder="请输入昵称"></label>
            <button class="primary" type="submit">保存昵称和头像</button>
          </form>
          <p class="muted">手机号：${maskedPhone}</p>
          <button class="logout-card" type="button" data-logout-account>退出账号</button>
        </section>
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

function pageSync() {
  return `
    ${topbar("数据同步设置", true)}
    <main class="content page-fresh">
      <section class="page-intro compact-intro">
        <div><p class="eyebrow dark">同步</p><h2>${state.syncEnabled ? "已开启同步" : "本地保存"}</h2><p>当前版本先记录同步开关状态，后续可接入云端服务。</p></div>
      </section>
      <section class="fresh-card settings-card">
        <button class="mine-row sync-toggle" data-toggle-sync><span>⇄</span><strong>${state.syncEnabled ? "关闭数据同步" : "开启数据同步"}</strong><span>›</span></button>
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
        <div><p class="eyebrow dark">关于</p><h2>壳友手账</h2><p>面向养龟、繁殖和经营记录的本地原型应用。</p></div>
      </section>
      <section class="fresh-card settings-card">
        <div class="settings-title">当前能力</div>
        <p class="muted">档案、繁殖、账本、护理、操作日志、满意度调查和意见反馈均可本地保存。</p>
      </section>
    </main>
    ${bottomNav()}
  `;
}

function placeholder(title) {
  return `${topbar(title, true)}<main class="content page-fresh"><div class="empty"><strong>${title}</strong><br>这个入口已经放好，后续可以继续扩展。</div></main>`;
}

function render() {
  applyTheme();
  const pages = {
    home: pageHome,
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
    satisfaction: pageSatisfaction,
    feedback: pageFeedback,
    account: pageAccount,
    sync: pageSync,
    about: pageAbout,
    breeding: pageBreeding,
    breedingAdd: pageBreedingAdd,
    breedingDetail: pageBreedingDetail
  };
  $app.innerHTML = (pages[state.page] || pageHome)();
  bindEvents();
  hydrateSpeciesImages();
  startAccountCodeCooldownTimer();
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
  document.querySelectorAll("[data-page]").forEach(el => el.addEventListener("click", () => {
    if (["add", "breedingAdd"].includes(el.dataset.page) && !requireLogin()) return;
    setState({ page: el.dataset.page, openTurtleMenuId: "", updatingTurtleId: "", turtleDetailDraftId: "", turtleDetailDraft: null, updateDraftPhoto: "" });
  }));
  document.querySelectorAll("[data-back]").forEach(el => el.addEventListener("click", () => setState({
    page: state.page === "turtleDetail" ? "list" : state.page === "ledgerDetail" ? "ledger" : state.page === "breedingAdd" || state.page === "breedingDetail" ? "breeding" : ["calendar", "satisfaction", "feedback", "account", "sync", "about"].includes(state.page) ? "mine" : "home",
    openTurtleMenuId: "",
    updatingTurtleId: "",
    turtleDetailDraftId: "",
    turtleDetailDraft: null,
    updateDraftPhoto: ""
  })));
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
    document.querySelector("[data-update-photo-input]")?.click();
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
  document.querySelector("[data-sort-turtles]")?.addEventListener("change", e => setState({ turtleSort: e.target.value }));
  document.querySelector("[data-species-search]")?.addEventListener("input", e => setState({ search: e.target.value }));
  document.querySelectorAll("[data-scroll-letter]").forEach(btn => btn.addEventListener("click", () => scrollToSpeciesLetter(btn.dataset.scrollLetter)));
  document.querySelectorAll("[data-add-species]").forEach(btn => btn.addEventListener("click", () => addKeptSpecies(btn.dataset.addSpecies)));
  document.querySelectorAll("[data-remove-species]").forEach(btn => btn.addEventListener("click", () => removeKeptSpecies(btn.dataset.removeSpecies)));
  document.querySelectorAll("[data-gender]").forEach(btn => btn.addEventListener("click", () => {
    if (!requireLogin()) return;
    setState({ formGender: btn.dataset.gender });
  }));
  document.querySelectorAll("[data-purchase-gender]").forEach(btn => btn.addEventListener("click", () => {
    if (!requireLogin()) return;
    setState({ ledgerPurchaseGender: btn.dataset.purchaseGender });
  }));
  document.querySelector("[data-photo-input-button]")?.addEventListener("click", () => {
    if (!requireLogin()) return;
    document.querySelector("[data-photo-input]")?.click();
  });
  document.querySelector("[data-photo-clear]")?.addEventListener("click", () => {
    if (!requireLogin()) return;
    setState({ formPhoto: "" });
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
  document.querySelector("[data-ledger-date-from]")?.addEventListener("change", e => setState({ ledgerDateFrom: e.target.value }));
  document.querySelector("[data-ledger-date-to]")?.addEventListener("change", e => setState({ ledgerDateTo: e.target.value }));
  document.querySelector("[data-ledger-date-clear]")?.addEventListener("click", () => setState({ ledgerDateFrom: "", ledgerDateTo: "" }));
  document.querySelectorAll("[data-view-ledger]").forEach(el => el.addEventListener("click", () => setState({ page: "ledgerDetail", selectedLedgerId: el.dataset.viewLedger })));
  document.querySelectorAll("[data-delete-ledger]").forEach(btn => btn.addEventListener("click", event => {
    event.stopPropagation();
    deleteLedgerRecord(btn.dataset.deleteLedger);
  }));
  document.querySelector("[data-cancel-ledger]")?.addEventListener("click", () => setState({ ledgerDraftType: "", ledgerDraftPhoto: "", ledgerDraftTurtleId: "", ledgerPurchaseGender: "未知" }));
  document.querySelector("[data-ledger-photo-button]")?.addEventListener("click", () => {
    if (!requireLogin()) return;
    document.querySelector("[data-ledger-photo-input]")?.click();
  });
  document.querySelector("[data-ledger-photo-input]")?.addEventListener("change", readLedgerPhoto);
  document.querySelector("#ledgerForm")?.addEventListener("submit", submitLedgerRecord);
  document.querySelector("[data-breeding-photo-button]")?.addEventListener("click", () => {
    if (!requireLogin()) return;
    document.querySelector("[data-breeding-photo-input]")?.click();
  });
  document.querySelector("[data-breeding-photo-input]")?.addEventListener("change", readBreedingPhoto);
  document.querySelectorAll("[data-view-breeding]").forEach(el => el.addEventListener("click", () => setState({ page: "breedingDetail", selectedBreedingId: el.dataset.viewBreeding, breedingEditPhoto: "" })));
  document.querySelector("[data-breeding-edit-photo-button]")?.addEventListener("click", () => {
    if (!requireLogin()) return;
    document.querySelector("[data-breeding-edit-photo-input]")?.click();
  });
  document.querySelector("[data-breeding-edit-photo-input]")?.addEventListener("change", readBreedingEditPhoto);
  document.querySelector("[data-clear-breeding-edit-photo]")?.addEventListener("click", () => {
    if (!requireLogin()) return;
    setState({ breedingEditPhoto: "__CLEAR__" });
  });
  document.querySelector("#breedingDetailForm")?.addEventListener("submit", submitBreedingDetail);
  document.querySelector("[data-breeding-mother]")?.addEventListener("change", e => {
    if (!requireLogin()) return;
    setState({
      ...readBreedingDraft(),
      breedingMotherMode: e.target.value === "manual" ? "manual" : "archive",
      breedingMotherValue: e.target.value
    });
  });
  document.querySelectorAll("#breedingForm [name='date'], #breedingForm [name='manualMother'], #breedingForm [name='eggCount'], #breedingForm [name='fertileCount'], #breedingForm [name='hatchCount'], #breedingForm [name='note']").forEach(input => {
    input.addEventListener("input", () => {
      if (!requireLogin()) return;
      setState(readBreedingDraft());
    });
  });
  document.querySelector("#breedingForm")?.addEventListener("submit", submitBreedingRecord);
  document.querySelectorAll("[data-delete-breeding]").forEach(btn => btn.addEventListener("click", event => {
    event.stopPropagation();
    deleteBreedingRecord(btn.dataset.deleteBreeding);
  }));
  document.querySelectorAll("[data-theme]").forEach(btn => btn.addEventListener("click", () => {
    if (!requireLogin()) return;
    setState({ themeColor: btn.dataset.theme });
  }));
  document.querySelectorAll("[data-rating]").forEach(btn => btn.addEventListener("click", () => {
    if (!requireLogin()) return;
    setState({ satisfactionRating: Number(btn.dataset.rating) });
  }));
  document.querySelector("#satisfactionForm")?.addEventListener("submit", submitSatisfaction);
  document.querySelector("#feedbackForm")?.addEventListener("submit", submitFeedback);
  document.querySelector("#accountForm")?.addEventListener("submit", submitAccount);
  document.querySelectorAll("[data-account-mode]").forEach(btn => btn.addEventListener("click", () => setState({ accountMode: btn.dataset.accountMode, pendingAuthCode: "", pendingAuthPhone: "", authCodeExpiresAt: "" })));
  const passwordInput = document.querySelector("#accountForm [name='password']");
  const confirmPasswordInput = document.querySelector("#accountForm [name='confirmPassword']");
  [passwordInput, confirmPasswordInput].forEach(input => input?.addEventListener("input", validateAccountPasswordMatch));
  document.querySelector("[data-send-code]")?.addEventListener("click", sendAccountCode);
  document.querySelector("[data-account-avatar-button]")?.addEventListener("click", () => {
    if (!requireLogin()) return;
    document.querySelector("[data-account-avatar-input]")?.click();
  });
  document.querySelector("[data-account-avatar-input]")?.addEventListener("change", readAccountAvatar);
  document.querySelector("#profileForm")?.addEventListener("submit", submitProfile);
  document.querySelectorAll("[data-logout-account]").forEach(btn => btn.addEventListener("click", logoutAccount));
  document.querySelector("[data-toggle-sync]")?.addEventListener("click", () => {
    if (!requireLogin()) return;
    setState({
      syncEnabled: !state.syncEnabled,
      activityLogs: logActivity(`${state.syncEnabled ? "关闭" : "开启"}数据同步设置`, "空间")
    });
  });
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
  const form = new FormData(event.currentTarget);
  const mode = event.currentTarget.dataset.authForm || state.accountMode;
  const phone = String(form.get("phone") || "").trim();
  const password = String(form.get("password") || "");
  const confirmPassword = String(form.get("confirmPassword") || "");
  if (!/^1[3-9]\d{9}$/.test(phone)) return toast("请输入正确的 11 位手机号");
  if (password.length < 6) return toast("密码至少需要 6 位");

  if (mode === "login") {
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
      page: "mine",
      activityLogs: [makeActivity(`手机号登录：${maskPhone(phone)}`, "空间"), ...(accountData.activityLogs || [])]
    });
    toast("登录成功");
    return;
  }

  const code = String(form.get("code") || "").trim();
  if (!confirmPassword) return toast("请先填写核对密码");
  if (password !== confirmPassword) return toast("密码不一致");
  if ((state.registeredUsers || []).some(item => item.phone === phone)) return toast("手机号已注册，请直接登录");
  if (!state.pendingAuthCode || state.pendingAuthPhone !== phone) return toast("请先获取验证码");
  if (Date.now() > Number(state.authCodeExpiresAt || 0)) return toast("验证码已过期，请重新获取");
  if (!(await verifyServerSmsCode(phone, code))) return toast("验证码不正确");

  const accountData = emptyAccountData();
  const user = { id: crypto.randomUUID(), phone, password, accountName: maskPhone(phone), accountAvatar: "", data: accountData, createdAt: new Date().toISOString() };
  setState({
    ...accountData,
    registeredUsers: [user, ...(state.registeredUsers || [])],
    loggedInPhone: phone,
    accountName: user.accountName,
    accountAvatar: "",
    pendingAuthCode: "",
    pendingAuthPhone: "",
    authCodeExpiresAt: "",
    accountCodeCooldownUntil: "",
    accountDraftPhone: "",
    accountDraftPassword: "",
    accountDraftConfirmPassword: "",
    page: "mine",
    activityLogs: [makeActivity(`注册并登录：${maskPhone(phone)}`, "空间")]
  });
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
  if ((state.registeredUsers || []).some(item => item.phone === phone)) return toast("手机号已注册，请直接登录");
  if (hasSmsBackend()) {
    try {
      const result = await apiPost("/api/sms/send", { phone, purpose: "register" });
      setState({
        accountDraftPhone: phone,
        accountDraftPassword: password,
        accountDraftConfirmPassword: confirmPassword,
        pendingAuthCode: result.code || SERVER_SMS_CODE,
        pendingAuthPhone: phone,
        authCodeExpiresAt: String(Date.now() + 5 * 60 * 1000),
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

function readAccountAvatar(event) {
  if (!requireLogin()) return;
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => setState({ accountAvatar: reader.result });
  reader.readAsDataURL(file);
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

function logoutAccount() {
  if (!confirm("确定要退出当前账号吗？")) return;
  const registeredUsers = syncRegisteredUsers(state);
  setState({
    ...emptyAccountData(),
    registeredUsers,
    loggedInPhone: "",
    accountName: "未登录用户",
    accountAvatar: "",
    page: "mine"
  });
  toast("已退出账号");
}

function maskPhone(phone) {
  return phone ? `${phone.slice(0, 3)}****${phone.slice(7)}` : "未登录用户";
}

function accountAvatarMarkup(className = "avatar") {
  return state.accountAvatar
    ? `<img class="${className} avatar-img" src="${state.accountAvatar}" alt="头像">`
    : `<div class="${className}">龟</div>`;
}

function hasSmsBackend() {
  return CONFIGURED_SMS_BACKEND || location.protocol === "http:" || location.protocol === "https:";
}

async function apiPost(path, payload) {
  const base = window.TURTLE_API_BASE_URL || "";
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || "服务暂时不可用");
  return data;
}

async function verifyServerSmsCode(phone, code) {
  if (state.pendingAuthCode !== SERVER_SMS_CODE) return CONFIGURED_SMS_BACKEND ? false : code === state.pendingAuthCode;
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
  const keptSpecies = state.keptSpecies.includes(code) ? state.keptSpecies : [...state.keptSpecies, code];
  setState({ keptSpecies, selectedSpeciesCode: code, page: "add", search: "" });
  toast(`${species.name} 已加入常用品种`);
}

function removeKeptSpecies(code) {
  if (!requireLogin()) return;
  if (!confirm("要把这个品种移出常用品种吗？已有档案会保留。")) return;
  setState({ keptSpecies: state.keptSpecies.filter(item => item !== code), activityLogs: logActivity(`移除常用品种：${speciesByCode(code)?.name || code}`, "品种") });
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

function readPhoto(event) {
  if (!requireLogin()) return;
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => setState({ formPhoto: reader.result });
  reader.readAsDataURL(file);
}

function readUpdatePhoto(event) {
  if (!requireLogin()) return;
  const file = event.target.files?.[0];
  if (!file) return;
  const draft = captureTurtleDetailDraft();
  const reader = new FileReader();
  reader.onload = () => setState({
    turtleDetailDraftId: state.selectedTurtleId,
    turtleDetailDraft: draft,
    updateDraftPhoto: reader.result
  });
  reader.readAsDataURL(file);
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
    gender: String(form.get("gender") || "未知"),
    weight,
    carapaceLength,
    carapaceWidth: String(form.get("carapaceWidth") || ""),
    shellHeight: String(form.get("shellHeight") || ""),
    plastronLength: String(form.get("plastronLength") || ""),
    status: String(form.get("status") || "正常饲养"),
    health: String(form.get("health") || "健康"),
    acquiredDate: String(form.get("acquiredDate") || ""),
    source: String(form.get("source") || "购买"),
    price: String(form.get("price") || ""),
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
      health: turtle.health
    },
    newSnapshot: {
      code: updated.code,
      weight: updated.weight,
      carapaceLength: updated.carapaceLength,
      status: updated.status,
      health: updated.health
    },
    updatedAt: new Date().toISOString()
  };
  const keptSpecies = state.keptSpecies.includes(species.code) ? state.keptSpecies : [...state.keptSpecies, species.code];
  setState({
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
  });
  toast("档案已更新，旧记录已经留存");
}

function submitTurtle(event) {
  event.preventDefault();
  if (!requireLogin()) return;
  const form = new FormData(event.currentTarget);
  const species = speciesByCode(form.get("speciesCode"));
  if (!species) return toast("先选择一个品种，再保存档案");
  const code = form.get("code") || `${species.code}-${state.turtles.filter(t => t.speciesCode === species.code).length + 1}`;
  const turtle = {
    id: crypto.randomUUID(),
    code,
    speciesCode: species.code,
    speciesName: species.name,
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
  setState({
    turtles: [turtle, ...state.turtles],
    keptSpecies,
    ledgerRecords,
    formPhoto: "",
    formGender: "未知",
    selectedSpeciesCode: "",
    page: "home",
    activityLogs: [...logs, ...(state.activityLogs || [])]
  });
  toast(turtle.source === "购买" ? "档案已保存，并已同步到收购账本" : "档案已保存");
}

function submitMemoForm(event) {
  event.preventDefault();
  if (!requireLogin()) return;
  const form = new FormData(event.currentTarget);
  const title = String(form.get("title") || "").trim();
  if (!title) return toast("先写一个护理事项名称");
  const content = String(form.get("content") || "").trim();
  const repeat = form.get("repeat") === "true";
  const now = new Date().toISOString();
  const editingMemo = state.memos.find(m => m.id === state.memoEditingId);
  const nextMemos = editingMemo
    ? state.memos.map(m => m.id === editingMemo.id ? { ...m, title, content, repeat, updatedAt: now } : m)
    : [{ id: crypto.randomUUID(), title, content, repeat, updatedAt: now }, ...state.memos];
  setState({
    memos: nextMemos,
    memoDraftOpen: false,
    memoEditingId: "",
    activityLogs: logActivity(`${editingMemo ? "调整护理" : "新增护理"}：${title}`, "护理")
  });
}

function deleteMemo(id) {
  if (!requireLogin()) return;
  const memo = state.memos.find(m => m.id === id);
  if (!memo || !confirm("要删除这条护理提醒吗？")) return;
  setState({ memos: state.memos.filter(m => m.id !== id), activityLogs: logActivity(`删除护理：${memo.title}`, "护理") });
}

function openLedgerForm(type, turtleId = "") {
  if (!requireLogin()) return;
  const turtle = state.turtles.find(t => t.id === turtleId);
  setState({ page: "ledger", ledgerDraftType: type, ledgerDraftPhoto: turtle?.photo || "", ledgerDraftTurtleId: turtleId, ledgerPurchaseGender: "未知", ledgerTab: type, openTurtleMenuId: "" });
}

function readLedgerPhoto(event) {
  if (!requireLogin()) return;
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => setState({ ledgerDraftPhoto: reader.result });
  reader.readAsDataURL(file);
}

function readBreedingPhoto(event) {
  if (!requireLogin()) return;
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => setState({ breedingDraftPhoto: reader.result });
  reader.readAsDataURL(file);
}

function readBreedingEditPhoto(event) {
  if (!requireLogin()) return;
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => setState({ breedingEditPhoto: reader.result });
  reader.readAsDataURL(file);
}

function readBreedingDraft() {
  const form = document.querySelector("#breedingForm");
  if (!form) return {};
  const data = new FormData(form);
  return {
    breedingDraftDate: String(data.get("date") || ""),
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
      note: record.note || ""
    },
    newSnapshot: {
      date: form.get("date"),
      motherName: nextMotherName,
      eggCount,
      fertileCount,
      hatchCount,
      note: String(form.get("note") || "")
    },
    updatedAt: new Date().toISOString()
  };
  const updated = {
    ...record,
    date: form.get("date"),
    motherId,
    motherName: nextMotherName,
    eggCount,
    fertileCount,
    hatchCount,
    note: form.get("note"),
    photo,
    updatedAt: historyItem.updatedAt,
    editHistory: [historyItem, ...(record.editHistory || [])]
  };
  setState({
    breedingRecords: (state.breedingRecords || []).map(item => item.id === record.id ? updated : item),
    breedingEditPhoto: "",
    page: "breedingDetail",
    activityLogs: logActivity(`修改繁殖记录：${updated.motherName}，产蛋 ${eggCount} 枚，受精 ${fertileCount} 枚，孵化 ${hatchCount} 只`, "繁殖")
  });
  toast("繁殖记录已更新");
}

function submitBreedingRecord(event) {
  event.preventDefault();
  if (!requireLogin()) return;
  const form = new FormData(event.currentTarget);
  const motherId = form.get("mother");
  const mother = state.turtles.find(t => t.id === motherId);
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
    eggCount,
    fertileCount,
    hatchCount,
    note: form.get("note"),
    photo: state.breedingDraftPhoto,
    createdAt: new Date().toISOString(),
    editHistory: []
  };
  setState({
    breedingRecords: [record, ...(state.breedingRecords || [])],
    breedingDraftPhoto: "",
    breedingMotherMode: "archive",
    breedingMotherValue: "",
    breedingDraftDate: "",
    breedingManualMother: "",
    breedingEggCount: "",
    breedingFertileCount: "",
    breedingHatchCount: "",
    breedingNote: "",
    page: "breeding",
    activityLogs: logActivity(`新增繁殖记录：${record.motherName}，产蛋 ${eggCount} 枚，受精 ${fertileCount} 枚，孵化 ${hatchCount} 只`, "繁殖")
  });
  toast("繁殖记录已保存");
}

function deleteBreedingRecord(id) {
  if (!requireLogin()) return;
  const record = (state.breedingRecords || []).find(item => item.id === id);
  if (!record || !confirm("要删除这条繁殖记录吗？")) return;
  setState({
    breedingRecords: (state.breedingRecords || []).filter(item => item.id !== id),
    activityLogs: logActivity(`删除繁殖记录：${record.motherName || "未填写种母"}`, "繁殖")
  });
}

function submitLedgerRecord(event) {
  event.preventDefault();
  if (!requireLogin()) return;
  const form = new FormData(event.currentTarget);
  const type = state.ledgerDraftType;
  let turtle = state.turtles.find(t => t.id === form.get("turtleId"));
  const amount = Number(form.get("amount"));
  if (!type || Number.isNaN(amount) || amount < 0) return toast("请填写正确的金额");
  let nextTurtles = state.turtles;
  let nextKeptSpecies = state.keptSpecies;
  if (type === "purchase" && !turtle) {
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
      price: amount,
      note: form.get("note"),
      photo: state.ledgerDraftPhoto || speciesPhoto(species),
      createdAt: new Date().toISOString(),
      measureHistory: []
    };
    nextTurtles = [turtle, ...state.turtles];
    nextKeptSpecies = state.keptSpecies.includes(species.code) ? state.keptSpecies : [...state.keptSpecies, species.code];
  }
  if ((type === "sold" || type === "loss") && turtle) nextTurtles = nextTurtles.filter(t => t.id !== turtle.id);
  const title = turtle ? turtleLabel(turtle) : (String(form.get("note") || "").trim().split(/[，。\n]/)[0] || "未关联档案");
  const record = {
    id: crypto.randomUUID(),
    type,
    turtleId: turtle?.id || form.get("turtleId"),
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
  setState({
    turtles: nextTurtles,
    keptSpecies: nextKeptSpecies,
    ledgerRecords: [record, ...state.ledgerRecords],
    ledgerTab: type,
    ledgerDraftType: "",
    ledgerDraftPhoto: "",
    ledgerDraftTurtleId: "",
    ledgerPurchaseGender: "未知",
    activityLogs: logActivity(`${ledgerTypeText(type)}记录：${title}，金额 ${money(amount)} 元${movedText}`, "账本")
  });
  toast(`${ledgerTypeText(type)}记录已保存`);
}

function deleteLedgerRecord(id) {
  if (!requireLogin()) return;
  const record = state.ledgerRecords.find(item => item.id === id);
  if (!record || !confirm("要删除这条账本记录吗？")) return;
  setState({ ledgerRecords: state.ledgerRecords.filter(item => item.id !== id), activityLogs: logActivity(`删除账本记录：${record.title}`, "账本") });
}

function toast(text) {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

render();
