import type { MorphoViewerTree } from "../morpho-viewer-simul";

export interface MorphoViewerSmallCircuitCell {
  id: string;
  center: [x: number, y: number, z: number];
  orientation: [x: number, y: number, z: number, w: number];
  somaRadius: number;
  color?: string;
}

export type MorphoViewerSmallCircuitCellData = {
  type: "tree";
  data: MorphoViewerTree;
};

export interface MorphoViewerSmallCircuitProps {
  className?: string;
  backgroundColor?: string;
  circuit: MorphoViewerSmallCircuitCell[];
  highlightedCellIds?: string[];
  onCellHover?(cell: MorphoViewerSmallCircuitCell | undefined): void;
  onCellClick?(cell: MorphoViewerSmallCircuitCell | undefined): void;
  onClose?(): void;
  /**
   * A function to load a cell.
   * @param id Unique identifier of the cell from attribute `circuit`.
   */
  loadCell(id: string): Promise<MorphoViewerSmallCircuitCellData | null>;
  /**
   * This callback is called when the loading starts (with a value of __0__),
   * then every time a cell is loaded.
   *
   * @param progress Percentage of loaded cells so far. Between `0.0` and `1.0`.
   */
  onLoadProgress?(progress: number): void;
}
