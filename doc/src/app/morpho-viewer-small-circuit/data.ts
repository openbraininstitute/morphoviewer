import type { MorphoViewerSmallCircuitCell } from "@bbp/morphoviewer";
import { assertType$, isType, isType$ } from "@tolokoban/type-guards";
import React from "react";

export function useCircuit() {
  const [circuit, setCircuit] = React.useState<MorphoViewerSmallCircuitCell[]>(
    [],
  );
  React.useEffect(() => {
    const action = async () => {
      try {
        const resp = await fetch("./assets/nodes.json");
        const content = await resp.text()
        const circuit = JSON.parse(content);
        setCircuit(
          circuit
            .map(convertNode)
            .filter((item: null | MorphoViewerSmallCircuitCell) => !!item),
        );
      } catch (error) {
        console.error("Unable to load nodes.json:", error);
      }
    };
    action();
  }, []);
  return circuit;
}

function convertNode(item: unknown): null | MorphoViewerSmallCircuitCell {
  try {
    assertType$<{
      color?: string;
      morphology_path: string;
      orientation: [number, number, number, number];
      position: [number, number, number];
      soma_radius: number;
    }>(item, {
      color: ["?", "string"],
      morphology_path: "string",
      orientation: ["array", "number", { min: 4, max: 4 }],
      position: ["array", "number", { min: 3, max: 3 }],
      soma_radius: "number",
    });

    return {
      id: item.morphology_path,
      center: item.position,
      orientation: item.orientation,
      somaRadius: item.soma_radius,
      color: item.color ?? nextColor(),
    };
  } catch (error) {
    console.error("Invalid node item:", item, error);
    return null;
  }
}

const COLORS = ["#28f", "#e82", "#3f4", "##f53"];
let colorIndex = 0;

function nextColor() {
  const color = COLORS[colorIndex];
  colorIndex = (colorIndex + 1) % COLORS.length;
  return color;
}

export const CIRCUIT: MorphoViewerSmallCircuitCell[] = [
  {
    id: "1",
    center: [0, 0, 0],
    orientation: [0, 0, 0, 1],
    somaRadius: 10,
    color: "#f53",
  },
  {
    id: "2",
    center: [124, -43, 0],
    orientation: [0.218508, -0.218508, 0.6724985, 0.6724985],
    somaRadius: 10,
    color: "#3f4",
  },
  {
    id: "3",
    center: [0, 100, -54],
    orientation: [-0.3415064, 0.6707343, -0.3629097, 0.54935],
    somaRadius: 10,
    color: "#28f",
  },
  {
    id: "4",
    center: [-89, 66, -50],
    orientation: [0, 0, 0, 1],
    somaRadius: 10,
    color: "#e82",
  },
];
