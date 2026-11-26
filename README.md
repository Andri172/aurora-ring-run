# Aurora Ring Run

A small flight game for the desktop browser, built from static files with no
library, no build step and no network request. You fly a little orange prop
plane over a dawn valley, thread twelve gold rings scattered around the
circuit, and finish by landing gently on the runway before the clock runs
out.

![Title screen](screenshots/1-start.jpg)

## How to play

Open `game/index.html` in desktop Chrome (or run `node serve.ts` and visit
http://localhost:8080). Press any key to fly.

- **Steer:** arrow keys or WASD, or hold the mouse and point
- **Throttle:** R to open it up, F to close it; Space is a short boost
- **Goal:** fly through the gold rings in order — the next one is lit and
  labelled, with a pointer at the screen edge when it is off-screen — then
  land on the runway: slow (under about 65 knots), gentle, wheels over the
  strip
- Climbing and diving trade speed for height. Let the speed fall too far and
  the wing stalls and the nose drops; the valley floor and the sea end the
  flight at once

Scoring: 250 points a ring, up to 120 more for passing near its centre, 600
for the landing plus 5 per second left on the clock.

## What is in the frame

A chase camera behind the plane: patchwork fields, pine woods, a river shore
and snow on the rim peaks, all projected point by point on a 2D canvas (no
WebGL). The instrument panel is live — airspeed, attitude indicator,
altimeter, vertical speed and throttle — and the HUD carries altitude, speed
and heading, a compass ribbon, the ring count and the clock. Sound is a
generated engine hum and a chime for each ring; there are no audio files.

## Layout

- `main.ts` — the hand-in program: copies the game and screenshots to the
  output folder and builds `dossier.json` with the vendored library
- `vendor/makefun-game.ts` — the make.fun game library, copied from the kit
  unchanged
- `game/` — the playable game: `index.html` plus ES modules under `src/`
  (`world.js` is the flight simulation, `render.js` the projector and
  instruments, `shots.js` the deterministic screenshot scenes)
- `screenshots/` — four real renders of the game's own code, staged by
  `game/src/shots.js` from the scenes in `shots.json`
- `serve.ts` — a tiny static server for playing locally

The valley, the ring course and every screenshot scene come from one seeded
random generator, so a seed always replays the same flight.
