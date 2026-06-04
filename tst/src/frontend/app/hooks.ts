import { TgdBoundingBox, TgdDataGlb, TgdVec3, tgdLoadGlb } from "@tolokoban/tgd";
import { assertType } from "@tolokoban/type-guards";
import React from "react";

import { API } from "../api";

interface GlbFile {
  path: string;
  error?: string;
  success?: boolean;
}

interface BlockBBox {
  bbox: TgdBoundingBox;
  item: GlbFile;
}

interface Report {
  error: {
    name: string;
    expected: TgdBoundingBox;
    got: TgdBoundingBox;
  }[];
  success: string[];
}

export function useBBoxHandler() {
  const [bbox, setBbox] = React.useState<TgdBoundingBox | null>(null);

  const handleComputeBBox = React.useCallback(async () => {
    try {
      const path = await API.fileSelect({ allowedExtensions: ["glb"] });
      if (!path) {
        // User's cancel.
        return;
      }

      const glbContent = await API.fileLoad(path);
      if (!glbContent) throw new Error("Not a valid GLB!");
      const data = await TgdDataGlb.parse(glbContent.content);
      const geometry = data.makeGeometry();
      const actualBBox = geometry.computeBoundingBox();
      setBbox(actualBBox);
    } catch (ex) {
      console.error("Unab le to compute BBox:", ex);
    }
  }, []);

  return { handleComputeBBox, bbox };
}

export function useSelectFileHandler() {
  const [selectedFile, setSelectedFile] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState("");
  const [files, setFiles] = React.useState<GlbFile[]>([]);
  const [filesGood, setFilesGood] = React.useState<string[]>([]);
  const [filesBad, setFilesBad] = React.useState<string[]>([]);
  const [progress, setProgress] = React.useState(0);
  const [markdown, setMarkdown] = React.useState("");

  const handleSelectFile = React.useCallback(async () => {
    try {
      setSelectedFile(null);
      setFilesBad([]);
      setFilesGood([]);
      const path = await API.fileSelect({ allowedExtensions: ["json"] });
      setMessage(path ?? "No file selected");
      if (!path) return;

      setSelectedFile(path);
      const data = await API.fileLoadJSON(path);
      assertType(data, {
        bbox: {
          min: ["array", "number"],
          max: ["array", "number"],
        },
        files: ["array", "string"],
      });
      const initialBBox = data.bbox;
      const margin = 1e-5 * Math.abs(initialBBox.max[0] - initialBBox.min[0]);
      setMessage(`Number of blocks: ${data.files.length}`);
      const maxFileLength = data.files.reduce((prev, curr) => Math.max(prev, curr.length - 4), 0);
      const maxLevels = Math.floor(maxFileLength / 3);
      const root = path.split("/").slice(0, -1).join("/");
      const items = data.files.map((f) => ({ path: `${root}/${f}` }));
      const availableBlocks = new Map<string, GlbFile>(
        items.map((item) => [item.path.split("/").slice(-1).join("").split(".")[0], item])
      );
      setFiles(items);
      const min = new TgdVec3(data.bbox.min[0], data.bbox.min[1], data.bbox.min[2]);
      const max = new TgdVec3(data.bbox.max[0], data.bbox.max[1], data.bbox.max[2]);
      const bbox = new TgdBoundingBox([min.x, min.y, min.z], [max.x, max.y, max.z]);
      const bboxes: BlockBBox[] = computeExpectedBBoxes(bbox, availableBlocks, maxLevels);
      const report: Report = {
        error: [],
        success: [],
      };
      for (const { bbox, item } of bboxes) {
        const glbContent = await API.fileLoad(item.path);
        setProgress((prev) => prev + 1);
        if (!glbContent) continue;

        const data = await TgdDataGlb.parse(glbContent.content);
        const geometry = data.makeGeometry();
        const actualBBox = geometry.computeBoundingBox();
        if (enlargeBBox(bbox, margin).containsBBox(actualBBox)) {
          item.success = true;
          report.success.push(item.path.split("/").pop() ?? "N/A");
          setFilesGood((list) => [...list, extractName(item.path)]);
        } else {
          item.error = `Misaligned bounding box!
Expected: ${formatBBox(bbox)}
Received: ${formatBBox(actualBBox)}
`;
          report.error.push({
            name: item.path.split("/").pop() ?? "N/A",
            expected: bbox,
            got: actualBBox,
          });
          setFilesBad((list) => [...list, extractName(item.path)]);
        }
        setFiles(items.slice());
      }
      setMarkdown(convertReportIntoMarkdown(report, initialBBox));
      await API.fileSaveText(`${root}/result.md`, convertReportIntoMarkdown(report, initialBBox));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : JSON.stringify(error));
    }
  }, []);

  return {
    selectedFile,
    handleSelectFile,
    message,
    files,
    filesGood,
    filesBad,
    progress,
    markdown,
  };
}

