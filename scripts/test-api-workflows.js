/*
 * End-to-end API regression test.
 *
 * The server is started with TURTLE_RUNTIME_DIR pointing at a temporary
 * directory, so this checks real authentication, uploads, records, market,
 * community, and chat workflows without touching any real user data.
 */
const assert = require("assert/strict");
const crypto = require("crypto");
const fs = require("fs/promises");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const serverFile = path.join(root, "server", "server.js");
const password = "RegressionPass123";
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9eAAAAABJRU5ErkJggg==",
  "base64"
);

function auth(user) {
  return { phone: user.phone, token: user.token };
}

function communityId(phone) {
  return crypto.createHash("sha256").update(`community:${phone}`).digest("hex").slice(0, 20);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      listener.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitFor(check, timeoutMs = 10000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  throw lastError || new Error("Timed out waiting for isolated API server");
}

async function main() {
  const runtime = await fs.mkdtemp(path.join(os.tmpdir(), "turtlekeeper-api-regression-"));
  const port = await getFreePort();
  const base = `http://127.0.0.1:${port}`;
  let output = "";
  let child;

  async function request(pathname, payload, options = {}) {
    const headers = { ...(options.headers || {}) };
    let body;
    if (Object.hasOwn(options, "rawBody")) {
      body = options.rawBody;
    } else {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
      body = JSON.stringify(payload || {});
    }
    const response = await fetch(`${base}${pathname}`, { method: options.method || "POST", headers, body });
    const json = await response.json().catch(() => ({}));
    if (options.status !== undefined) {
      assert.equal(response.status, options.status, `${pathname} should return HTTP ${options.status}: ${JSON.stringify(json)}`);
    } else if (!response.ok || json.ok === false) {
      throw new Error(`${pathname} failed (${response.status}): ${json.message || JSON.stringify(json)}`);
    }
    return { response, json };
  }

  async function register(phone, accountName) {
    const sms = await request("/api/sms/send", { phone, purpose: "register" });
    assert.equal(sms.json.mode, "mock", "regression server must use local SMS mode");
    assert.match(String(sms.json.code || ""), /^\d{6}$/);
    const registered = await request("/api/account/register", {
      phone,
      password,
      code: sms.json.code,
      termsAccepted: true,
      accountName
    });
    assert.ok(registered.json.user?.token, "registration should issue an auth token");
    return { phone, token: registered.json.user.token };
  }

  try {
    child = spawn(process.execPath, [serverFile], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        MIN_SUPPORTED_APP_BUILD: "95",
        LATEST_APP_BUILD: "99",
        TURTLE_RUNTIME_DIR: runtime,
        FFMPEG_PATH: path.join(runtime, "disabled-ffmpeg"), // Encoding is covered by test-media-variants.js.
        SMS_PROVIDER: "mock",
        SMS_MOCK: "true",
        ADMIN_PHONE: "13900000001"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout.on("data", chunk => { output += chunk.toString(); });
    child.stderr.on("data", chunk => { output += chunk.toString(); });
    child.once("error", error => { output += `\nprocess error: ${error.message}`; });

    await waitFor(async () => {
      const response = await fetch(`${base}/api/app/version?build=1`);
      return response.ok;
    });

    const health = await fetch(`${base}/api/app/version?build=1`).then(response => response.json());
    assert.equal(health.ok, true);
    assert.equal(health.minimumBuild, 95, "1.0.7 must remain supported when building 1.0.8");
    assert.equal(health.latestBuild, 99, "unreleased builds must not replace the public release in update checks");
    for (const build of [95, 96, 97, 98, 99, 102, 103]) assert.ok(build >= health.minimumBuild, `Build ${build} must not require a forced update`);

    await request("/api/upload/image", { image: "data:image/png;base64,AAAA" }, { status: 401 });

    const seller = await register("13900000001", "Regression Seller");
    const buyer = await register("13900000002", "Regression Buyer");

    // 1.0.7 removes a lost turtle but retains the original purchase and the
    // user-entered loss amount. A shared server must not migrate that ledger.
    const legacy = await register("13900000003", "Legacy Client");
    const legacyTurtle = { id: "legacy-lost", speciesName: "果核蛋龟", price: 100, status: "正常饲养", photo: "/uploads/shared.png?media-v=compat-test" };
    const legacyPurchase = { id: "legacy-purchase", type: "purchase", turtleId: legacyTurtle.id, amount: 100, turtleSnapshot: legacyTurtle };
    const legacyLoss = { id: "legacy-loss", type: "loss", turtleId: legacyTurtle.id, amount: 25, turtleSnapshot: legacyTurtle };
    const legacyData = {
      turtles: [],
      ledgerRecords: [legacyLoss, legacyPurchase],
      memos: [{ id: "legacy-memo", turtleId: legacyTurtle.id, reminderEnabled: true }],
      turtlePools: [{ id: "legacy-pool", name: "旧版龟池", type: "hatchling", count: 12 }]
    };
    const legacySaved = await request("/api/account/save", { ...auth(legacy), data: legacyData });
    const legacyLoaded = await request("/api/account/load", auth(legacy));
    for (const result of [legacySaved, legacyLoaded]) {
      const data = result.json.user.data;
      assert.deepEqual(data.turtles, [], "1.0.7 losses must not reappear in archives");
      assert.deepEqual(data.ledgerRecords, legacyData.ledgerRecords, "server must preserve 1.0.7 purchase and loss amounts");
      assert.deepEqual(data.memos, legacyData.memos, "server must not migrate legacy reminders");
      assert.equal(data.turtlePools[0].count, 12, "legacy pool counts must remain unchanged");
      assert.equal(result.json.user.termsVersion, "2026-08-12", "legacy saves and loads must keep the compatible agreement");
    }
    const legacyDeleted = await request("/api/account/save", {
      ...auth(legacy), data: { ...legacyData, ledgerRecords: [legacyPurchase] }
    });
    assert.deepEqual(legacyDeleted.json.user.data.ledgerRecords, [legacyPurchase], "1.0.7 can still delete a loss without rewriting its purchase");

    // Build 103 performs its own accounting migration. The same endpoints
    // must round-trip its metadata and shared image URLs as ordinary JSON.
    const modern = await register("13900000004", "Build 103 Client");
    const accounting = require("../assets/loss-accounting");
    const modernData = accounting.reconcile(legacyData);
    const modernSaved = await request("/api/account/save", { ...auth(modern), data: modernData });
    const modernLoaded = await request("/api/account/load", auth(modern));
    for (const result of [modernSaved, modernLoaded]) {
      assert.deepEqual(result.json.user.data.turtles, modernData.turtles);
      assert.deepEqual(result.json.user.data.ledgerRecords, modernData.ledgerRecords);
      assert.deepEqual(result.json.user.data.memos, modernData.memos);
    }
    const undone = accounting.undoLoss(modernLoaded.json.user.data, modernLoaded.json.user.data.ledgerRecords.find(record => record.id === legacyLoss.id));
    const undoSaved = await request("/api/account/save", { ...auth(modern), data: undone });
    assert.deepEqual(undoSaved.json.user.data.ledgerRecords, undone.ledgerRecords);
    assert.equal(undoSaved.json.user.data.turtles[0].status, "正常饲养");
    await request("/api/account/save", { ...auth(modern), baseUpdatedAt: "2000-01-01T00:00:00.000Z", data: modernData }, { status: 409 });
    const afterStaleWrite = await request("/api/account/load", auth(modern));
    assert.deepEqual(afterStaleWrite.json.user.data.ledgerRecords, undone.ledgerRecords, "stale device cannot overwrite newer ledger records");
    await request("/api/account/save", { ...auth(modern), baseUpdatedAt: afterStaleWrite.json.user.updatedAt, data: undone });

    const privateCode = "CUS-" + crypto.randomUUID();
    await request("/api/account/species/create", { code: privateCode, name: "私有测试品种" }, { status: 401 });
    const custom = await request("/api/account/species/create", { ...auth(seller), code: privateCode, name: "私有测试品种" });
    assert.equal(custom.json.customSpecies.length, 1);
    assert.equal(custom.json.species.code, privateCode);
    const repeated = await request("/api/account/species/create", { ...auth(seller), code: privateCode, name: "私有测试品种" });
    assert.equal(repeated.json.customSpecies.length, 1, "retries must not create duplicates");
    const otherAccount = await request("/api/account/load", auth(buyer));
    assert.equal(otherAccount.json.user.data.customSpecies.length, 0, "private species must not leak to another account");
    await request("/api/account/species/create", { phone: seller.phone, token: buyer.token, code: privateCode, name: "越权品种" }, { status: 401 });

    const accountData = {
      turtles: [{
        id: "regression-turtle",
        code: "Regression Turtle",
        speciesCode: "GHG",
        speciesName: "果核蛋龟",
        gender: "未知",
        weight: "88",
        carapaceLength: "6"
      }],
      ledgerRecords: [{
        id: "regression-ledger",
        type: "expense",
        amount: 12,
        title: "Regression feed",
        createdAt: new Date().toISOString()
      }]
    };
    const saved = await request("/api/account/save", { ...auth(seller), data: accountData, accountName: "Regression Seller" });
    assert.equal(saved.json.user.data.turtles.length, 1);
    assert.equal(saved.json.user.data.customSpecies[0].code, privateCode, "an old client save must preserve private species");
    const loaded = await request("/api/account/load", auth(seller));
    assert.equal(loaded.json.user.data.turtles[0].id, "regression-turtle");
    await request("/api/account/save", { ...auth(seller), data: {}, accountName: "Regression Seller" }, { status: 409 });

    const dataUrl = `data:image/png;base64,${tinyPng.toString("base64")}`;
    const uploadedImage = await request("/api/upload/image", { ...auth(seller), kind: "regression", image: dataUrl });
    assert.match(uploadedImage.json.url || "", /^\/uploads\//);
    const uploadedImageResponse = await fetch(`${base}${uploadedImage.json.url}`);
    assert.equal(uploadedImageResponse.status, 200);
    assert.equal(await uploadedImageResponse.arrayBuffer().then(buffer => buffer.byteLength), tinyPng.length);

    const streamedImage = await request("/api/upload/media", null, {
      rawBody: tinyPng,
      headers: {
        "Content-Type": "image/png",
        "X-Auth-Phone": seller.phone,
        "X-Auth-Token": seller.token,
        "X-Media-Duration": "0"
      }
    });
    assert.equal(streamedImage.json.mediaType, "image");
    const ranged = await fetch(`${base}${streamedImage.json.url}`, { headers: { Range: "bytes=0-3" } });
    assert.equal(ranged.status, 206, "uploaded images must support range reads");

    await request("/api/upload/media", null, {
      rawBody: Buffer.from("not-a-video"),
      headers: {
        "Content-Type": "video/mp4",
        "X-Auth-Phone": seller.phone,
        "X-Auth-Token": seller.token,
        "X-Media-Duration": "31"
      },
      status: 400
    });
    const uploadedVideo = await request("/api/upload/media", null, {
      rawBody: Buffer.from("regression-video-stream"),
      headers: {
        "Content-Type": "video/mp4",
        "X-Auth-Phone": seller.phone,
        "X-Auth-Token": seller.token,
        "X-Media-Duration": "1"
      }
    });
    assert.equal(uploadedVideo.json.mediaType, "video");

    const post = await request("/api/community/create", {
      ...auth(seller),
      title: "Regression turtle post",
      content: "Regression community post",
      mediaItems: [{ url: uploadedImage.json.url, type: "image" }]
    });
    const postId = post.json.posts[0]?.id;
    assert.ok(postId, "community post should be returned after creation");
    await request("/api/community/daily-push/preference", {}, { status: 401 });
    const preference = await request("/api/community/daily-push/preference", { ...auth(buyer), enabled: false });
    assert.equal(preference.json.enabled, false);
    assert.equal((await request("/api/community/daily-push/preference", auth(buyer))).json.enabled, false);
    assert.equal((await request("/api/community/daily-push/preference", auth(seller))).json.enabled, true);
    await request("/api/community/admin/action", { ...auth(buyer), postId, action: "dailyPushApprove", confirmNoAdvertising: true }, { status: 403 });
    await request("/api/community/admin/action", { ...auth(seller), postId, action: "dailyPushApprove" }, { status: 400 });
    await request("/api/community/admin/action", { ...auth(seller), postId, action: "dailyPushApprove", confirmNoAdvertising: true });
    await request("/api/community/admin/action", { ...auth(seller), postId, action: "dailyPushReject" });
    await request("/api/community/create", {
      ...auth(seller), title: "Objectionable turtle post", content: "提供 色-情 裸聊服务"
    }, { status: 400 });
    await request("/api/community/create", {
      ...auth(seller), title: "Video turtle post", content: "Regression video rejection", mediaItems: [{ url: uploadedVideo.json.url, type: "video" }]
    }, { status: 400 });
    await request("/api/community/like", { ...auth(buyer), postId });
    await request("/api/community/comment", { ...auth(buyer), postId, content: "Regression comment" });
    const activityInbox = await request("/api/community/unread", auth(seller));
    assert.equal(activityInbox.json.notificationSummary.interactions.unread, 2, "like and comment share one unread badge");
    const activityPage = await request("/api/community/notifications", { ...auth(seller), group: "interactions", limit: 1 });
    assert.equal(activityPage.json.notifications.length, 1);
    assert.equal(activityPage.json.hasMore, true);
    const displayedId = activityPage.json.notifications[0].id;
    await request("/api/community/notifications", {}, { status: 401 });
    await request("/api/community/unread", { ...auth(buyer), readNotificationIds: [displayedId] });
    const unchangedActivity = await request("/api/community/unread", auth(seller));
    assert.equal(unchangedActivity.json.notificationSummary.interactions.unread, 2, "reading or a different account's acknowledgment cannot clear activity");
    const activityAck = await request("/api/community/unread", { ...auth(seller), readNotificationIds: [displayedId] });
    assert.equal(activityAck.json.notificationSummary.interactions.unread, 1, "only the displayed notification is acknowledged");
    await request("/api/community/comment", {
      ...auth(buyer), postId, content: "这是一个网赌 平台"
    }, { status: 400 });
    const community = await request("/api/community/list", auth(seller));
    assert.equal(community.json.posts[0].likeCount, 1);
    assert.equal(community.json.posts[0].comments[0].content, "Regression comment");
    const commentId = community.json.posts[0].comments[0].id;
    assert.equal(community.json.posts[0].comments[0].authorId, communityId(buyer.phone), "comment avatar must link to the actual author's public profile");
    assert.equal(community.json.posts[0].comments[0].authorPhoneRaw, undefined, "profile navigation must not expose private phone numbers");
    assert.equal(community.json.posts[0].comments[0].canDelete, false, "post owner cannot delete another user's comment");
    const ownComments = await request("/api/community/list", auth(buyer));
    assert.equal(ownComments.json.posts[0].comments[0].canDelete, true);
    await request("/api/community/comment/delete", { postId, commentId }, { status: 401 });
    await request("/api/community/comment/delete", { ...auth(seller), postId, commentId, canDelete: true }, { status: 403 });
    const replyResult = await request("/api/community/comment", { ...auth(seller), postId, content: "Keep this reply", replyToCommentId: commentId });
    const replyId = replyResult.json.posts[0].comments.find(item => item.content === "Keep this reply").id;
    await request("/api/community/comment/like", { ...auth(seller), postId, commentId });
    const removed = await request("/api/community/comment/delete", { ...auth(buyer), postId, commentId });
    assert.equal(removed.json.posts[0].comments.length, 1);
    assert.equal(removed.json.posts[0].comments[0].id, replyId, "other people's replies survive deletion");
    assert.equal(removed.json.posts[0].comments[0].replyToCommentId, "");
    const afterDeleteUnread = await request("/api/community/unread", auth(seller));
    assert.ok(!afterDeleteUnread.json.notifications.some(item => item.preview === "Regression comment"), "deleted comment preview must be removed");
    await request("/api/community/comment/delete", { ...auth(buyer), postId, commentId }, { status: 404 });
    await request("/api/community/comment/delete", { ...auth(buyer), postId, commentId: replyId }, { status: 403 });
    await request("/api/community/comment/delete", { ...auth(seller), postId, commentId: replyId });

    const sellerId = communityId(seller.phone);
    const buyerId = communityId(buyer.phone);
    const privatePost = await request("/api/community/create", {
      ...auth(seller), title: "Private turtle post", content: "Only the author can see this", visibility: "private"
    });
    const privatePostId = privatePost.json.posts.find(item => item.title === "Private turtle post")?.id;
    const followersPost = await request("/api/community/create", {
      ...auth(seller), title: "Followers turtle post", content: "Followers can see this", visibility: "followers"
    });
    const followersPostId = followersPost.json.posts.find(item => item.title === "Followers turtle post")?.id;
    const buyerBeforeFollow = await request("/api/community/list", auth(buyer));
    assert.ok(!buyerBeforeFollow.json.posts.some(item => item.id === privatePostId || item.id === followersPostId));
    await request("/api/community/follow/toggle", { ...auth(buyer), userId: sellerId });
    const buyerAfterFollow = await request("/api/community/list", auth(buyer));
    assert.ok(buyerAfterFollow.json.posts.some(item => item.id === followersPostId));
    assert.ok(!buyerAfterFollow.json.posts.some(item => item.id === privatePostId));
    const sent = await request("/api/community/chat/send", {
      ...auth(buyer),
      userId: sellerId,
      content: "价格 100 元"
    });
    await request("/api/community/chat/send", {
      ...auth(buyer), userId: sellerId, content: "刷单返利，联系我"
    }, { status: 400 });
    assert.ok(sent.json.messages.length >= 2, "price discussion should include the official safety notice");
    const unread = await request("/api/community/unread", auth(seller));
    assert.ok(unread.json.unreadCount >= 1);
    const followsPage = await request("/api/community/notifications", { ...auth(seller), group: "follows" });
    assert.ok(followsPage.json.notifications.every(item => item.type === "follow"));
    assert.equal(unread.json.notificationSummary.follows.unread, 1);
    const followAck = await request("/api/community/unread", { ...auth(seller), readNotificationIds: followsPage.json.notifications.map(item => item.id) });
    assert.equal(followAck.json.notificationSummary.follows.unread, 0);
    assert.equal(followAck.json.unreadCount, unread.json.unreadCount, "activity acknowledgments preserve private chat unread counts");
    const conversation = await request("/api/community/chat/list", { ...auth(seller), userId: buyerId });
    assert.ok(conversation.json.messages.some(message => message.content.includes("100")));
    const afterRead = await request("/api/community/unread", auth(seller));
    assert.equal(afterRead.json.unreadCount, 0, "opening a conversation should clear its unread count");
    await request("/api/community/chat/pin", { ...auth(seller), userId: buyerId });
    const chatList = await request("/api/community/unread", auth(seller));
    assert.equal(chatList.json.friends[0]?.pinned, true);

    const market = await request("/api/market/create", {
      ...auth(seller),
      submissionId: "regression-submission-1",
      turtleId: "regression-turtle",
      title: "Regression 果核蛋龟",
      speciesCode: "GHG",
      stage: "juvenile",
      gender: "未知",
      weight: "88",
      shellLength: "6",
      price: 100,
      city: "南京市",
      locationSource: "device",
      latitude: 32.0603,
      longitude: 118.7969,
      delivery: "可快递",
      description: "Regression listing",
      mediaItems: [{ url: uploadedImage.json.url, type: "image" }]
    });
    const listingId = market.json.myListings[0]?.id;
    assert.ok(listingId, "market listing should be returned after publishing");
    await request("/api/market/seller-phone", { listingId }, { status: 401 });
    await request("/api/market/seller-phone", { ...auth(buyer), listingId, isAdmin: true }, { status: 403 });
    await request("/api/market/seller-phone", { phone: seller.phone, token: buyer.token, listingId }, { status: 401 });
    const sellerPhone = await request("/api/market/seller-phone", { ...auth(seller), listingId });
    assert.equal(sellerPhone.json.sellerPhone, seller.phone);
    await request("/api/market/seller-phone", { ...auth(seller), listingId: "missing-listing" }, { status: 404 });
    await request("/api/market/create", {
      ...auth(seller), submissionId: "regression-no-location", title: "缺少定位的商品", speciesCode: "GHG", price: 100
    }, { status: 400 });
    await request("/api/market/create", {
      ...auth(seller),
      submissionId: "regression-blocked-listing",
      title: "黄色网站推广",
      speciesCode: "GHG",
      price: 100
    }, { status: 400 });
    const duplicate = await request("/api/market/create", {
      ...auth(seller),
      submissionId: "regression-submission-1",
      title: "Regression 果核蛋龟",
      speciesCode: "GHG",
      price: 100
    });
    assert.equal(duplicate.json.duplicate, true, "retrying a publish request must not duplicate a product");
    const marketForBuyer = await request("/api/market/list", { ...auth(buyer), thumbnails: true });
    assert.equal(marketForBuyer.json.total, 1);
    assert.equal(marketForBuyer.json.rankingSession, undefined, "legacy clients retain their original list protocol");
    // Seed a completed immutable derivative, then verify protocol opt-in without changing originals.
    const originalMediaPath = new URL(uploadedImage.json.url, base).pathname;
    const originalMediaFile = path.join(runtime, originalMediaPath);
    const mediaStat = await fs.stat(originalMediaFile);
    const derivativeHash = crypto.createHash("sha256").update(`delivery-v1:${originalMediaPath}:${mediaStat.size}:${mediaStat.mtimeMs}`).digest("hex").slice(0, 24);
    const variants = { thumbnailUrl: "/uploads/2026/09/ready-thumb.jpg", displayUrl: "/uploads/2026/09/ready-detail.jpg" };
    await fs.writeFile(path.join(path.dirname(originalMediaFile), `delivery-${derivativeHash}.json`), JSON.stringify({ hash: derivativeHash, variants }));
    const optimizedFeed = await request("/api/market/list", { ...auth(buyer), mediaVariantsVersion: 1 });
    assert.equal(new URL(optimizedFeed.json.listings[0].mediaItems[0].displayUrl, base).pathname, variants.displayUrl);
    assert.equal(optimizedFeed.json.listings[0].mediaItems[0].url, uploadedImage.json.url, "original remains accessible for zoom and old clients");
    const legacyFeed = await request("/api/market/list", auth(buyer));
    assert.equal(legacyFeed.json.listings[0].mediaItems[0].displayUrl, undefined);
    const optimizedDetail = await request("/api/market/detail", { ...auth(buyer), listingId, mediaVariantsVersion: 1 });
    assert.equal(new URL(optimizedDetail.json.listing.mediaItems[0].displayUrl, base).pathname, variants.displayUrl);

    const cheap = await request("/api/market/create", {
      ...auth(seller), submissionId: "ranking-cheaper", title: "另一只果核蛋龟", speciesCode: "GHG",
      stage: "juvenile", gender: "未知", price: 50, city: "南京市", locationSource: "device",
      latitude: 32.0603, longitude: 118.7969, delivery: "仅自提", description: "排序回归测试商品",
      mediaItems: [{url: uploadedImage.json.url, type:"image"}]
    });
    const cheapId = cheap.json.myListings.find(item => item.id !== listingId)?.id;
    assert.ok(cheapId);
    const rankedQuery = {...auth(buyer), rankingVersion:1, priceOrder:"asc", limit:1};
    const rankedFirst = (await request("/api/market/list", rankedQuery)).json;
    assert.equal(rankedFirst.listings[0]?.id, cheapId);
    assert.equal(rankedFirst.hasMore, true);
    assert.ok(rankedFirst.rankingSession);
    const rankedNext = (await request("/api/market/list", {...rankedQuery, offset:rankedFirst.nextOffset, rankingSession:rankedFirst.rankingSession})).json;
    assert.equal(rankedNext.listings[0]?.id, listingId);
    assert.equal(rankedNext.hasMore, false);
    const otherOwner = (await request("/api/market/list", {...rankedQuery, ...auth(seller), offset:1, rankingSession:rankedFirst.rankingSession})).json;
    assert.equal(otherOwner.rankingReset,true);
    const deliveryOnly = (await request("/api/market/list", {...rankedQuery,delivery:"可快递"})).json;
    assert.equal(deliveryOnly.listings[0]?.id,listingId);
    assert.equal(deliveryOnly.total,1);
    const descriptionMatch = (await request("/api/market/list", {...rankedQuery, keyword:"排序回归测试"})).json;
    assert.equal(descriptionMatch.listings[0]?.id,cheapId);
    await request("/api/market/offline", {...auth(seller),listingId:cheapId});
    await request("/api/market/detail", { ...auth(buyer), listingId });
    const wanted = await request("/api/market/want", { ...auth(buyer), listingId });
    assert.equal(wanted.json.wantCount, 1);
    await request("/api/market/status", {
      ...auth(seller),
      listingId,
      status: "sold",
      saleMethod: "自有客户成交",
      salePrice: 100
    });
    const marketAfterSale = await request("/api/market/list", auth(buyer));
    assert.equal(marketAfterSale.json.total, 0, "sold listings must be hidden from the public market");
    const removedPage = (await request("/api/market/list", {...rankedQuery,offset:1,rankingSession:rankedFirst.rankingSession})).json;
    assert.equal(removedPage.listings.length,0,"rank snapshots cannot reveal sold or offline listings");
    const sellerAfterSale = await request("/api/account/load", auth(seller));
    assert.ok(sellerAfterSale.json.user.data.ledgerRecords.some(record => record.marketListingId === listingId));

    await request("/api/community/chat/delete", { ...auth(seller), userId: buyerId });
    await request("/api/account/delete", { ...auth(buyer), password, confirmation: "DELETE" });
    await request("/api/account/delete", { ...auth(seller), password, confirmation: "DELETE" });

    console.log("API workflow regression passed: auth, safe account saves, images, video streaming, community, chat, unread state, and market publishing.");
  } finally {
    if (child && !child.killed) {
      child.kill();
      await new Promise(resolve => child.once("exit", resolve));
    }
    await fs.rm(runtime, { recursive: true, force: true });
    if (output && process.env.DEBUG_API_REGRESSION === "1") console.error(output);
  }
}

main().catch(error => {
  console.error("API workflow regression failed:", error.stack || error.message);
  process.exitCode = 1;
});
