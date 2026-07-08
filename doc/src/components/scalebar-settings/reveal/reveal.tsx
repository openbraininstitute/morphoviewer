import { ViewOptions } from "@tolokoban/ui";

import type { ScalebarConfig } from "@openbraininstitute/morphoviewer";

export interface RevealProps {
  value: ScalebarConfig | boolean;
  onUpdate(part: Partial<ScalebarConfig>): void;
}

export function Reveal({ value, onUpdate }: RevealProps) {
  const actualValue = resolveReveal(value);

  return (
    <div>
      <ViewOptions label="reveal" value={actualValue} onChange={(reveal) => onUpdate({ reveal })}>
        <div key="hover">hover</div>
        <div key="always">always</div>
      </ViewOptions>
    </div>
  );
}

function resolveReveal(value: boolean | ScalebarConfig): ScalebarConfig["reveal"] {
  const DEFAULT = "hover";
  if (typeof value === "boolean") return DEFAULT;
  return value.reveal ?? DEFAULT;
}
