/* Replace only repeated fallback thumbnails with Baidu image-search results.
 * Run locally: node scripts/replace-fallback-species-images.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);
const root = path.resolve(__dirname, "..");
const dir = path.join(root, "assets", "species");
const searcher = path.join(__dirname, "search-species-image.ps1");
const downloader = path.join(__dirname, "download-one-species.ps1");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "species-data.js"), "utf8"), context);
const species = context.window.TURTLE_SPECIES || [];
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
const targets = new Set(manifest.fallbackCodes || []);

async function getJson(url) {
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", searcher, "-Url", url], { windowsHide: true, timeout: 55000, maxBuffer: 5 * 1024 * 1024 });
  return JSON.parse(stdout.replace(/^\uFEFF/, ""));
}
async function download(url, target) {
  const part = `${target}.baidu.part`;
  fs.rmSync(part, { force: true });
  await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", downloader, "-Url", url, "-Target", part], { windowsHide: true, timeout: 90000 });
  if (!fs.existsSync(part) || fs.statSync(part).size < 1500) throw new Error("image too small");
  fs.renameSync(part, target);
}
async function replace(item) {
  const params = new URLSearchParams({ tn: "resultjson_com", ipn: "rj", ct: "201326592", word: `${item.name} 乌龟`, queryWord: `${item.name} 乌龟`, ie: "utf-8", oe: "utf-8", pn: "0", rn: "5", gsm: "1e" });
  const results = await getJson(`https://image.baidu.com/search/acjson?${params}`);
  const image = (results.data || []).find(row => row.thumbURL || row.middleURL || row.objURL);
  const url = image?.thumbURL || image?.middleURL || image?.objURL;
  if (!url) throw new Error("no Baidu image result");
  await download(url, path.join(dir, `${item.code}.jpg`));
}
async function run() {
  const failed = [];
  for (const item of species.filter(item => targets.has(item.code))) {
    try { await replace(item); console.log(`${item.code}: replaced`); }
    catch (error) { failed.push({ code: item.code, error: error.message }); console.warn(`${item.code}: failed`); }
    await new Promise(resolve => setTimeout(resolve, 900));
  }
  manifest.baiduReplacedAt = new Date().toISOString();
  manifest.baiduFailures = failed;
  manifest.fallbackCodes = species.filter(item => targets.has(item.code) && failed.some(x => x.code === item.code)).map(item => item.code);
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`Done: ${targets.size - failed.length}/${targets.size} replacements.`);
}
run().catch(error => { console.error(error); process.exitCode = 1; });
