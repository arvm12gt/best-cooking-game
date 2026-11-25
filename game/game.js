// Rush Hour Kitchen — a complete little cooking game on one canvas.
//
// The lunch rush lasts 120 seconds. Order tickets pin up on the board,
// each naming a dish as a sequence of ingredients. Click the bins on the
// counter to stack ingredients on the plate in the ticket's order;
// anything with a flame badge cooks in a pan first. Serve a finished
// plate to its ticket before the patience bar runs dry.
//
// Shot mode: ?shot=start|play|end&seed=1 renders one composed, static
// frame of the same kitchen for the entry's screenshots.

'use strict';

// ---------------------------------------------------------------- setup

const canvas = document.getElementById('kitchen');
const ctx = canvas.getContext('2d');
const VIEW_W = 1280;
const VIEW_H = 800;

const DAY_SECONDS = 120;
const MAX_TICKETS = 4;
const PAN_COUNT = 2;
const COOK_SECONDS = 3.2;

// Deterministic random source for decorations and ticket dealing, so a
// given seed always deals the same day.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------- the food

// Every ingredient the kitchen stocks. `flame` ingredients must spend
// time in a pan before they may land on the plate.
const INGREDIENTS = [
  { id: 'bun',     name: 'Bun',     flame: false, main: '#e8a856', dark: '#c07f35' },
  { id: 'patty',   name: 'Patty',   flame: true,  main: '#8a5632', dark: '#6b3f22' },
  { id: 'cheese',  name: 'Cheese',  flame: false, main: '#ffc93c', dark: '#e0a81e' },
  { id: 'lettuce', name: 'Lettuce', flame: false, main: '#7ec850', dark: '#57a032' },
  { id: 'tomato',  name: 'Tomato',  flame: false, main: '#e8483f', dark: '#c22f27' },
  { id: 'egg',     name: 'Egg',     flame: true,  main: '#fff6e8', dark: '#f2b33d' },
  { id: 'bacon',   name: 'Bacon',   flame: true,  main: '#c0453e', dark: '#93322d' },
  { id: 'onion',   name: 'Onion',   flame: false, main: '#d9b8e6', dark: '#a678c2' },
  { id: 'fries',   name: 'Fries',   flame: true,  main: '#ffd76a', dark: '#e0aa2e' },
  { id: 'sauce',   name: 'Sauce',   flame: false, main: '#d94f30', dark: '#b03a20' },
];
const ING_BY_ID = {};
for (const ing of INGREDIENTS) ING_BY_ID[ing.id] = ing;

// The menu: each dish is an ordered stack of ingredients and a price.
const DISHES = [
  { name: 'Classic Burger', stack: ['bun', 'patty', 'cheese', 'tomato'], price: 24 },
  { name: 'Sunrise Stack',  stack: ['bun', 'egg', 'bacon', 'cheese'], price: 26 },
  { name: 'Garden Melt',    stack: ['bun', 'lettuce', 'tomato', 'onion', 'cheese'], price: 28 },
  { name: 'Loaded Fries',   stack: ['fries', 'cheese', 'bacon', 'sauce'], price: 22 },
  { name: 'Double Trouble', stack: ['bun', 'patty', 'cheese', 'patty', 'bacon'], price: 34 },
  { name: 'Orchard Skillet', stack: ['egg', 'tomato', 'onion', 'sauce'], price: 20 },
];

// ------------------------------------------------------------ geometry

const HUD_H = 58;
const BOARD = { x: 20, y: 68, w: 1240, h: 172 };
const TICKET_W = 292;
const TICKET_H = 148;
const STOVE = { x: 34, y: 452, w: 300, h: 178 };
const PLATE = { x: 592, y: 528, r: 96 };
const PASS = { x: 852, y: 452, w: 168, h: 178 };   // shelf for a finished dish
const CHEF = { x: 1130, y: 470 };
const SCRAP = { x: 356, y: 566, w: 74, h: 64 };
const BIN_ROW_Y = 688;
const BIN_W = 118;
const BIN_H = 100;
const BIN_GAP = 8;
const BIN_X0 = 24;

