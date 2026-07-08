import { ViewOptions } from "@tolokoban/ui";

import type { ScalebarConfig } from "@openbraininstitute/morphoviewer";

export interface OrientationProps {
  value: ScalebarConfig | boolean;
  onUpdate(part: Partial<ScalebarConfig>): void;
}

export function Orientation({ value, onUpdate }: OrientationProps) {
  const actualValue = resolveOrientation(value);

  return (
    <div>
      <ViewOptions
        label="orientation"
        value={actualValue}
        onChange={(orientation) => onUpdate({ orientation })}
      >
        <div key="horizontal">horizontal</div>
        <div key="vertical">vertical</div>
      </ViewOptions>
    </div>
  );
}

function resolveOrientation(value: boolean | ScalebarConfig): ScalebarConfig["orientation"] {
  const DEFAULT = "horizontal";
  if (typeof value === "boolean") return DEFAULT;
  return value.orientation ?? DEFAULT;
}
