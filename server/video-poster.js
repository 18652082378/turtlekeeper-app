const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');

// Only decode local uploads. Never pass a URL supplied by a client to ffmpeg.
function createPosterService({ uploadRoot, publish, binary = process.env.FFMPEG_PATH || 'ffmpeg', thumbnail = false }) {
  const pending = new Map();
  const failures = new Map();
  let active = 0;
  let unavailable = false;
  const completed = new Map();
  return async function posterFor(value) {
    if (unavailable) return "";
    let relative;
    try {
      relative = decodeURIComponent(new URL(value, 'http://local').pathname);
    } catch { return ''; }
    const allowed = thumbnail ? /^\/uploads\/\d{4}\/\d{2}\/[^/\\]+\.(jpg|jpeg|png|webp)$/i : /^\/uploads\/\d{4}\/\d{2}\/[^/\\]+\.(mp4|mov|m4v|webm)$/i;
    if (!allowed.test(relative)) return '';
    const source = path.resolve(uploadRoot, relative.slice('/uploads/'.length));
    if (!source.startsWith(path.resolve(uploadRoot) + path.sep) || !fs.existsSync(source)) return '';
    if (completed.has(source)) return completed.get(source);
    if (pending.has(source)) return pending.get(source);
    if (Date.now() - (failures.get(source) || 0) < 60000 || active >= 2) return '';
    const task = (async () => {
      active++;
      try {
        const stat = fs.statSync(source);
        const hash = crypto.createHash('sha256').update(`${relative}:${stat.size}:${stat.mtimeMs}`).digest('hex').slice(0, 24);
        const name = `${thumbnail ? "thumb600" : "poster"}-${hash}.jpg`;
        const target = path.join(path.dirname(source), name);
        if (!fs.existsSync(target)) {
          const temporary = target + '.tmp.jpg';
          try {
            await new Promise((resolve, reject) => execFile(binary, [
              '-nostdin', '-loglevel', 'error', '-y', '-protocol_whitelist', 'file,pipe',
              '-i', source, '-frames:v', '1', '-vf', thumbnail ? 'scale=600:600:force_original_aspect_ratio=decrease' : 'scale=1280:1280:force_original_aspect_ratio=decrease',
              '-q:v', '5',
              '-threads', '1', temporary
            ], { timeout: 20000, windowsHide: true, maxBuffer: 65536 }, error => error ? reject(error) : resolve()));
            if (!fs.statSync(temporary).size) throw Error('Empty video poster');
            fs.renameSync(temporary, target);
          } finally {
            fs.rmSync(temporary, { force: true });
          }
        }
        const [, , year, month] = relative.split('/');
        const url = await publish(target, year, month, name, 'image/jpeg');
        if (completed.size >= 2000) completed.delete(completed.keys().next().value);
        completed.set(source, url);
        return url;
      } catch (error) {
        if (error.code === "ENOENT") unavailable = true;
        if (failures.size >= 500) failures.clear();
        failures.set(source, Date.now());
        console.warn('Video poster generation failed:', error.code || error.message);
        return '';
      } finally { active--; }
    })();
    pending.set(source, task);
    try { return await task; } finally { pending.delete(source); }
  };
}
module.exports = { createPosterService };
