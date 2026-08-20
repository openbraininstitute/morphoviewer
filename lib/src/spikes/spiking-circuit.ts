import type { MorphoViewerSpikes } from "./types";

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
 * The frame rate the glow window is allowed to slow the clock down to.
 *
 * A step longer than the glow window would leave spikes fired between two
 * frames already past their cutoff by the next one, so they would never light
 * a cell — but an afterglow short enough to make that window narrower than an
 * ordinary frame describes a spike too brief to draw at any step size, and
 * honouring it would stall the replay instead of fixing anything.
 */
const NOMINAL_FRAME_IN_MS = 1000 / 60;

/**
 * The clock and the per-cell glow of a spike replay.
 *
 * Deliberately not `TgdTime`, which does offer milliseconds and a seek: it
 * advances whenever the *context* is playing, and this context also plays for
 * camera moves and morphology nudges, so the replay would creep forward while
 * paused. It also has no notion of a recording that ends. Keeping the clock
 * here additionally keeps it testable without a WebGL context.
 *
 * Shared by the morphology and soma viewers, and deliberately blind to which
 * is asking: it says how brightly each cell should be glowing and leaves how
 * to paint that to whoever owns the geometry. The sibling `SpikingManager` in
 * `morpho-viewer-simul` animates spikes too, but over one morphology as a
 * normalised 0–1 progress with a linear ramp; there is no shared data model to
 * hoist from it, only the idea.
 *
 * Nothing here is cumulative. The set of glowing cells at time `t` is computed
 * from scratch each frame by a binary search plus a walk back over the decay
 * window, so playing, pausing, seeking, scrubbing backwards and changing speed
 * are all the same code path, and none of them can drift.
 */
export class SpikingCircuit {
  private spikes: MorphoViewerSpikes | null = null;
  private _glow = new Float32Array(0);
  private _timeInMs = 0;
  private _playing = false;
  private _speed = DEFAULT_SPIKE_SPEED;
  private _afterglowInSeconds = DEFAULT_SPIKE_AFTERGLOW_IN_SECONDS;
  private lastTickInMs = 0;

  /** Brightness to add per cell, indexed like the cells the viewer draws. */
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

  /**
   * Hand over a new recording, restarting the clock at its beginning.
   *
   * Playback always stops: the new train is indexed against whatever cells the
   * viewer draws now, and carrying a running clock into it would replay a
   * stretch of data nobody asked for. Callers own telling their own host.
   */
  setSpikes(spikes: MorphoViewerSpikes | null, cellCount: number) {
    if (spikes) warnIfUnsorted(spikes.times);
    this.spikes = spikes;
    if (this._glow.length !== cellCount) this._glow = new Float32Array(cellCount);
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

    // Capped by the glow window as well as by the frame, so a slow frame plays
    // back slowly rather than stepping straight over spikes it never drew. See
    // NOMINAL_FRAME_IN_MS for why the cap has a floor of its own.
    const stepInMs = Math.min(
      (deltaInMs / 1000) * this._speed,
      Math.max(this.glowWindowInMs, (NOMINAL_FRAME_IN_MS / 1000) * this._speed)
    );
    const timeInMs = this._timeInMs + stepInMs;
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

  /** How far back a spike is still worth drawing, in simulated milliseconds. */
  private get glowWindowInMs(): number {
    return GLOW_CUTOFF_IN_TAUS * this.tauInMs;
  }

  private computeGlow() {
    const glow = this._glow;
    glow.fill(0);
    const { spikes } = this;
    if (!spikes || glow.length === 0) return;

    const { cellIndices, times } = spikes;
    const tauInMs = this.tauInMs;
    const t = this._timeInMs;
    const oldest = t - this.glowWindowInMs;
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

/**
 * Not `tgdCalcClamp`: importing a value from `@tolokoban/tgd` would pull the
 * whole ESM bundle into this module and take the unit tests down with it.
 * Also snaps NaN to `min`, which `tgdCalcClamp` passes straight through.
 */
function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Report a spike train that is not in the ascending order the search assumes.
 *
 * One pass over a typed array, once per recording rather than per frame, which
 * is nothing next to reading the file it came from. Reported rather than
 * thrown: the replay still runs, it just misses spikes, and a host given a
 * console line can go and sort its own data.
 */
function warnIfUnsorted(times: Float32Array) {
  for (let i = 1; i < times.length; i++) {
    if (times[i] >= times[i - 1]) continue;

    console.warn(
      `Spike times must be ascending, but times[${i}] (${times[i]}) is before times[${i - 1}] (${times[i - 1]}). Cells will light up at the wrong moments.`
    );
    return;
  }
}

function now(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}