function binRect(i) {
  return { x: BIN_X0 + i * (BIN_W + BIN_GAP), y: BIN_ROW_Y, w: BIN_W, h: BIN_H };
}
function panRect(i) {
  return { x: STOVE.x + 26 + i * 142, y: STOVE.y + 52, w: 118, h: 96 };
}
function ticketRect(i) {
  return { x: BOARD.x + 18 + i * (TICKET_W + 14), y: BOARD.y + 12, w: TICKET_W, h: TICKET_H };
}
function pointIn(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

// -------------------------------------------------------- draw helpers

function roundRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function fillRoundRect(x, y, w, h, r, color) {
  roundRect(x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeRoundRect(x, y, w, h, r, color, width) {
  roundRect(x, y, w, h, r);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function ellipse(cx, cy, rx, ry, color) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function circle(cx, cy, r, color) {
  ellipse(cx, cy, r, r, color);
}

function text(str, x, y, size, color, align, weight) {
  ctx.font = (weight || 700) + ' ' + size + 'px "Segoe UI", Verdana, sans-serif';
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function shadowed(fn) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  fn();
  ctx.restore();
}

// ------------------------------------------------- ingredient pictures

// Draws one ingredient centred at (cx, cy) inside a box of width s.
// Used for the bins, the plate stack, ticket rows and the pans alike.
function drawIngredient(id, cx, cy, s) {
  const ing = ING_BY_ID[id];
  ctx.save();
  ctx.translate(cx, cy);
  const u = s / 60; // unit scale: drawings are sketched on a 60px grid
  ctx.scale(u, u);
  if (id === 'bun') {
    ctx.beginPath();
    ctx.ellipse(0, 4, 26, 15, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = ing.main; ctx.fill();
    ctx.strokeStyle = ing.dark; ctx.lineWidth = 2; ctx.stroke();
    ellipse(0, 5, 26, 5, ing.dark);
    ctx.fillStyle = '#fff3d6';
    for (const [sx, sy] of [[-12, -6], [0, -10], [12, -6], [-5, -2], [7, -1]]) circle(sx, sy, 2, '#fff3d6');
  } else if (id === 'patty') {
    ellipse(0, 2, 27, 12, ing.main);
    ellipse(0, -1, 27, 10, '#9c683c');
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (const [sx, sy] of [[-14, 0], [2, -3], [15, 1], [-4, 3]]) circle(sx, sy, 2.4, 'rgba(0,0,0,0.18)');
  } else if (id === 'cheese') {
    ctx.save();
    ctx.rotate(0.06);
    ctx.fillStyle = ing.main;
    ctx.fillRect(-25, -9, 50, 18);
    ctx.fillStyle = ing.dark;
    ctx.beginPath(); ctx.moveTo(25, 9); ctx.lineTo(34, 16); ctx.lineTo(18, 12); ctx.closePath(); ctx.fill();
    ctx.restore();
    circle(-10, 0, 3.4, 'rgba(224,168,30,0.8)');
    circle(9, -2, 2.6, 'rgba(224,168,30,0.8)');
  } else if (id === 'lettuce') {
    ctx.fillStyle = ing.main;
    ctx.beginPath();
    ctx.moveTo(-27, 6);
    for (let i = 0; i < 6; i++) ctx.quadraticCurveTo(-22 + i * 9, -8, -13 + i * 9, 4);
    ctx.lineTo(27, 10); ctx.lineTo(-27, 12); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = ing.dark; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-24, 8); ctx.lineTo(24, 8); ctx.stroke();
  } else if (id === 'tomato') {
    circle(0, 0, 17, ing.main);
    circle(0, 0, 12.5, '#f2766b');
    ctx.fillStyle = '#ffd9d4';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ellipse(Math.cos(a) * 6.5, Math.sin(a) * 6.5, 2.6, 1.6, '#ffd9d4');
    }
    circle(0, 0, 2.4, '#ffe9e5');
  } else if (id === 'egg') {
    ctx.beginPath();
    ctx.ellipse(0, 1, 25, 14, 0.3, 0, Math.PI * 2);
    ctx.fillStyle = ing.main; ctx.fill();
    ctx.strokeStyle = '#e8d9bd'; ctx.lineWidth = 2; ctx.stroke();
    circle(2, 0, 8.5, ing.dark);
    circle(-1, -3, 2.8, '#ffd97a');
  } else if (id === 'bacon') {
    ctx.strokeStyle = ing.main; ctx.lineWidth = 9; ctx.lineCap = 'round';
    for (const off of [-11, 0, 11]) {
      ctx.beginPath();
      ctx.moveTo(-24, off);
      ctx.bezierCurveTo(-10, off - 8, 8, off + 8, 24, off - 2);
      ctx.stroke();
    }
    ctx.strokeStyle = '#e8a49c'; ctx.lineWidth = 2.6;
    for (const off of [-11, 0, 11]) {
      ctx.beginPath();
      ctx.moveTo(-22, off - 1);
      ctx.bezierCurveTo(-10, off - 8, 8, off + 6, 22, off - 3);
      ctx.stroke();
    }
  } else if (id === 'onion') {
    for (const r of [19, 13.5, 8]) {
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.72, 0, 0, Math.PI * 2);
      ctx.strokeStyle = r === 8 ? ing.dark : ing.main;
      ctx.lineWidth = 3.4;
      ctx.stroke();
    }
  } else if (id === 'fries') {
    ctx.fillStyle = '#e8483f';
    ctx.beginPath();
    ctx.moveTo(-18, -2); ctx.lineTo(18, -2); ctx.lineTo(13, 20); ctx.lineTo(-13, 20); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c22f27'; ctx.fillRect(-18, -2, 36, 5);
    ctx.fillStyle = ing.main;
    for (const [fx, fh, tilt] of [[-13, 26, -0.12], [-5, 32, -0.04], [3, 30, 0.05], [11, 25, 0.13], [-9, 22, 0.02]]) {
      ctx.save(); ctx.translate(fx, 2); ctx.rotate(tilt); ctx.fillRect(-3.4, -fh, 6.8, fh); ctx.restore();
    }
    ctx.fillStyle = '#fff';
    circle(0, 9, 4.4, '#ffffff');
    text('F', 0, 9.5, 13, '#e8483f', 'center', 900);
  } else if (id === 'sauce') {
    ctx.beginPath();
    ctx.ellipse(0, 6, 20, 10, 0, 0, Math.PI * 2);
    ctx.fillStyle = ing.main; ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-6, 2, 9, 6, 0.4, 0, Math.PI * 2);
    ctx.fillStyle = '#e8704f'; ctx.fill();
    circle(8, 8, 4, ing.dark);
  }
  ctx.restore();
}

// A small flame badge marking ingredients that need the stove.
function drawFlameBadge(x, y) {
  circle(x, y, 10, '#ff7b33');
  ctx.fillStyle = '#ffd23e';
  ctx.beginPath();
  ctx.moveTo(x, y - 6.5);
  ctx.quadraticCurveTo(x + 5, y + 1, x + 2.6, y + 5.5);
  ctx.quadraticCurveTo(x, y + 7.5, x - 2.6, y + 5.5);
  ctx.quadraticCurveTo(x - 5, y + 1, x, y - 6.5);
  ctx.fill();
}

// ------------------------------------------------------ kitchen scenery

function drawWallAndFloor() {
  const wall = ctx.createLinearGradient(0, 0, 0, 460);
  wall.addColorStop(0, '#f7e3c2');
  wall.addColorStop(1, '#eecfa0');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, VIEW_W, 460);
  // tile grid on the back wall
  ctx.strokeStyle = 'rgba(190,140,80,0.18)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= VIEW_W; x += 64) { ctx.beginPath(); ctx.moveTo(x, 240); ctx.lineTo(x, 452); ctx.stroke(); }
  for (let y = 240; y <= 452; y += 53) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(VIEW_W, y); ctx.stroke(); }
  // worktop and floor
  const top = ctx.createLinearGradient(0, 440, 0, 660);
  top.addColorStop(0, '#b07a45');
  top.addColorStop(1, '#96622f');
  ctx.fillStyle = top;
  ctx.fillRect(0, 440, VIEW_W, 236);
  ctx.fillStyle = 'rgba(255,235,200,0.25)';
  ctx.fillRect(0, 440, VIEW_W, 6);
  const floor = ctx.createLinearGradient(0, 676, 0, VIEW_H);
  floor.addColorStop(0, '#7c4f27');
  floor.addColorStop(1, '#5f3b1c');
  ctx.fillStyle = floor;
  ctx.fillRect(0, 676, VIEW_W, VIEW_H - 676);
}

