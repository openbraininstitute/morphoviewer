import { classNames, useEventValue } from "@/utils";

import { MorphoViewerTreeItemType } from "../../types/public";

import type React from "react";
import type { PainterManager } from "../../painter";
import type { StructureItem } from "../../painter/structure";

import styles from "./hint.module.css";

export interface HintProps {
    className?: string;
    painterManager: PainterManager;
}

export function HintPanel({ className, painterManager }: HintProps) {
    const hovered = useEventValue(
        { x: 0, y: 0, item: null, offset: 0 },
        painterManager.eventHover,
    );
    const visible = useEventValue(false, painterManager.eventHintVisible);

    if (!visible || !hovered.item) {
        return null;
    }

    return (
        <div
            className={classNames(className, styles.hintPanel)}
            key="hint"
            style={hovered.y > 0 ? { bottom: "1em" } : { top: "4em" }}
        >
            <HintContent painterManager={painterManager} />
        </div>
    );
}

export function HintContent({ className, painterManager }: HintProps) {
    const hovered = painterManager.hoverItem;

    if (!hovered.item) {
        return null;
    }
    const { item, offset } = hovered;

    return (
        <div className={classNames(className, styles.hintContent)}>
            <div>Section:</div>
            <div>{resolveName(hovered.item)}</div>
            <div>Section index:</div>
            <div>{item.sectionIndex}</div>
            <div>Segment index:</div>
            <div>{item.segmentIndex}</div>
            <div>Number of segments:</div>
            <div>{item.segmentsCount}</div>
            <div>Offset:</div>
            <div>{offset.toFixed(3)}</div>
            <div>Distance from soma:</div>
            <div>
                {(item.distanceFromSoma + offset * item.sectionLength).toFixed(
                    2,
                )} µm
            </div>
        </div>
    );
}

function resolveName(item: StructureItem): React.ReactNode {
    switch (item.type) {
        case MorphoViewerTreeItemType.Axon:
            return "Axon";
        case MorphoViewerTreeItemType.Soma:
            return "Soma";
        case MorphoViewerTreeItemType.Dendrite:
            return "Dendrite";
        case MorphoViewerTreeItemType.BasalDendrite:
            return "Basal Dendrite";
        case MorphoViewerTreeItemType.ApicalDendrite:
            return "Apical dendrite";
        case MorphoViewerTreeItemType.Myelin:
            return "Myelin";
        default:
            return "Unknown";
    }
}
