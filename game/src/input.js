// Keyboard and mouse input, gathered into one plain object the world reads.
// Arrows or WASD fly the plane, R/F (or Shift/Ctrl) work the throttle, and a
// held mouse button steers toward the pointer. Nothing here knows the rules.

export function createInput(target) {
  const keys = new Set();
  const state = {
    pitch: 0,      // -1 nose down .. 1 nose up
    roll: 0,       // -1 bank left .. 1 bank right
    throttle: 0,   // -1 .. 1 adjustment while held
    boost: false,
    anyKey: false,
    pointerSteer: null, // {x, y} in -1..1 while the mouse is held
  };

  const down = (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    state.anyKey = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  };
  const up = (event) => keys.delete(event.code);
  target.addEventListener('keydown', down);
  target.addEventListener('keyup', up);
  target.addEventListener('blur', () => keys.clear());

  let pointer = null;
  target.addEventListener('pointerdown', (event) => { pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }; state.anyKey = true; });
  target.addEventListener('pointermove', (event) => { if (pointer && event.pointerId === pointer.id) { pointer.x = event.clientX; pointer.y = event.clientY; } });
  const release = (event) => { if (pointer && event.pointerId === pointer.id) pointer = null; };
  target.addEventListener('pointerup', release);
  target.addEventListener('pointercancel', release);

  /** Recompute the axes from whatever is held right now. Called once per step. */
  function poll(width, height) {
    const has = (code) => keys.has(code) ? 1 : 0;
    state.roll = (has('ArrowRight') + has('KeyD')) - (has('ArrowLeft') + has('KeyA'));
    state.pitch = (has('ArrowUp') + has('KeyW')) - (has('ArrowDown') + has('KeyS'));
    state.throttle = (has('KeyR') + has('ShiftLeft') + has('ShiftRight')) - (has('KeyF') + has('ControlLeft') + has('ControlRight'));
    state.boost = keys.has('Space');
    if (pointer) {
      state.pointerSteer = {
        x: Math.max(-1, Math.min(1, (pointer.x / width) * 2 - 1)),
        y: Math.max(-1, Math.min(1, (pointer.y / height) * 2 - 1)),
      };
      state.roll = state.pointerSteer.x;
      state.pitch = -state.pointerSteer.y;
    } else {
      state.pointerSteer = null;
    }
    state.roll = Math.max(-1, Math.min(1, state.roll));
    state.pitch = Math.max(-1, Math.min(1, state.pitch));
    return state;
  }

  return { poll, state };
}