function drawShelves(rng) {
  for (const shelfY of [300, 372]) {
    ctx.fillStyle = '#8a5a2e';
    ctx.fillRect(356, shelfY + 34, 520, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(356, shelfY + 44, 520, 5);
    for (let i = 0; i < 6; i++) {
      const jx = 380 + i * 84;
      const jarH = 26 + Math.floor(rng() * 10);
      const jarCols = ['#d94f30', '#7ec850', '#ffc93c', '#c0453e', '#e8a856', '#a678c2'];
      fillRoundRect(jx, shelfY + 34 - jarH, 34, jarH, 5, 'rgba(255,252,240,0.85)');
      ctx.fillStyle = jarCols[(i + (shelfY === 372 ? 3 : 0)) % jarCols.length];
      ctx.fillRect(jx + 3, shelfY + 34 - jarH + 9, 28, jarH - 12);
      fillRoundRect(jx - 2, shelfY + 34 - jarH - 6, 38, 8, 3, '#8a5a2e');
    }
    // a hanging pan at the end of each shelf
    const px = 902;
    ctx.strokeStyle = '#5d5d66'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(px, shelfY - 14); ctx.lineTo(px, shelfY + 6); ctx.stroke();
    circle(px, shelfY + 26, 21, '#4c4c55');
    circle(px, shelfY + 26, 15, '#6a6a75');
  }
}

function drawLamps() {
  for (const lx of [240, 640, 1040]) {
    ctx.strokeStyle = '#3d3230'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(lx, 58); ctx.lineTo(lx, 96); ctx.stroke();
    const glow = ctx.createRadialGradient(lx, 128, 6, lx, 128, 92);
    glow.addColorStop(0, 'rgba(255,214,120,0.55)');
    glow.addColorStop(1, 'rgba(255,214,120,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(lx - 92, 60, 184, 170);
    ctx.beginPath();
    ctx.moveTo(lx - 34, 128); ctx.lineTo(lx + 34, 128); ctx.lineTo(lx + 16, 94); ctx.lineTo(lx - 16, 94); ctx.closePath();
    ctx.fillStyle = '#37414f'; ctx.fill();
    circle(lx, 128, 9, '#ffd76a');
  }
}

function drawWindow() {
  fillRoundRect(60, 268, 210, 150, 10, '#a8d8ea');
  const sky = ctx.createLinearGradient(0, 268, 0, 418);
  sky.addColorStop(0, '#bfe6f5'); sky.addColorStop(1, '#8ec9e8');
  fillRoundRect(68, 276, 194, 134, 7, sky);
  circle(105, 308, 17, '#ffdf6b');
  ctx.fillStyle = '#ffffff';
  ellipse(190, 306, 30, 11, '#ffffff'); ellipse(214, 314, 22, 9, '#ffffff');
  ctx.fillStyle = '#7ec850';
  ctx.beginPath(); ctx.moveTo(68, 410); ctx.quadraticCurveTo(140, 366, 262, 410); ctx.closePath(); ctx.fill();
  strokeRoundRect(60, 268, 210, 150, 10, '#8a5a2e', 8);
  ctx.strokeStyle = '#8a5a2e'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(165, 270); ctx.lineTo(165, 416); ctx.stroke();
}

// ------------------------------------------------------------------ HUD

function drawHud(state) {
  const bar = ctx.createLinearGradient(0, 0, 0, HUD_H);
  bar.addColorStop(0, '#37414f');
  bar.addColorStop(1, '#232a35');
  ctx.fillStyle = bar;
  ctx.fillRect(0, 0, VIEW_W, HUD_H);
  text('RUSH HOUR KITCHEN', 22, HUD_H / 2, 22, '#ffd76a', 'left', 900);
  // score
  text('SCORE', 330, HUD_H / 2 - 11, 12, '#9fb4c8', 'left', 700);
  text(String(state.score), 330, HUD_H / 2 + 12, 21, '#ffffff', 'left', 900);
  // coins
  circle(492, HUD_H / 2 - 1, 12, '#ffc93c');
  text('$', 492, HUD_H / 2, 14, '#8a5a00', 'center', 900);
  text(String(state.coins), 512, HUD_H / 2, 21, '#ffffff', 'left', 900);
  // served count
  text('SERVED ' + state.served, 640, HUD_H / 2, 16, '#cfe3f5', 'left', 800);
  // day timer bar
  const tx = 830, tw = 392;
  text('DAY', tx, 15, 11, '#9fb4c8', 'left', 700);
  fillRoundRect(tx, 26, tw, 18, 9, '#141a21');
  const frac = Math.max(0, state.timeLeft / DAY_SECONDS);
  const tcol = frac > 0.35 ? '#7ec850' : (frac > 0.15 ? '#ffc93c' : '#e8483f');
  if (frac > 0) fillRoundRect(tx, 26, Math.max(18, tw * frac), 18, 9, tcol);
  text(Math.ceil(state.timeLeft) + 's', tx + tw + 12, 35, 16, '#ffffff', 'left', 800);
}

// ------------------------------------------------------- order tickets

function drawTicket(ticket, i, now, plate) {
  const r = ticketRect(i);
  const ready = plate && plateMatchesStack(plate, ticket.dish.stack);
  shadowed(() => fillRoundRect(r.x, r.y, r.w, r.h, 8, '#fffdf4'));
  if (ready) strokeRoundRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4, 10, '#7ec850', 4);
  // pin
  circle(r.x + r.w / 2, r.y + 9, 6, '#e8483f');
  circle(r.x + r.w / 2 - 1.5, r.y + 7.5, 2, '#ffb3ad');
  text('#' + (i + 1) + '  ' + ticket.dish.name, r.x + 14, r.y + 28, 17, '#33302a', 'left', 900);
  text('$' + ticket.dish.price, r.x + r.w - 14, r.y + 28, 16, '#2e7d32', 'right', 900);
  // ingredient sequence, left to right; the next one the plate still
  // needs (when the plate is a true prefix of this ticket) gets a ring
  const n = ticket.dish.stack.length;
  const stepW = Math.min(52, (r.w - 28) / n);
  let nextIdx = -1;
  if (plate) {
    const isPrefix = plate.length < n && plate.every((id, k) => ticket.dish.stack[k] === id);
    if (isPrefix) nextIdx = plate.length;
  }
  for (let k = 0; k < n; k++) {
    const cx = r.x + 20 + stepW * k + stepW / 2 - 6;
    const cy = r.y + 76;
    if (k === nextIdx) {
      ctx.beginPath();
      ctx.arc(cx, cy, 23, 0, Math.PI * 2);
      ctx.strokeStyle = '#e8483f';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (plate && k < plate.length && ticket.dish.stack[k] === plate[k]) {
      circle(cx + 13, cy - 13, 7, '#7ec850');
      text('✓', cx + 13, cy - 12.5, 10, '#ffffff', 'center', 900);
    }
    drawIngredient(ticket.dish.stack[k], cx, cy, 34);
    if (k < n - 1) text('›', cx + stepW / 2 + 1, cy, 18, '#b0a58e', 'center', 900);
  }
  if (ready) text('READY — click to serve!', r.x + r.w / 2, r.y + r.h - 36, 12, '#2e7d32', 'center', 900);
  // patience bar
  const px = r.x + 14, pw = r.w - 28;
  fillRoundRect(px, r.y + r.h - 24, pw, 11, 5, '#e8e0cc');
  const pfrac = Math.max(0, ticket.patience / ticket.patienceMax);
  const pcol = pfrac > 0.45 ? '#7ec850' : (pfrac > 0.22 ? '#ffc93c' : '#e8483f');
  if (pfrac > 0) fillRoundRect(px, r.y + r.h - 24, Math.max(11, pw * pfrac), 11, 5, pcol);
  text('patience', px, r.y + r.h - 33, 10, '#a3967a', 'left', 700);
}

function drawOrderBoard(state, now) {
  shadowed(() => fillRoundRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h, 12, '#503a26'));
  strokeRoundRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h, 12, '#332415', 5);
  fillRoundRect(BOARD.x + 8, BOARD.y + 6, BOARD.w - 16, 4, 2, 'rgba(255,220,160,0.35)');
  if (state.tickets.length === 0) {
    text('No orders yet — the rush is coming…', BOARD.x + BOARD.w / 2, BOARD.y + BOARD.h / 2, 20, '#d8c39a', 'center', 700);
  }
  state.tickets.forEach((t, i) => drawTicket(t, i, now, state.plate));
}

