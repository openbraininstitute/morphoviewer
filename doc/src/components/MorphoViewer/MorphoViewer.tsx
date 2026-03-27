"use client";

/* eslint-disable no-param-reassign */
import { GizmoCanvas, MorphologyCanvas } from "@bbp/morphoviewer";
import { useEffect, useRef } from "react";

import { ColorRamp } from "./ColorRamp";
import { useMorphoViewerSettings } from "./hooks/settings";
import { useSignal } from "./hooks/signal";
import { Scalebar } from "./Scalebar";
import { Settings } from "./Settings";
import { Warning } from "./Warning";

// We disable enhanced somas until they are fixed on the backend.
// import { WaitingForSomaEnhancement } from './WaitingForSomaEnhancement';
// import { useEnhancedSomaService } from './hooks/neuro-morpho-viz-service';

import { IconFullscreen } from "@tolokoban/ui";
import { classNames } from "@/util/utils";
import styles from "./morpho-viewer.module.css";

interface MorphoViewerProps {
    className?: string;
    /**
     * Text content of a SWC file.
     */
    swc: string;
    mode?: "light" | "dark";
    // We disable enhanced somas until they are fixed on the backend.
    // contentUrl?: string;
}

// Disble Gizmo until it is fixed.
const SHOW_GIZMO = false;

function MorphoViewer({ className, swc, mode }: MorphoViewerProps) {
    const refDiv = useRef<HTMLDivElement | null>(null);
    const refMorphoCanvas = useRef(new MorphologyCanvas());
    const morphoCanvas = refMorphoCanvas.current;
    const refGizmoCanvas = useRef(new GizmoCanvas());
    const gizmoCanvas = refGizmoCanvas.current;
    const refCanvas = useRef<HTMLCanvasElement | null>(null);
    const [{ isDarkMode }] = useMorphoViewerSettings(morphoCanvas);
    const [warning, setWarning] = useSignal(10000);
    // We disable enhanced somas until they are fixed on the backend.
    //   const enhancedSomaIsLoading = useEnhancedSomaService(morphoCanvas, contentUrl);

    useEffect(() => {
        morphoCanvas.canvas = refCanvas.current;
        morphoCanvas.swc = swc;
        if (mode === "dark") morphoCanvas.colors.background = "#000";
        else if (mode === "light") morphoCanvas.colors.background = "#fff";
        const handleWarning = () => {
            setWarning(true);
        };
        morphoCanvas.eventMouseWheelWithoutCtrl.addListener(handleWarning);
        gizmoCanvas.attachCamera(morphoCanvas.camera);
        gizmoCanvas.eventTipClick.addListener(morphoCanvas.interpolateCamera);
        return () => {
            morphoCanvas.eventMouseWheelWithoutCtrl.removeListener(
                handleWarning,
            );
            gizmoCanvas.eventTipClick.removeListener(
                morphoCanvas.interpolateCamera,
            );
        };
    }, [morphoCanvas, gizmoCanvas, swc, setWarning, mode]);

    const handleFullscreen = () => {
        const div = refDiv.current;
        if (!div) return;

        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            div.requestFullscreen({
                navigationUI: "hide",
            });
        }
    };

    return (
        <div
            className={classNames(
                styles.main,
                className,
                isDarkMode && styles.darkMode,
            )}
            ref={refDiv}
            onDoubleClick={handleFullscreen}
            data-testid="morpho-viewer"
        >
            <canvas className={styles.morphoViewer} ref={refCanvas}>
                MorphologyViewer
            </canvas>
            <Settings painter={morphoCanvas} />
            <button
                className={styles.fullscreenButton}
                type="button"
                onClick={handleFullscreen}
                aria-label="Toggle fullscreen"
            >
                <IconFullscreen />
            </button>
            {SHOW_GIZMO && (
                <div className={styles.rightPanel}>
                    <canvas
                        className={styles.gizmo}
                        ref={(canvas) => {
                            gizmoCanvas.canvas = canvas;
                        }}
                    >
                        GizmoViewer
                    </canvas>
                    <ColorRamp painter={morphoCanvas} />
                </div>
            )}
            <Scalebar painter={morphoCanvas} />
            <Warning visible={warning} />
            {
                // We disable enhanced somas until they are fixed on the backend.
                // <WaitingForSomaEnhancement visible={enhancedSomaIsLoading} />
            }
        </div>
    );
}

export { MorphoViewer };
