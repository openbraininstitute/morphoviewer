import type { MorphoViewerSmallCircuitCell } from "../../types";

/**
 * The colour a cell drawn as a soma alone falls back to when it names none.
 *
 * `PainterCell` rolls a random colour per cell instead. A cloud cannot: it is rebuilt whole on
 * every update, so a random colour would repaint every context soma the moment anything else
 * in the scene moved.
 */
const DEFAULT_SOMA_COLOR = "#888";

/** What a soma cloud is built from: one instance per cell, in circuit order. */
export interface SomaCloudData {
  /** The cells drawn, in instance order — instance `i` is `cells[i]`. */
  cells: MorphoViewerSmallCircuitCell[];
  /** `[x, y, z, radius]` per cell. */
  dataPoint: Float32Array;
  /** `[u, v]` per cell: `u` picks the palette column, `v` is unused. */
  dataUV: Float32Array;
  /** The distinct colours of those cells, one column each. */
  palette: string[];
}

/**
 * Gather the cells that draw as a soma and nothing else into one instanced cloud.
 *
 * Both passes that draw them — the visible cloud and its silhouette in the pick buffer — build
 * from here, so a soma's instance number means the same thing in both and a click resolves to
 * the cell the eye was on.
 */
export function buildSomaCloudData(
  circuit: readonly MorphoViewerSmallCircuitCell[]
): SomaCloudData {
  // Truthy, not `=== true`: `updateCircuit` and both pick buffers decide the same thing the
  // same way, and a cell they agree to leave to the cloud has to end up in it — one left out
  // of every pass is drawn nowhere, picked nowhere, and counted as loading nowhere either.
  const cells = circuit.filter((cell) => Boolean(cell.somaOnly));
  const palette: string[] = [];
  const columnByColor = new Map<string, number>();
  const columns = cells.map((cell) => {
    const color = somaColor(cell.color);
    const known = columnByColor.get(color);
    if (known !== undefined) return known;

    const column = palette.length;
    palette.push(color);
    columnByColor.set(color, column);
    return column;
  });
  const dataPoint = new Float32Array(cells.length * 4);
  const dataUV = new Float32Array(cells.length * 2);
  cells.forEach((cell, index) => {
    const [x, y, z] = cell.center;
    // Written one float at a time: `set` would take a 4-element JS array per cell, and this
    // runs for every context soma in the scene.
    dataPoint[index * 4] = x;
    dataPoint[index * 4 + 1] = y;
    dataPoint[index * 4 + 2] = z;
    dataPoint[index * 4 + 3] = cell.somaRadius;
    // The middle of the column: the palette is one pixel wide per colour, sampled NEAREST.
    dataUV[index * 2] = (columns[index] + 0.5) / palette.length;
    dataUV[index * 2 + 1] = 0.5;
  });
  return { cells, dataPoint, dataUV, palette };
}

/** One colour per cell: a cell coloured per section type contributes the one its soma wears. */
function somaColor(color: MorphoViewerSmallCircuitCell["color"]): string {
  if (!color) return DEFAULT_SOMA_COLOR;

  return typeof color === "string" ? color : color.soma;
}
