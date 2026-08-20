import { PainterCell } from "./painter-cell";

import type { TgdContext } from "@tolokoban/tgd";
import type { MorphoViewerSmallCircuitCell, MorphoViewerSmallCircuitCellData } from "../../types";

export interface PainterCellIdOptions {
  id: number;
  cell: MorphoViewerSmallCircuitCell;
  loadCell(id: string): Promise<MorphoViewerSmallCircuitCellData | null>;
}

export class PainterCellId extends PainterCell {
  constructor(context: TgdContext, options: PainterCellIdOptions) {
    super(context, {
      ...options,
      material: options.id,
    });
  }
}
