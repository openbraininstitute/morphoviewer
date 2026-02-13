import { MorphologyCanvas } from "@bbp/morphoviewer";
import { useState } from "react";

import { ColorMode } from "./ColorMode";
import { ColorsLegend } from "./ColorsLegend";
import { DendriteThickness } from "./DendriteThickness";
import { ThicknessMode } from "./ThicknessMode";

import { classNames } from "@/util/utils";

import styles from "./settings.module.css";
import { IconClose, IconGear } from "@tolokoban/ui";

interface SettingsProps {
    className?: string;
    painter: MorphologyCanvas;
}

export function Settings({ className, painter }: SettingsProps) {
    const [expand, setExpand] = useState(false);
    return (
        <div
            className={classNames(
                styles.main,
                className,
                expand ? styles.expand : styles.collapse,
            )}
        >
            <button type="button" onClick={() => setExpand(true)}>
                <IconGear />
                <div>Settings</div>
            </button>
            <div>
                <div>
                    <button
                        type="button"
                        onClick={() => setExpand(false)}
                        aria-label="Close settings"
                    >
                        <IconClose />
                    </button>
                </div>
                <ColorsLegend className={styles.legend} painter={painter} />
                <DendriteThickness painter={painter} />
                <ThicknessMode painter={painter} />
                <ColorMode painter={painter} />
            </div>
        </div>
    );
}
