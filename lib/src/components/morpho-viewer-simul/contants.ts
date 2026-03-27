import { ArrayNumber4, TgdColor } from "@tolokoban/tgd";

/**
 * Number of seconds before the actual spiking to start
 * the lighting.
 */
export const SPIKING_TIME_RADIUS = 0.075;

export const SPIKING_BLUR_SIZE = 4;

export const SPIKING_RADIUS_MULTIPLIER = 1;

export const SPIKING_COLOR = TgdColor.fromString("#d75f5f").luminanceSet(0.4).toArayNumber4();

export const SPIKING_COLOR_MIX = 1;

export const TIMELINE_MARGIN: ArrayNumber4 = [0, 8, 8, 48];

export const TIMELINE_HEIGHT = 32;
