/**
 * The slice of the geometry that is on show, as an index range into the array
 * the viewer was handed.
 *
 * Read when the camera is fitted and at no other time. Changing it moves
 * nothing: a host putting another population on show gets the reset button to
 * frame that one, and the view stays where the user left it until they ask.
 *
 * The position and the zoom come from this range; the near and far planes still
 * come from the whole scene, so everything around the frame stays on screen.
 */
export interface MorphoViewerCameraFocus {
  /** Index of the first cell on show. */
  from: number;
  /** How many cells from {@link from}. */
  count: number;
}

/**
 * The range as the scene can use it, or `null` for "frame all of it".
 *
 * These are indices into an array the host built and the viewer only counted,
 * so the two go out of step whenever a host moves geometry and focus in the
 * wrong order. Framing the whole scene is the recoverable answer to that;
 * framing whichever cells the indices happen to land on is not, and neither is
 * doing it quietly.
 */
export function clampCameraFocus(
  focus: MorphoViewerCameraFocus | null | undefined,
  cellCount: number
): MorphoViewerCameraFocus | null {
  if (!focus) return null;

  const { from, count } = focus;
  if (
    Number.isInteger(from) &&
    Number.isInteger(count) &&
    from >= 0 &&
    count > 0 &&
    from + count <= cellCount
  ) {
    return focus;
  }
  console.warn(
    `MorphoViewer: camera focus [${from}, ${from + count}) is not inside the ${cellCount} cells of the scene; framing all of them.`
  );
  return null;
}
