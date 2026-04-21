import {
  MorphoViewerSpikeRecord,
  type MorphoViewerTree,
  morphoViewerConvertMorphologyIntoTree,
} from "@bbp/morphoviewer";
import { tgdCalcRandom } from "@tolokoban/tgd";
import { assertType$ } from "@tolokoban/type-guards";
import React from "react";

export function useMorphologyTree(
  example: string,
  straightCylinders: boolean,
): [MorphoViewerTree | undefined | string, Morphology | undefined] {
  const [morpho, setMorpho] = React.useState<Morphology | undefined>(undefined);
  const [tree, setTree] = React.useState<MorphoViewerTree | undefined | string>(undefined);
  React.useEffect(() => {
    setTree(undefined);
    setMorpho(undefined);
    loadMorphology(example)
      .then((morphology) => {
        setMorpho(morphology);
        const tree = morphoViewerConvertMorphologyIntoTree(morphology, `Cell #${example}`);
        tree.useStraightCylinders = straightCylinders;
        setTree(tree);
      })
      .catch((error) => {
        console.error(error);
        const message = error instanceof Error ? error.message : JSON.stringify(error);
        setTree(message);
      });
  }, [example, straightCylinders]);
  return [tree, morpho];
}

async function loadMorphology(example) {
  const url = `assets/morpho/${example}.json`;
  const resp = await fetch(url);
  if (!resp || !resp.ok)
    throw new Error(`Unable to load URL: ${url}\nError #${resp.status}: ${resp.statusText}`);

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
      neuron_section_id: ["|", "number", "null"],
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

export function useRandomSpikes(): MorphoViewerSpikeRecord[] {
  return React.useMemo(makeRandomSpikes, []);
}

export function makeRandomSpikes() {
  const spikes: MorphoViewerSpikeRecord[] = [
    randomSpikes("IDREST_0.05", "#1a1ae6", 20),
    randomSpikes("IDREST_0.1625", "#e61abd", 40),
    randomSpikes("IDREST_0.0275", "#e66b1a", 60),
    randomSpikes("IDREST_0.03875", "#6be61a", 80),
    randomSpikes("IDREST_0.5", "#1ae6bd", 100),
  ];
  return spikes;
}

function randomSpikes(label: string, color: string, count: number): MorphoViewerSpikeRecord {
  const min = Math.random();
  const max = min + tgdCalcRandom(2, 3);
  const times: number[] = [];
  for (let i = 0; i < tgdCalcRandom(count / 2, count); i++) {
    times.push(tgdCalcRandom(min, max));
  }
  times.sort();
  return {
    label,
    color,
    spikesInSeconds: times,
    timeMinInSeconds: min,
    timeMaxInSeconds: max,
  };
}
