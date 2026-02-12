import React from "react";

import Tooltip from "@/components/tooltip";
import { classNames, useEventValue } from "@/utils";

import { PainterManager } from "../../painter";
import { IconCenter } from "../../../icons/center";

import styles from "./button-reset-camera.module.css";

export interface ButtonResetCameraProps {
    className?: string;
    painterManager: PainterManager;
}

export function ButtonResetCamera(
    { className, painterManager }: ButtonResetCameraProps,
) {
    const restPosition = useEventValue(
        false,
        painterManager.eventRestingPosition,
    );

    return (
        <div
            className={classNames(
                className,
                styles.buttonResetCamera,
                restPosition && styles.hide,
            )}
        >
            <Tooltip
                tooltip="Recenter the view"
                arrow="topLeft"
                foreColor="#fff"
                backColor="#05a"
            >
                <button type="button" onClick={painterManager.resetCamera}>
                    <IconCenter />
                </button>
            </Tooltip>
        </div>
    );
}