function computeExpectedBBoxes(
  bbox: TgdBoundingBox,
  availableBlocks: Map<string, GlbFile>,
  maxLevels: number
): BlockBBox[] {
  const list: BlockBBox[] = [];
  const recurse = (
    bbox: TgdBoundingBox,
    level: number,
    prefixX: string = "",
    prefixY: string = "",
    prefixZ: string = ""
  ) => {
    if (level > maxLevels) return;

    const id = prefixX ? `${prefixX}${prefixY}${prefixZ}` : "0";
    const block = availableBlocks.get(id);
    if (!block) return;

    list.push({ bbox, item: block });
    const [x0, y0, z0] = bbox.min;
    const [xM, yM, zM] = bbox.center;
    const [x1, y1, z1] = bbox.max;
    for (let x = 0; x < 2; x++) {
      const minX = x === 0 ? x0 : xM;
      const maxX = x === 0 ? xM : x1;
      for (let y = 0; y < 2; y++) {
        const minY = y === 0 ? y0 : yM;
        const maxY = y === 0 ? yM : y1;
        for (let z = 0; z < 2; z++) {
          const minZ = z === 0 ? z0 : zM;
          const maxZ = z === 0 ? zM : z1;
          recurse(
            new TgdBoundingBox([minX, minY, minZ], [maxX, maxY, maxZ]),
            level + 1,
            `${prefixX}${x}`,
            `${prefixY}${y}`,
            `${prefixZ}${z}`
          );
        }
      }
    }
  };
  recurse(bbox, 0);
  return list;
}

function formatBBox({ min, max }: TgdBoundingBox) {
  return `\`${min.map(pad).join(", ")} / ${max.map(pad).join(", ")}\``;
}

function pad(v: number) {
  return v.toFixed(3).padStart(12);
}

function convertReportIntoMarkdown(report: Report, bbox: { min: number[]; max: number[] }): string {
  return `# Result

Here is the bounding box defined in \`lods.json\`:

\`\`\`js
${JSON.stringify(bbox, null, 2)}
\`\`\`

<details>
<summary>List of correct blocks (${report.success.length}):</summary>

${report.success.length === 0 ? "none" : report.success.map((item) => `\`${item}\``).join(", ")}.
</details>

Number of misaligned blocks: ${report.error.length}.

${report.error
  .map(
    ({ name, expected, got }) => `
### Block __\`${name}\`__

|  | X min | Y min | Z min | X max | Y max | Z max |
|--|-------|-------|-------|-------|-------|-------|
| expected | ${expected.min.map((item) => `${item}`).join(" | ")} | ${expected.max.map((item) => `${item}`).join(" | ")} |
| but got  | ${got.min
      .map((item, index) => `${item < expected.min[index] ? `__${item}__` : item}`)
      .join(" | ")} | ${got.max
      .map((item, index) => `${item > expected.max[index] ? `__${item}__` : item}`)
      .join(" | ")} |

`
  )
  .join("\n")}
`;
}

function extractName(path: string): string {
  return path.split("/").slice(-1).join("").split(".")[0];
}

/**
 * We enlarge the BBox to fight float approximations errors.
 */
function enlargeBBox(bbox: TgdBoundingBox, margin: number) {
  const min = new TgdVec3(bbox.min);
  const max = new TgdVec3(bbox.max);
  const vec = new TgdVec3(margin, margin, margin);
  min.subtract(vec);
  max.add(vec);
  return new TgdBoundingBox([min.x, min.y, min.z], [max.x, max.y, max.z]);
}
