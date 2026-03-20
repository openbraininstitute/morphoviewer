import React from "react";
import { SpikingManager } from "../../../painter/spiking-manager";
import styles from "./speed-combo.module.css";
import { classNames } from "@/utils";

export interface SpeedComboProps {
  spikingManager: SpikingManager;
}

const SPEEDS = [1.0, 0.5, 0.25, 0.1, 0.05, 0.01];

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
          {speedToText(speed)}
        </button>
      </div>
      <div
        className={classNames(styles.dialog, dialogOpen && styles.open)}
        onClick={() => setDialogOpen(false)}
      >
        <div className={styles.column}>
          <div>Playback speed:</div>
          <div className={styles.row}>
            {SPEEDS.map((speed) => (
              <button
                className={styles.speedComboButton}
                key={speed}
                onClick={() => {
                  setSpeed(speed);
                  spikingManager.speed = speed;
                }}
              >
                {speedToText(speed)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function speedToText(speed: number) {
  return <span>{speed.toFixed(2)}×</span>;
}
