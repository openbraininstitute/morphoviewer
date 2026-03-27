/* eslint-disable no-param-reassign */
import React from "react";

import { PainterManager } from "../../painter";

import { classNames, useEventValue } from "@/utils";

import styles from "./zoom-slider.module.css";
import { IconZoomOut } from "@/components/icons/zoom-out";
import { IconZoomIn } from "@/components/icons/zoom-in";

export interface ZoomSliderProps {
    className?: string;
    painterManager: PainterManager;
}

export default function ZoomSlider(
    { className, painterManager }: ZoomSliderProps,
) {
    const zoom = useEventValue(1, painterManager.eventZoom);

    return (
        <div className={classNames(className, styles.zoomSlider)}>
            <button type="button" onClick={painterManager.zoomOut}>
                <IconZoomOut />
            </button>
            <input
                type="range"
                value={zoom}
                onInput={(evt) => {
                    const input = evt.target as HTMLInputElement;
                    painterManager.zoom = parseFloat(input.value);
                }}
                min={-1}
                max={1}
                step={0.01}
            />
            <button type="button" onClick={painterManager.zoomIn}>
                <IconZoomIn />
            </button>
        </div>
    );
}
