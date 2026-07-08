import { ViewOptions } from "@tolokoban/ui";

import type { ScalebarConfig } from "@openbraininstitute/morphoviewer";

export interface PlacementProps {
  value: ScalebarConfig | boolean;
  onUpdate(part: Partial<ScalebarConfig>): void;
}

export function Placement({ value, onUpdate }: PlacementProps) {
  const actualValue = resolvePlacement(value);

  return (
    <div>
      <ViewOptions
        label="placement"
        value={actualValue}
        onChange={(placement) => onUpdate({ placement })}
      >
        <div key="top">top</div>
        <div key="bottom">bottom</div>
        <div key="left">left</div>
        <div key="right">right</div>
        <div key="top-left">top-left</div>
        <div key="top-right">top-right</div>
        <div key="bottom-left">bottom-left</div>
        <div key="bottom-right">bottom-right</div>
      </ViewOptions>
    </div>
  );
}

function resolvePlacement(value: boolean | ScalebarConfig): ScalebarConfig["placement"] {
  const DEFAULT = "bottom-left";
  if (typeof value === "boolean") return DEFAULT;
  return value.placement ?? DEFAULT;
}
