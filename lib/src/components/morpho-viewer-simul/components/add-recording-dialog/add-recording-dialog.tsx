/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import React from "react";

import { classNames, useEventValue } from "@/utils";
import { IconClose } from "@/components/icons/close";

import { useRecordingsAndInjection } from "../../hooks";
import { HintContent } from "../hint";
import { useEscapeHandler } from "./hooks";
import { MorphoViewerSimulContentProps } from "../../types/private";

import styles from "./add-recording-dialog.module.css";

export interface AddRecordingDialogProps extends MorphoViewerSimulContentProps {
    className?: string;
}

export default function AddRecordingDialog(props: AddRecordingDialogProps) {
    const { className, painterManager } = props;
    const data = useRecordingsAndInjection(props);
    const [open, setOpen] = React.useState(false);
    const { offset, item, y } = useEventValue({
        x: 0,
        y: 0,
        item: null,
        offset: 0,
    }, painterManager.eventTap);
    React.useEffect(() => {
        if (item) setOpen(true);
    }, [item, offset]);
    const handleClose = React.useCallback(() => {
        setOpen(false);
    }, [setOpen]);
    const handleMoveInjection = () => {
        handleClose();
        if (item) data.moveInjection(item.sectionName);
    };
    const handleAddRecording = () => {
        handleClose();
        if (item) data.addRecording(item.sectionName, offset);
    };
    useEscapeHandler(handleClose);

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
                        {item?.sectionName} ({offset.toFixed(2)})
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
