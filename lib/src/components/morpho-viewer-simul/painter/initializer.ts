import { MorphoViewerTree } from "../types/public";
import { MorphologyData } from "./morphology-data";

/**
 * To be able to initialize the viewer, we need a `canvas`
 * and a `morphology`. But we don't know when we will receive
 * them, nor in what order.
 */
export abstract class Initializer {
  //#region canvas
  private _canvas: HTMLCanvasElement | null = null;

  get canvas() {
    return this._canvas;
  }
  set canvas(value: HTMLCanvasElement | null) {
    if (this._canvas === value) return;

    this._canvas = value;
    if (!value) this.delete();
    else this.initializeWhenReady();
  }
  //#endregion

  //#region morphology
  private _morphology: MorphoViewerTree | null = null;

  get morphology() {
    return this._morphology;
  }
  set morphology(value: MorphoViewerTree | null) {
    if (JSON.stringify(this._morphology) === JSON.stringify(value)) return;

    this._morphology = value;
    this.initializeWhenReady();
  }
  //#endregion

  private initializeWhenReady() {
    const { canvas, morphology } = this;
    if (canvas && morphology) {
      this.initialize(canvas, new MorphologyData(morphology));
    }
  }

  protected abstract initialize(
    canvas: HTMLCanvasElement,
    data: MorphologyData,
  ): void;

  abstract delete(): void;
}
