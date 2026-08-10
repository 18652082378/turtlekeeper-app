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
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        TURTLE_RUNTIME_DIR: runtime,
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

    await request("/api/upload/image", { image: "data:image/png;base64,AAAA" }, { status: 401 });

    const seller = await register("13900000001", "Regression Seller");
    const buyer = await register("13900000002", "Regression Buyer");

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
      content: "Regression community post",
      mediaItems: [{ url: uploadedImage.json.url, type: "image" }]
    });
    const postId = post.json.posts[0]?.id;
    assert.ok(postId, "community post should be returned after creation");
    await request("/api/community/like", { ...auth(buyer), postId });
    await request("/api/community/comment", { ...auth(buyer), postId, content: "Regression comment" });
    const community = await request("/api/community/list", auth(seller));
    assert.equal(community.json.posts[0].likeCount, 1);
    assert.equal(community.json.posts[0].comments[0].content, "Regression comment");

    const sellerId = communityId(seller.phone);
    const buyerId = communityId(buyer.phone);
    const sent = await request("/api/community/chat/send", {
      ...auth(buyer),
      userId: sellerId,
      content: "价格 100 元"
    });
    assert.ok(sent.json.messages.length >= 2, "price discussion should include the official safety notice");
    const unread = await request("/api/community/unread", auth(seller));
    assert.ok(unread.json.unreadCount >= 1);
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
      delivery: "可快递",
      description: "Regression listing",
      mediaItems: [{ url: uploadedImage.json.url, type: "image" }]
    });
    const listingId = market.json.myListings[0]?.id;
    assert.ok(listingId, "market listing should be returned after publishing");
    const duplicate = await request("/api/market/create", {
      ...auth(seller),
      submissionId: "regression-submission-1",
      title: "Regression 果核蛋龟",
      speciesCode: "GHG",
      price: 100
    });
    assert.equal(duplicate.json.duplicate, true, "retrying a publish request must not duplicate a product");
    const marketForBuyer = await request("/api/market/list", auth(buyer));
    assert.equal(marketForBuyer.json.total, 1);
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
