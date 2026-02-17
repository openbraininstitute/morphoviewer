import { getColorFromGeneratedPalette } from "./colors";
import type { MorphoViewerSimulContentProps } from "./types/private";
import type { MorphoViewerElectrodeRecording } from "./types/public";

export function useRecordingsAndInjection(
  props: MorphoViewerSimulContentProps,
) {
  const addRecording = (sectionName: string, offset: number) => {
    const recordings = props.recordings ?? [];
    const existingColors = new Set<string>(recordings.map(rec => rec.color??""))
    let color = "#000"
    let index = 0
    for(;;){
        color = getColorFromGeneratedPalette(index++)
        if (!existingColors.has(color)) break;
    }
    const recording: MorphoViewerElectrodeRecording = {
      offset,
      origin: "recording",
      color,
      record_currents: false,
      section: sectionName,
    };
    props.onRecordingsChange?.([...recordings, recording]);
  };
  return {
    recordings: props.recordings ?? [],
    injection: props.injection,
    addRecording,
    moveInjection: (sectionName: string) => {
      props.onInjectionChange?.({
        ...props.injection,
        inject_to: sectionName,
      });
    },
  };
}