// Aurora Ring Run — every tuning number and colour in one place.
// The view is a fixed 1280x720 logical frame; the renderer scales it to the
// window, so no rule below depends on the screen size. Distances are metres,
// speeds are metres per second unless a name says otherwise.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second at any refresh rate. */
export const STEP = 1 / 60;

/** World bounds: the valley is a square; the sea borders it to the south. */
export const WORLD = {
  size: 4200,          // metres, x east / z north, centred on 0
  seaLevel: 0,
  ceiling: 900,
};

export const PLANE = {
  minSpeed: 21,         // below this the wing stalls and the nose drops
  cruiseSpeed: 52,
  maxSpeed: 96,
  throttleAccel: 14,    // m/s gained per second at full throttle
  drag: 0.055,          // quadratic-ish drag coefficient, applied simply
  pitchRate: 0.85,      // radians per second at full stick
  rollRate: 1.9,
  maxBank: 1.05,        // radians, about 60 degrees
  turnPerBank: 0.55,    // heading change per radian of bank, scaled by speed feel
  climbPerPitch: 0.92,  // share of velocity that pitch turns into climb
  gravitySink: 5.2,     // m/s the plane settles when slow and level
  startAltitude: 210,
  startSpeed: 54,
};

export const COURSE = {
  rings: 12,
  ringRadius: 26,       // metres; fly through the hoop
  ringTube: 2.6,
  timeLimit: 240,       // seconds on the clock
  ringPoints: 250,
  centreBonus: 120,     // extra for passing near the middle of a ring
  landingPoints: 600,
  finishAltitude: 4,    // below this over the runway, slow, counts as touchdown
  finishSpeed: 34,
};

export const CAMERA = {
  back: 34,             // metres behind the plane
  up: 11,               // metres above it
  lookAhead: 90,        // aim point in front of the plane
  fov: 1.25,            // horizontal-ish field of view factor
};

export const PALETTE = {
  skyTop: '#2e5f8a',
  skyMid: '#7fb2d9',
  skyLow: '#f6c177',
  sun: '#fff3c4',
  fog: '#cfdde8',
  water: '#2b6ea6',
  waterDeep: '#1f5a8c',
  sand: '#d9c08a',
  grassLow: '#69a357',
  grassHigh: '#4c8a4f',
  forest: '#2f6b3a',
  rock: '#8d8577',
  snow: '#f4f7f7',
  runway: '#4a4d52',
  runwayLine: '#f5f2e8',
  planeBody: '#e8833a',
  planeTrim: '#f7f3e8',
  planeDark: '#33393f',
  ringNext: '#ffd94d',
  ringDone: '#57d977',
  ringIdle: '#e8e4da',
  panel: '#20262c',
  panelEdge: '#39424b',
  dial: '#10151a',
  needle: '#ffb454',
  text: '#f2f5f7',
  muted: '#9fb2bd',
  warn: '#ff6b5e',
  good: '#6fe08a',
};

export const FONT = '"Avenir Next", "Segoe UI", system-ui, sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'aurora-ring-run.best';
