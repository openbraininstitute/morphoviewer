import React from "react";

import { MorphoViewerIconPause } from "@/components/icons/pause";
import { MorphoViewerIconPlay } from "@/components/icons/play";
import { classNames } from "@/utils";

import { SpikingManager } from "../../../painter/spiking-manager";

import styles from "./play-button.module.css";

export interface PlayButtonProps {
  spikingManager: SpikingManager;
}

export default function PlayButton({ spikingManager }: PlayButtonProps) {
  const [playing, setPlaying] = spikingManager.usePlaying();

  return (
    <button
      type="button"
      className={classNames(styles.playButton)}
      onClick={() => {
        setPlaying(!playing);
      }}
    >
      {playing ? <MorphoViewerIconPause /> : <MorphoViewerIconPlay />}
    </button>
  );
}
