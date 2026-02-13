import type { TgdDataset, TgdPainterSegmentsData } from "@tolokoban/tgd";
import type { MorphoViewerTree } from "../types/public";
import { makeSegments3D, makeSegmentsDendrogram } from "./segments";
import { Structure } from "./structure";

export class MorphologyData {
  public readonly structure: Structure;

  public readonly dataset3D: TgdDataset;

  public readonly segments3D = new Map<number, TgdPainterSegmentsData>();

  public readonly datasetDendrogram: TgdDataset;

  public readonly segmentsDendrogram = new Map<
    number,
    TgdPainterSegmentsData
  >();

  constructor(morphology: MorphoViewerTree) {
    this.structure = new Structure(morphology);
    console.log("🐞 [morphology-data@22] this.structure =", this.structure); // @FIXME: Remove this line written on 2026-02-13 at 15:56
    const segments3D = makeSegments3D(this.structure, this.segments3D);
    this.dataset3D = segments3D.makeDataset();
    const segmentsDendrogram = makeSegmentsDendrogram(
      this.structure,
      this.segmentsDendrogram,
    );
    this.datasetDendrogram = segmentsDendrogram.makeDataset();
  }
}
