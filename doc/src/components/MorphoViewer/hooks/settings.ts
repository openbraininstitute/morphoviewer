"use client";

/* eslint-disable no-param-reassign */
import { ColoringType, MorphologyCanvas } from "@bbp/morphoviewer";
import { atom, useAtom } from "jotai";
import { useEffect, useMemo } from "react";

import {
  DARK_APICAL_DENDRITE,
  DARK_AXON,
  DARK_BACKGROUND,
  DARK_BASAL_DENDRITE,
  DARK_SOMA,
  LIGHT_APICAL_DENDRITE,
  LIGHT_AXON,
  LIGHT_BACKGROUND,
  LIGHT_BASAL_DENDRITE,
  LIGHT_SOMA,
} from "../constants";

const DEFAULT_SETTINGS: ExtendedMorphoViewerSettings = {
  darkMode: false,
  darkColors: {
    soma: DARK_SOMA,
    basalDendrite: DARK_BASAL_DENDRITE,
    apicalDendrite: DARK_APICAL_DENDRITE,
    axon: DARK_AXON,
  },
  lightColors: {
    soma: LIGHT_SOMA,
    basalDendrite: LIGHT_BASAL_DENDRITE,
    apicalDendrite: LIGHT_APICAL_DENDRITE,
    axon: LIGHT_AXON,
  },
  radiusType: 0,
  colorBy: "section",
};

export function getDefaultSettings() {
  return structuredClone(DEFAULT_SETTINGS);
}

export interface MorphoViewerSettings {
  isDarkMode: boolean;
  /** CSS color for Soma */
  colorSoma: string;
  /** CSS color for BasalDendrite */
  colorBasalDendrite: string;
  /** CSS color for ApicalDendrite */
  colorApicalDendrite: string;
  /** CSS color for Axon */
  colorAxon: string;
  /**
   * **0** (accurate): real radius taken from the SWC file.
   * **1** (uniform): constant radius for all dendrites/axon.
   * This constant is the mean of the real radii.
   */
  radiusType: number;
  /**
   * Coloration mode:
   * * **section**: each section has a different color (soma, dendrite, axon, ...).
   * * **distance**: the color depends on the path distance along the dendrites.
   */
  colorBy: ColoringType;
}

const extendedSettingsAtom = atom(getDefaultSettings());

/**
 * Internally, we store two color palettes: one for dark mode,
 * and one for light mode.
 * But we only expose the current palette and the `darkMode` attribute.
 * @param painter The painter to update when the settings change.
 */
export function useMorphoViewerSettings(
  painter: MorphologyCanvas,
): [
  settings: MorphoViewerSettings,
  update: (settings: Partial<MorphoViewerSettings>) => void,
  reset: (darkMode?: boolean) => void,
] {
  const [extendedSettings, setExtendedSettings] = useAtom(extendedSettingsAtom);
  const settings = useMemo(
    () => readSettings(extendedSettings),
    [extendedSettings],
  );

  useEffect(
    () => applySettingsToMorphologyCanvas(painter, extendedSettings),
    [extendedSettings, painter],
  );
  const update = (value: Partial<MorphoViewerSettings>) => {
    const darkMode = value.isDarkMode ?? extendedSettings.darkMode;
    const newExtendedSettings =
      darkMode === extendedSettings.darkMode
        ? writeSettings({
            ...settings,
            ...value,
          })
        : {
            ...extendedSettings,
            darkMode,
          };
    setExtendedSettings(newExtendedSettings);
  };
  const reset = (darkMode?: boolean) => {
    const defaultSettings = getDefaultSettings();
    if (typeof darkMode === "boolean") {
      defaultSettings.darkMode = darkMode;
    }
    setExtendedSettings(defaultSettings);
  };

  return [settings, update, reset];
}

interface Palette {
  soma: string;
  basalDendrite: string;
  apicalDendrite: string;
  axon: string;
}

interface ExtendedMorphoViewerSettings {
  darkMode: boolean;
  darkColors: Palette;
  lightColors: Palette;
  /**
   * **0** (accurate): real radius taken from the SWC file.
   * **1** (uniform): constant radius for all dendrites/axon.
   * This constant is the mean of the real radii.
   */
  radiusType: number;
  /**
   * Coloration mode:
   * * **section**: each section has a different color (soma, dendrite, axon, ...).
   * * **distance**: the color depends on the path distance along the dendrites.
   */
  colorBy: ColoringType;
}

function readSettings(
  settings: ExtendedMorphoViewerSettings,
): MorphoViewerSettings {
  const { darkMode, darkColors, lightColors } = settings;
  const palette: Palette = darkMode ? darkColors : lightColors;
  return {
    ...settings,
    isDarkMode: darkMode,
    colorSoma: palette.soma,
    colorBasalDendrite: palette.basalDendrite,
    colorApicalDendrite: palette.apicalDendrite,
    colorAxon: palette.axon,
  };
}

function writeSettings({
  isDarkMode,
  colorSoma,
  colorBasalDendrite,
  colorApicalDendrite,
  colorAxon,
  radiusType,
  colorBy,
}: MorphoViewerSettings): ExtendedMorphoViewerSettings {
  const output = getDefaultSettings();
  output.colorBy = colorBy;
  output.radiusType = radiusType;
  output.darkMode = isDarkMode;
  const palette: Palette = isDarkMode ? output.darkColors : output.lightColors;
  palette.soma = colorSoma;
  palette.apicalDendrite = colorApicalDendrite;
  palette.basalDendrite = colorBasalDendrite;
  palette.axon = colorAxon;
  return output;
}

function applySettingsToMorphologyCanvas(
  painter: MorphologyCanvas,
  {
    darkMode,
    darkColors,
    lightColors,
    radiusType,
    colorBy,
  }: ExtendedMorphoViewerSettings,
) {
  const { soma, basalDendrite, apicalDendrite, axon }: Palette = darkMode
    ? darkColors
    : lightColors;
  const background = darkMode ? DARK_BACKGROUND : LIGHT_BACKGROUND;
  painter.colors.background = background;
  painter.colors.soma = soma;
  painter.colors.basalDendrite = basalDendrite;
  painter.colors.apicalDendrite = apicalDendrite;
  painter.colors.axon = axon;
  painter.radiusType = radiusType;
  painter.colorBy = colorBy;
  painter.paint();
}
