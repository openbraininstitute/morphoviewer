import type { LocationMarker } from "./painter-location-markers";

/** Distinct marker colours, plus the palette slot each marker uses. */
export function buildMarkerPalette(
  markers: readonly LocationMarker[],
  fallback: string
): { palette: string[]; slots: number[] } {
  const palette: string[] = [];
  const slotByColor = new Map<string, number>();
  const slots = markers.map((marker) => {
    const color = marker.color ?? fallback;
    const known = slotByColor.get(color);
    if (known !== undefined) return known;

    const slot = palette.length;
    palette.push(color);
    slotByColor.set(color, slot);
    return slot;
  });
  return { palette, slots };
}
