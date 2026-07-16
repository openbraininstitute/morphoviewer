/** options for an image capture */
export interface MorphoViewerSignalSnapshotOptions {
  /** output image type. Defaults to `"image/png"`. */
  type?: "image/png" | "image/webp" | "image/jpeg";
  /** quality between `0` and `1` for lossy types (webp/jpeg). Defaults to `0.92`. */
  quality?: number;
}

export interface MorphoViewerSignalCameraResetOptions {
  /**
   * By default, the zoom is reset to 1.
   */
  zoom?: number;
}

/**
 * a request/response signal: the viewer registers a handler, the host calls
 * `dispatch()` and awaits the (async) result. Unlike a pub/sub event this has a
 * single handler and returns a value, so there's no need for a separate "ready"
 * event to carry the result back.
 */
export class MorphoViewerSignal<Input = void, Output = void> {
  private handler: ((args: Input) => Output | Promise<Output>) | undefined;

  constructor(handler?: (args: Input) => Output | Promise<Output>) {
    this.handler = handler;
  }

  /** run the registered handler. Rejects when nothing is registered yet. */
  async dispatch(args: Input): Promise<Output> {
    if (!this.handler) throw new Error("MorphoViewerSignal: no handler registered yet.");
    return this.handler(args);
  }

  /** register the handler; returns a function that unregisters it. */
  register(handler: (args: Input) => Output | Promise<Output>): () => void {
    this.handler = handler;
    return () => {
      if (this.handler === handler) this.handler = undefined;
    };
  }
}

/**
 * imperative signal bus shared with a viewer (`MorphoViewerSomasOnly`,
 * `MorphoViewerSmallCircuit`).
 */
export class MorphoViewerSignals {
  /** dispatch to reset the camera to fit the scene's bounding box */
  public readonly cameraReset = new MorphoViewerSignal<
    MorphoViewerSignalCameraResetOptions | undefined
  >();
  /**
   * dispatch to capture the current view as an image (the gizmo is excluded).
   *
   * @returns the captured image, or `null` when the viewer isn't ready. The
   * image's `src` is an object URL the host is responsible for using and
   * revoking.
   */
  public readonly snapshot = new MorphoViewerSignal<
    MorphoViewerSignalSnapshotOptions | undefined,
    HTMLImageElement | null
  >();
}
