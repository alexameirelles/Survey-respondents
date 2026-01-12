const scroller = scrollama();
/* -----------------------------
   Canvas setup
----------------------------- */
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const stateLabel = document.getElementById("state");

let W = 0, H = 0, DPR = 1;
let currentStep = 0;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function resizeCanvas() {
  const r = canvas.getBoundingClientRect();
  W = Math.max(1, Math.floor(r.width));
  H = Math.max(1, Math.floor(r.height));
  DPR = window.devicePixelRatio || 1;

  canvas.width = W * DPR;
  canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

/* -----------------------------
   Data (6 groups)
----------------------------- */
const groups = [
  { key: "A", n: 120, color: "#ff6666" },
  { key: "B", n: 110, color: "#cc0000" },
  { key: "C", n: 100, color: "#990000" },
  { key: "D", n: 90,  color: "#d5d6ff" },
  { key: "E", n: 80,  color: "#988fec" },
  { key: "F", n: 70,  color: "#5c48d9" }
];

const groupKeys = groups.map(g => g.key);

const people = [];
for (const g of groups) {
  for (let i = 0; i < g.n; i++) {
    people.push({
      group: g.key,
      color: g.color,

      // current position
      x: 0, y: 0,

      // targets (tweened)
      tx: 0, ty: 0,

      // next target (layout output)
      nx: 0, ny: 0,

      // base target for floating scatter
      btx: 0, bty: 0,

      // tween start
      sx: 0, sy: 0,

      // velocity
      vx: 0, vy: 0,

      // floating params
      phase: Math.random() * Math.PI * 2,
      orbitR: 4 + Math.random() * 10,
      orbitSpeed: 0.6 + Math.random() * 1.4
    });
  }
}

// stable-ish shuffle so grouped layout doesn't reshuffle every call
function seededShuffle(array) {
  return array
    .map((d, i) => ({ d, k: (i * 9301 + 49297) % 233280 }))
    .sort((a, b) => a.k - b.k)
    .map(o => o.d);
}

/* -----------------------------
   Smooth transitions between steps
----------------------------- */
let tweenStart = performance.now();
const TWEEN_MS = 900;

function beginTargetTween() {
  tweenStart = performance.now();
  for (const p of people) {
    p.sx = p.tx;
    p.sy = p.ty;
  }
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function updateTweenedTargets(now) {
  const t = clamp((now - tweenStart) / TWEEN_MS, 0, 1);
  const e = easeInOutCubic(t);

  for (const p of people) {
    p.tx = p.sx + (p.nx - p.sx) * e;
    p.ty = p.sy + (p.ny - p.sy) * e;
  }
}

/* -----------------------------
   Layouts (set nx, ny)
----------------------------- */
function applyLayout(step) {
  currentStep = step;
  stateLabel.textContent = ["Scatter (Floating)", "Grouped", "Stacks", "100% Bar"][step] ?? "—";

  const pad = 24;

  beginTargetTween();

  if (step === 0) {
    // Scatter base targets
    for (const p of people) {
      p.btx = pad + Math.random() * (W - pad * 2);
      p.bty = pad + Math.random() * (H - pad * 2);
      p.nx = p.btx;
      p.ny = p.bty;
    }
  }

  if (step === 1) {
    // GROUPED: auto-centers for N groups in a 3x2 grid (fits 6 nicely)
    const cols = 3;
    const rows = Math.ceil(groupKeys.length / cols);

    const cellW = W / (cols + 1);
    const cellH = H / (rows + 1);

    const spacing = 10;

    groupKeys.forEach((g, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);

      const cx = cellW * (col + 1);
      const cy = cellH * (row + 1);

      const arr = seededShuffle(people.filter(p => p.group === g));

      arr.forEach((p, i) => {
        const angle = i * 0.60;
        const radius = spacing * Math.sqrt(i);
        p.nx = cx + Math.cos(angle) * radius;
        p.ny = cy + Math.sin(angle) * radius;
      });
    });
  }

  if (step === 2) {
    // STACKS: one block per group, aligned to bottom, centered horizontally
    const colsPerGroup = 12;
    const cell = 12;
    const gap = 2;
    const groupGap = 42;

    const blockW = colsPerGroup * (cell + gap) - gap;
    const totalW = groupKeys.length * blockW + (groupKeys.length - 1) * groupGap;

    let x = (W - totalW) / 2;
    x = clamp(x, 24, W); // keep some margin

    const baseY = H - 60;

    groupKeys.forEach((g) => {
      const arr = people.filter(p => p.group === g);
      arr.forEach((p, i) => {
        const col = i % colsPerGroup;
        const row = Math.floor(i / colsPerGroup);
        p.nx = x + col * (cell + gap);
        p.ny = baseY - row * (cell + gap);
      });
      x += blockW + groupGap;
    });
  }

  if (step === 3) {
    // 100% BAR: ordered by group, ANCHORED TO BOTTOM
    const cols = 30;
    const cell = 12;
    const gap = 2;

    const order = Object.fromEntries(groupKeys.map((k, i) => [k, i]));
    const sorted = [...people].sort((a, b) => order[a.group] - order[b.group]);

    const total = sorted.length;
    const rows = Math.ceil(total / cols);

    const barW = cols * (cell + gap) - gap;
    const barH = rows * (cell + gap) - gap;

    const marginBottom = 24;
    const marginSide = 32;

    const startX = clamp((W - barW) / 2, marginSide, W - barW - marginSide);
    const startY = H - marginBottom - barH;

    sorted.forEach((p, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      p.nx = startX + col * (cell + gap);
      p.ny = startY + row * (cell + gap);
    });
  }
}

/* -----------------------------
   Drawing (pictogram person)
----------------------------- */
function drawPerson(p) {
  ctx.fillStyle = p.color;

  // head
  const headR = 3.2;
  ctx.beginPath();
  ctx.arc(p.x, p.y - 4.5, headR, 0, Math.PI * 2);
  ctx.fill();

  // body
  const bodyW = 6.5;
  const bodyH = 10;
  const rx = 2;

  const x0 = p.x - bodyW / 2;
  const y0 = p.y - 2;

  ctx.beginPath();
  ctx.moveTo(x0 + rx, y0);
  ctx.lineTo(x0 + bodyW - rx, y0);
  ctx.quadraticCurveTo(x0 + bodyW, y0, x0 + bodyW, y0 + rx);
  ctx.lineTo(x0 + bodyW, y0 + bodyH - rx);
  ctx.quadraticCurveTo(x0 + bodyW, y0 + bodyH, x0 + bodyW - rx, y0 + bodyH);
  ctx.lineTo(x0 + rx, y0 + bodyH);
  ctx.quadraticCurveTo(x0, y0 + bodyH, x0, y0 + bodyH - rx);
  ctx.lineTo(x0, y0 + rx);
  ctx.quadraticCurveTo(x0, y0, x0 + rx, y0);
  ctx.closePath();
  ctx.fill();
} // <-- IMPORTANT: closing brace

/* -----------------------------
   Fast collision using spatial grid
----------------------------- */
function resolveCollisions(minDist) {
  const cellSize = minDist * 2;
  const grid = new Map();

  function key(cx, cy) {
    return `${cx},${cy}`;
  }

  for (let i = 0; i < people.length; i++) {
    const p = people[i];
    const cx = Math.floor(p.x / cellSize);
    const cy = Math.floor(p.y / cellSize);
    const k = key(cx, cy);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }

  const minDist2 = minDist * minDist;

  for (let i = 0; i < people.length; i++) {
    const a = people[i];
    const acx = Math.floor(a.x / cellSize);
    const acy = Math.floor(a.y / cellSize);

    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const k = key(acx + ox, acy + oy);
        const bucket = grid.get(k);
        if (!bucket) continue;

        for (const j of bucket) {
          if (j <= i) continue;
          const b = people[j];

          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d2 = dx * dx + dy * dy;

          if (d2 > 0 && d2 < minDist2) {
            const d = Math.sqrt(d2);
            const push = (minDist - d) / d * 0.5;
            const px = dx * push;
            const py = dy * push;
            a.x -= px; a.y -= py;
            b.x += px; b.y += py;
          }
        }
      }
    }
  }
}

