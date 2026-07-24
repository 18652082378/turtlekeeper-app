/*
 * One-time local asset archiver. Run this on a Windows machine before commit:
 *   node scripts/download-species-assets.js --force
 *
 * It deliberately uses Windows' native downloader because the source site
 * rejects burst requests from cloud builders. Codemagic never invokes it.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "assets", "species");
const downloader = path.join(__dirname, "download-one-species.ps1");
const searcher = path.join(__dirname, "search-species-image.ps1");
const source = fs.readFileSync(path.join(root, "species-data.js"), "utf8");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context);
const species = context.window.TURTLE_SPECIES || [];
const force = process.argv.includes("--force");
const concurrency = 2;
const fallbackImage = path.join(outputDir, "ABQ.jpg");

async function downloadUrl(url, target) {
  const temp = `${target}.part`;
  fs.rmSync(temp, { force: true });
  try {
    await execFileAsync("powershell.exe", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", downloader,
      "-Url", url, "-Target", temp
    ], { windowsHide: true, timeout: 90000, maxBuffer: 1024 * 1024 });
    const size = fs.existsSync(temp) ? fs.statSync(temp).size : 0;
    if (size < 1024) throw new Error("Downloaded file is empty or too small");
    fs.renameSync(temp, target);
    return size;
  } catch (error) {
    fs.rmSync(temp, { force: true });
    throw error;
  }
}

async function searchReplacement(item) {
  const rawTitle = decodeURIComponent(item.image.split("/").pop() || "").replace(/\.[a-z]+$/i, "");
  const apiUrl = new URL("https://commons.wikimedia.org/w/api.php");
  apiUrl.search = new URLSearchParams({
    action: "query", format: "json", generator: "search", gsrnamespace: "6",
    gsrlimit: "1", gsrsearch: rawTitle, prop: "imageinfo", iiprop: "url", iiurlwidth: "720", origin: "*"
  }).toString();
  try {
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", searcher,
      "-Url", apiUrl.toString()
    ], { windowsHide: true, timeout: 55000, maxBuffer: 4 * 1024 * 1024 });
    const pages = Object.values(JSON.parse(stdout).query?.pages || {});
    const info = pages[0]?.imageinfo?.[0];
    return info?.thumburl || info?.url || "";
  } catch {
    return "";
  }
}

async function download(item) {
  const target = path.join(outputDir, `${item.code}.jpg`);
  if (!force && fs.existsSync(target) && fs.statSync(target).size > 1024) return "cached";
  fs.rmSync(target, { force: true });
  try {
    const size = await downloadUrl(item.image, target);
    return `${Math.round(size / 1024)} KB`;
  } catch (firstError) {
    const replacement = await searchReplacement(item);
    if (replacement) {
      try {
        const size = await downloadUrl(replacement, target);
        return `${Math.round(size / 1024)} KB (searched)`;
      } catch { /* fall through to a bundled turtle image */ }
    }
    if (fs.existsSync(fallbackImage) && fs.statSync(fallbackImage).size > 1024) {
      fs.copyFileSync(fallbackImage, target);
      return "local turtle fallback";
    }
    throw firstError;
  }
}

async function run() {
  fs.mkdirSync(outputDir, { recursive: true });
  const failures = [];
  const fallbackCodes = [];
  let cursor = 0;
  async function worker() {
    while (cursor < species.length) {
      const item = species[cursor++];
      try {
        const result = await download(item);
        if (result === "local turtle fallback") fallbackCodes.push(item.code);
        console.log(`${item.code}: ${result}`);
      } catch (error) {
        failures.push({ code: item.code, name: item.name, url: item.image, error: error.message });
        console.warn(`${item.code}: FAILED`);
      }
      await new Promise(resolve => setTimeout(resolve, 700));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  const localCodes = species.filter(item => fs.existsSync(path.join(outputDir, `${item.code}.jpg`))).map(item => item.code);
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify({
    generatedAt: new Date().toISOString(),
    count: localCodes.length,
    codes: localCodes,
    fallbackCodes,
    failures
  }, null, 2));
  console.log(`Bundled ${localCodes.length}/${species.length} local images.`);
  if (failures.length) process.exitCode = 2;
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
