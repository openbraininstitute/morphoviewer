import type { PainterManager } from "../painter";
import { MorphoViewerSimulProps } from "./public";

export interface MorphologySection {
  index: number;
  name: string;
  nseg: number;
  distance_from_soma: number;
  sec_length: number;
  xstart: number[];
  xend: number[];
  xcenter: number[];
  xdirection: number[];
  ystart: number[];
  yend: number[];
  ycenter: number[];
  ydirection: number[];
  zstart: number[];
  zend: number[];
  zcenter: number[];
  zdirection: number[];
  segx: number[];
  diam: number[];
  length: number[];
  distance: number[];
  neuron_segments_offset: number[];
  neuron_section_id: number;
  segment_distance_from_soma: number[];
}

export type Morphology = Record<string, MorphologySection>;

export interface MorphoViewerSimulContentProps extends MorphoViewerSimulProps {
  painterManager: PainterManager;
}
