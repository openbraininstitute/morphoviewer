import { ViewOptions, ViewSwitch } from "@tolokoban/ui";

import type { ScalebarConfig } from "@openbraininstitute/morphoviewer";

export interface LabelsProps {
  value: ScalebarConfig | boolean;
  onUpdate(part: Partial<ScalebarConfig>): void;
}

const DEFAULT = undefined;
const DEFAULT_SHOW = "hover";
const DEFAULT_SIDE = "right";

export function Labels({ value, onUpdate }: LabelsProps) {
  const labels = resolveLabels(value);

  return (
    <>
      <ViewSwitch
        value={!!labels}
        onChange={(v) => {
          if (v) onUpdate({ labels: {} });
          else onUpdate({ labels: undefined });
        }}
      >
        labels
      </ViewSwitch>
      {labels && (
        <ViewOptions
          label="labels.show"
          value={labels.show ?? DEFAULT_SHOW}
          onChange={(show) =>
            onUpdate({
              labels: { ...labels, show },
            })
          }
        >
          <div key="hover">hover</div>
          <div key="never">never</div>
          <div key="always">always</div>
        </ViewOptions>
      )}
      {labels && (
        <ViewOptions
          label="labels.side"
          value={labels.side ?? DEFAULT_SIDE}
          onChange={(side) =>
            onUpdate({
              labels: { ...labels, side },
            })
          }
        >
          <div key="left">left</div>
          <div key="right">right</div>
        </ViewOptions>
      )}
    </>
  );
}

function resolveLabels(value: boolean | ScalebarConfig): ScalebarConfig["labels"] | undefined {
  if (typeof value === "boolean") return DEFAULT;
  return value.labels ?? DEFAULT;
}
