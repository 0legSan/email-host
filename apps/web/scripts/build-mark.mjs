// Generates an isometric open-envelope wireframe mark.
// Run: node scripts/build-mark.mjs
const cos30 = Math.cos(Math.PI / 6);
const sin30 = Math.sin(Math.PI / 6);

function project(p, s, cx, cy) {
  const [X, Y, Z] = p;
  const sx = cx + (X - Y) * cos30 * s;
  const sy = cy + ((X + Y) * sin30 - Z) * s;
  return [sx, sy];
}

// 3D vertices of an open envelope (a shallow tray) with a raised flap.
// X = width, Y = depth (away from viewer), Z = up
const V = {
  // bottom face
  bBL: [0,   0,   0  ],
  bBR: [3.2, 0,   0  ],
  bFR: [3.2, 2.0, 0  ],
  bFL: [0,   2.0, 0  ],
  // top of back wall (tall)
  tBL: [0,   0,   1.0],
  tBR: [3.2, 0,   1.0],
  // top of front wall (shorter)
  tFR: [3.2, 2.0, 0.65],
  tFL: [0,   2.0, 0.65],
  // raised flap peak (behind, centered, high)
  flap: [1.6, -0.9, 2.05],
  // letter card standing inside, peeking above the back wall (Y slightly in front)
  lBL: [0.45, 0.3, 0.95],
  lBR: [2.75, 0.3, 0.95],
  lTR: [2.75, 0.3, 1.95],
  lTL: [0.45, 0.3, 1.95],
  // text lines on the letter (constant Y face)
  t1a: [0.9, 0.3, 1.65], t1b: [2.3, 0.3, 1.65],
  t2a: [0.9, 0.3, 1.35], t2b: [1.9, 0.3, 1.35],
};

const s = 64;
const cx = 256;
const cy = 256;

const P = {};
for (const [name, v] of Object.entries(V)) {
  P[name] = project(v, s, cx, cy);
}

function seg(a, b) {
  const [ax, ay] = P[a];
  const [bx, by] = P[b];
  return `M ${ax.toFixed(1)} ${ay.toFixed(1)} L ${bx.toFixed(1)} ${by.toFixed(1)}`;
}

// All wireframe edges (see-through technical drawing)
const edges = [
  // bottom rectangle
  ['bBL','bBR'], ['bBR','bFR'], ['bFR','bFL'], ['bFL','bBL'],
  // back wall verticals + top
  ['bBL','tBL'], ['bBR','tBR'], ['tBL','tBR'],
  // front wall verticals + top
  ['bFL','tFL'], ['bFR','tFR'], ['tFL','tFR'],
  // side top edges (connect back-top to front-top)
  ['tBL','tFL'], ['tBR','tFR'],
  // raised flap
  ['tBL','flap'], ['tBR','flap'],
  // letter card (front face)
  ['lBL','lBR'], ['lBR','lTR'], ['lTR','lTL'], ['lTL','lBL'],
  // text lines on letter
  ['t1a','t1b'], ['t2a','t2b'],
];

const paths = edges.map(([a,b]) => seg(a, b)).join(' ');

// bounding box
const xs = Object.values(P).map(p => p[0]);
const ys = Object.values(P).map(p => p[1]);
const minx = Math.min(...xs), maxx = Math.max(...xs);
const miny = Math.min(...ys), maxy = Math.max(...ys);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <rect width="512" height="512" fill="#151719"/>
  <path d="${paths}" stroke="#f6f3ef" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

console.log(svg);
console.error('bbox x', minx.toFixed(1), maxx.toFixed(1), '| y', miny.toFixed(1), maxy.toFixed(1));
