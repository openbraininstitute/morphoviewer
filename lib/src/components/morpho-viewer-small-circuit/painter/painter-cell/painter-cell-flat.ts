import { PainterCell } from "./painter-cell";

import type { TgdContext } from "@tolokoban/tgd";
import type { MorphoViewerSmallCircuitCell, MorphoViewerSmallCircuitCellData } from "../../types";

export interface PainterCellFlatOptions {
  cell: MorphoViewerSmallCircuitCell;
  loadCell(id: string): Promise<MorphoViewerSmallCircuitCellData | null>;
}

export class PainterCellFlat extends PainterCell {
  constructor(context: TgdContext, options: PainterCellFlatOptions) {
    super(context, {
      ...options,
      material: "flat",
    });
  }
}
