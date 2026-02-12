export interface MorphoViewerElectrodeRecording {
  section: string;
  offset: number;
  record_currents: boolean;
  origin: "injection" | "recording";
  color?: string | undefined;
}

export interface MorphoViewerElectrodeInjection {
  inject_to: string;
}

export interface MorphoViewerElectrodesProps {
  recordings?: MorphoViewerElectrodeRecording[];
  onRecordingsChange?(
    this: void,
    recordings: MorphoViewerElectrodeRecording[],
  ): void;
  injection?: MorphoViewerElectrodeInjection | undefined;
  onInjectionChange?(
    this: void,
    injections: MorphoViewerElectrodeInjection | undefined,
  ): void;
}

export interface MorphoViewerSimulProps extends MorphoViewerElectrodesProps {
  morphology: MorphoViewerTree;
  synapses?: Array<{
    color: string;
    data: Float32Array;
  }>;
  disableClick?: boolean;
}

export type MorphoViewerMode = "3d" | "dendrogram";

export enum MorphoViewerTreeItemType {
  Soma = 0,
  /**
   * We make a difference between Dendrite and BasalDendrite.
   * If the morphology has no ApicalDendrite, then the basal dendrites
   * are called simply Dendrite.
   */
  Dendrite,
  BasalDendrite,
  ApicalDendrite,
  Myelin,
  Axon,
  Selected,
  /**
   * Can be used for horizontal lines in dendrogram mode.
   * Such segments are not interactive.
   */
  Liaison,
  Unknown,
}

export interface MorphoViewerTreeItem {
  x: number;
  y: number;
  z: number;
  radius: number;
  type: MorphoViewerTreeItemType;
  sectionId: string;
  segmentId: string;
  children?: MorphoViewerTreeItem[];
}

export interface MorphoViewerTree {
  cellId: string;
  roots: MorphoViewerTreeItem[];
}
