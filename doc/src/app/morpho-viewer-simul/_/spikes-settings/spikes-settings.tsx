import { ViewPanel, ViewSwitch } from "@tolokoban/ui";
import { classNames } from "@/utils";
import { makeRandomSpikes } from "../../hook";
import { MorphoViewerSpikeRecord } from "@bbp/morphoviewer";

import styles from "./spikes-settings.module.css";

export interface SpikesSettingsProps {
  className?: string;
  spikes: MorphoViewerSpikeRecord[];
  onSpikesChange(spikes: MorphoViewerSpikeRecord[]): void;
}

export function SpikesSettings({ className, spikes, onSpikesChange }: SpikesSettingsProps) {
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
      </ViewPanel>
    </div>
  );
}
