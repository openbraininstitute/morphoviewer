import React from "react";

import { classNames } from "@/utils";

import { useRecordingsAndInjection } from "../../hooks";
import type { MorphoViewerSimulContentProps } from "../../types/private";
import styles from "./legend-overlay.module.css";
import { type LegendTarget, useLegendPainter } from "./legend-painter";

/**
 * Display injection and rcordings for electrodes.
 */
export default function LegendOverlay(
    props: MorphoViewerSimulContentProps & { className?: string },
) {
    const refCanvas = React.useRef<HTMLCanvasElement | null>(null);
    const data = useRecordingsAndInjection(props);
    const { className, painterManager } = props;
    const legendPainter = useLegendPainter(painterManager);
    React.useEffect(() => {
        legendPainter.paint(refCanvas.current, resolveLegendTargets(data));
    }, [data, legendPainter]);

    return (
        <canvas
            className={classNames(className, styles.legendOverlay)}
            ref={refCanvas}
        />
    );
}

function resolveLegendTargets(data: {
    recordings: {
        section: string;
        offset: number;
        color?: string | undefined;
    }[];
    injection?: {
        inject_to: string;
    };
}): LegendTarget[] {
    const targets: LegendTarget[] = data.recordings.map(
        ({ section, offset, color }) =>
            ({
                section,
                origin: "recording",
                offset,
                color,
            }) satisfies LegendTarget,
    );
    if (data.injection) {
        targets.push({
            section: data.injection.inject_to,
            origin: "injection",
            offset: 0.5,
            color: "#fff",
        });
    }
    return targets;
}
