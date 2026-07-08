import {
  MorphoViewerIconCameraOrtho,
  MorphoViewerIconCameraPersp,
  MorphoViewerSomasOnly,
  type MorphoViewerSomasOnlyProps,
  MorphoViewerSpinner,
} from "@openbraininstitute/morphoviewer";
import { useLocalStorageState, ViewOptions } from "@tolokoban/ui";
import React from "react";

import { ScalebarSettings } from "@/components/scalebar-settings";

import { useCellInfos } from "./hooks";

import styles from "./page.module.css";

export default function Page() {
  const [scalebar, setScalebar] = React.useState<MorphoViewerSomasOnlyProps["scalebar"]>(true);
  const [cameraType, setCameraType] = useLocalStorageState<"orthographic" | "perspective">(
    "orthographic",
    "MorphoViewerSomasOnly/cameraType"
  );
  const [species, setSpecies] = useLocalStorageState("mouse", "MorphoViewerSomasOnly/species");
  const [dataId, setDataId] = useLocalStorageState(
    "c9e10151-8f07-4158-a3b3-205210ceb075",
    "MorphoViewerSomasOnly/dataId"
  );
  const cellInfos = useCellInfos(dataId);

  return (
    <div className={styles.page}>
      <ViewOptions value={dataId} onChange={setDataId}>
        <div key="c9e10151-8f07-4158-a3b3-205210ceb075">3'684 cells</div>
        <div key="fly">127'400 cells</div>
        <div key="964a878a-c580-4722-b891-1a078ea9aa76">211'712 cells</div>
        <div key="big">4'234'929 cells</div>
      </ViewOptions>
      <div className={styles.viewer}>
        {!cellInfos && <MorphoViewerSpinner label="Circuit" />}
        {cellInfos && (
          <MorphoViewerSomasOnly
            somaRadius={SOMAS_RADII[species] ?? 10}
            cellInfos={cellInfos}
            onMinimize={() => alert("onMinimize()")}
            onClose={() => alert("onClose()")}
            scalebar={scalebar}
            gizmo
            cameraType={cameraType}
            controls={[
              <ViewOptions key="species" value={species} onChange={setSpecies}>
                <div key="fly">Fly</div>
                <div key="mouse">Mouse</div>
                <div key="rat">Rat</div>
                <div key="human">Human</div>
                <div key="alien">Alien</div>
              </ViewOptions>,
              <ViewOptions key="camera-type" value={cameraType} onChange={setCameraType}>
                <div key="orthographic">
                  <MorphoViewerIconCameraOrtho />
                </div>
                <div key="perspective">
                  <MorphoViewerIconCameraPersp />
                </div>
              </ViewOptions>,
              "reset-camera",
              "fullscreen",
            ]}
          />
        )}
      </div>
      <ScalebarSettings value={scalebar} onChange={setScalebar} />
    </div>
  );
}

const SOMAS_RADII = {
  fly: 4,
  mouse: 12,
  rat: 15,
  human: 20,
  alien: 200,
};
