import { MorphoViewerOctree, type MorphoViewerOctreeProps } from "@openbraininstitute/morphoviewer";
import { assertType } from "@tolokoban/type-guards";
import { ViewLabel, ViewOptions } from "@tolokoban/ui";
import React from "react";

import { GizmoSettings } from "@/components/gizmo-settings";

import Styles from "./page.module.css";

export default function PageMorphoViewerOctree() {
  const [meshId, setMeshId] = React.useState("1");
  const [gizmo, setGizmo] = React.useState<boolean | MorphoViewerOctreeProps["gizmo"]>(true);

  return (
    <div className={Styles.morphoViewerOctree}>
      <header>
        <ViewLabel>Choose the mesh:</ViewLabel>
        <ViewOptions value={meshId} onChange={setMeshId}>
          <div key="1">Example #1</div>
          <div key="2">Example #2</div>
        </ViewOptions>
        <GizmoSettings value={gizmo} onChange={setGizmo} />
      </header>
      <MorphoViewerOctree
        className={Styles.octree}
        meshId={meshId}
        gizmo={gizmo}
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
          const url = `./assets/octree/${meshId}/${blockId}.glb`;
          console.debug("Loading:", url);
          const resp = await fetch(url);
          if (!resp.ok) {
            console.error(
              `Unable to get info file: ${url}!\nError #${resp.status}: ${resp.statusText}`
            );
            return null;
          }
          return {
            type: "glb",
            data: await resp.arrayBuffer(),
          };
        }}
      />
    </div>
  );
}

interface BBox {
  min: [number, number, number];
  max: [number, number, number];
}
