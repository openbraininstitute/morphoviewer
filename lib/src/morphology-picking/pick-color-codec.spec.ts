import { decodePickColor, encodePickColor } from "./pick-color-codec";

/** The encoder's colour as the framebuffer stores it, and `readPixel` hands it back. */
function throughFramebuffer(index: number): Uint8Array {
  return new Uint8Array([...encodePickColor(index).map((c) => Math.round(c * 255)), 255]);
}

describe("pick colour codec", () => {
  it("reads the clear colour as a miss, not as index 0", () => {
    expect(decodePickColor(new Uint8Array([0, 0, 0, 255]))).toBeNull();
  });

  it("round-trips across all three channels", () => {
    for (const index of [1, 254, 255, 256, 65535, 65536, 4_234_928, 0xffffff]) {
      expect(decodePickColor(throughFramebuffer(index))).toBe(index);
    }
  });

  it("keeps the two pick passes of one buffer apart", () => {
    // Cell meshes number from 1 up, the soma cloud from 1 << 23: a decoded index says
    // which of the two drew the pixel, so both can share the buffer.
    expect(decodePickColor(throughFramebuffer(1 << 23))).toBe(1 << 23);
    expect(decodePickColor(throughFramebuffer((1 << 23) + 12))).toBe((1 << 23) + 12);
  });
});
