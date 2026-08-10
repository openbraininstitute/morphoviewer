/**
 * Encoding of a segment index for the GPU pick buffer.
 *
 * Encoder and decoder are only correct as a pair. The `+1.5` reserves bucket 0 for "nothing
 * drawn here": the pass clears to black, so an untouched pixel reads back as `0` and must not
 * decode to segment 0.
 */

/** Encode `index` for a cell of `count` segments as a value in `0..1`. */
export function encodeSegmentIndex(index: number, count: number): number {
  return (index + 1.5) / (count + 2);
}

/** Decode a pixel value to a segment index. Negative means the pixel held no segment. */
export function decodeSegmentIndex(value: number, count: number): number {
  return Math.floor((count + 2) * value) - 1;
}

const spiralCache = new Map<number, ReadonlyArray<readonly [number, number]>>();

/**
 * Pixel offsets to probe around a point, nearest first, so a near miss still resolves.
 *
 * Cached per radius: callers probe on every pointer move, and the offsets never change.
 */
export function spiralPixelOffsets(radius: number): ReadonlyArray<readonly [number, number]> {
  const cached = spiralCache.get(radius);
  if (cached) return cached;

  const offsets: Array<[number, number]> = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      offsets.push([dx, dy]);
    }
  }
  offsets.sort((a, b) => a[0] ** 2 + a[1] ** 2 - (b[0] ** 2 + b[1] ** 2));
  spiralCache.set(radius, offsets);
  return offsets;
}
