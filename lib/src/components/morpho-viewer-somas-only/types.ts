import type { ArrayNumber3 } from "@tolokoban/tgd";

export interface MorphoViewerCellInfo {
  morphologyId: string;
  position: ArrayNumber3;
}

export interface MorphoViewerSomasOnlyProps {
  className?: string;
  cellInfos: MorphoViewerCellInfo[];
}
