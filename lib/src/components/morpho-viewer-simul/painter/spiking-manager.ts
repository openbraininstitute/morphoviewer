import { TgdColor, TgdContext, TgdEvent, TgdTime, TgdVec4 } from "@tolokoban/tgd";
import { MorphoViewerSpikeRecord } from "../types/public";
import React from "react";

export class SpikingManager {
  private static ID = 1;

  public readonly name = `SpikingManager#${SpikingManager.ID++}`;
  public readonly eventSpikesChange = new TgdEvent<MorphoViewerSpikeRecord[]>();
  public readonly eventSpikeChange = new TgdEvent<MorphoViewerSpikeRecord | undefined>();
  public readonly eventSpikeIndexChange = new TgdEvent<number>();

  private readonly _color = new TgdColor(1, 1, 1, 1);
  private _spikes: MorphoViewerSpikeRecord[] = [];
  private _spike: MorphoViewerSpikeRecord | undefined = undefined;
  private _spikeIndex = 0;
  private _flashTime = 0.1;
  private _speed = 1;
  private readonly virtualTime: TgdTime;

  constructor(public readonly context: TgdContext) {
    this.virtualTime = new TgdTime({ context });
  }

  get speed(): number {
    return this._speed;
  }
  set speed(speed: number) {
    if (this._speed === speed) return;

    this._speed = speed;
    this.virtualTime.speed = speed;
  }

  get time() {
    return this.virtualTime.seconds;
  }

  usePlaying(): [playing: boolean, setPlaying: (playing: boolean) => void] {
    const { context } = this;
    const [playing, setPlaying] = React.useState(false);
    React.useEffect(() => {
      const handler = () => setPlaying(context.playing);
      context.eventPaintingChange.addListener(handler);
      return () => context.eventPaintingChange.removeListener(handler);
    }, []);

    return [
      playing,
      (v: boolean) => {
        if (v) context.play();
        else context.pause();
      },
    ];
  }

  get color(): {
    R: number;
    G: number;
    B: number;
    A: number;
    toVec4: () => TgdVec4;
    toString: () => string;
  } {
    return this._color;
  }

  /**
   * @returns Progress of the animation (between 0.0 and 1.0).
   */
  get progress() {
    const { spike } = this;
    if (!spike) return 0;

    const { time } = this;
    const duration = spike.timeMaxInSeconds - spike.timeMinInSeconds;
    const progress = time / duration;
    if (progress > 1) {
      this.virtualTime.reset();
      this.context?.pause();
      return 0;
    }

    return Math.max(progress, 0);
  }
  set progress(progress: number) {
    const { spike } = this;
    if (!spike) return;

    const duration = spike.timeMaxInSeconds - spike.timeMinInSeconds;
    const seconds = duration * progress;
    this.virtualTime.seconds = seconds;
  }

  get playing() {
    return this.context?.playing ?? false;
  }

  /**
   * @returns The intensity of the spiking at current time (between 0.0 and 1.0).
   */
  get intensity(): number {
    const { spike } = this;
    if (!spike) return 0;

    const { progress } = this;
    const t = progress * (spike.timeMaxInSeconds - spike.timeMinInSeconds) + spike.timeMinInSeconds;
    let a = 0;
    const data = spike.spikesInSeconds;
    let b = data.length - 1;
    let m = 0;
    let loops = Math.ceil(Math.log2(data.length));
    while (loops-- > 0) {
      m = Math.floor((a + b) / 2);
      const value = data[m];
      if (value === t) {
        a = m;
        b = m;
        break;
      } else if (value > t) {
        b = m;
      } else {
        a = m;
      }
    }
    m = Math.floor((a + b) / 2);
    const factor = 1 / (this.speed * this._flashTime);
    const computeIntensity = (index: number) => 1 - Math.min(Math.abs(data[index] - t) * factor, 1);
    let intensity = computeIntensity(m);
    if (m < data.length - 1) {
      intensity += computeIntensity(m + 1);
    }
    return intensity;
  }

  get spikes(): MorphoViewerSpikeRecord[] {
    return this._spikes;
  }
  set spikes(spikes: MorphoViewerSpikeRecord[]) {
    if (this._spikes === spikes) return;

    this._spikes = spikes;
    this.spikeIndex = spikes.length - 1;
    this.eventSpikesChange.dispatch(spikes);
  }

  get spike(): MorphoViewerSpikeRecord | undefined {
    return this._spikes[this._spikeIndex];
  }
  private set spike(spike: MorphoViewerSpikeRecord | undefined) {
    if (spike === this._spike) return;

    this._spike = spike;
    spike?.spikesInSeconds.sort((a, b) => a - b);
    this.virtualTime.reset();
    this.eventSpikeChange.dispatch(spike);
  }

  get spikeIndex() {
    return this._spikeIndex;
  }
  set spikeIndex(spikeIndex: number) {
    if (spikeIndex === this._spikeIndex) return;

    this._spikeIndex = spikeIndex;
    this.spike = this.spikes[spikeIndex];
    const { spike } = this;
    if (spike) {
      this._color.parse(spike.color);
    }
    this.eventSpikeIndexChange.dispatch(spikeIndex);
    this.eventSpikeChange.dispatch(this.spike);
  }
}
