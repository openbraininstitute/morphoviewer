/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: <explanation> */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import React from "react";
import { IconClose } from "@/components/icons/close";
import { classNames, useEventValue } from "@/utils";

import { useRecordingsAndInjection } from "../../hooks";
import type { MorphoViewerSimulContentProps } from "../../types/private";
import { resolveTypeName } from "../../utils";
import { HintContent } from "../hint";
import styles from "./add-recording-dialog.module.css";
import { useEscapeHandler } from "./hooks";

export interface AddRecordingDialogProps extends MorphoViewerSimulContentProps {
    className?: string;
}

export default function AddRecordingDialog(props: AddRecordingDialogProps) {
    const { className, painterManager } = props;
    const data = useRecordingsAndInjection(props);
    const [open, setOpen] = React.useState(false);
    const { offset, item, y } = useEventValue(
        {
            x: 0,
            y: 0,
            item: null,
            offset: 0,
        },
        painterManager.eventTap,
    );
    console.log(
        "🐞 [add-recording-dialog@32] offset, item, y =",
        offset,
        item,
        y,
    ); // @FIXME: Remove this line written on 2026-02-13 at 17:37
    React.useEffect(() => {
        if (item) setOpen(true);
    }, [item, offset]);
    const handleClose = () => setOpen(false);
    const handleMoveInjection = () => {
        handleClose();
        if (item) {
            data.moveInjection(
                `${resolveTypeName(item.type)}[${item.sectionName}]`,
            );
        }
    };
    const handleAddRecording = () => {
        handleClose();
        if (item) {
            data.addRecording(
                `${resolveTypeName(item.type)}[${item.sectionName}]`,
                offset,
            );
        }
    };
    useEscapeHandler(handleClose);
    if (!item) return null;

    return (
        <div
            className={classNames(
                className,
                styles.addRecordingDialog,
                open && styles.open,
            )}
            title={`y = ${y}`}
            onClick={handleClose}
            role="alertdialog"
        >
            <div
                className={y < 0 ? styles.top : styles.bottom}
                onClick={(evt) => {
                    evt.preventDefault();
                    evt.stopPropagation();
                }}
                role="dialog"
            >
                <header>
                    <h2>
                        {resolveTypeName(item.type)}[{item.sectionName}][{item
                            .segmentIndex}
                        ] <small>({offset.toFixed(2)})</small>
                    </h2>
                    <button type="button" onClick={handleClose}>
                        <IconClose />
                        <div>Cancel</div>
                    </button>
                </header>
                <HintContent painterManager={painterManager} />
                <div className={styles.buttons}>
                    <button type="button" onClick={handleMoveInjection}>
                        Move injection here
                    </button>
                    <button type="button" onClick={handleAddRecording}>
                        Add recording
                    </button>
                </div>
            </div>
        </div>
    );
}
