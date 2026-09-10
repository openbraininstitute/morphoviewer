import { type TgdBoundingBox, TgdVec3 } from "@tolokoban/tgd";

/**
 * Slack left around a framed scene. Fitting a bounding box fits it exactly,
 * which puts the outermost cells hard against the edge of the canvas, and the
 * box is only padded by one soma radius: nothing at region scale.
 */
export const FRAME_MARGIN = 1.1;

/**
 * The far plane that keeps `scene` whole for a camera standing `distance` away
 * at `position`.
 *
 * Fitting a box sizes the depth slab to it as well as the frame, so a camera
 * framing part of a scene would leave the rest behind the far plane. Both
 * viewers need the plane pushed back past everything they hold, whichever
 * subset they chose to frame.
 */
export function farPlaneCovering(
  scene: Readonly<TgdBoundingBox>,
  position: Readonly<TgdVec3>,
  distance: number
): number {
  const [width, height, depth] = scene.size;
  const radius = 0.5 * Math.hypot(width, height, depth);
  return distance + TgdVec3.distance(position, scene.center) + radius;
}
