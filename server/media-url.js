'use strict';

// Shared by public user-generated media entry points. Client escaping is still
// required, but an older client must never receive a newly stored executable
// scheme or attribute-breaking URL from a newer server.
function mediaUrl(value, { allowImageData = false } = {}) {
  const url = value == null ? '' : String(value).trim();
  if (!url) return '';
  const fail = () => { throw Object.assign(new Error('图片或视频地址无效，请重新上传'), { status: 400 }); };
  if (allowImageData && /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(url)) {
    if (url.length <= 3 * 1024 * 1024) return url;
    return fail();
  }
  if (url.length > 800 || /[\u0000-\u0020\u007f"'<>`\\]/.test(url)) return fail();
  if (/^\/(?:uploads|assets)\//.test(url)) {
    let decoded;
    try { decoded = decodeURIComponent(url.split(/[?#]/, 1)[0]); } catch { return fail(); }
    if (decoded.includes('\\') || decoded.split('/').some(part => part === '.' || part === '..')) return fail();
    return url;
  }
  if (!/^https?:\/\//i.test(url)) return fail();
  try {
    const parsed = new URL(url);
    if (!parsed.hostname || parsed.username || parsed.password) return fail();
    return url; // Preserve signed query strings byte-for-byte.
  } catch { return fail(); }
}

module.exports = { mediaUrl };
