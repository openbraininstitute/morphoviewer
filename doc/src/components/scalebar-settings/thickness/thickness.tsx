import { ViewInputNumber, ViewOptions } from "@tolokoban/ui";

import type { ScalebarConfig } from "@openbraininstitute/morphoviewer";

export interface ThicknessProps {
  value: ScalebarConfig | boolean;
  onUpdate(part: Partial<ScalebarConfig>): void;
}

const DEFAULT = 1;

export function Thickness({ value, onUpdate }: ThicknessProps) {
  const thickness = resolveThickness(value);

  return (
    <div>
      <ViewInputNumber
        label="thickness"
        value={thickness ?? DEFAULT}
        onChange={(thickness) => onUpdate({ thickness })}
        width="4em"
      />
    </div>
  );
}

function resolveThickness(value: boolean | ScalebarConfig): ScalebarConfig["thickness"] {
  if (typeof value === "boolean") return DEFAULT;
  return value.thickness ?? DEFAULT;
}
