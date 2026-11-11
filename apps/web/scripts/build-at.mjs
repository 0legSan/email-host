// "@" single-stroke spiral: near-closed inner bowl -> tail -> near-closed outer ring.
// Run: node scripts/build-at.mjs > /tmp/at.svg
const cx = 256, cy = 256;
const r = 58;    // inner bowl
const R = 150;   // outer ring
const SW = 26;
const f = (n) => n.toFixed(1);
const pt = (rad, ang) => { const a = ang * Math.PI / 180; return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)]; };

// Inner bowl gap at bottom (theta 78..102)
const iS = pt(r, 102);
const iE = pt(r, 78);
// Outer ring gap at bottom-right (theta 42..62)
const oS = pt(R, 62);
const oE = pt(R, 42);
// Tail control (bows down-right between inner-end and outer-start)
const tc = [cx + R * 0.62, cy + R * 0.78];

const path =
  `M ${f(iS[0])} ${f(iS[1])} ` +
  `A ${r} ${r} 0 1 1 ${f(iE[0])} ${f(iE[1])} ` +
  `Q ${f(tc[0])} ${f(tc[1])} ${f(oS[0])} ${f(oS[1])} ` +
  `A ${R} ${R} 0 1 1 ${f(oE[0])} ${f(oE[1])}`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <rect width="512" height="512" fill="#151719"/>
  <path d="${path}" stroke="#817f43" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;
console.log(svg);
