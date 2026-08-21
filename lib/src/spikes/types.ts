/**
 * A spike train flattened against the array of cells the viewer draws.
 *
 * Parallel typed arrays rather than objects: a region-scale recording is
 * millions of spikes, and the viewer only ever reads them in index order.
 */
export interface MorphoViewerSpikes {
  /**
   * For each spike, the index of the cell that fired.
   *
   * Positional against the cells the viewer is currently drawing, not an id
   * of any kind — so a host that swaps the circuit has to supply spikes for
   * the new one. Swapping to a circuit of the same length and leaving these
   * alone lights the wrong cells, and nothing can detect it.
   */
  cellIndices: Uint32Array;
  /**
   * For each spike, when it fired, in milliseconds. Must be ascending.
   *
   * The viewer binary-searches this every frame, so an unsorted train does not
   * error, it just draws the wrong cells. {@link MorphoViewerSpikes} is checked
   * once when it is handed over, and an unsorted one is reported to the console.
   */
  times: Float32Array;
  /** Start of the recording. Not necessarily `times[0]` — a cell may be silent. */
  timeMinInMs: number;
  timeMaxInMs: number;
}

/**
 * Replay a spike train over whatever cells a viewer draws.
 *
 * Shared verbatim by the morphology and soma viewers, which differ only in how
 * a glowing cell is painted — one lights a whole neurite tree, the other a
 * point. A host that renders both switches components without rewiring.
 */
export interface PropsForSpikeReplay {
  /**
   * Spikes to replay over the cells. Omit and the viewer behaves exactly as
   * before: no clock runs and no cell ever glows on its own.
   *
   * Must be referentially stable — build it in a `useMemo`, not inline. A new
   * object is a new recording: the clock returns to its start and playback
   * stops, reported through {@link onSpikePlayingChange}.
   */
  spikes?: MorphoViewerSpikes;
  /**
   * Where the playhead is, in milliseconds. Setting it seeks.
   *
   * Only read when it changes, so a host is free to leave it alone during
   * playback and pass it only when the user scrubs. That also means two seeks
   * to the same millisecond are one prop value and the second one is dropped —
   * a host whose scrubber can land twice on the same mark (a restart button, a
   * snapping playhead) should pass this as a one-shot and clear it back to
   * `undefined` once it has been read.
   */
  spikeTime?: number;
  /**
   * The playhead on every painted frame.
   *
   * Fires at frame rate on purpose — a linked view has to follow the replay,
   * not a throttled copy of it. Hosts that put this into React state should
   * throttle there.
   */
  onSpikeTimeChange?(timeInMs: number): void;
  spikePlaying?: boolean;
  /**
   * Also fires with `false` when playback reaches the end of the recording, and
   * when a new {@link spikes} object stops it.
   */
  onSpikePlayingChange?(playing: boolean): void;
  /**
   * Playback rate as simulated milliseconds per wall-clock second.
   * Default `100`, so a one-second simulation plays in ten seconds.
   */
  spikeSpeed?: number;
  /**
   * How long a spike stays visible, as the wall-clock time it takes to fade
   * to `1/e` of full brightness. Default `0.35`.
   *
   * In wall-clock rather than simulated time so that a flash lasts the same
   * on screen whatever {@link spikeSpeed} is — at 100× the speed a spike
   * would otherwise be gone before a frame could show it.
   *
   * It also sets how far the clock may move in one frame: on a circuit heavy
   * enough to render slower than a spike stays lit, the replay slows down
   * rather than stepping over spikes without drawing them.
   */
  spikeAfterglowInSeconds?: number;
}
