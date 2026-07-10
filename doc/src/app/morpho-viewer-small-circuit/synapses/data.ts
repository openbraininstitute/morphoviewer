import type { MorphoViewerSmallCircuitCell } from "@openbraininstitute/morphoviewer";

const COLORS = {
  soma: "#aaa",
  axon: "#f30",
  apicalDendrite: "rgb(78, 204, 247)",
  basalDendrite: "rgb(0, 130, 173)",
  myelin: "#b2f",
  unknown: "#f80",
};

const CIRCUIT: MorphoViewerSmallCircuitCell[] = [
  {
    center: [-50, 0, 0],
    orientation: [0, 0, 0, 1],
    // id: "AA0622.swc",
    id: "17302_00065.swc",
    somaRadius: 50,
    color: COLORS,
  },
  // {
  //     center: [+50, 0, 0],
  //     orientation: [0, 0, 0, 1],
  //     id: "2062129966.swc",
  //     somaRadius: 50,
  //     color: COLORS
  // }
];

export function useCircuit(): MorphoViewerSmallCircuitCell[] {
  return CIRCUIT;
}
