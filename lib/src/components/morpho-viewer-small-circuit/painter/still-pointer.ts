/** A click may move this many pixels. More than that is a drag. */
const LOCATION_PICK_SLOP_IN_PIXELS = 5;

/** Whether the pointer stayed within click slop. `evt` x/y are clip coords (-1..1). */
export function isStillPointer(
  evt: { x: number; y: number; start: { x: number; y: number } },
  canvasWidth: number,
  canvasHeight: number
): boolean {
  if (canvasWidth <= 0 || canvasHeight <= 0) return true;

  const dxInPixels = ((evt.x - evt.start.x) * canvasWidth) / 2;
  const dyInPixels = ((evt.y - evt.start.y) * canvasHeight) / 2;
  return (
    Math.sqrt(dxInPixels * dxInPixels + dyInPixels * dyInPixels) <= LOCATION_PICK_SLOP_IN_PIXELS
  );
}
