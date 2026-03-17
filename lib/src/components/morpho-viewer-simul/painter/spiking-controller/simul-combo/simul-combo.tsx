import React from "react";
import { MorphoViewerSpikeRecord } from "@/components/morpho-viewer-simul/types/public";
import { classNames } from "@/utils";
import { SpikingManager } from "../../spiking-manager";
import styles from "./simul-combo.module.css";

export interface SimulComboProps {
  spikingManager: SpikingManager;
  spikes: MorphoViewerSpikeRecord[];
}

export default function SimulCombo({ spikingManager, spikes }: SimulComboProps) {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const spike = spikingManager.spike;
  const handleOpenDialog = () => {
    setDialogOpen(true);
  };
  const selectIndex = (index: number) => {
    spikingManager.spikeIndex = index;
    setDialogOpen(false);
  };
  if (!spike) return null;

  return (
    <>
      {!dialogOpen && (
        <div className={classNames(styles.simulCombo)}>
          <button
            className={styles.button}
            style={{ "--custom-color": spike.color }}
            onClick={handleOpenDialog}
          >
            {spike.label}
          </button>
        </div>
      )}
      <div
        className={classNames(styles.dialog, dialogOpen && styles.open)}
        onClick={() => setDialogOpen(false)}
      >
        <div>
          {spikes.map(({ label, color }, index) => (
            <button
              className={styles.button}
              style={{ "--custom-color": color }}
              key={index}
              onClick={() => selectIndex(index)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
