import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const basePath = process.cwd();
const iconPath = path.resolve(basePath, 'public/icons/icon.svg');
const notificationBadgePath = path.resolve(basePath, 'public/icons/notification-badge.svg');
const outDir = path.resolve(basePath, 'public');
const iconsDir = path.resolve(basePath, 'public/icons');

async function generateIcons() {
  console.log('Generating icons...');

  const svgBuffer = fs.readFileSync(iconPath);
  const notificationBadgeBuffer = fs.readFileSync(notificationBadgePath);
  fs.copyFileSync(iconPath, path.join(iconsDir, 'icon-v2.svg'));

  // icon-512 / icon-192 — full-bleed app icon (platform masks apply their own corners)
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(iconsDir, 'icon-512.png'));
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(iconsDir, 'icon-512-v2.png'));
  await sharp(svgBuffer).resize(192, 192).png().toFile(path.join(iconsDir, 'icon-192.png'));
  await sharp(svgBuffer).resize(192, 192).png().toFile(path.join(iconsDir, 'icon-192-v2.png'));

  // apple-touch-icon — full-bleed 180, iOS adds rounding
  await sharp(svgBuffer).resize(180, 180).png().toFile(path.join(outDir, 'apple-touch-icon.png'));
  await sharp(svgBuffer).resize(180, 180).png().toFile(path.join(outDir, 'apple-touch-icon-v2.png'));

  // favicon — 32x32 (mark is bold enough to read at this size)
  await sharp(svgBuffer).resize(32, 32).png().toFile(path.join(outDir, 'favicon.ico'));
  await sharp(svgBuffer).resize(32, 32).png().toFile(path.join(outDir, 'favicon-v2.ico'));

  // maskable — same full-bleed, mark already within safe zone (central ~70%)
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(iconsDir, 'icon-maskable-512.png'));
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(iconsDir, 'icon-maskable-512-v2.png'));

  // notification badge — Android expects a small monochrome transparent image
  await sharp(notificationBadgeBuffer).resize(96, 96).png().toFile(path.join(iconsDir, 'notification-badge.png'));
  await sharp(notificationBadgeBuffer).resize(96, 96).png().toFile(path.join(iconsDir, 'notification-badge-v2.png'));

  console.log('Done!');
}

generateIcons().catch(console.error);
