// The world: one valley, one runway, a course of rings, and the plane that
// flies it. Pure simulation — no drawing, no DOM — stepped at a fixed rate so
// a seed always replays the same flight.

import { COURSE, PLANE, WORLD } from './config.js';
import { createRandom, makeNoise2d } from './random.js';

export const EVENT_RING = 1;
export const EVENT_MISSED = 2;
export const EVENT_OVER = 4;
export const EVENT_LANDED = 8;
export const EVENT_STALL = 16;

/** The runway: a flat strip on the valley floor, pointing north. */
export const RUNWAY = { x: 0, z: -520, length: 760, width: 46, altitude: 6, heading: 0 };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

export function createWorld(seed) {
  const random = createRandom(seed * 7919 + 13);
  const hills = makeNoise2d(random, 8);
  const detail = makeNoise2d(random, 16);

  /**
   * Ground height at a point. Rolling hills inland, a mountain rim far to the
   * north and west, the sea eating the south edge, and a flat apron carved
   * around the runway so the strip always sits on level ground.
   */
  function terrainHeight(x, z) {
    const half = WORLD.size / 2;
    const nx = (x + half) / WORLD.size;
    const nz = (z + half) / WORLD.size;
    let h = hills(nx * 6, nz * 6) * 150 + detail(nx * 14, nz * 14) * 36 - 52;
    // Mountain rim: rises toward the north-west corner.
    const rim = Math.max(0, (nz - 0.62) / 0.38) * 320 + Math.max(0, (0.24 - nx) / 0.24) * 190;
    h += rim * rim / 320;
    // The south shore falls away into the sea.
    const shore = clamp((z + 1180) / 260, 0, 1);
    h = lerp(-14, h, shore);
    // A gentle valley bowl around the middle keeps the course flyable.
    const d = Math.hypot(x, z + 200) / 1500;
    h *= clamp(0.35 + d * 0.75, 0.35, 1);
    // Flatten the runway apron.
    const inX = clamp(1 - (Math.abs(x - RUNWAY.x) - RUNWAY.width) / 130, 0, 1);
    const inZ = clamp(1 - (Math.abs(z - RUNWAY.z) - RUNWAY.length / 2) / 160, 0, 1);
    const flat = Math.min(inX, inZ);
    return lerp(h, RUNWAY.altitude, flat * flat);
  }

  // The ring course: a wide circuit that leaves the runway heading north,
  // swings east over the valley, climbs toward the rim, and comes home.
  const rings = [];
  {
    const courseRandom = createRandom(seed * 104729 + 7);
    const legs = [
      { x: 60, z: 120, alt: 150 }, { x: 420, z: 620, alt: 190 },
      { x: 950, z: 980, alt: 235 }, { x: 1420, z: 820, alt: 285 },
      { x: 1560, z: 260, alt: 330 }, { x: 1180, z: -260, alt: 300 },
      { x: 700, z: -560, alt: 235 }, { x: 330, z: -180, alt: 185 },
      { x: 520, z: 330, alt: 215 }, { x: 120, z: 760, alt: 170 },
      { x: -260, z: 420, alt: 200 }, { x: -120, z: -60, alt: 130 },
    ];
    for (let i = 0; i < COURSE.rings; i += 1) {
      const p = legs[i % legs.length];
      const next = legs[(i + 1) % legs.length];
      const jitter = (courseRandom() - 0.5) * 30;
      rings.push({
        x: p.x + jitter, z: p.z + jitter, alt: p.alt + (courseRandom() - 0.5) * 24,
        // The hoop faces along the leg toward the next ring.
        nx: next.x - p.x, nz: next.z - p.z,
        passed: false, missed: false,
      });
      const ring = rings[i];
      const len = Math.hypot(ring.nx, ring.nz) || 1;
      ring.nx /= len; ring.nz /= len;
    }
  }

  // Set dressing the renderer picks up: clouds and pine trees, seeded once.
  const clouds = [];
  for (let i = 0; i < 42; i += 1) {
    clouds.push({
      x: (random() - 0.5) * WORLD.size * 1.15,
      z: (random() - 0.5) * WORLD.size * 1.15,
      alt: 330 + random() * 260,
      size: 90 + random() * 190,
      drift: 1.5 + random() * 2.5,
    });
  }
  const trees = [];
  for (let i = 0; i < 900; i += 1) {
    const x = (random() - 0.5) * WORLD.size * 0.96;
    const z = (random() - 0.5) * WORLD.size * 0.96;
    const h = terrainHeight(x, z);
    if (h > 12 && h < 300 && Math.abs(x - RUNWAY.x) > RUNWAY.width + 26) {
      trees.push({ x, z, alt: h, s: 0.75 + random() * 0.9 });
    }
  }

  const state = {
    // Plane kinematics. Heading 0 is north (+z), positive turns east (+x).
    x: RUNWAY.x, z: RUNWAY.z - 240, alt: PLANE.startAltitude,
    heading: 0, pitch: 0.02, bank: 0,
    speed: PLANE.startSpeed, throttle: 0.62,
    score: 0, ringsHit: 0, ringIndex: 0,
    timeLeft: COURSE.timeLimit, elapsed: 0,
    result: 'flying', // flying | landed | crashed | timeup
    message: '', messageTtl: 0,
    stalled: false, lastRingDist: null, prevSide: null,
    shake: 0, finalApproach: false, finalSettle: 0,
  };

  function reset() {
    state.x = RUNWAY.x; state.z = RUNWAY.z - 240; state.alt = PLANE.startAltitude;
    state.heading = 0; state.pitch = 0.02; state.bank = 0;
    state.speed = PLANE.startSpeed; state.throttle = 0.62;
    state.score = 0; state.ringsHit = 0; state.ringIndex = 0;
    state.timeLeft = COURSE.timeLimit; state.elapsed = 0;
    state.result = 'flying';
    state.message = 'Fly the gold rings — then land on the runway';
    state.messageTtl = 4;
    state.stalled = false; state.prevSide = null; state.shake = 0; state.finalApproach = false; state.finalSettle = 0;
    for (const ring of rings) { ring.passed = false; ring.missed = false; }
  }
  reset();

  const onRunway = () => Math.abs(state.x - RUNWAY.x) <= RUNWAY.width / 2 + 6
    && Math.abs(state.z - RUNWAY.z) <= RUNWAY.length / 2;

  /**
   * Advance the flight by dt seconds under `controls`
   * ({pitch, roll, throttle, boost}, each axis -1..1). Returns EVENT_* bits.
   */
  function step(dt, controls) {
    if (state.result !== 'flying') return 0;
    let events = 0;
    state.elapsed += dt;
    state.timeLeft -= dt;
    if (state.messageTtl > 0) state.messageTtl -= dt;

    // Throttle and speed: pitch trades speed for height, boost is a shove.
    // The constants settle near 57 m/s at cruise throttle, about 75 flat out
    // and 38 throttled back, before pitch and boost have their say.
    state.throttle = clamp(state.throttle + controls.throttle * dt * 0.55, 0, 1);
    const power = state.throttle * PLANE.throttleAccel * 1.64;
    const drag = PLANE.drag * state.speed * Math.abs(state.speed) * 0.062 + state.speed * 0.05;
    const slope = -Math.sin(state.pitch) * 26;
    state.speed += (power - drag + slope) * dt;
    if (controls.boost) state.speed += 9 * dt;
    state.speed = clamp(state.speed, 12, PLANE.maxSpeed + 22);

    // Attitude: the stick moves pitch and bank toward where it is held.
    const stall = state.speed < PLANE.minSpeed;
    if (stall && !state.stalled) events |= EVENT_STALL;
    state.stalled = stall;
    const pitchTarget = controls.pitch * 0.46 + (stall ? -0.34 : 0);
    const bankTarget = controls.roll * PLANE.maxBank;
    state.pitch += clamp(pitchTarget - state.pitch, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);
    state.bank += clamp(bankTarget - state.bank, -PLANE.rollRate * dt, PLANE.rollRate * dt);

    // Heading follows the bank; a wing held over turns the plane.
    const turnRate = Math.sin(state.bank) * PLANE.turnPerBank * Math.sqrt(PLANE.cruiseSpeed / Math.max(state.speed, 18));
    state.heading += turnRate * dt;

    // Move: forward along heading and pitch, with a settle when slow.
    const climb = Math.sin(state.pitch) * state.speed * PLANE.climbPerPitch
      - (stall ? PLANE.gravitySink * 1.7 : PLANE.gravitySink * (1 - state.speed / (PLANE.maxSpeed * 1.6)));
    state.x += Math.sin(state.heading) * Math.cos(state.pitch) * state.speed * dt;
    state.z += Math.cos(state.heading) * Math.cos(state.pitch) * state.speed * dt;
    state.alt += climb * dt;
    state.alt = Math.min(state.alt, WORLD.ceiling);

    // Leaving the valley turns you around gently rather than ending the run.
    const half = WORLD.size / 2 - 60;
    if (Math.abs(state.x) > half || Math.abs(state.z) > half) {
      state.x = clamp(state.x, -half, half);
      state.z = clamp(state.z, -half, half);
      state.message = 'Valley edge — turning back in';
      state.messageTtl = 2;
    }

    // The active ring: crossing its plane inside the hoop scores.
    const ring = rings[state.ringIndex];
    if (ring) {
      const dx = state.x - ring.x;
      const dz = state.z - ring.z;
      const side = dx * ring.nx + dz * ring.nz;
      if (state.prevSide !== null && Math.sign(side) !== Math.sign(state.prevSide) && Math.abs(side) < 30) {
        const radial = Math.hypot(dx - side * ring.nx, state.alt - ring.alt, dz - side * ring.nz);
        if (radial <= COURSE.ringRadius) {
          ring.passed = true;
          state.ringsHit += 1;
          const centred = 1 - radial / COURSE.ringRadius;
          const gained = COURSE.ringPoints + Math.round(COURSE.centreBonus * centred);
          state.score += gained;
          state.message = `Ring ${state.ringsHit} of ${COURSE.rings} — +${gained}`;
          state.messageTtl = 2.4;
          events |= EVENT_RING;
          state.ringIndex += 1;
          if (state.ringIndex >= COURSE.rings) {
            state.message = 'Course complete — land on the runway!';
            state.messageTtl = 5;
          }
        } else if (Math.abs(state.alt - ring.alt) < 90 && Math.hypot(dx, dz) < 130) {
          ring.missed = true;
          state.message = 'Missed the ring — on to the next';
          state.messageTtl = 2.2;
          events |= EVENT_MISSED;
          state.ringIndex += 1;
          if (state.ringIndex >= COURSE.rings) {
            state.message = 'That was the last ring — land on the runway!';
            state.messageTtl = 5;
          }
        }
      }
      state.prevSide = side;
    }

    // Ground, sea and the landing itself.
    const ground = terrainHeight(state.x, state.z);
    const floor = Math.max(ground, WORLD.seaLevel);
    if (state.alt <= floor + 1.6) {
      const gentle = state.speed <= COURSE.finishSpeed && climb > -7;
      if (onRunway() && state.alt <= RUNWAY.altitude + 2.2 && gentle && state.ringIndex >= COURSE.rings) {
        state.result = 'landed';
        state.score += COURSE.landingPoints + Math.max(0, Math.round(state.timeLeft) * 5);
        events |= EVENT_LANDED | EVENT_OVER;
      } else {
        state.result = 'crashed';
        state.shake = 1;
        events |= EVENT_OVER;
      }
    }
    if (state.timeLeft <= 0 && state.result === 'flying') {
      state.result = 'timeup';
      events |= EVENT_OVER;
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 1.4);
    return events;
  }

  return { state, rings, clouds, trees, terrainHeight, reset, step, seed };
}
