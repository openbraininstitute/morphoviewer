import { MorphoViewerSomasOnly, MorphoViewerSpinner } from "@openbraininstitute/morphoviewer";
import { ViewOptions } from "@tolokoban/ui";
import React from "react";

import { useCellInfos } from "./hooks";

import styles from "./page.module.css";

export default function Page() {
  const [dataId, setDataId] = React.useState("c9e10151-8f07-4158-a3b3-205210ceb075");
  const cellInfos = useCellInfos(dataId);

  return (
    <div className={styles.page}>
      <ViewOptions value={dataId} onChange={setDataId}>
        <div key="c9e10151-8f07-4158-a3b3-205210ceb075">3'684 cells</div>
        <div key="964a878a-c580-4722-b891-1a078ea9aa76">211'712 cells</div>
      </ViewOptions>
      <div className={styles.viewer}>
        {!cellInfos && <MorphoViewerSpinner label="Circuit" />}
        {cellInfos && <MorphoViewerSomasOnly cellInfos={cellInfos} />}
      </div>
    </div>
  );
}
