import React from "react";
import { SpikingManager } from "../../spiking-manager";
import styles from "./speed-combo.module.css";
import { classNames } from "@/utils";

export interface SpeedComboProps {
  spikingManager: SpikingManager;
}

const STEPS = [1, 2, 4, 8, 16, 32, 64];

export function SpeedCombo({ spikingManager }: SpeedComboProps) {
  const [speed, setSpeed] = React.useState(spikingManager.speed);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const handleOpenDialog = () => {
    setDialogOpen(true);
  };

  return (
    <>
      <div className={styles.speedCombo}>
        <button type="button" className={styles.speedComboButton} onClick={handleOpenDialog}>
          1:{Math.round(1 / speed)}
        </button>
      </div>
      <div
        className={classNames(styles.dialog, dialogOpen && styles.open)}
        onClick={() => setDialogOpen(false)}
      >
        <div className={styles.column}>
          <div>Playback speed:</div>
          <div className={styles.row}>
            {STEPS.map((step) => (
              <button
                className={styles.speedComboButton}
                key={step}
                onClick={() => {
                  setSpeed(1 / step);
                  spikingManager.speed = 1 / step;
                }}
              >
                1:{step}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
