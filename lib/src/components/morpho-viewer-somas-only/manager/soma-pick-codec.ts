/**
 * The pixel a soma pick pass wrote, back to a soma index — or `null` where the
 * clear colour (black, id `0`) shows nothing was drawn.
 *
 * Counterpart of the ID shader in `soma-picker.ts`: 24 bits of
 * `gl_InstanceID + 1` across the three colour channels, low byte in red. The
 * pair caps out at 16.7 million somas, well past what the cloud can draw.
 *
 * Its own module, free of `@tolokoban/tgd`, for the same reason as
 * `segment-index-codec`: a codec is the part worth a unit test, and the picker
 * around it needs a WebGL context no test environment has.
 */
export function decodeSomaPickColor(pixel: Readonly<Uint8Array>): number | null {
  // eslint-disable-next-line no-bitwise
  const id = pixel[0] + (pixel[1] << 8) + (pixel[2] << 16);
  return id === 0 ? null : id - 1;
}
