import { tgdFullscreenToggle } from "@tolokoban/tgd";
import React from "react";

import { classNames } from "@/utils";

import { IconCenter } from "../icons/center";
import { IconFullscreen } from "../icons/fullscreen";
import MorphoViewerScalebar from "../morpho-viewer-scalebar";
import { type OctreeManager, useOctreeManager } from "./painter/manager";

import type { MorphoViewerOctreeProps } from "./types";

import styles from "./morpho-viewer-octree.module.css";

export function MorphoViewerOctree(props: MorphoViewerOctreeProps) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const manager = useOctreeManager(props);
  const handleFullscreen = () => {
    const div = ref.current;
    if (!div) return;

    tgdFullscreenToggle(div);
  };
  const handleResetCamera = () => {
    manager.resetCamera();
  };

  return (
    <div className={classNames(props.className, styles.morphoViewerOctree)} ref={ref}>
      <Canvas painterManager={manager} />
      <header>
        <button type="button" onClick={handleResetCamera}>
          <IconCenter />
        </button>
        <button type="button" onClick={handleFullscreen}>
          <IconFullscreen />
        </button>
      </header>
      {props.scalebar && (
        <MorphoViewerScalebar
          className={props.scalebar}
          spacePerPixelEvent={manager.eventScalebar}
        />
      )}
    </div>
  );
}

const Canvas = React.memo(({ painterManager }: { painterManager: OctreeManager }) => {
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
