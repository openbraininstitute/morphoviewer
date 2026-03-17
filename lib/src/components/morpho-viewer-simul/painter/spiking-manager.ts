import { TgdColor, TgdContext, TgdEvent, TgdTime, TgdVec4 } from "@tolokoban/tgd";
import { useEventValue } from "@/utils";
import { MorphoViewerSpikeRecord } from "../types/public";

export class SpikingManager {
  public readonly eventPlayingChange = new TgdEvent<boolean>();
  public readonly eventSpikesChange = new TgdEvent<MorphoViewerSpikeRecord[]>();
  public readonly eventSpikeChange = new TgdEvent<MorphoViewerSpikeRecord | undefined>();
  public readonly eventSpikeIndexChange = new TgdEvent<number>();

  private readonly _color = new TgdColor(1, 1, 1, 1);
  private _spikes: MorphoViewerSpikeRecord[] = [];
  private _spike: MorphoViewerSpikeRecord | undefined = undefined;
  private _spikeIndex = 0;
  private _flashTime = 0.1;
  private _playing = false;
  private readonly virtualTime = new TgdTime();
  private context: TgdContext | undefined = undefined;

  get time() {
    return this.virtualTime.seconds;
  }

  bind(context: TgdContext) {
    this.unbind();
    this.context = context;
    this.virtualTime.bind(context);
    this._playing = context.playing;
    this.eventPlayingChange.dispatch(context.playing);
    context.eventPaintEnter.addListener(this.handlePaintEnter);
  }

  unbind() {
    this.context?.eventPaintEnter.removeListener(this.handlePaintEnter);
    this.context = undefined;
    this.virtualTime.unbind();
    this.eventPlayingChange.dispatch(false);
  }

  usePlaying(): [playing: boolean, setPlaying: (playing: boolean) => void] {
    const playing = useEventValue(this.playing, this.eventPlayingChange);
    return [
      playing,
      (v: boolean) => {
        const { context } = this;
        if (context) context.playing = v;
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
    const factor = spike.speed / this._flashTime;
    const computeIntensity = (index: number) => 1 - Math.min(Math.abs(data[index] - t) * factor, 1);
    let intensity = computeIntensity(m);
    if (m < data.length - 1) {
      intensity += computeIntensity(m + 1);
    }
    // console.log();
    // console.log(data[m], "<", t, "<", data[m + 1]);
    // console.log(data.map((v) => v.toFixed(2)).join(", "));
    // console.log("🐞 [spiking-manager@124] intensity =", intensity); // @FIXME: Remove this line written on 2026-03-17 at 15:28
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
    spike?.spikesInSeconds.sort();
    this.virtualTime.reset();
    // this.virtualTime.speed = spike?.speed ?? 1;
    this.eventSpikeChange.dispatch(spike);
  }

  get spikeIndex() {
    return this._spikeIndex;
  }
  set spikeIndex(spikeIndex: number) {
    if (spikeIndex === this._spikeIndex) return;

    this._spikeIndex = spikeIndex;
    const { spike } = this;
    if (spike) {
      this._color.parse(spike.color);
    }
    this.eventSpikeIndexChange.dispatch(spikeIndex);
    this.eventSpikeChange.dispatch(this.spike);
  }

  private handlePaintEnter = (context: TgdContext) => {
    if (context.playing === this._playing) return;

    this.eventPlayingChange.dispatch(context.playing);
  };
}
