// Camera view-follow lerp state. Kept dependency-free so floor/hub/arena transition
// modules can reset it without creating an import cycle with render.ts.

const CAMERA_SPRING_RATE = 0.3;
let camX: number | null = null;
let camY: number | null = null;

/** Clears camera-lerp state; call on floor/hub transitions to avoid a cross-map swoosh. */
export function resetCameraLerp(): void {
  camX = null;
  camY = null;
}

/** Advances the lerped camera one frame toward (targetX, targetY), returning the new fractional position. */
export function stepCameraLerp(targetX: number, targetY: number): { x: number; y: number } {
  if (camX === null || camY === null) {
    camX = targetX;
    camY = targetY;
  } else {
    camX += (targetX - camX) * CAMERA_SPRING_RATE;
    camY += (targetY - camY) * CAMERA_SPRING_RATE;
  }
  return { x: camX, y: camY };
}
