import { MorphoViewerOctree, type MorphoViewerOctreeProps } from "@openbraininstitute/morphoviewer";
import { assertType } from "@tolokoban/type-guards";
import { IconGear, ViewLabel, ViewOptions } from "@tolokoban/ui";
import React from "react";

import { GizmoSettings } from "@/components/gizmo-settings";

import Styles from "./page.module.css";

export default function PageMorphoViewerOctree() {
  const [meshId, setMeshId] = React.useState("1");
  const [gizmo, setGizmo] = React.useState<boolean | MorphoViewerOctreeProps["gizmo"]>(true);
  const [loadingInProgress, setLoadingInProgress] = React.useState(0);
  const [bytesLoaded, setBytesLoaded] = React.useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: we really want to reset bytresLoad when meshId changes.
  React.useEffect(() => setBytesLoaded(0), [meshId]);
  console.log("🐞 [page@15] bytesLoaded =", bytesLoaded); // @FIXME: Remove this line written on 2026-05-08 at 16:08
  console.log("🐞 [page@14] loadingInProgress =", loadingInProgress); // @FIXME: Remove this line written on 2026-05-08 at 16:01

  return (
    <div className={Styles.morphoViewerOctree}>
      <footer>
        <div>Loaded so far:</div>
        <div>{(bytesLoaded / (1024 * 1024)).toFixed(3)} Mb</div>
        <div></div>
        {loadingInProgress > 0 && (
          <>
            <IconGear animate />
            <div>
              Loading {loadingInProgress} block{loadingInProgress > 1 ? "s" : ""}...
            </div>
          </>
        )}
      </footer>
      <MorphoViewerOctree
        className={Styles.octree}
        meshId={meshId}
        gizmo={gizmo}
        scalebar
        loadInfo={async (meshId: string) => {
          const url = `./assets/octree/${meshId}/lod.json`;
          console.debug("Loading info:", url);
          const resp = await fetch(url);
          if (!resp.ok) {
            throw new Error(
              `Unable to get info file: ${url}!\nError #${resp.status}: ${resp.statusText}`
            );
          }
          const data = await resp.json();
          assertType(data, {
            bbox: {
              min: ["array", "number"],
              max: ["array", "number"],
            },
            files: ["array", "string"],
          });
          return {
            bbox: data.bbox as BBox,
            blockIds: data.files.map((filename) => filename.split(".")[0]),
          };
        }}
        loadBlock={async (meshId: string, blockId: string) => {
          try {
            setLoadingInProgress((v) => v + 1);
            const url = `./assets/octree/${meshId}/${blockId}.glb`;
            console.debug("Loading:", url);
            const resp = await fetch(url);
            if (!resp.ok) {
              console.error(
                `Unable to get block file: ${url}!\nError #${resp.status}: ${resp.statusText}`
              );
              return null;
            }
            const data = await resp.arrayBuffer();
            setBytesLoaded((v) => v + data.byteLength);
            return {
              type: "glb",
              data,
            };
          } catch (ex) {
            console.error(ex);
            return null;
          } finally {
            setLoadingInProgress((v) => v - 1);
          }
        }}
      />
      <header>
        <ViewLabel>Choose the mesh:</ViewLabel>
        <ViewOptions value={meshId} onChange={setMeshId}>
          <div key="1">Example #1</div>
          <div key="2">Example #2</div>
        </ViewOptions>
        <GizmoSettings value={gizmo} onChange={setGizmo} />
      </header>
    </div>
  );
}

interface BBox {
  min: [number, number, number];
  max: [number, number, number];
}
