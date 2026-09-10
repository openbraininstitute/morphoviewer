import {
  type ArrayNumber3,
  type TgdBoundingBox,
  type TgdCamera,
  TgdCameraOrthographic,
  TgdVec3,
} from "@tolokoban/tgd";

/**
 * Slack around a framed scene. Fitting a bounding box fits it exactly, and the
 * box is padded by one soma radius, which is nothing at region scale.
 */
export const FRAME_MARGIN = 1.1;

/** The slab a camera draws between, measured from the eye. */
export interface DepthRange {
  near: number;
  far: number;
}

/**
 * The slab that keeps `scene` whole for a camera standing `distance` away at
 * `position`.
 *
 * Fitting a box sizes the depth range to it as well as the frame, so framing
 * part of a scene would leave the rest outside it. `near` comes back negative
 * when the scene reaches behind the eye, which an orthographic camera can draw
 * and a perspective one cannot.
 */
export function depthRangeCovering(
  scene: Readonly<TgdBoundingBox>,
  position: Readonly<TgdVec3>,
  distance: number
): DepthRange {
  const [width, height, depth] = scene.size;
  const radius = 0.5 * Math.hypot(width, height, depth);
  const reach = TgdVec3.distance(position, scene.center) + radius;
  return { near: distance - reach, far: distance + reach };
}

/**
 * Open `camera`'s slab up to `range`, never closing it in.
 *
 * A reset interpolates from wherever the camera stands now, so the slab has to
 * hold both ends of the move; one that only ever grows does.
 */
export function widenDepthRange(camera: TgdCamera, { near, far }: DepthRange) {
  if (far > camera.far) camera.far = far;
  // Only an orthographic slab can start behind the eye. A perspective frustum keeps
  // the near plane the fit gave it, rather than spend depth precision pulling it
  // towards zero.
  if (camera instanceof TgdCameraOrthographic && near < camera.near) camera.near = near;
}

/**
 * How far a box of `size` reaches along `axis`.
 *
 * A camera has to fit what is in front of it, which is the reach along its own
 * right and up rather than along X and Y — the same box turned 90° is as wide
 * as it was deep.
 */
export function extentAlong(size: Readonly<ArrayNumber3>, axis: Readonly<TgdVec3>): number {
  const [width, height, depth] = size;
  return width * Math.abs(axis.x) + height * Math.abs(axis.y) + depth * Math.abs(axis.z);
}
