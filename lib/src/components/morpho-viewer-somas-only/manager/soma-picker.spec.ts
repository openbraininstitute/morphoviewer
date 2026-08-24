import { decodeSomaPickColor } from "./soma-pick-codec";

/** What `readPixel` returns for a drawn soma: the 24-bit id `index + 1`. */
function pixel(id: number): Uint8Array {
  return new Uint8Array([id & 0xff, (id >> 8) & 0xff, (id >> 16) & 0xff, 255]);
}

describe("decodeSomaPickColor", () => {
  it("reads the clear colour as a miss, not as soma 0", () => {
    expect(decodeSomaPickColor(new Uint8Array([0, 0, 0, 255]))).toBeNull();
  });

  it("decodes the first soma", () => {
    expect(decodeSomaPickColor(pixel(1))).toBe(0);
  });

  it("round-trips across all three channels", () => {
    for (const index of [0, 254, 255, 256, 65535, 65536, 4_234_928]) {
      expect(decodeSomaPickColor(pixel(index + 1))).toBe(index);
    }
  });
});
