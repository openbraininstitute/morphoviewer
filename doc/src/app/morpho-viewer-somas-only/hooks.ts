import type { MorphoViewerSpikes } from "@openbraininstitute/morphoviewer";
import { assertType$ } from "@tolokoban/type-guards";
import React from "react";

export interface CellInfo {
  morphologyId: string;
  position: [number, number, number];
}

export function useCellInfos(dataId: string) {
  const [cellInfos, setCellInfos] = React.useState<CellInfo[] | undefined>(undefined);
  React.useEffect(() => {
    setCellInfos(undefined);
    loadNodes(dataId).then(setCellInfos).catch(console.error);
  }, [dataId]);
  return cellInfos;
}

async function loadNodes(dataId: string): Promise<CellInfo[]> {
  const url = `assets/circuit-cloud/${dataId}.gz`;
  const response = await fetch(url);
  const blob = await response.blob();
  const ds = new DecompressionStream("gzip");
  const stream = blob.stream().pipeThrough(ds);
  const buff = await new Response(stream).arrayBuffer();
  const view = new DataView(buff);
  const BPE = Float32Array.BYTES_PER_ELEMENT;
  const stride = BPE * 4;
  const count = Math.floor(buff.byteLength / stride);
  const data: CellInfo[] = [];
  for (let i = 0; i < count; i++) {
    const ptr = i * stride;
    const x = view.getFloat32(ptr, true);
    const y = view.getFloat32(ptr + 1 * BPE, true);
    const z = view.getFloat32(ptr + 2 * BPE, true);
    const morphologyId = view.getFloat32(ptr + 3 * BPE, true).toString();
    data.push({
      morphologyId,
      position: [x, y, z],
    });
  }
  return data;
}

/**
 * One second of Poisson firing across the circuit, for tuning the glow by eye.
 *
 * Unlike the small-circuit demo's version this never sorts: the biggest preset
 * here is four million somas, and sorting a spike per cell would mean an index
 * array bigger than the spikes. Times are drawn as ascending gaps instead, so
 * the train comes out ordered by construction.
 */
export function useRandomSpikes(cellCount: number): MorphoViewerSpikes | undefined {
  return React.useMemo(() => {
    if (cellCount === 0) return undefined;

    const timeMaxInMs = 1000;
    // Enough that something is always firing, few enough that four million
    // cells stay inside a typed array the browser will actually allocate.
    const count = Math.min(cellCount * 4, 8_000_000);
    const cellIndices = new Uint32Array(count);
    const times = new Float32Array(count);
    const meanGapInMs = timeMaxInMs / count;
    let timeInMs = 0;
    for (let i = 0; i < count; i++) {
      // Exponential gaps: what a Poisson process actually produces, and what
      // makes the glow look like firing rather than like a metronome.
      timeInMs += -Math.log(1 - Math.random()) * meanGapInMs;
      cellIndices[i] = Math.floor(Math.random() * cellCount);
      times[i] = timeInMs;
    }
    return { cellIndices, times, timeMinInMs: 0, timeMaxInMs: Math.max(timeInMs, timeMaxInMs) };
  }, [cellCount]);
}
