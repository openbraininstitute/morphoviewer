/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: <explanation> */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import React from "react";

import { IconClose } from "@/components/icons/close";
import { classNames, useEventValue } from "@/utils";

import { useRecordingsAndInjection } from "../../hooks";
import { HintContent } from "../hint";
import { useEscapeHandler } from "./hooks";

import type { MorphoViewerSimulContentProps } from "../../types/private";

import styles from "./add-recording-dialog.module.css";

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
  React.useEffect(() => {
    if (item) {
      props.onSegmentClick?.({
        segment: item.node,
        parent: item.parent?.node,
      });
      setOpen(true);
    }
  }, [item]);
  const handleClose = () => setOpen(false);
  const handleMoveInjection = () => {
    handleClose();
    if (item) {
      data.moveInjection(item.sectionName);
    }
  };
  const handleAddRecording = () => {
    handleClose();
    if (item) {
      data.addRecording(item.sectionName, offset);
    }
  };
  useEscapeHandler(handleClose);
  if (!item) return null;

  return (
    <div
      className={classNames(className, styles.addRecordingDialog, open && styles.open)}
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
            {item.sectionName}[{item.segmentIndex}] <small>({offset.toFixed(2)})</small>
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
