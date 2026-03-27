import React from "react";

import { classNames } from "@/utils";

import { Icon3D } from "../../../icons/3d";
import { IconDendrogramStraight } from "../../../icons/dendrogram-straight";
import { MorphoViewerMode } from "../../types/public";
import { PainterManager } from "../../painter";

import styles from "./ModeSelector.module.css";

export interface ModeSelectorProps {
    className?: string;
    painterManager: PainterManager;
}

export default function ModeSelector(
    { className, painterManager }: ModeSelectorProps,
) {
    const [mode, setMode] = React.useState(
        painterManager.mode as MorphoViewerMode,
    );
    React.useMemo(() => painterManager.mode = mode, [painterManager, mode]);

    return (
        <div className={classNames(className, styles.modeSelector)}>
            <button
                type="button"
                className={classNames(
                    styles.button,
                    mode === "3d" && styles.selected,
                )}
                onClick={() => setMode("3d")}
            >
                <Icon3D />
            </button>
            <button
                type="button"
                className={classNames(
                    styles.button,
                    mode === "dendrogram" && styles.selected,
                )}
                onClick={() => setMode("dendrogram")}
            >
                <IconDendrogramStraight />
            </button>
        </div>
    );
}
