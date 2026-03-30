import type { TgdEvent } from "@tolokoban/tgd";
import React from "react";
import Tooltip from "@/components/tooltip";
import { classNames, useEventValue } from "@/utils";
import { IconCenter } from "../icons/center";
import styles from "./button-reset-camera.module.css";

export interface ButtonResetCameraProps {
  className?: string;
  painterManager: {
    cameraReset: () => void;
    eventRestingPosition: TgdEvent<boolean>;
  };
}

export function ButtonCameraReset({ className, painterManager }: ButtonResetCameraProps) {
  const restPosition = useEventValue(false, painterManager.eventRestingPosition);

  return (
    <div className={classNames(className, styles.buttonResetCamera, restPosition && styles.hide)}>
      <Tooltip tooltip="Recenter the view" arrow="topLeft" foreColor="#fff" backColor="#05a">
        <button type="button" onClick={painterManager.cameraReset}>
          <IconCenter />
        </button>
      </Tooltip>
    </div>
  );
}
