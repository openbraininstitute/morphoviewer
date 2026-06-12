import type { ArrayNumber3 } from "@tolokoban/tgd";
import type { ControlsLayoutProps } from "../controls-layout";
import type { PropsForGizmo, PropsForScalebar } from "../types";

export interface MorphoViewerCellInfo {
  morphologyId: string;
  position: ArrayNumber3;
}

export type MorphoViewerSomasOnlyProps = PropsForGizmo &
  PropsForScalebar & {
    className?: string;
    somaRadius?: number;
    cellInfos: MorphoViewerCellInfo[];
    onClose?(): void;
    onMinimize?(): void;
    controls?: ControlsLayoutProps["content"];
  };
