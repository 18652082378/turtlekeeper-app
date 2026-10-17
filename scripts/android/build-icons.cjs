// Export the approved Android artwork at store and launcher resource sizes.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const root = path.resolve(__dirname, '../..');
const source = path.join(__dirname, 'branding/guizhongjie-icon-source.png');
const res = path.join(root, 'android/app/src/main/res');
async function main() {
  const store = path.join(root, 'output/android/store');
  fs.mkdirSync(store, { recursive: true });
  await sharp(source).resize(512, 512).flatten({ background: '#FFF3BB' }).png().toFile(path.join(store, 'guiyou-icon-512.png'));
  for (const [density, size, adaptive] of [['mdpi',48,108],['hdpi',72,162],['xhdpi',96,216],['xxhdpi',144,324],['xxxhdpi',192,432]]) {
    const folder = path.join(res, 'mipmap-' + density);
    for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
      await sharp(source).resize(size, size).png().toFile(path.join(folder, name));
    }
    // Keep name and artwork within the mask-safe part of adaptive launchers.
    const inner = Math.round(adaptive * 0.6);
    const artwork = await sharp(source).resize(inner, inner).png().toBuffer();
    await sharp({ create: { width: adaptive, height: adaptive, channels: 4, background: '#FFF3BB' } })
      .composite([{ input: artwork, gravity: 'centre' }]).png().toFile(path.join(folder, 'ic_launcher_foreground.png'));
  }
  console.log('Android launcher resources and 512px store icon exported.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
