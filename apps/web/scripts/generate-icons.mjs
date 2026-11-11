import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const iconPath = path.resolve('public/icons/icon.svg');
const outDir = path.resolve('public');
const iconsDir = path.resolve('public/icons');

async function generateIcons() {
  console.log('Generating icons...');

  const svgBuffer = fs.readFileSync(iconPath);

  // 1. icon-512.png (transparent)
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(iconsDir, 'icon-512.png'));

  // 2. icon-192.png (transparent)
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(iconsDir, 'icon-192.png'));

  // 3. apple-touch-icon.png (white background, padded)
  // Apple recommends 180x180, let's make it 180x180 with some padding
  await sharp(svgBuffer)
    .resize(150, 150)
    .extend({
      top: 15,
      bottom: 15,
      left: 15,
      right: 15,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .png()
    .toFile(path.join(outDir, 'apple-touch-icon.png'));

  // 4. favicon.ico (can just use a 32x32 png, browsers support it well, or save as png and rename, or let sharp do it if it supports it, wait, sharp doesn't fully support .ico out of the box, we can just save a 32x32 png as favicon.ico and browsers accept it nowadays)
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(path.join(outDir, 'favicon.ico'));

  // 5. icon-maskable-512.png (solid background, with some padding)
  await sharp(svgBuffer)
    .resize(400, 400)
    .extend({
      top: 56,
      bottom: 56,
      left: 56,
      right: 56,
      background: { r: 2, g: 6, b: 23, alpha: 1 } // slate-950
    })
    .png()
    .toFile(path.join(iconsDir, 'icon-maskable-512.png'));

  console.log('Done!');
}

generateIcons().catch(console.error);
