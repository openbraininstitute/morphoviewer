import { classNames } from "@/utils";

import { MorphoViewerIconCenter } from "../icons/center";
import { MorphoViewerIconClose } from "../icons/close";
import { MorphoViewerIconFullscreen } from "../icons/fullscreen";
import { MorphoViewerIconMinimize } from "../icons/minimize";

import type React from "react";

import styles from "./controls-layout.module.css";

export type ControlAction = "fullscreen" | "reset-camera" | "minimize" | "close";

export interface ControlsLayoutProps {
  className?: string;
  content: (ControlAction | React.ReactNode | (ControlAction | React.ReactNode)[])[];
  onClick?(action: ControlAction): void;
}

export function ControlsLayout({ className, content, onClick }: ControlsLayoutProps) {
  return (
    <div className={classNames(className, styles.controlsLayout)}>
      {renderContent(content, onClick)}
    </div>
  );
}

function renderContent(
  content: ControlsLayoutProps["content"],
  onClick?: (action: ControlAction) => void
): React.ReactNode {
  return content.map((action, index) => {
    if (Array.isArray(action)) {
      return (
        <div key={index} className={styles.group}>
          {renderContent(action, onClick)}
        </div>
      );
    }
    switch (action) {
      case "close":
      case "fullscreen":
      case "minimize":
      case "reset-camera":
        return renderButton(action as ControlAction, onClick, index);
      default:
        return action;
    }
  });
}

function renderButton(
  action: ControlAction,
  onClick: ((action: ControlAction) => void) | undefined,
  index: number
) {
  const Icon = ICONS[action];
  if (!Icon) return null;

  return (
    <button
      key={index}
      className={styles.button}
      type="button"
      aria-label={action}
      onClick={() => onClick?.(action)}
    >
      <Icon />
    </button>
  );
}

const ICONS: Record<ControlAction, React.FC> = {
  "reset-camera": MorphoViewerIconCenter,
  close: MorphoViewerIconClose,
  fullscreen: MorphoViewerIconFullscreen,
  minimize: MorphoViewerIconMinimize,
};