/* -----------------------------
   Animation loop
----------------------------- */
function tick(now) {
  ctx.clearRect(0, 0, W, H);

  updateTweenedTargets(now);

  // floating in scatter
  if (currentStep === 0) {
    const t = now / 1000;
    for (const p of people) {
      const ang = p.phase + t * p.orbitSpeed;
      const ox = Math.cos(ang) * p.orbitR;
      const oy = Math.sin(ang * 0.9) * p.orbitR;
      p.tx = p.btx + ox;
      p.ty = p.bty + oy;
    }
  }

  const attract = 0.045;
  const damp = 0.90;

  for (const p of people) {
    p.vx = (p.vx + (p.tx - p.x) * attract) * damp;
    p.vy = (p.vy + (p.ty - p.y) * attract) * damp;
    p.x += p.vx;
    p.y += p.vy;
  }

  // bigger minDist for pictogram people
  resolveCollisions(11);

  for (const p of people) {
    p.x = clamp(p.x, 8, W - 8);
    p.y = clamp(p.y, 12, H - 6);
    drawPerson(p);
  }

  requestAnimationFrame(tick);
}

/* -----------------------------
   Scrollama
----------------------------- */
const scroller = scrollama();

function initScrollama() {
  scroller
    .setup({
      step: ".step",
      offset: 0.6,
      debug: false
    })
    .onStepEnter((r) => {
      const step = Number(r.element.dataset.step);
      if (Number.isFinite(step)) applyLayout(step);
    });
}

/* -----------------------------
   Init
----------------------------- */
function init() {
  resizeCanvas();

  for (const p of people) {
    p.x = Math.random() * W;
    p.y = Math.random() * H;
    p.tx = p.x; p.ty = p.y;
    p.nx = p.x; p.ny = p.y;
    p.btx = p.x; p.bty = p.y;
    p.sx = p.x; p.sy = p.y;
  }

 applyLayout(0);          // garante Scatter como estado inicial
initScrollama();
requestAnimationFrame(tick);

// Scroll the page so the first step is visible on load
requestAnimationFrame(() => {
  const el = document.getElementById("step-scatter");
  if (el) {
    el.scrollIntoView({
      behavior: "auto",   // instant
      block: "center"     // centers the card nicely
    });
  }
});

  window.addEventListener("resize", () => {
    resizeCanvas();
    applyLayout(currentStep);
    scroller.resize();
  });
}

init();
