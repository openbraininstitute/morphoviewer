import React from "react";

import { PainterManager } from "../../painter";
import { StructureItem } from "../../painter/structure";

import { classNames, useEventValue } from "@/utils";

import styles from "./hint.module.css";
import { MorphoViewerTreeItemType } from "../../types/public";

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

    return (
        <div className={classNames(className, styles.hintContent)}>
            <div>Section:</div>
            <div>{resolveName(hovered.item)}</div>
            <div>Section index:</div>
            <div>{hovered.item.sectionIndex}</div>
            <div>Segment index:</div>
            <div>{hovered.item.segmentIndex}</div>
            <div>Number of segments:</div>
            <div>{hovered.item.segmentsCount}</div>
            <div>Offset:</div>
            <div>{hovered.offset.toFixed(3)}</div>
            <div>Distance from soma:</div>
            <div>{hovered.item.distanceFromSoma.toFixed(2)} µm</div>
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
