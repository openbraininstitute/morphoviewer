/* eslint-disable no-bitwise */
/**
 * How a pick pass writes an index as a colour, and reads it back from a pixel.
 *
 * 24 bits across the three channels, low byte in red, so an index comes back
 * exactly rather than rounded through a float. Index `0` is spoken for: every
 * pass clears to black, and an untouched pixel must not decode to the first
 * thing drawn — so each pass starts its numbering at 1 and takes the offset off
 * again on the way out.
 *
 * Its own module, free of `@tolokoban/tgd`, for the same reason as
 * `segment-index-codec`: a codec is the part worth a unit test, and the
 * painters around it need a WebGL context no test environment has.
 */

/** The red, green and blue an index is drawn as, each in `0..1`. */
export function encodePickColor(index: number): [number, number, number] {
  return [(index & 0xff) / 255, ((index >> 8) & 0xff) / 255, ((index >> 16) & 0xff) / 255];
}

/** The index written at this pixel, or `null` where nothing was drawn. */
export function decodePickColor(pixel: Readonly<Uint8Array>): number | null {
  const index = pixel[0] + (pixel[1] << 8) + (pixel[2] << 16);
  return index === 0 ? null : index;
}
