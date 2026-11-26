// The screenshot scenes behind ?shot=start|play|end. Each one flies the real
// rules forward from a fresh world with a simple autopilot at the stick — aim
// at the next ring, match its height, keep the speed up — so the frame is what
// a real flight looks like, and the same seed always gives the same frame.

import { PLANE, STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** One step of autopilot controls for the world's current state. */
function autopilot(world, fast = false) {
  const s = world.state;
  const ring = world.rings[s.ringIndex];
  let targetX;
  let targetZ;
  let targetAlt;
  let landing = false;
  if (ring) {
    targetX = ring.x; targetZ = ring.z; targetAlt = ring.alt;
  } else if (!s.finalApproach) {
    // Course done: run out over the sea south of the strip, then turn back.
    // The turn happens over the shore, not over the hills flanking the runway.
    targetX = 0; targetZ = -1450; targetAlt = 100;
    if (s.z < -1150 && Math.abs(s.x) < 250) s.finalApproach = true;
  } else {
    // The final, flown by heading command rather than point pursuit (which
    // S-curves at low speed): the commanded heading leans into the cross-track
    // error so the plane settles onto the centreline, and the height follows
    // a glide slope to the threshold once it is roughly lined up.
    landing = true;
    if (s.z > -700 && s.alt > 45) {
      // Floated past the strip still high: go around via the sea fix. Low
      // over the strip it is safer to let the final play out than to turn.
      s.finalApproach = false;
      targetX = 0; targetZ = -1450; targetAlt = 100;
    } else {
      const headingCmd = clamp(Math.atan2(-s.x, 420), -0.6, 0.6);
      let diff = headingCmd - s.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const glide = 8 + Math.max(0, -860 - s.z) * 0.1;
      const goal = Math.abs(s.x) < 70 ? glide : Math.max(glide, 60);
      // Pitch is feed-forward plus correction: the feed-forward term is the
      // attitude that exactly cancels the settle at this speed (the world
      // maps a stick input to 0.46 rad of attitude), and the correction
      // closes the height error. Without it the plane flies a steady
      // twenty metres under the glide and meets the ground beside the strip.
      const sink = PLANE.gravitySink * (1 - s.speed / (PLANE.maxSpeed * 1.6));
      const holdAttitude = Math.asin(clamp(sink / (s.speed * PLANE.climbPerPitch), -0.4, 0.4));
      const pitch = clamp((holdAttitude + Math.atan2(goal - s.alt, 300) * 1.8) / 0.46, -1, 1);
      // Landing speed only once the nose points north; bleeding speed off
      // during the turn onto final leaves the plane sinking over the shore.
      const northbound = Math.abs(Math.sin(s.heading)) < 0.45 && Math.cos(s.heading) > 0;
      const throttle = s.z > -1300 && northbound
        ? (s.speed > 32 ? -0.55 : s.speed < 27 ? 0.3 : 0)
        : (s.speed < 44 ? 0.5 : s.speed > 62 ? -0.4 : 0);
      return { pitch, roll: clamp(diff * 2.0, -1, 1), throttle, boost: false };
    }
  }
  const dx = targetX - s.x;
  const dz = targetZ - s.z;
  const dist = Math.hypot(dx, dz);
  const wanted = Math.atan2(dx, dz);
  let diff = wanted - s.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const roll = clamp(diff * (landing ? 2.1 : 1.35), -1, 1);
  const climbAngle = Math.atan2(targetAlt - s.alt, Math.max(dist, 60));
  // On the approach the pitch loop works harder: at landing speed the plane
  // settles several metres a second, and a gentle loop sinks beside the strip.
  const pitch = clamp(climbAngle * (landing ? 2.3 : 1.5) - s.pitch * 0.25, -1, 1);
  let throttle = s.speed < 44 ? 0.5 : s.speed > 62 ? -0.4 : 0;
  let boost = false;
  if (fast && !landing) {
    // The end scene flies the course briskly so the landing fits the clock.
    throttle = s.speed < 66 ? 0.6 : s.speed > 78 ? -0.4 : 0;
    boost = Math.abs(diff) < 0.18 && s.speed < 84;
  }
  return { pitch, roll, throttle, boost };
}

/**
 * Set `world` to the named scene (start, play or end; any other name is
 * start) and return the screen to draw over it and the score to beat.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'end' && name !== 'approach') {
    for (let i = 0; i < 5 / STEP; i += 1) world.step(STEP, { pitch: 0, roll: 0, throttle: 0, boost: false });
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'approach') {
    // The landing: fly the whole course, then stop at the first settled
    // moment of the final — northbound, low, still carrying speed, with the
    // runway filling the view ahead.
    for (let i = 0; i < 420 / STEP; i += 1) {
      const events = world.step(STEP, autopilot(world, true));
      if (events & EVENT_OVER) break;
      const s = world.state;
      const settled = s.finalApproach && Math.cos(s.heading) > 0 && Math.abs(Math.sin(s.heading)) < 0.35
        && Math.abs(s.x) < 120 && s.alt > 30 && s.alt < 70 && s.speed > 24 && s.z > -1150 && s.z < -900;
      if (settled) break;
    }
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  const seconds = name === 'play' ? 40 : 420;
  let events = 0;
  for (let i = 0; i < seconds / STEP; i += 1) {
    events = world.step(STEP, autopilot(world, name === 'end'));
    if (events & EVENT_OVER) break;
  }
  const over = world.state.result !== 'flying';
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}
