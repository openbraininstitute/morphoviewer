import type { MorphoViewerSpikes } from "@openbraininstitute/morphoviewer";
import React from "react";

/** One second of firing, which is long enough to judge the glow by eye. */
const RECORDING_IN_MS = 1000;

/**
 * Enough spikes that something is always firing, few enough that four million
 * cells still fit in a typed array the browser will actually allocate.
 */
const MAX_SPIKES = 8_000_000;

/**
 * Poisson firing across a circuit, for tuning the glow on the demo pages.
 *
 * Times come out of ascending gaps rather than out of a sort, which is what the
 * viewer needs and what the biggest preset here — four million somas — makes
 * necessary: the index array a sort of two parallel arrays needs would be
 * bigger than the spikes themselves.
 */
export function useRandomSpikes(
  cellCount: number,
  spikesPerCell: number
): MorphoViewerSpikes | undefined {
  return React.useMemo(() => {
    if (cellCount === 0) return undefined;

    const count = Math.min(cellCount * spikesPerCell, MAX_SPIKES);
    const cellIndices = new Uint32Array(count);
    const times = new Float32Array(count);
    const meanGapInMs = RECORDING_IN_MS / count;
    let timeInMs = 0;
    for (let i = 0; i < count; i++) {
      // Exponential gaps: what a Poisson process actually produces, and what
      // makes the glow look like firing rather than like a metronome.
      timeInMs += -Math.log(1 - Math.random()) * meanGapInMs;
      cellIndices[i] = Math.floor(Math.random() * cellCount);
      times[i] = timeInMs;
    }
    return {
      cellIndices,
      times,
      timeMinInMs: 0,
      timeMaxInMs: Math.max(timeInMs, RECORDING_IN_MS),
    };
  }, [cellCount, spikesPerCell]);
}
