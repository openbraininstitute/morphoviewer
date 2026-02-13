import React from "react";

import {
  morphoViewerConvertMorphologyIntoTree,
  MorphoViewerTree,
} from "@bbp/morphoviewer";
import { assertType$ } from "@tolokoban/type-guards";

export function useMorphologyTree(): MorphoViewerTree | undefined | string {
  const [tree, setTree] = React.useState<MorphoViewerTree | undefined | string>(
    undefined,
  );
  React.useEffect(() => {
    setTree(undefined);
    loadMorphology()
      .then((morphology) => {
        const tree = morphoViewerConvertMorphologyIntoTree(
          morphology,
          "single cell",
        );
        setTree(tree);
      })
      .catch((error) => {
        console.error(error);
        const message =
          error instanceof Error ? error.message : JSON.stringify(error);
        setTree(message);
      });
  }, []);
  return tree;
}

async function loadMorphology() {
  const url = "assets/morpho-01.json";
  const resp = await fetch(url);
  if (!resp || !resp.ok)
    throw new Error(
      `Unable to load URL: ${url}\nError #${resp.status}: ${resp.statusText}`,
    );

  const data: unknown = await resp.json();
  assertType$<Morphology>(data, [
    "map",
    {
      index: "number",
      name: "string",
      nseg: "number",
      distance_from_soma: "number",
      sec_length: "number",
      xstart: ["array", "number"],
      xend: ["array", "number"],
      xcenter: ["array", "number"],
      xdirection: ["array", "number"],
      ystart: ["array", "number"],
      yend: ["array", "number"],
      ycenter: ["array", "number"],
      ydirection: ["array", "number"],
      zstart: ["array", "number"],
      zend: ["array", "number"],
      zcenter: ["array", "number"],
      zdirection: ["array", "number"],
      segx: ["array", "number"],
      diam: ["array", "number"],
      length: ["array", "number"],
      distance: ["array", "number"],
      neuron_segments_offset: ["array", "number"],
      neuron_section_id: "number",
      segment_distance_from_soma: ["array", "number"],
    },
  ]);
  return data;
}

interface MorphologySection {
  index: number;
  name: string;
  nseg: number;
  distance_from_soma: number;
  sec_length: number;
  xstart: number[];
  xend: number[];
  xcenter: number[];
  xdirection: number[];
  ystart: number[];
  yend: number[];
  ycenter: number[];
  ydirection: number[];
  zstart: number[];
  zend: number[];
  zcenter: number[];
  zdirection: number[];
  segx: number[];
  diam: number[];
  length: number[];
  distance: number[];
  neuron_segments_offset: number[];
  neuron_section_id: number;
  segment_distance_from_soma: number[];
}

type Morphology = Record<string, MorphologySection>;
function tgdLoadText(arg0: string) {
  throw new Error("Function not implemented.");
}
