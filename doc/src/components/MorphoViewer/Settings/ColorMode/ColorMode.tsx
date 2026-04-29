import { MorphologyCanvas } from "@openbraininstitute/morphoviewer";
import React from "react";

import ChevronDownIcon from "@/components/icons/ChevronDownIcon";
import { classNames } from "@/util/utils";

import { useMorphoViewerSettings } from "../../hooks/settings";

import styles from "./color-mode.module.css";

interface ColorModeProps {
  className?: string;
  painter: MorphologyCanvas;
}

export function ColorMode({ className, painter }: ColorModeProps) {
  const [settings, update] = useMorphoViewerSettings(painter);
  const handleToggle = () => {
    update({ colorBy: settings.colorBy === "distance" ? "section" : "distance" });
  };
  return (
    <div className={classNames(styles.main, className)}>
      <div>Color by</div>
      <button type="button" onClick={handleToggle}>
        <div>{settings.colorBy === "distance" ? "Distance" : "Section"}</div>
        <ChevronDownIcon />
      </button>
    </div>
  );
}
