import type { MorphoViewerSmallCircuitSpikes } from "../types";

/** Simulated milliseconds per wall-clock second. */
export const DEFAULT_SPIKE_SPEED = 100;

/** Wall-clock seconds for a spike to fade to `1/e` of its brightness. */
export const DEFAULT_SPIKE_AFTERGLOW_IN_SECONDS = 0.35;

/**
 * Past this many decay constants a spike contributes under 1% of full
 * brightness, which is invisible against the neuron already drawn underneath.
 * It is where the search over the spike train stops.
 */
const GLOW_CUTOFF_IN_TAUS = 5;

/**
 * The most wall-clock time one frame is allowed to be worth.
 *
 * A gap longer than this is a tab that was in the background, and advancing by
 * it would teleport the replay past everything that happened while the user was
 * away. Clamped rather than dropped, so a circuit heavy enough to render slower
 * than this plays slowly instead of freezing.
 */
const MAX_FRAME_IN_MS = 250;

/**
 * The clock and the per-cell glow of a spike replay.
 *
 * Deliberately not `TgdTime`: this one counts in *simulated* milliseconds
 * rather than seconds of wall clock, clamps itself at the end of the recording,
 * and has to survive a seek to an exact time — none of which `TgdTime` offers.
 *
 * Nothing here is cumulative. The set of glowing cells at time `t` is computed
 * from scratch each frame by a binary search plus a walk back over the decay
 * window, so playing, pausing, seeking, scrubbing backwards and changing speed
 * are all the same code path, and none of them can drift.
 */
export class SpikingCircuit {
  private spikes: MorphoViewerSmallCircuitSpikes | null = null;
  private _glow = new Float32Array(0);
  private _timeInMs = 0;
  private _playing = false;
  private _speed = DEFAULT_SPIKE_SPEED;
  private _afterglowInSeconds = DEFAULT_SPIKE_AFTERGLOW_IN_SECONDS;
  private lastTickInMs = 0;

  get hasSpikes(): boolean {
    return this.spikes !== null;
  }

  /** Brightness to add per cell, indexed like the `circuit` array. */
  get glow(): Readonly<Float32Array> {
    return this._glow;
  }

  get timeMinInMs(): number {
    return this.spikes?.timeMinInMs ?? 0;
  }

  get timeMaxInMs(): number {
    return this.spikes?.timeMaxInMs ?? 0;
  }

  get timeInMs(): number {
    return this._timeInMs;
  }
  set timeInMs(timeInMs: number) {
    const clamped = clamp(timeInMs, this.timeMinInMs, this.timeMaxInMs);
    if (clamped === this._timeInMs) return;

    this._timeInMs = clamped;
    this.computeGlow();
  }

  get playing(): boolean {
    return this._playing;
  }
  set playing(playing: boolean) {
    if (this._playing === playing) return;

    // Replaying from the end would otherwise sit on the last frame forever.
    if (playing && this._timeInMs >= this.timeMaxInMs) {
      this._timeInMs = this.timeMinInMs;
      this.computeGlow();
    }
    this._playing = playing;
    this.lastTickInMs = now();
  }

  /** Simulated milliseconds per wall-clock second. */
  get speed(): number {
    return this._speed;
  }
  set speed(speed: number) {
    if (this._speed === speed) return;

    this._speed = speed;
    // Faster playback shortens the fade in simulated time by exactly as much as
    // it shortens everything else, so the flash keeps the same length on screen.
    this.computeGlow();
  }

  get afterglowInSeconds(): number {
    return this._afterglowInSeconds;
  }
  set afterglowInSeconds(afterglowInSeconds: number) {
    if (this._afterglowInSeconds === afterglowInSeconds) return;

    this._afterglowInSeconds = afterglowInSeconds;
    this.computeGlow();
  }

  setSpikes(spikes: MorphoViewerSmallCircuitSpikes | null, cellCount: number) {
    this.spikes = spikes;
    this.setCellCount(cellCount);
    this._timeInMs = this.timeMinInMs;
    this._playing = false;
    this.computeGlow();
  }

  /** Resize the glow buffer after the circuit itself changed. */
  setCellCount(cellCount: number) {
    if (this._glow.length === cellCount) return;

    this._glow = new Float32Array(cellCount);
    this.computeGlow();
  }

  /**
   * Move the clock on by however long the last frame took.
   *
   * @returns `true` when this frame ran off the end of the recording, which is
   * the host's cue to drop out of playback.
   */
  advance(): boolean {
    const wallClock = now();
    const deltaInMs = Math.min(wallClock - this.lastTickInMs, MAX_FRAME_IN_MS);
    this.lastTickInMs = wallClock;
    if (!this._playing || deltaInMs <= 0) return false;

    const timeInMs = this._timeInMs + (deltaInMs / 1000) * this._speed;
    if (timeInMs >= this.timeMaxInMs) {
      this._timeInMs = this.timeMaxInMs;
      this._playing = false;
      this.computeGlow();
      return true;
    }
    this._timeInMs = timeInMs;
    this.computeGlow();
    return false;
  }

  /** Milliseconds of simulated time a spike takes to fade to `1/e`. */
  private get tauInMs(): number {
    return Math.max(this._afterglowInSeconds * this._speed, Number.MIN_VALUE);
  }

  private computeGlow() {
    const glow = this._glow;
    glow.fill(0);
    const { spikes } = this;
    if (!spikes || glow.length === 0) return;

    const { cellIndices, times } = spikes;
    const tauInMs = this.tauInMs;
    const t = this._timeInMs;
    const oldest = t - GLOW_CUTOFF_IN_TAUS * tauInMs;
    for (let i = upperBound(times, t) - 1; i >= 0; i--) {
      const spikeTime = times[i];
      if (spikeTime < oldest) break;

      const cellIndex = cellIndices[i];
      if (cellIndex >= glow.length) continue;

      const intensity = Math.exp((spikeTime - t) / tauInMs);
      if (intensity > glow[cellIndex]) glow[cellIndex] = intensity;
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Index of the first entry strictly greater than `value`, in an ascending array. */
function upperBound(values: Float32Array, value: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (values[mid] <= value) low = mid + 1;
    else high = mid;
  }
  return low;
}

function now(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}
