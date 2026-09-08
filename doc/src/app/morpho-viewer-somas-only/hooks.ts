import { assertType$ } from "@tolokoban/type-guards";
import React from "react";

export interface CellInfo {
  morphologyId: string;
  position: [number, number, number];
}

/**
 * Sorted along Y, so that a contiguous range of them is a slab of the circuit.
 * A host's populations arrive grouped that way; this file's do not, and an
 * index range over them would name a third of the cells spread over all of it —
 * which is a camera focus that cannot be seen to work.
 */
export function useCellInfos(dataId: string) {
  const [cellInfos, setCellInfos] = React.useState<CellInfo[] | undefined>(undefined);
  React.useEffect(() => {
    setCellInfos(undefined);
    loadNodes(dataId)
      .then((cells) => setCellInfos(cells.sort((a, b) => a.position[1] - b.position[1])))
      .catch(console.error);
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
