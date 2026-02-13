import { getColorFromGeneratedPalette } from "./colors";
import type { MorphoViewerSimulContentProps } from "./types/private";
import type { MorphoViewerElectrodeRecording } from "./types/public";

export function useRecordingsAndInjection(
  props: MorphoViewerSimulContentProps,
) {
  const addRecording = (sectionName: string, offset: number) => {
    const recordings = props.recordings ?? [];
    const recording: MorphoViewerElectrodeRecording = {
      offset,
      origin: "recording",
      color: getColorFromGeneratedPalette((recordings ?? []).length),
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

// function useRecordingsAndInjection_BACKUP(sessionId: string) {
//     const recordingsKey = getSessionKey(
//         RECORDING_LOCATION_CONFIGURATION_SESSION_KEY,
//         sessionId
//     )
//     const [recordings, updateRecordings] = useAtom(
//         RecordLocationConfigurationAtomFamily(recordingsKey)
//     )
//     const injectionKey = getSessionKey(
//         STIMULATION_PROTOCOL_CONFIGURATION_SESSION_KEY,
//         sessionId
//     )
//     const [injection, updateInjection] = useAtom(
//         StimulationConfigurationAtomFamily(injectionKey)
//     )

//     return {
//         recordings: recordings.filter(({ origin }) => origin !== "injection"),
//         addRecording: (sectionName: string, offset: number) => {
//             updateRecordings([
//                 ...recordings,
//                 {
//                     offset,
//                     origin: "recording",
//                     color: getColorFromGeneratedPalette(recordings.length),
//                     record_currents: false,
//                     section: sectionName,
//                 },
//             ])
//         },
//         injection,
//         moveInjection: (sectionName: string) =>
//             updateInjection({ ...injection, inject_to: sectionName }),
//     }
// }