// ---------------------------------------------------------------- stove

function drawStove(state, now) {
  shadowed(() => fillRoundRect(STOVE.x, STOVE.y, STOVE.w, STOVE.h, 12, '#3c4149'));
  fillRoundRect(STOVE.x + 8, STOVE.y + 8, STOVE.w - 16, 34, 8, '#2b2f36');
  text('STOVE', STOVE.x + 20, STOVE.y + 25, 15, '#ffb27a', 'left', 900);
  for (let i = 0; i < PAN_COUNT; i++) {
    const p = panRect(i);
    const pan = state.pans[i];
    // burner glow
    const glowCol = pan.state === 'cooking' ? 'rgba(255,110,40,0.55)' : 'rgba(120,130,150,0.25)';
    ellipse(p.x + p.w / 2, p.y + p.h / 2 + 6, 52, 30, glowCol);
    // pan body
    ellipse(p.x + p.w / 2, p.y + p.h / 2, 46, 30, '#22242a');
    ellipse(p.x + p.w / 2, p.y + p.h / 2 - 3, 40, 25, '#33363e');
    ctx.fillStyle = '#22242a';
    ctx.fillRect(p.x + p.w - 4, p.y + p.h / 2 - 6, 15, 9);
    if (pan.state !== 'empty') {
      drawIngredient(pan.ing, p.x + p.w / 2, p.y + p.h / 2 - 4, 52);
      // timer ring
      const frac = pan.state === 'done' ? 1 : pan.progress;
      ctx.beginPath();
      ctx.arc(p.x + p.w / 2, p.y + p.h / 2 - 3, 34, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.strokeStyle = pan.state === 'done' ? '#7ec850' : '#ffc93c';
      ctx.lineWidth = 5;
      ctx.stroke();
      if (pan.state === 'done') {
        text('READY!', p.x + p.w / 2, p.y + p.h - 8, 13, '#9fe870', 'center', 900);
        drawSteam(p.x + p.w / 2, p.y + 6, now, i);
      } else {
        drawSteam(p.x + p.w / 2, p.y + 10, now, i + 3);
      }
    } else {
      text('empty pan', p.x + p.w / 2, p.y + p.h - 8, 11, '#8b93a1', 'center', 700);
    }
  }
}

function drawSteam(cx, cy, now, phase) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  for (let i = -1; i <= 1; i++) {
    const drift = Math.sin(now / 380 + phase + i * 1.7) * 4;
    ctx.beginPath();
    ctx.moveTo(cx + i * 16, cy);
    ctx.bezierCurveTo(cx + i * 16 + drift, cy - 12, cx + i * 16 - drift, cy - 22, cx + i * 16 + drift * 0.6, cy - 34);
    ctx.stroke();
  }
  ctx.restore();
}

