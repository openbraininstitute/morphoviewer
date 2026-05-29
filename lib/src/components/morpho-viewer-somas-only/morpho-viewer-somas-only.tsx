import React from "react";

import { classNames } from "@/utils";

import { type PainterManager, useManager } from "./manager";

import type { MorphoViewerSomasOnlyProps } from "./types";

import styles from "./morpho-viewer-somas-only.module.css";

export function MorphoViewerSomasOnly(props: MorphoViewerSomasOnlyProps) {
  const painterManager = useManager(props);

  return (
    <div className={classNames(props.className, styles.morphoViewerSomasOnly)}>
      <Canvas painterManager={painterManager} />
    </div>
  );
}

const Canvas = React.memo(({ painterManager }: { painterManager: PainterManager }) => {
  return (
    <canvas
      key="canvas"
      className={styles.webgl}
      ref={(canvas: HTMLCanvasElement | null) => {
        painterManager.canvas = canvas;
        return () => {
          painterManager.canvas = null;
        };
      }}
    />
  );
});
