import {
	MorphoViewerSmallCircuit,
	type MorphoViewerSmallCircuitCell,
	type MorphoViewerSmallCircuitCellData,
	morphoViewerConvertMorphologyIntoTree,
} from "@bbp/morphoviewer";
import React from "react";
import { CIRCUIT } from "./data";
import styles from "./page.module.css";

export default function Page() {
	const [highlightedCellId, setHighlightedCellId] = React.useState("");

	const handleCellHover = (
		cell: MorphoViewerSmallCircuitCell | undefined,
	): void => {
		console.log("Cell:", cell?.id);
		setHighlightedCellId(cell?.id ?? "");
	};

	return (
		<div className={styles.page}>
			<div>
				<MorphoViewerSmallCircuit
					className={styles.viewer}
					backgroundColor="#333"
					circuit={CIRCUIT}
					loadCell={loadCell}
					highlightedCellId={highlightedCellId}
					onCellHover={handleCellHover}
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