// ------------------------------------------------------------ the plate

function drawPlateStack(stack, cx, cy, scale) {
  // the plate itself
  ellipse(cx, cy + 34 * scale, 104 * scale, 26 * scale, '#e9edf2');
  ellipse(cx, cy + 30 * scale, 96 * scale, 22 * scale, '#ffffff');
  ellipse(cx, cy + 30 * scale, 62 * scale, 13 * scale, '#dde5ec');
  // ingredients stacked bottom-to-top
  let y = cy + 22 * scale;
  for (const id of stack) {
    drawIngredient(id, cx, y, 96 * scale);
    y -= 13 * scale;
  }
  return y;
}

function drawPass(state, now) {
  // pass counter block
  shadowed(() => fillRoundRect(344, 452, 500, 178, 12, '#6d4525'));
  fillRoundRect(344, 452, 500, 10, 5, 'rgba(255,230,190,0.35)');
  text('THE PASS — build the dish here', 366, 478, 14, '#ffe1b0', 'left', 900);
  // scrap bin
  fillRoundRect(SCRAP.x, SCRAP.y, SCRAP.w, SCRAP.h, 8, '#c23b31');
  text('SCRAP', SCRAP.x + SCRAP.w / 2, SCRAP.y + 20, 12, '#ffffff', 'center', 900);
  text('✕ plate', SCRAP.x + SCRAP.w / 2, SCRAP.y + 42, 12, '#ffd9d4', 'center', 700);
  // the plate being built
  drawPlateStack(state.plate, PLATE.x, PLATE.y, 1);
  if (state.plate.length === 0) {
    text('plate is empty', PLATE.x, PLATE.y + 92, 13, '#e8cba0', 'center', 700);
  } else {
    text(state.plate.length + ' stacked — click a ticket to serve', PLATE.x, PLATE.y + 92, 13, '#ffe1b0', 'center', 700);
  }
  // serve bell
  circle(796, 486, 17, '#ffc93c');
  ellipse(796, 492, 20, 8, '#e0a81e');
  circle(796, 472, 4, '#8a5a00');
}

