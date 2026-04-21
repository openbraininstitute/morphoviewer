import { MorphoViewerSpikeRecord } from "@bbp/morphoviewer";
import { IconPause, IconPlay, ViewPanel, ViewSlider, ViewSwitch } from "@tolokoban/ui";
import { classNames } from "@/utils";
import { makeRandomSpikes } from "../../hook";

import styles from "./spikes-settings.module.css";

export interface SpikesSettingsProps {
  className?: string;
  spikes: MorphoViewerSpikeRecord[];
  onSpikesChange(spikes: MorphoViewerSpikeRecord[]): void;
  spikeProgress: number;
  onSpikeProgressChange(spikeProgress: number): void;
  spikePlaying: boolean;
  onSpikePlayingChange(spikePlaying: boolean): void;
}

export function SpikesSettings({
  className,
  spikes,
  onSpikesChange,
  spikeProgress,
  onSpikeProgressChange,
  spikePlaying,
  onSpikePlayingChange,
}: SpikesSettingsProps) {
  const handleSwitch = () => {
    if (spikes.length === 0) {
      onSpikesChange(makeRandomSpikes());
    } else {
      onSpikesChange([]);
    }
  };
  return (
    <div className={classNames(className, styles.spikesSettings)}>
      <ViewPanel color="neutral-7" padding="M" margin={["L", 0]}>
        <ViewSwitch value={spikes.length > 0} onChange={handleSwitch}>
          Enable Spikes
        </ViewSwitch>
        {spikes.length > 0 && (
          <ViewPanel fullwidth display="grid" gridTemplateColumns="auto 1fr" gap="M">
            {spikePlaying && <IconPause onClick={() => onSpikePlayingChange(false)} />}
            {!spikePlaying && <IconPlay onClick={() => onSpikePlayingChange(true)} />}
            <ViewSlider
              value={spikeProgress}
              onChange={onSpikeProgressChange}
              min={0}
              max={1}
              step={1e-6}
            />
          </ViewPanel>
        )}
      </ViewPanel>
    </div>
  );
}
