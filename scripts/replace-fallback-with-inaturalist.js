/*
 * Replaces only duplicate fallback files with photos whose returned taxon name
 * matches the catalogue scientific name. Failed matches are removed instead
 * of being represented by an unrelated turtle photo.
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
const manifestPath = path.join(dir, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const fallbackCodes = new Set(manifest.fallbackCodes || []);

const scientificName = item => decodeURIComponent(item.image.split("/").pop() || "").replace(/\.[a-z]+$/i, "").replace(/_/g, " ");
const normal = value => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
async function getJson(url) {
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", searcher, "-Url", url], { windowsHide: true, timeout: 60000, maxBuffer: 6 * 1024 * 1024 });
  return JSON.parse(stdout.replace(/^\uFEFF/, ""));
}
async function save(url, target) {
  const part = `${target}.inat.part`;
  fs.rmSync(part, { force: true });
  await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", downloader, "-Url", url, "-Target", part], { windowsHide: true, timeout: 90000 });
  if (!fs.existsSync(part) || fs.statSync(part).size < 1500) throw new Error("invalid photo file");
  fs.renameSync(part, target);
}
async function lookup(item) {
  const scientific = scientificName(item);
  const taxon = await getJson(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(scientific)}`);
  const matched = (taxon.results || []).find(result => normal(result.name) === normal(scientific) && result.iconic_taxon_name === "Reptilia");
  if (!matched?.default_photo) throw new Error("no matching iNaturalist taxon photo");
  const photo = matched.default_photo;
  return { scientific, photo, url: photo.medium_url || photo.url || photo.square_url };
}
async function run() {
  const replaced = {};
  const unavailable = [];
  for (const item of species.filter(item => fallbackCodes.has(item.code))) {
    const target = path.join(dir, `${item.code}.jpg`);
    try {
      const found = await lookup(item);
      if (!found.url) throw new Error("missing photo URL");
      await save(found.url, target);
      replaced[item.code] = { scientificName: found.scientific, source: "iNaturalist", photoId: found.photo.id, license: found.photo.license_code, attribution: found.photo.attribution, url: found.url };
      console.log(`${item.code}: replaced`);
    } catch (error) {
      // Do not retain an unrelated, repeated fallback picture.
      fs.rmSync(target, { force: true });
      unavailable.push({ code: item.code, scientificName: scientificName(item), reason: error.message });
      console.warn(`${item.code}: unavailable`);
    }
    await new Promise(resolve => setTimeout(resolve, 1050));
  }
  manifest.iNaturalistPhotos = replaced;
  manifest.unavailableSpecies = unavailable;
  manifest.fallbackCodes = [];
  manifest.count = species.filter(item => fs.existsSync(path.join(dir, `${item.code}.jpg`))).length;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Done: ${Object.keys(replaced).length} matching photos, ${unavailable.length} unavailable.`);
}
run().catch(error => { console.error(error); process.exitCode = 1; });