function drawFinishedShelf(state) {
  shadowed(() => fillRoundRect(PASS.x, PASS.y, PASS.w, PASS.h, 12, '#5d7a3a'));
  text('READY', PASS.x + PASS.w / 2, PASS.y + 26, 15, '#eaf7d0', 'center', 900);
  text('to serve', PASS.x + PASS.w / 2, PASS.y + 46, 12, '#cfe6ab', 'center', 700);
  if (state.finished) {
    drawPlateStack(state.finished.stack, PASS.x + PASS.w / 2, PASS.y + 96, 0.62);
    text(state.finished.name, PASS.x + PASS.w / 2, PASS.y + PASS.h - 14, 12, '#ffffff', 'center', 800);
  }
}

// ----------------------------------------------------------------- chef

function drawChef(now) {
  const { x, y } = CHEF;
  const bob = Math.sin(now / 500) * 2;
  ctx.save();
  ctx.translate(0, bob);
  // body: white coat
  shadowed(() => fillRoundRect(x - 52, y + 66, 104, 128, 22, '#f7f5ef'));
  ctx.fillStyle = '#e8483f';
  ctx.beginPath(); // neckerchief
  ctx.moveTo(x - 20, y + 68); ctx.lineTo(x + 20, y + 68); ctx.lineTo(x, y + 94); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#37414f';
  for (const by of [110, 134, 158]) circle(x + 14, y + by, 3.4, '#37414f');
  // arms
  ctx.strokeStyle = '#f7f5ef'; ctx.lineWidth = 17; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - 48, y + 84); ctx.quadraticCurveTo(x - 78, y + 116, x - 62, y + 148); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 48, y + 84); ctx.quadraticCurveTo(x + 80, y + 108, x + 66, y + 138); ctx.stroke();
  circle(x - 62, y + 150, 9, '#f2c094'); // hands
  circle(x + 66, y + 140, 9, '#f2c094');
  // the raised hand holds a spatula
  ctx.save();
  ctx.translate(x + 66, y + 140); ctx.rotate(-0.5);
  ctx.fillStyle = '#8a5a2e'; ctx.fillRect(-3, -34, 6, 30);
  fillRoundRect(-10, -52, 20, 20, 4, '#9aa3ad');
  ctx.restore();
  // head
  circle(x, y + 34, 33, '#f2c094');
  ellipse(x, y + 44, 33, 20, '#f2c094');
  circle(x - 12, y + 32, 3.6, '#2b2b2b'); // eyes
  circle(x + 12, y + 32, 3.6, '#2b2b2b');
  ctx.strokeStyle = '#8a5632'; ctx.lineWidth = 3; // smile
  ctx.beginPath(); ctx.arc(x, y + 42, 11, 0.25, Math.PI - 0.25); ctx.stroke();
  ctx.fillStyle = '#5d4028'; // moustache
  ellipse(x, y + 47, 15, 4.6, '#5d4028');
  circle(x - 24, y + 40, 6, 'rgba(232,72,63,0.35)'); // cheeks
  circle(x + 24, y + 40, 6, 'rgba(232,72,63,0.35)');
  // tall hat
  fillRoundRect(x - 30, y - 34, 60, 34, 8, '#ffffff');
  circle(x - 18, y - 34, 15, '#ffffff');
  circle(x + 2, y - 40, 18, '#ffffff');
  circle(x + 20, y - 33, 14, '#ffffff');
  fillRoundRect(x - 32, y - 4, 64, 9, 4, '#e8e4da');
  ctx.restore();
  text('CHEF MARCO', x, y + 204, 13, '#ffe1b0', 'center', 800);
}

// -------------------------------------------------------- ingredient bins

function drawBins(state) {
  for (let i = 0; i < INGREDIENTS.length; i++) {
    const r = binRect(i);
    const ing = INGREDIENTS[i];
    shadowed(() => fillRoundRect(r.x, r.y, r.w, r.h, 10, '#fdf6e7'));
    fillRoundRect(r.x, r.y, r.w, 26, 10, ing.main);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(r.x, r.y + 22, r.w, 4);
    text(ing.name.toUpperCase(), r.x + r.w / 2, r.y + 14, 12.5, '#33302a', 'center', 900);
    drawIngredient(ing.id, r.x + r.w / 2, r.y + 58, 46);
    if (ing.flame) drawFlameBadge(r.x + r.w - 16, r.y + 40);
    text(ing.flame ? 'cook first' : 'ready', r.x + r.w / 2, r.y + r.h - 9, 10, '#a3967a', 'center', 700);
  }
}

// ------------------------------------------------------------ full scene

function drawKitchen(state, now, rng) {
  drawWallAndFloor();
  drawWindow();
  drawShelves(rng);
  drawLamps();
  drawOrderBoard(state, now);
  drawStove(state, now);
  drawPass(state, now);
  drawFinishedShelf(state);
  drawChef(now);
  drawBins(state);
  drawHud(state);
  if (state.flash) {
    text(state.flash.text, VIEW_W / 2, 428, 26, state.flash.color, 'center', 900);
  }
}

// ------------------------------------------------------------ game state

