import {
	MorphoViewerSmallCircuit,
	type MorphoViewerSmallCircuitCellData,
	morphoViewerConvertMorphologyIntoTree,
} from "@bbp/morphoviewer";

import { CIRCUIT } from "./data";

import styles from "./page.module.css";

export default function Page() {
	return (
		<div className={styles.page}>
			<div>
				<MorphoViewerSmallCircuit
					className={styles.viewer}
					backgroundColor="#001244"
					circuit={CIRCUIT}
					loadCell={loadCell}
				/>
			</div>
			<div>
				<h1>&lt;MorphoViewerSmallCircuit /&gt;</h1>
			</div>
		</div>
	);
}

async function loadCell(
	id: string,
): Promise<MorphoViewerSmallCircuitCellData | null> {
	try {
		const resp = await fetch("./assets/morpho-02.json");
		const morphology = await resp.json();
		return {
			type: "tree",
			data: morphoViewerConvertMorphologyIntoTree(morphology, id),
		};
	} catch (error) {
		console.error(`Unable to load cell "${id}":`, error);
		return null;
	}
}
