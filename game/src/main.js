// Aurora Ring Run — boot, the fixed-step loop, screens and sound.
// The valley is seeded from ?seed= (default 1); ?shot=start|play|end stages a
// deterministic scene for the screenshots instead of starting the live game.

import { BEST_KEY, STEP, VIEW } from './config.js';
import { createInput } from './input.js';
import { createWorld, EVENT_LANDED, EVENT_OVER, EVENT_RING } from './world.js';
import { drawScene, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW.width;
canvas.height = VIEW.height;
const status = document.getElementById('status');

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 1) || 1;
const world = createWorld(seed);
const input = createInput(window);

let best = 0;
try { best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0; } catch { best = 0; }

// --- Sound: a small generated engine hum and ring chime, no audio files. ---
let audio = null;
function ensureAudio() {
  if (audio) return;
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const filter = ac.createBiquadFilter();
    osc.type = 'sawtooth';
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    gain.gain.value = 0;
    osc.connect(filter).connect(gain).connect(ac.destination);
    osc.start();
    audio = { ac, osc, gain };
  } catch { audio = null; }
}
function chime() {
  if (!audio) return;
  const { ac } = audio;
  for (const [at, freq] of [[0, 880], [0.09, 1318]]) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.12, ac.currentTime + at);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + at + 0.35);
    o.connect(g).connect(ac.destination);
    o.start(ac.currentTime + at);
    o.stop(ac.currentTime + at + 0.4);
  }
}

// --- Screens and flow ---
let screen = SCREEN_TITLE;
let overAt = 0;
const shot = params.get('shot');
if (shot) {
  const staged = stageShot(shot, world);
  screen = staged.screen;
  best = Math.max(best, staged.best);
  drawScene(ctx, world, screen, best, 1.6);
  window.__shotReady = true;
} else {
  let last = performance.now();
  let acc = 0;
  let started = false;
  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    const controls = input.poll(canvas.clientWidth, canvas.clientHeight);
    if (!started && input.state.anyKey) {
      started = true;
      screen = SCREEN_PLAY;
      ensureAudio();
    }
    while (acc >= STEP) {
      acc -= STEP;
      if (screen === SCREEN_PLAY) {
        const events = world.step(STEP, controls);
        if (events & EVENT_RING) chime();
        if (events & EVENT_OVER) {
          overAt = now;
          screen = SCREEN_OVER;
          if (world.state.score > best) {
            best = world.state.score;
            try { localStorage.setItem(BEST_KEY, String(best)); } catch { /* private mode */ }
          }
        }
      }
    }
    if (screen === SCREEN_OVER && input.state.anyKey && now - overAt > 900) {
      world.reset();
      screen = SCREEN_PLAY;
      input.state.anyKey = false;
    }
    if (audio) {
      const s = world.state;
      audio.osc.frequency.value = 52 + s.throttle * 46 + s.speed * 0.22;
      audio.gain.gain.value = screen === SCREEN_PLAY ? 0.045 + s.throttle * 0.03 : 0.012;
    }
    drawScene(ctx, world, screen, best, now / 1000);
    status.textContent = `Altitude ${Math.round(world.state.alt * 3.281)} feet, speed ${Math.round(world.state.speed * 1.944)} knots, rings ${world.state.ringsHit} of 12, score ${world.state.score}.`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void EVENT_LANDED;