function freshState() {
  return {
    mode: 'title',
    score: 0,
    coins: 0,
    served: 0,
    missed: 0,
    bestCombo: 0,
    combo: 0,
    timeLeft: DAY_SECONDS,
    tickets: [],
    plate: [],
    pans: Array.from({ length: PAN_COUNT }, () => ({ state: 'empty', ing: null, progress: 0 })),
    finished: null,
    spawnIn: 1.2,
    flash: null,
    rng: mulberry32(20261125),
  };
}

function makeTicket(state, dishIdx, patienceFrac) {
  const dish = DISHES[dishIdx % DISHES.length];
  const max = 46;
  return { dish, patience: max * (patienceFrac == null ? 1 : patienceFrac), patienceMax: max };
}

function setFlash(state, msg, color) {
  state.flash = { text: msg, color, until: performance.now() + 1100 };
}

// Put an ingredient to work: flame items claim a free pan, the rest go
// straight onto the plate.
function addIngredient(state, id) {
  const ing = ING_BY_ID[id];
  if (ing.flame) {
    const pan = state.pans.find(p => p.state === 'empty');
    if (!pan) { setFlash(state, 'Both pans are busy!', '#e8483f'); return; }
    pan.state = 'cooking';
    pan.ing = id;
    pan.progress = 0;
    return;
  }
  if (state.plate.length >= 6) { setFlash(state, 'The plate is full!', '#e8483f'); return; }
  state.plate.push(id);
}

function plateMatchesStack(plate, stack) {
  if (plate.length !== stack.length) return false;
  return stack.every((id, i) => plate[i] === id);
}

function plateMatches(state, ticket) {
  return plateMatchesStack(state.plate, ticket.dish.stack);
}

function tryServe(state, idx) {
  const ticket = state.tickets[idx];
  if (!ticket) return;
  if (!plateMatches(state, ticket)) {
    setFlash(state, 'That plate does not match ticket #' + (idx + 1), '#e8483f');
    state.combo = 0;
    return;
  }
  const tip = Math.round(ticket.patience / ticket.patienceMax * 8);
  state.coins += ticket.dish.price + tip;
  state.score += 100 + tip * 10;
  state.served += 1;
  state.combo += 1;
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  state.finished = ticket.dish;
  state.plate = [];
  state.tickets.splice(idx, 1);
  setFlash(state, 'Served! +$' + (ticket.dish.price + tip), '#2e7d32');
}

function updateGame(state, dt, now) {
  if (state.mode !== 'playing') return;
  state.timeLeft -= dt;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    state.mode = 'end';
    return;
  }
  state.spawnIn -= dt;
  if (state.spawnIn <= 0 && state.tickets.length < MAX_TICKETS) {
    const idx = Math.floor(state.rng() * DISHES.length);
    state.tickets.push(makeTicket(state, idx));
    state.spawnIn = 4.5 + state.rng() * 3.5;
  }
  for (let i = state.tickets.length - 1; i >= 0; i--) {
    const t = state.tickets[i];
    t.patience -= dt;
    if (t.patience <= 0) {
      state.tickets.splice(i, 1);
      state.missed += 1;
      state.combo = 0;
      setFlash(state, 'A customer walked out!', '#e8483f');
    }
  }
  for (const pan of state.pans) {
    if (pan.state === 'cooking') {
      pan.progress += dt / COOK_SECONDS;
      if (pan.progress >= 1) { pan.progress = 1; pan.state = 'done'; }
    }
  }
  if (state.flash && now > state.flash.until) state.flash = null;
}

// ---------------------------------------------------------------- input

function startDay(state) {
  const keep = state.rng;
  Object.assign(state, freshState());
  state.rng = keep;
  state.mode = 'playing';
  state.tickets.push(makeTicket(state, 0));
  state.tickets.push(makeTicket(state, 3));
  state.spawnIn = 5;
}

function handleClick(state, mx, my) {
  if (state.mode === 'title') { startDay(state); return; }
  if (state.mode === 'end') {
    if (pointIn(mx, my, { x: 490, y: 560, w: 300, h: 62 })) startDay(state);
    return;
  }
  // bins
  for (let i = 0; i < INGREDIENTS.length; i++) {
    if (pointIn(mx, my, binRect(i))) { addIngredient(state, INGREDIENTS[i].id); return; }
  }
  // pans: a finished pan moves its food to the plate
  for (let i = 0; i < PAN_COUNT; i++) {
    if (pointIn(mx, my, panRect(i))) {
      const pan = state.pans[i];
      if (pan.state === 'done') {
        if (state.plate.length >= 6) { setFlash(state, 'The plate is full!', '#e8483f'); return; }
        state.plate.push(pan.ing);
        pan.state = 'empty'; pan.ing = null; pan.progress = 0;
      } else if (pan.state === 'cooking') {
        setFlash(state, 'Still cooking…', '#e0a81e');
      }
      return;
    }
  }
  // scrap
  if (pointIn(mx, my, SCRAP)) { state.plate = []; setFlash(state, 'Plate scrapped', '#a3967a'); return; }
  // tickets: serve
  for (let i = 0; i < state.tickets.length; i++) {
    if (pointIn(mx, my, ticketRect(i))) { tryServe(state, i); return; }
  }
}

canvas.addEventListener('click', (ev) => {
  const rect = canvas.getBoundingClientRect();
  const mx = (ev.clientX - rect.left) * (VIEW_W / rect.width);
  const my = (ev.clientY - rect.top) * (VIEW_H / rect.height);
  handleClick(game, mx, my);
});

