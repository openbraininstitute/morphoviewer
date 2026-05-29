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
  console.log("🐞 [hooks@15] cellInfos =", cellInfos); // @FIXME: Remove this line written on 2026-05-29 at 17:45
  return cellInfos;
}

async function loadNodes(dataId: string): Promise<CellInfo[]> {
  const url = `assets/circuit-cloud/${dataId}.json.gz`;
  const response = await fetch(url);
  const blob = await response.blob();
  const ds = new DecompressionStream("gzip");
  const stream = blob.stream().pipeThrough(ds);
  const text = await new Response(stream).text();
  // amazonq-ignore-next-line
  const data = JSON.parse(text);
  assertType$<CellInfo[]>(data, [
    "array",
    {
      morphologyId: "string",
      position: ["array", "number", { min: 3, max: 3 }],
    },
  ]);
  console.log("🐞 [hooks@34] data =", data); // @FIXME: Remove this line written on 2026-05-29 at 17:44
  return data;
}
