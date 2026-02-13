import { MorphoViewerSimul, MorphoViewerTree } from "@bbp/morphoviewer";
import { useMorphologyTree } from "./hook";
import { ViewSpinner } from "@tolokoban/ui";

import styles from "./page.module.css";

export default function Page() {
    const tree = useMorphologyTree();
    console.log("🐞 [page@9] tree =", tree); // @FIXME: Remove this line written on 2026-02-13 at 11:02

    return (
        <div className={styles.page}>
            <div>
                <h1>&lt;MorphoViewerSimul /&gt;</h1>
                <div className={styles.viewer}>
                    {tree && typeof tree !== "string" &&
                        <MorphoViewerSimul morphology={tree} />}
                    {tree === undefined && (
                        <div className={styles.grid}>
                            <ViewSpinner />
                        </div>
                    )}
                    {typeof tree === "string" && (
                        <div className={styles.grid}>
                            <div className={styles.error}>{tree}</div>
                        </div>
                    )}
                </div>
            </div>
            <div>
                <p>You can hover and click the segments.</p>
            </div>
        </div>
    );
}
