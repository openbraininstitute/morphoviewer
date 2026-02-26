import {
  MorphoViewerSmallCircuit,
  type MorphoViewerSmallCircuitCell,
  type MorphoViewerSmallCircuitCellData,
  morphoViewerConvertMorphologyIntoTree,
} from '@bbp/morphoviewer';
import React from 'react';

import { CIRCUIT } from './data';

import styles from './page.module.css';

export default function Page() {
  const [selectedCells, setSelectedCells] = React.useState<string[]>([]);
  const [highlightedCellId, setHighlightedCellId] = React.useState('');
  const highlightedCellIds = React.useMemo(
    () => [...selectedCells, highlightedCellId],
    [selectedCells, highlightedCellId]
  );
  const handleCellHover = (cell: MorphoViewerSmallCircuitCell | undefined): void => {
    setHighlightedCellId(cell?.id ?? '');
  };
  const handleCellClick = (cell: MorphoViewerSmallCircuitCell | undefined): void => {
    if (!cell) return;

    if (selectedCells.includes(cell.id)) {
      setSelectedCells(selectedCells.filter((id) => id !== cell.id));
    } else {
      setSelectedCells([...selectedCells, cell.id]);
    }
  };

  return (
    <div className={styles.page}>
      <div>
        <MorphoViewerSmallCircuit
          className={styles.viewer}
          backgroundColor="#000"
          circuit={CIRCUIT}
          loadCell={loadCell}
          onCellHover={handleCellHover}
          onCellClick={handleCellClick}
          highlightedCellIds={highlightedCellIds}
        />
      </div>
      <div>
        <h1>&lt;MorphoViewerSmallCircuit /&gt;</h1>
      </div>
    </div>
  );
}

async function loadCell(id: string): Promise<MorphoViewerSmallCircuitCellData | null> {
  try {
    const resp = await fetch('./assets/morpho-02.json');
    const morphology = await resp.json();
    return {
      type: 'tree',
      data: morphoViewerConvertMorphologyIntoTree(morphology, id),
    };
  } catch (error) {
    console.error(`Unable to load cell "${id}":`, error);
    return null;
  }
}