window.addEventListener('keydown', (ev) => {
  if (game.mode !== 'playing') {
    if (ev.key === ' ' || ev.key === 'Enter') { startDay(game); ev.preventDefault(); }
    return;
  }
  const n = parseInt(ev.key, 10);
  if (n >= 1 && n <= 4) tryServe(game, n - 1);
  if (ev.key === 'Backspace') { game.plate = []; ev.preventDefault(); }
});

// ------------------------------------------------------- title and end

function drawTitleOverlay(state, now, rng) {
  drawKitchen(state, now, rng);
  ctx.fillStyle = 'rgba(30,20,10,0.38)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  shadowed(() => fillRoundRect(240, 268, 800, 264, 24, '#fff8ea'));
  strokeRoundRect(240, 268, 800, 264, 24, '#e8a856', 6);
  text('RUSH HOUR', 640, 336, 64, '#c23b31', 'center', 900);
  text('KITCHEN', 640, 402, 64, '#37414f', 'center', 900);
  text('Stack the tickets. Beat the clock. Feed the rush.', 640, 458, 20, '#7a6a52', 'center', 700);
  const pulse = 1 + Math.sin(now / 300) * 0.03;
  ctx.save();
  ctx.translate(640, 500); ctx.scale(pulse, pulse);
  fillRoundRect(-130, -24, 260, 48, 24, '#e8483f');
  text('▶  CLICK TO START', 0, 2, 21, '#ffffff', 'center', 900);
  ctx.restore();
}

function drawEndOverlay(state, now, rng) {
  drawKitchen(state, now, rng);
  ctx.fillStyle = 'rgba(30,20,10,0.45)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  shadowed(() => fillRoundRect(340, 196, 600, 430, 22, '#fff8ea'));
  strokeRoundRect(340, 196, 600, 430, 22, '#e8a856', 6);
  text('DAY OVER!', 640, 252, 44, '#c23b31', 'center', 900);
  text('The lunch rush is done. The till says:', 640, 296, 17, '#7a6a52', 'center', 700);
  const rows = [
    ['Final score', String(state.score)],
    ['Dishes served', String(state.served)],
    ['Coins earned', '$' + state.coins],
    ['Customers lost', String(state.missed)],
    ['Best combo', '×' + state.bestCombo],
  ];
  rows.forEach(([label, value], i) => {
    const y = 348 + i * 44;
    text(label, 420, y, 20, '#4a4238', 'left', 700);
    text(value, 860, y, 24, '#2e7d32', 'right', 900);
    ctx.strokeStyle = '#eadfc6'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(420, y + 21); ctx.lineTo(860, y + 21); ctx.stroke();
  });
  fillRoundRect(490, 560, 300, 62, 31, '#e8483f');
  text('↻  COOK ANOTHER DAY', 640, 592, 20, '#ffffff', 'center', 900);
}

// ------------------------------------------------------------ shot mode

const params = new URLSearchParams(location.search);
const shotKind = params.get('shot');
const shotSeed = parseInt(params.get('seed') || '1', 10) || 1;

// Compose the exact still frame the screenshots are taken from: a busy
// mid-rush moment, frozen.
function composeShotFrame(kind) {
  const s = freshState();
  s.rng = mulberry32(shotSeed);
  s.mode = 'playing';
  s.score = 1240;
  s.coins = 386;
  s.served = 9;
  s.timeLeft = 74;
  s.tickets = [
    makeTicket(s, 4, 0.82),  // Double Trouble
    makeTicket(s, 0, 0.55),  // Classic Burger
    makeTicket(s, 1, 0.34),  // Sunrise Stack
    makeTicket(s, 2, 0.93),  // Garden Melt
  ];
  s.plate = ['bun', 'patty', 'cheese']; // Double Trouble, mid-assembly
  s.pans[0] = { state: 'cooking', ing: 'patty', progress: 0.86 };
  s.pans[1] = { state: 'done', ing: 'bacon', progress: 1 };
  s.finished = DISHES[0]; // a Classic Burger waits at the pass
  if (kind === 'start') {
    s.mode = 'title';
    s.plate = [];
    s.score = 0; s.coins = 0; s.served = 0; s.timeLeft = DAY_SECONDS;
  }
  if (kind === 'end') {
    s.mode = 'end';
    s.score = 2380; s.coins = 512; s.served = 14; s.missed = 2; s.bestCombo = 5;
    s.timeLeft = 0;
  }
  return s;
}

// ----------------------------------------------------------------- main

const game = shotKind ? composeShotFrame(shotKind) : freshState();
const decoRng = mulberry32(shotSeed * 7 + 3);

function render(now) {
  // The shelf jars are laid out from a fresh seeded stream each frame so
  // the picture never flickers.
  const frameRng = mulberry32(shotSeed * 7 + 3);
  if (game.mode === 'title') drawTitleOverlay(game, now, frameRng);
  else if (game.mode === 'end') drawEndOverlay(game, now, frameRng);
  else drawKitchen(game, now, frameRng);
}

if (shotKind) {
  // One frozen frame, drawn once the page is ready; no loop, no clock.
  render(900);
} else {
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    updateGame(game, dt, now);
    render(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
