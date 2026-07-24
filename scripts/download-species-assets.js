/*
 * Downloads the catalogue thumbnails into the application bundle.
 * Run with: node scripts/download-species-assets.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "assets", "species");
const source = fs.readFileSync(path.join(root, "species-data.js"), "utf8");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context);
const species = context.window.TURTLE_SPECIES || [];
const concurrency = 4;
const requestTimeoutMs = 25000;
const maxAttempts = 3;

function thumbnailUrl(url) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}width=640`;
}

async function download(item) {
  const target = path.join(outputDir, `${item.code}.jpg`);
  if (fs.existsSync(target) && fs.statSync(target).size > 1024) return "cached";

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetch(thumbnailUrl(item.image), {
        headers: { "User-Agent": "TurtleKeeper/1.0 (bundled species assets)" },
        redirect: "follow",
        signal: controller.signal
      });
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.startsWith("image/")) {
        throw new Error(`${response.status} ${contentType || "unexpected response"}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 1024) throw new Error("image response is too small");
      fs.writeFileSync(target, buffer);
      return `${Math.round(buffer.length / 1024)} KB`;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) await new Promise(resolve => setTimeout(resolve, attempt * 700));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function run() {
  fs.mkdirSync(outputDir, { recursive: true });
  const failures = [];
  let cursor = 0;
  async function worker() {
    while (cursor < species.length) {
      const item = species[cursor++];
      try {
        const result = await download(item);
        console.log(`${item.code}: ${result}`);
      } catch (error) {
        failures.push(`${item.code}: ${error.message}`);
        console.warn(`${item.code}: failed (${error.message})`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  if (failures.length) {
    console.error(`\n${failures.length} species image(s) failed:\n${failures.join("\n")}`);
    process.exitCode = 1;
    return;
  }
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify({
    generatedAt: new Date().toISOString(),
    count: species.length,
    codes: species.map(item => item.code)
  }, null, 2));
  console.log(`\nBundled ${species.length} species images in ${outputDir}`);
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
