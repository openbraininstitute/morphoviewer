import type { ArrayNumber3, TgdPainterGizmo, TgdPainterGizmoOptions } from "@tolokoban/tgd";

export type MorphoViewerOctreeMeshType = {
  type: "glb";
  data: ArrayBuffer;
};

export interface MorphoViewerOctreeInfo {
  bbox: {
    min: ArrayNumber3;
    max: ArrayNumber3;
  };
  blockIds: string[];
}

export interface MorphoViewerOctreeProps {
  className?: string;
  meshId: string;
  loadInfo(meshId: string): Promise<MorphoViewerOctreeInfo | null>;
  /**
   *
   * @param blockId Indentifier of a block, composed only of "0" and "1" chars.
   */
  loadBlock(meshId: string, blockId: string): Promise<MorphoViewerOctreeMeshType | null>;
  /**
   * Display the axes controller gizmo.
   * - `false`: do not show the Gizmo
   * - `true`: show it with default options
   * - `Partial<object>`:
   *   - `alignX`: -1 meand left and +1 means right
   *   - `alignY`: -1 meand bottom and +1 means top
   *   - `size`: size of the Gizmo side in pixels
   *   - `margin`: margin from the borders of the viewer (in pixels)
   */
  gizmo?: boolean | TgdPainterGizmoOptions;
}
