import { ViewButton, ViewPanel, ViewProgress } from "@tolokoban/ui";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";

import Bbox from "../components/bbox";
import { SuccessGrid } from "../components/success-grid";
import { useBBoxHandler, useSelectFileHandler } from "./hooks";

import styles from "./page.module.css";

export default function Page() {
  const { handleSelectFile, files, progress, filesBad, filesGood, message, markdown } =
    useSelectFileHandler();
  const { bbox, handleComputeBBox } = useBBoxHandler();

  return (
    <div className={styles.page}>
        <ViewPanel gap="M" display="flex">
      <ViewButton onClick={handleComputeBBox}>Compute BBox of GLB file</ViewButton>
      {files.length === 0 && (
          <ViewButton onClick={handleSelectFile}>Open a LODs description file</ViewButton>
        )}
      {files.length > 0 && progress >= 1 && (
          <ViewButton onClick={() => globalThis.location.reload()}>Restart</ViewButton>
        )}</ViewPanel>
        <Bbox bbox={bbox} />
      {progress > 0 && progress < 1 && files.length > 0 && (
        <ViewProgress value={(100 * progress) / files.length} fullwidth />
      )}
      <SuccessGrid filesBad={filesBad} filesGood={filesGood} />
      {message && <pre>{message}</pre>}
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
        {markdown}
      </Markdown>
    </div>
  );
}
