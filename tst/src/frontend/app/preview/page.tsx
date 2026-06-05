import {
  MorphoViewerOctree,
  type MorphoViewerOctreeInfo,
  type MorphoViewerOctreeMeshType,
} from "@openbraininstitute/morphoviewer";
import { TgdDataGlb, tgdCalcRandom } from "@tolokoban/tgd";
import { assertType$ } from "@tolokoban/type-guards";

import { API } from "../../api";

import styles from "./page.module.css";

export default function () {
  const path = decodeURIComponent(globalThis.location.search.slice(1));

  return (
    <div className={styles.fullscreen}>
      <MorphoViewerOctree
        className={styles.viewer}
        meshId={path}
        loadInfo={loadInfo}
        loadBlock={loadBlock}
        scalebar
        gizmo
      />
    </div>
  );
}

async function loadInfo(meshId: string): Promise<MorphoViewerOctreeInfo | null> {
  const data = await API.fileLoadJSON(meshId);
  assertType$<{
    bbox: MorphoViewerOctreeInfo["bbox"];
    files: string[];
  }>(data, {
    bbox: {
      min: ["array", "number"],
      max: ["array", "number"],
    },
    files: ["array", "string"],
  });
  return {
    bbox: data.bbox,
    blockIds: data.files.map((filename) => filename.split(".")[0]),
  };
}

async function loadBlock(
  meshId: string,
  blockId: string
): Promise<MorphoViewerOctreeMeshType | null> {
  const path = `${meshId.slice(0, -"lod.json".length)}${blockId}.glb`;
  const glbContent = await API.fileLoad(path);
  if (!glbContent) return null;

  return {
    type: "glb",
    data: glbContent.content,
    color: randomColor(),
  };
}

function randomColor() {
  return `hsl(${tgdCalcRandom(360)}, ${tgdCalcRandom(50, 100)}%, ${tgdCalcRandom(40, 60)}%)`;
}
