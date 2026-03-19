import React from "react";
import { useEventValue } from "@/utils";
import { SpikingManager } from "../spiking-manager";
import PlayButton from "./play-button";
import SimulCombo from "./simul-combo";
import { SpeedCombo } from "./speed-combo";

export interface SpikingControllerProps {
  spikingManager: SpikingManager;
}

export default function SpikingController({ spikingManager }: SpikingControllerProps) {
  const spikes = useEventValue(spikingManager.spikes, spikingManager.eventSpikesChange);

  if (spikes.length === 0) return;

  return (
    <>
      <PlayButton spikingManager={spikingManager} />
      <SpeedCombo spikingManager={spikingManager} />
      <SimulCombo spikingManager={spikingManager} spikes={spikes} />
    </>
  );
}
