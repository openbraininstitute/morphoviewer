import { SpikingManager } from "@/components/morpho-viewer-simul/painter/spiking-manager";
import styles from "./current-time.module.css";
import { useEventValue } from "@/utils";
import { TIMELINE_HEIGHT, TIMELINE_MARGIN } from "@/components/morpho-viewer-simul/contants";

export interface CurrentTimeProps {
  spikingManager: SpikingManager;
}

const [, RIGHT, BOTTOM, LEFT] = TIMELINE_MARGIN;

export function CurrentTime({ spikingManager }: CurrentTimeProps) {
  const progress = useEventValue(spikingManager.progress, spikingManager.eventProgressChange);
  const { spike } = spikingManager;
  if (!spike) return null;

  const { timeMinInSeconds, timeMaxInSeconds } = spike;
  const time = timeMinInSeconds + (timeMaxInSeconds - timeMinInSeconds) * progress;

  return (
    <div
      className={styles.currentTime}
      style={{
        "--custom-left": `${LEFT + TIMELINE_HEIGHT / 2}px`,
        "--custom-right": `${RIGHT + TIMELINE_HEIGHT / 2}px`,
        "--custom-bottom": `${BOTTOM}px`,
        "--custom-height": `${TIMELINE_HEIGHT}px`,
        "--custom-progress": `${progress}`,
      }}
    >
      {(time * 1e3).toFixed(0)} ms
    </div>
  );
}
