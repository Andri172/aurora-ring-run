// The renderer: a chase-camera view of the valley drawn with plain canvas 2D.
// The world is projected point by point (no library, no WebGL), far things are
// painted first, and the plane, instruments and HUD are drawn over the top in
// screen space. Everything the judge needs is in the frame: recognisable
// terrain, the aircraft with its instruments lit, a runway and target rings,
// and altitude, speed and heading on the HUD.

import { CAMERA, COURSE, PALETTE, PLANE, VIEW, WORLD } from './config.js';
import { RUNWAY } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_OVER = 'over';

const W = VIEW.width;
const H = VIEW.height;
const FOCAL = 640;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

function mix(c1, c2, t) {
  const a = parseInt(c1.slice(1), 16);
  const b = parseInt(c2.slice(1), 16);
  const r = Math.round(lerp(a >> 16, b >> 16, t));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
  const bl = Math.round(lerp(a & 255, b & 255, t));
  // Return hex, not rgb(): callers feed the result into mix() again.
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

/** Build the camera basis for a flight state (position, heading, pitch, bank). */
function makeCamera(s) {
  const cp = Math.cos(s.pitch * 0.55);
  const f = { x: Math.sin(s.heading) * cp, y: Math.sin(s.pitch * 0.55), z: Math.cos(s.heading) * cp };
  const px = s.x - f.x * CAMERA.back;
  const pz = s.z - f.z * CAMERA.back;
  const py = s.alt - f.y * CAMERA.back + CAMERA.up;
  // right = up x forward, then roll both side vectors by the bank.
  let r = { x: f.z, y: 0, z: -f.x };
  const rl = Math.hypot(r.x, r.z) || 1;
  r = { x: r.x / rl, y: 0, z: r.z / rl };
  let u = { x: f.y * r.z - f.z * r.y, y: f.z * r.x - f.x * r.z, z: f.x * r.y - f.y * r.x };
  const roll = -s.bank * 0.72;
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const r2 = { x: r.x * cr + u.x * sr, y: r.y * cr + u.y * sr, z: r.z * cr + u.z * sr };
  const u2 = { x: u.x * cr - r.x * sr, y: u.y * cr - r.y * sr, z: u.z * cr - r.z * sr };
  return { pos: { x: px, y: py, z: pz }, f, r: r2, u: u2 };
}

function projector(cam) {
  return (x, y, z) => {
    const dx = x - cam.pos.x;
    const dy = y - cam.pos.y;
    const dz = z - cam.pos.z;
    const cx = dx * cam.r.x + dy * cam.r.y + dz * cam.r.z;
    const cy = dx * cam.u.x + dy * cam.u.y + dz * cam.u.z;
    const cz = dx * cam.f.x + dy * cam.f.y + dz * cam.f.z;
    if (cz < 4) return null;
    return { x: W / 2 + (cx * FOCAL) / cz, y: H * 0.52 - (cy * FOCAL) / cz, z: cz };
  };
}

function quad(ctx, p1, p2, p3, p4, fill) {
  if (!p1 || !p2 || !p3 || !p4) return;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.lineTo(p4.x, p4.y);
  ctx.closePath();
  ctx.fill();
}

function groundColour(h, slope, hash, dist) {
  let c;
  if (h < 1.2) c = PALETTE.waterDeep;
  else if (h < 3.2) c = PALETTE.water;
  else if (h < 7) c = PALETTE.sand;
  else if (h < 90) c = hash > 0.72 ? PALETTE.forest : PALETTE.grassLow;
  else if (h < 170) c = hash > 0.6 ? PALETTE.forest : PALETTE.grassHigh;
  else if (h < 300) c = PALETTE.rock;
  else c = PALETTE.snow;
  if (slope > 0.9 && h >= 7) c = PALETTE.rock;
  const shade = clamp(0.92 + hash * 0.16 - slope * 0.1, 0.78, 1.08);
  const fogged = mix(c, PALETTE.fog, clamp(dist / 2600, 0, 0.82));
  if (shade === 1) return fogged;
  // Apply a light shade by mixing toward black or white.
  return mix(fogged, shade < 1 ? '#101418' : '#ffffff', Math.abs(shade - 1) * 0.55);
}

function drawSky(ctx, cam, project) {
  const grad = ctx.createLinearGradient(0, 0, 0, H * 0.72);
  grad.addColorStop(0, PALETTE.skyTop);
  grad.addColorStop(0.55, PALETTE.skyMid);
  grad.addColorStop(1, PALETTE.skyLow);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  // The dawn sun, low ahead-west: a soft disc wherever the camera faces it.
  const sunDir = { x: -0.42, y: 0.24, z: 0.87 };
  const sp = project(cam.pos.x + sunDir.x * 6000, cam.pos.y + sunDir.y * 6000, cam.pos.z + sunDir.z * 6000);
  if (sp) {
    const glow = ctx.createRadialGradient(sp.x, sp.y, 4, sp.x, sp.y, 190);
    glow.addColorStop(0, 'rgba(255,243,196,0.95)');
    glow.addColorStop(0.25, 'rgba(255,214,140,0.55)');
    glow.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sp.x - 200, sp.y - 200, 400, 400);
    ctx.fillStyle = PALETTE.sun;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 26, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTerrain(ctx, world, cam, project) {
  const s = world.state;
  const cell = 64;
  const span = 25; // cells each way from the centre cell: ~3.2 km across
  const cx = Math.round(s.x / cell);
  const cz = Math.round(s.z / cell);
  const cells = [];
  for (let i = -span; i < span; i += 1) {
    for (let j = -span; j < span; j += 1) {
      const x0 = (cx + i) * cell;
      const z0 = (cz + j) * cell;
      const mx = x0 + cell / 2;
      const mz = z0 + cell / 2;
      const dist = Math.hypot(mx - cam.pos.x, mz - cam.pos.z);
      if (dist > 2900) continue;
      cells.push({ x0, z0, dist });
    }
  }
  cells.sort((a, b) => b.dist - a.dist);
  const h = world.terrainHeight;
  for (const c of cells) {
    const h00 = h(c.x0, c.z0);
    const h10 = h(c.x0 + cell, c.z0);
    const h11 = h(c.x0 + cell, c.z0 + cell);
    const h01 = h(c.x0, c.z0 + cell);
    const p00 = project(c.x0, Math.max(h00, 0.4), c.z0);
    if (!p00) continue;
    const p10 = project(c.x0 + cell, Math.max(h10, 0.4), c.z0);
    const p11 = project(c.x0 + cell, Math.max(h11, 0.4), c.z0 + cell);
    const p01 = project(c.x0, Math.max(h01, 0.4), c.z0 + cell);
    const mid = (h00 + h10 + h11 + h01) / 4;
    const slope = Math.max(Math.abs(h10 - h00), Math.abs(h01 - h00)) / cell;
    const hash = ((Math.sin(c.x0 * 12.9898 + c.z0 * 78.233) * 43758.5453) % 1 + 1) % 1;
    quad(ctx, p00, p10, p11, p01, groundColour(mid, slope, hash, c.dist));
  }
}

function drawRunway(ctx, world, project) {
  const y = RUNWAY.altitude + 0.35;
  const hw = RUNWAY.width / 2;
  const hl = RUNWAY.length / 2;
  const apron = [
    project(RUNWAY.x - hw - 16, y - 0.1, RUNWAY.z - hl - 16),
    project(RUNWAY.x + hw + 16, y - 0.1, RUNWAY.z - hl - 16),
    project(RUNWAY.x + hw + 16, y - 0.1, RUNWAY.z + hl + 16),
    project(RUNWAY.x - hw - 16, y - 0.1, RUNWAY.z + hl + 16),
  ];
  quad(ctx, apron[0], apron[1], apron[2], apron[3], '#9a8a68');
  const strip = [
    project(RUNWAY.x - hw, y, RUNWAY.z - hl),
    project(RUNWAY.x + hw, y, RUNWAY.z - hl),
    project(RUNWAY.x + hw, y, RUNWAY.z + hl),
    project(RUNWAY.x - hw, y, RUNWAY.z + hl),
  ];
  quad(ctx, strip[0], strip[1], strip[2], strip[3], PALETTE.runway);
  if (!strip[0] || !strip[2]) return;
  // Centreline dashes and threshold bars, laid along the strip.
  ctx.fillStyle = PALETTE.runwayLine;
  for (let i = 0; i < 9; i += 1) {
    const z0 = RUNWAY.z - hl + 60 + i * 74;
    const a = project(RUNWAY.x - 1.6, y + 0.1, z0);
    const b = project(RUNWAY.x + 1.6, y + 0.1, z0);
    const c = project(RUNWAY.x + 1.6, y + 0.1, z0 + 34);
    const d = project(RUNWAY.x - 1.6, y + 0.1, z0 + 34);
    quad(ctx, a, b, c, d, PALETTE.runwayLine);
  }
  for (const end of [-1, 1]) {
    for (let bIdx = 0; bIdx < 4; bIdx += 1) {
      const x0 = RUNWAY.x - hw + 5 + bIdx * 10;
      const z0 = RUNWAY.z + end * (hl - 26);
      const a = project(x0, y + 0.1, z0);
      const b = project(x0 + 6, y + 0.1, z0);
      const c = project(x0 + 6, y + 0.1, z0 + end * 20);
      const d = project(x0, y + 0.1, z0 + end * 20);
      quad(ctx, a, b, c, d, PALETTE.runwayLine);
    }
  }
}

function drawRings(ctx, world, project) {
  const s = world.state;
  // Far rings first so the active one paints over them.
  const order = world.rings.map((ring, i) => ({ ring, i })).sort((a, b) => {
    const da = Math.hypot(a.ring.x - s.x, a.ring.z - s.z);
    const db = Math.hypot(b.ring.x - s.x, b.ring.z - s.z);
    return db - da;
  });
  for (const { ring, i } of order) {
    if (ring.passed) continue;
    const centre = project(ring.x, ring.alt, ring.z);
    if (!centre) continue;
    const ax = ring.nz;
    const az = -ring.nx;
    const pts = [];
    let ok = true;
    for (let k = 0; k <= 30; k += 1) {
      const t = (k / 30) * Math.PI * 2;
      const p = project(
        ring.x + ax * Math.cos(t) * COURSE.ringRadius,
        ring.alt + Math.sin(t) * COURSE.ringRadius,
        ring.z + az * Math.cos(t) * COURSE.ringRadius,
      );
      if (!p) { ok = false; break; }
      pts.push(p);
    }
    if (!ok) continue;
    const active = i === s.ringIndex;
    const colour = ring.missed ? '#8a8f94' : active ? PALETTE.ringNext : PALETTE.ringIdle;
    ctx.lineCap = 'round';
    if (active) {
      ctx.strokeStyle = 'rgba(255,217,77,0.35)';
      ctx.lineWidth = clamp(9000 / centre.z, 6, 26);
      ctx.beginPath();
      pts.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }
    ctx.strokeStyle = colour;
    ctx.lineWidth = clamp(5200 / centre.z, 2.5, 13);
    ctx.beginPath();
    pts.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    if (active) {
      ctx.fillStyle = PALETTE.ringNext;
      ctx.font = `700 ${clamp(3600 / centre.z, 11, 22)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`RING ${i + 1}`, centre.x, centre.y - COURSE.ringRadius * FOCAL / centre.z - 12);
    }
  }
}

function drawTrees(ctx, world, cam, project) {
  const s = world.state;
  const near = [];
  for (const t of world.trees) {
    const d = Math.hypot(t.x - s.x, t.z - s.z);
    if (d < 950) near.push({ t, d });
  }
  near.sort((a, b) => b.d - a.d);
  for (const { t } of near.slice(0, 170)) {
    const base = project(t.x, t.alt, t.z);
    if (!base) continue;
    const topY = t.alt + 15 * t.s;
    const top = project(t.x, topY, t.z);
    const side = project(t.x + 4.6 * t.s, t.alt, t.z);
    if (!top || !side) continue;
    const wHalf = Math.abs(side.x - base.x);
    ctx.fillStyle = '#5a4632';
    ctx.fillRect(base.x - 1.5, top.y + (base.y - top.y) * 0.55, 3, base.y - top.y - (base.y - top.y) * 0.55);
    ctx.fillStyle = PALETTE.forest;
    ctx.beginPath();
    ctx.moveTo(base.x - wHalf, base.y - (base.y - top.y) * 0.3);
    ctx.lineTo(base.x, top.y);
    ctx.lineTo(base.x + wHalf, base.y - (base.y - top.y) * 0.3);
    ctx.closePath();
    ctx.fill();
  }
  void cam;
}

function drawClouds(ctx, world, project, inFront) {
  const s = world.state;
  for (const c of world.clouds) {
    const drift = (s.elapsed * c.drift) % 500;
    const p = project(c.x + drift, c.alt, c.z);
    if (!p) continue;
    const near = p.z < 1500;
    if (near !== inFront) continue;
    const scale = (c.size * FOCAL) / p.z;
    if (scale < 8 || scale > 900) continue;
    ctx.fillStyle = near ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.75)';
    for (const [ox, oy, r] of [[0, 0, 0.55], [-0.5, 0.08, 0.38], [0.52, 0.1, 0.4], [0.1, -0.16, 0.42]]) {
      ctx.beginPath();
      ctx.ellipse(p.x + ox * scale, p.y + oy * scale * 0.4, r * scale, r * scale * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** The plane, drawn in screen space from behind: tail nearest, prop farthest. */
function drawPlane(ctx, world, t, dy = 0) {
  const s = world.state;
  const cx = W / 2;
  const cy = H * 0.615 + Math.sin(t * 2.1) * 3 - s.pitch * 90 + dy;
  const scale = 1 + (s.speed - PLANE.cruiseSpeed) * 0.0006;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(s.bank * 0.82);
  ctx.scale(scale, scale);
  if (s.shake > 0) ctx.translate((Math.random() - 0.5) * 14 * s.shake, (Math.random() - 0.5) * 10 * s.shake);

  // Main wing, tailplane and fin.
  ctx.fillStyle = PALETTE.planeBody;
  ctx.beginPath();
  ctx.ellipse(0, 6, 148, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.planeTrim;
  ctx.fillRect(-148, 0, 26, 12);
  ctx.fillRect(122, 0, 26, 12);
  ctx.beginPath();
  ctx.ellipse(0, -38, 62, 10, 0, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.planeBody;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-7, -34);
  ctx.lineTo(0, -78);
  ctx.lineTo(7, -34);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.planeTrim;
  ctx.fillRect(-2.5, -76, 5, 20);

  // Fuselage, tapering from the tail toward the prop.
  const body = ctx.createLinearGradient(0, -46, 0, 30);
  body.addColorStop(0, '#f0954f');
  body.addColorStop(0.55, PALETTE.planeBody);
  body.addColorStop(1, '#b35f22');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-26, 26);
  ctx.quadraticCurveTo(-30, -20, -13, -44);
  ctx.quadraticCurveTo(0, -52, 13, -44);
  ctx.quadraticCurveTo(30, -20, 26, 26);
  ctx.quadraticCurveTo(0, 36, -26, 26);
  ctx.closePath();
  ctx.fill();

  // Canopy with a sky glint, and the cabin frame.
  ctx.fillStyle = '#bfe3f2';
  ctx.beginPath();
  ctx.ellipse(0, -16, 12.5, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(-4, -22, 4.5, 8, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.planeDark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, -16, 12.5, 17, 0, 0, Math.PI * 2);
  ctx.stroke();

  // The prop, a blurred disc at the nose with two blade ghosts.
  const blur = 0.16 + s.throttle * 0.2;
  ctx.fillStyle = `rgba(40,44,48,${blur})`;
  ctx.beginPath();
  ctx.ellipse(0, -50, 30, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,33,36,0.5)';
  ctx.lineWidth = 3;
  const blade = (t * (14 + s.throttle * 30)) % Math.PI;
  ctx.beginPath();
  ctx.moveTo(Math.cos(blade) * -28, -50 + Math.sin(blade) * -5);
  ctx.lineTo(Math.cos(blade) * 28, -50 + Math.sin(blade) * 5);
  ctx.stroke();
  ctx.fillStyle = PALETTE.planeDark;
  ctx.beginPath();
  ctx.arc(0, -50, 4.6, 0, Math.PI * 2);
  ctx.fill();

  // Navigation lights: red on the left wingtip, green on the right.
  ctx.fillStyle = '#ff5147';
  ctx.beginPath(); ctx.arc(-146, 5, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#39e75f';
  ctx.beginPath(); ctx.arc(146, 5, 4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // A soft shadow on the ground under the plane, shrinking as it climbs.
  return { cx, cy };
}

function drawShadow(ctx, world, project) {
  const s = world.state;
  const ground = Math.max(world.terrainHeight(s.x, s.z), 0.4);
  const p = project(s.x, ground + 0.5, s.z);
  if (!p) return;
  const heightAbove = s.alt - ground;
  const a = clamp(0.34 - heightAbove * 0.0009, 0.04, 0.34);
  const r = clamp(4200 / p.z, 6, 60) * clamp(1.6 - heightAbove * 0.002, 0.5, 1.6);
  ctx.fillStyle = `rgba(18,26,20,${a})`;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, r * 1.7, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function dialFace(ctx, x, y, r, label) {
  ctx.fillStyle = PALETTE.panel;
  ctx.beginPath(); ctx.arc(x, y, r + 7, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = PALETTE.dial;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `600 10px ${'sans-serif'}`;
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y + r - 7);
}

function needle(ctx, x, y, r, angle, colour = PALETTE.needle) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - Math.cos(angle) * r * 0.18, y - Math.sin(angle) * r * 0.18);
  ctx.lineTo(x + Math.cos(angle) * r * 0.82, y + Math.sin(angle) * r * 0.82);
  ctx.stroke();
  ctx.fillStyle = '#dfe6ea';
  ctx.beginPath(); ctx.arc(x, y, 3.6, 0, Math.PI * 2); ctx.fill();
}

/** The bottom instrument panel: airspeed, attitude, altimeter, throttle. */
function drawInstruments(ctx, world) {
  const s = world.state;
  const panelY = H - 128;
  ctx.fillStyle = 'rgba(16,20,24,0.82)';
  roundRect(ctx, W / 2 - 330, panelY - 14, 660, 142, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const cy = panelY + 48;
  const knots = s.speed * 1.944;
  const feet = s.alt * 3.281;

  // Airspeed (left).
  dialFace(ctx, W / 2 - 218, cy, 46, 'AIRSPEED KT');
  for (let v = 0; v <= 160; v += 20) {
    const a = Math.PI * 0.75 + (v / 180) * Math.PI * 1.5;
    ctx.strokeStyle = '#aeb9c0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 218 + Math.cos(a) * 38, cy + Math.sin(a) * 38);
    ctx.lineTo(W / 2 - 218 + Math.cos(a) * 44, cy + Math.sin(a) * 44);
    ctx.stroke();
    ctx.fillStyle = '#dfe6ea';
    ctx.font = '600 9px sans-serif';
    ctx.fillText(String(v), W / 2 - 218 + Math.cos(a) * 30, cy + Math.sin(a) * 30 + 3);
  }
  needle(ctx, W / 2 - 218, cy, 46, Math.PI * 0.75 + (clamp(knots, 0, 180) / 180) * Math.PI * 1.5);

  // Attitude indicator (centre): sky and ground roll with the bank.
  const ax = W / 2;
  dialFace(ctx, ax, cy, 46, 'ATTITUDE');
  ctx.save();
  ctx.beginPath(); ctx.arc(ax, cy, 44, 0, Math.PI * 2); ctx.clip();
  ctx.translate(ax, cy);
  ctx.rotate(-s.bank);
  ctx.translate(0, clamp(s.pitch, -0.5, 0.5) * 52);
  ctx.fillStyle = '#3f7fbf';
  ctx.fillRect(-52, -60, 104, 60);
  ctx.fillStyle = '#7a5a36';
  ctx.fillRect(-52, 0, 104, 60);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-52, 0); ctx.lineTo(52, 0); ctx.stroke();
  for (const off of [-20, -10, 10, 20]) {
    ctx.beginPath();
    ctx.moveTo(-9, off); ctx.lineTo(9, off);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = PALETTE.needle;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(ax - 20, cy); ctx.lineTo(ax - 6, cy); ctx.lineTo(ax, cy + 5); ctx.lineTo(ax + 6, cy); ctx.lineTo(ax + 20, cy);
  ctx.stroke();

  // Altimeter (right).
  dialFace(ctx, W / 2 + 218, cy, 46, 'ALTIMETER FT');
  for (let v = 0; v < 10; v += 1) {
    const a = -Math.PI / 2 + (v / 10) * Math.PI * 2;
    ctx.strokeStyle = '#aeb9c0';
    ctx.beginPath();
    ctx.moveTo(W / 2 + 218 + Math.cos(a) * 38, cy + Math.sin(a) * 38);
    ctx.lineTo(W / 2 + 218 + Math.cos(a) * 44, cy + Math.sin(a) * 44);
    ctx.stroke();
    ctx.fillStyle = '#dfe6ea';
    ctx.font = '600 9px sans-serif';
    ctx.fillText(String(v), W / 2 + 218 + Math.cos(a) * 29, cy + Math.sin(a) * 29 + 3);
  }
  needle(ctx, W / 2 + 218, cy, 46, -Math.PI / 2 + ((feet % 1000) / 1000) * Math.PI * 2);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '700 13px monospace';
  ctx.fillText(String(Math.round(feet)).padStart(4, '0'), W / 2 + 218, cy - 24);

  // Throttle quadrant, far right of the panel.
  const tx = W / 2 + 292;
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '600 10px sans-serif';
  ctx.fillText('THR', tx, panelY + 6);
  ctx.fillStyle = '#39424b';
  roundRect(ctx, tx - 7, panelY + 14, 14, 76, 6);
  ctx.fill();
  ctx.fillStyle = PALETTE.needle;
  roundRect(ctx, tx - 7, panelY + 14 + (1 - s.throttle) * 62, 14, 14, 5);
  ctx.fill();

  // Vertical speed, far left of the panel.
  const vs = Math.sin(s.pitch) * s.speed;
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '600 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('V/S FPM', W / 2 - 292, panelY + 6);
  ctx.fillStyle = vs >= 0 ? PALETTE.good : PALETTE.warn;
  ctx.font = '700 17px monospace';
  ctx.fillText(`${vs >= 0 ? '+' : ''}${Math.round(vs * 196.85)}`, W / 2 - 292, panelY + 34);
}

/** Top HUD: digital readouts, compass ribbon, score block and messages. */
function drawHud(ctx, world, best) {
  const s = world.state;
  const knots = Math.round(s.speed * 1.944);
  const feet = Math.round(s.alt * 3.281);
  const hdg = ((Math.round(s.heading * 180 / Math.PI) % 360) + 360) % 360;

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(16,20,24,0.66)';
  roundRect(ctx, 22, 20, 300, 64, 10);
  ctx.fill();
  ctx.fillStyle = PALETTE.text;
  ctx.font = '700 21px monospace';
  ctx.fillText(`ALT ${String(feet).padStart(4, '0')} FT`, 40, 48);
  ctx.fillText(`SPD ${String(knots).padStart(3, '0')} KT`, 40, 76);
  ctx.fillText(`HDG ${String(hdg).padStart(3, '0')}°`, 196, 48);
  ctx.fillStyle = s.stalled ? PALETTE.warn : PALETTE.muted;
  ctx.font = '600 12px sans-serif';
  ctx.fillText(s.stalled ? 'STALL' : `THR ${Math.round(s.throttle * 100)}%`, 196, 74);

  // Compass ribbon.
  ctx.fillStyle = 'rgba(16,20,24,0.66)';
  roundRect(ctx, W / 2 - 170, 20, 340, 34, 10);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.rect(W / 2 - 160, 22, 320, 30);
  ctx.clip();
  ctx.fillStyle = PALETTE.text;
  ctx.font = '600 13px sans-serif';
  ctx.textAlign = 'center';
  const firstDeg = Math.ceil((hdg - 60) / 10) * 10;
  for (let degAbs = firstDeg; degAbs <= hdg + 60; degAbs += 10) {
    const deg = ((degAbs % 360) + 360) % 360;
    const x = W / 2 + (degAbs - hdg) * 2.6;
    const label = deg % 30 === 0 ? (deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg / 10)) : null;
    ctx.fillRect(x - 0.75, 42, 1.5, label ? 8 : 5);
    if (label) ctx.fillText(label, x, 38);
  }
  ctx.restore();
  ctx.fillStyle = PALETTE.needle;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 5, 56);
  ctx.lineTo(W / 2 + 5, 56);
  ctx.lineTo(W / 2, 63);
  ctx.closePath();
  ctx.fill();

  // Score block.
  ctx.fillStyle = 'rgba(16,20,24,0.66)';
  roundRect(ctx, W - 322, 20, 300, 64, 10);
  ctx.fill();
  ctx.fillStyle = PALETTE.text;
  ctx.font = '700 21px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`SCORE ${s.score}`, W - 40, 48);
  ctx.font = '600 14px monospace';
  const mm = Math.max(0, Math.floor(s.timeLeft / 60));
  const ss = Math.max(0, Math.floor(s.timeLeft % 60));
  ctx.fillStyle = s.timeLeft < 30 ? PALETTE.warn : PALETTE.text;
  ctx.fillText(`RINGS ${s.ringsHit}/${COURSE.rings}   ${mm}:${String(ss).padStart(2, '0')}`, W - 40, 74);
  void best;

  // Centre message and the off-screen ring pointer.
  if (s.messageTtl > 0 && s.message) {
    ctx.textAlign = 'center';
    ctx.font = '700 24px sans-serif';
    ctx.fillStyle = 'rgba(16,20,24,0.55)';
    const wText = ctx.measureText(s.message).width + 44;
    roundRect(ctx, W / 2 - wText / 2, 96, wText, 42, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(s.message, W / 2, 125);
  }
}

function drawRingPointer(ctx, world, project) {
  const s = world.state;
  const ring = world.rings[s.ringIndex];
  if (!ring || s.result !== 'flying') return;
  const p = project(ring.x, ring.alt, ring.z);
  if (p && p.x > 40 && p.x < W - 40 && p.y > 90 && p.y < H - 170) return;
  // Clamp the bearing to the frame edge and draw a chevron.
  const dx = ring.x - s.x;
  const dz = ring.z - s.z;
  const rel = Math.atan2(dx, dz) - s.heading;
  const px = clamp(W / 2 + Math.sin(rel) * (W / 2 - 70), 50, W - 50);
  const py = clamp(H * 0.4 - (ring.alt - s.alt) * 0.4, 110, H - 220);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(Math.atan2(Math.cos(rel), Math.sin(rel)) - Math.PI / 2 + Math.PI / 2);
  ctx.fillStyle = PALETTE.ringNext;
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.lineTo(10, 9);
  ctx.lineTo(0, 3);
  ctx.lineTo(-10, 9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = PALETTE.ringNext;
  ctx.font = '700 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('NEXT RING', px, py + 28);
}

function panel(ctx, w, h) {
  ctx.fillStyle = 'rgba(13,17,21,0.78)';
  roundRect(ctx, W / 2 - w / 2, H / 2 - h / 2, w, h, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawTitle(ctx, world, best) {
  ctx.save();
  ctx.translate(0, -64);
  panel(ctx, 640, 300);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.ringNext;
  ctx.font = '800 54px sans-serif';
  ctx.fillText('AURORA RING RUN', W / 2, H / 2 - 92);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '400 19px sans-serif';
  ctx.fillText('Twelve gold rings over a dawn valley. Thread them all,', W / 2, H / 2 - 48);
  ctx.fillText('then put her down gently on the runway.', W / 2, H / 2 - 20);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '400 16px sans-serif';
  ctx.fillText('Steer: arrow keys or WASD, or hold the mouse   ·   Throttle: R / F', W / 2, H / 2 + 26);
  ctx.fillText('Climb and dive trade speed for height — watch the stall.', W / 2, H / 2 + 54);
  ctx.fillStyle = PALETTE.good;
  ctx.font = '700 21px sans-serif';
  ctx.fillText('Press any key to fly', W / 2, H / 2 + 102);
  if (best > 0) {
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '600 15px sans-serif';
    ctx.fillText(`Best score so far: ${best}`, W / 2, H / 2 + 132);
  }
  ctx.restore();
}

function drawOver(ctx, world, best) {
  const s = world.state;
  panel(ctx, 560, 320);
  ctx.textAlign = 'center';
  const title = s.result === 'landed' ? 'TOUCHDOWN — COURSE FLOWN'
    : s.result === 'timeup' ? 'OUT OF TIME'
      : 'DOWN IN THE VALLEY';
  ctx.fillStyle = s.result === 'landed' ? PALETTE.good : PALETTE.warn;
  ctx.font = '800 33px sans-serif';
  ctx.fillText(title, W / 2, H / 2 - 106);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '400 19px sans-serif';
  const lines = s.result === 'landed'
    ? ['Wheels down, rings done, dawn well spent.']
    : s.result === 'timeup'
      ? [`The clock ran out with ${s.ringsHit} of ${COURSE.rings} rings threaded.`]
      : s.ringsHit >= COURSE.rings
        ? ['Every ring threaded — but the landing went wrong.']
        : [`The valley floor arrived early, at ring ${Math.min(s.ringsHit + 1, COURSE.rings)} of ${COURSE.rings}.`];
  lines.forEach((line, i) => ctx.fillText(line, W / 2, H / 2 - 62 + i * 28));
  ctx.font = '700 26px monospace';
  ctx.fillText(`SCORE ${s.score}`, W / 2, H / 2 + 6);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '600 16px sans-serif';
  ctx.fillText(`Rings ${s.ringsHit}/${COURSE.rings}   ·   Time flown ${Math.floor(s.elapsed)}s   ·   Best ${Math.max(best, s.score)}`, W / 2, H / 2 + 44);
  ctx.fillStyle = PALETTE.good;
  ctx.font = '700 20px sans-serif';
  ctx.fillText('Press any key to fly again', W / 2, H / 2 + 102);
}

/** Draw one whole frame: world, plane, instruments, and the screen's overlay. */
export function drawScene(ctx, world, screen, best, t) {
  const s = world.state;
  const cam = makeCamera(s);
  const project = projector(cam);
  drawSky(ctx, cam, project);
  drawClouds(ctx, world, project, false);
  drawTerrain(ctx, world, cam, project);
  drawRunway(ctx, world, project);
  drawShadow(ctx, world, project);
  drawTrees(ctx, world, cam, project);
  drawRings(ctx, world, project);
  drawClouds(ctx, world, project, true);
  drawPlane(ctx, world, t, screen === SCREEN_TITLE ? 62 : 0);
  drawRingPointer(ctx, world, project);
  drawInstruments(ctx, world);
  drawHud(ctx, world, best);
  if (screen === SCREEN_TITLE) drawTitle(ctx, world, best);
  if (screen === SCREEN_OVER) drawOver(ctx, world, best);
  if (s.result === 'crashed' && screen === SCREEN_PLAY) {
    ctx.fillStyle = `rgba(120,20,10,${0.25 * s.shake})`;
    ctx.fillRect(0, 0, W, H);
  }
}
