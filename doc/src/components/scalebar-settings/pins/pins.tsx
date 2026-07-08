import { ViewInputNumber, ViewOptions, ViewSwitch } from "@tolokoban/ui";

import type { ScalebarConfig } from "@openbraininstitute/morphoviewer";

export interface PinsProps {
  value: ScalebarConfig | boolean;
  onUpdate(part: Partial<ScalebarConfig>): void;
}

const DEFAULT = undefined;
const DEFAULT_LEFT = "always";
const DEFAULT_RIGHT = "hover";
const DEFAULT_MAJOR_LENGTH = 10;
const DEFAULT_MINOR_LENGTH = 5;
const DEFAULT_MINOR_PER_MAJOR = 5;

export function Pins({ value, onUpdate }: PinsProps) {
  const pins = resolvePins(value);

  return (
    <>
      <ViewSwitch
        value={!!pins}
        onChange={(v) => {
          if (v) onUpdate({ pins: {} });
          else onUpdate({ pins: undefined });
        }}
      >
        pins
      </ViewSwitch>
      {pins && (
        <ViewOptions
          label="pins.left"
          value={pins.left ?? DEFAULT_LEFT}
          onChange={(left) =>
            onUpdate({
              pins: { ...pins, left },
            })
          }
        >
          <div key="hover">hover</div>
          <div key="never">never</div>
          <div key="always">always</div>
        </ViewOptions>
      )}
      {pins && (
        <ViewOptions
          label="pins.right"
          value={pins.right ?? DEFAULT_LEFT}
          onChange={(right) =>
            onUpdate({
              pins: { ...pins, right },
            })
          }
        >
          <div key="hover">hover</div>
          <div key="never">never</div>
          <div key="always">always</div>
        </ViewOptions>
      )}
      {pins && (
        <ViewInputNumber
          label="pins.majorLength"
          value={pins.majorLength ?? DEFAULT_MAJOR_LENGTH}
          onChange={(majorLength) => onUpdate({ pins: { ...pins, majorLength } })}
          width="4em"
        />
      )}
      {pins && (
        <ViewInputNumber
          label="pins.minorLength"
          value={pins.minorLength ?? DEFAULT_MINOR_LENGTH}
          onChange={(minorLength) => onUpdate({ pins: { ...pins, minorLength } })}
          width="4em"
        />
      )}
      {pins && (
        <ViewInputNumber
          label="pins.minorPerMajor"
          value={pins.minorPerMajor ?? DEFAULT_MINOR_PER_MAJOR}
          onChange={(minorPerMajor) => onUpdate({ pins: { ...pins, minorPerMajor } })}
          width="4em"
        />
      )}
    </>
  );
}

function resolvePins(value: boolean | ScalebarConfig): ScalebarConfig["pins"] | undefined {
  if (typeof value === "boolean") return DEFAULT;
  return value.pins ?? DEFAULT;
}
