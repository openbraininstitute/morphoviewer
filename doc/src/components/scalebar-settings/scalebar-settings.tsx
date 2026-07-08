import { ViewInputNumber, ViewSwitch } from "@tolokoban/ui";

import { classNames } from "@/utils";

import { Labels } from "./labels";
import { Orientation } from "./orientation";
import { Pins } from "./pins";
import { Placement } from "./placement";
import { Reveal } from "./reveal";
import { Thickness } from "./thickness";

import type { ScalebarConfig } from "@openbraininstitute/morphoviewer";

import styles from "./scalebar-settings.module.css";

let currentConfig: ScalebarConfig = {};

export interface ScalebarSettingsProps {
  className?: string;
  value: ScalebarConfig | boolean | string | undefined;
  onChange(value: ScalebarConfig | boolean): void;
}

export function ScalebarSettings({ className, value, onChange }: ScalebarSettingsProps) {
  const scalebar = resolveScalebar(value);
  const update = (part: Partial<ScalebarConfig>) => {
    currentConfig = {
      ...(typeof scalebar === "boolean" ? currentConfig : scalebar),
      ...part,
    };
    onChange(currentConfig);
  };

  return (
    <div className={classNames(className, styles.settingsScalebar)}>
      <ViewSwitch
        value={!!scalebar}
        onChange={(v) => {
          if (v) onChange(currentConfig);
          else onChange(false);
        }}
      >
        Scalebar
      </ViewSwitch>
      {scalebar && (
        <>
          <Orientation value={scalebar} onUpdate={update} />
          <Placement value={scalebar} onUpdate={update} />
          <Reveal value={scalebar} onUpdate={update} />
          <Labels value={scalebar} onUpdate={update} />
          <Pins value={scalebar} onUpdate={update} />
          <Thickness value={scalebar} onUpdate={update} />
          <ViewSwitch
            value={scalebar === true ? false : (scalebar.hiDPI ?? false)}
            onChange={(hiDPI) => update({ hiDPI })}
          >
            hiDPI
          </ViewSwitch>
        </>
      )}
    </div>
  );
}

function resolveScalebar(
  value: ScalebarConfig | boolean | string | undefined
): ScalebarConfig | boolean {
  if (!value) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return true;
  return value;
}
