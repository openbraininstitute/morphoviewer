import { TgdEvent } from "@tolokoban/tgd";

/** options for an image capture */
export interface MorphoViewerSnapshotOptions {
  /** output image type. Defaults to `"image/png"`. */
  type?: "image/png" | "image/webp" | "image/jpeg";
  /** quality between `0` and `1` for lossy types (webp/jpeg). Defaults to `0.92`. */
  quality?: number;
}

/**
 * imperative signal bus shared with a viewer (`MorphoViewerSomasOnly`,
 * `MorphoViewerSmallCircuit`).
 */
export class MorphoViewerSignals {
  /** dispatch to reset the camera to fit the scene's bounding box */
  public readonly cameraReset = new TgdEvent<void>();
  /** dispatch to capture the current view as an image (the gizmo is excluded) */
  public readonly snapshot = new TgdEvent<MorphoViewerSnapshotOptions | undefined>();
  /**
   * dispatched by the viewer once a {@link snapshot} has been rendered. The
   * image's `src` is an object URL the host is responsible for using and
   * revoking.
   */
  public readonly snapshotReady = new TgdEvent<HTMLImageElement>();
}
