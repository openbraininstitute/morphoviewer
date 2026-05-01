import { ViewInputNumber, ViewSlider, ViewSwitch } from "@tolokoban/ui";

import type { MorphoViewerOctreeProps } from "@openbraininstitute/morphoviewer";

import styles from "./gizmo-settings.module.css";

export interface GizmoSettingsProps {
  value: MorphoViewerOctreeProps["gizmo"];
  onChange(value: MorphoViewerOctreeProps["gizmo"]): void;
}

export function GizmoSettings({ value, onChange }: GizmoSettingsProps) {
  const flag = !!value;
  const gizmo = resolveGizmo(value ?? false);
  const update = (
    partial: Partial<{ alignX: number; alignY: number; size: number; margin: number }>
  ) => {
    onChange({
      ...gizmo,
      ...partial,
    });
  };

  return (
    <div className={styles.gizmoSettings}>
      <ViewSwitch
        value={flag}
        onChange={(newFlag) => {
          const newValue = newFlag ? gizmo : false;
          onChange(newValue);
        }}
      >
        Gizmo
      </ViewSwitch>
      {!!value && (
        <>
          <ViewInputNumber
            label="alignX"
            value={gizmo.alignX}
            onChange={(alignX) => update({ alignX })}
          />
          <ViewInputNumber
            label="alignY"
            value={gizmo.alignY}
            onChange={(alignY) => update({ alignY })}
          />
          <ViewInputNumber label="size" value={gizmo.size} onChange={(size) => update({ size })} />
          <ViewInputNumber
            label="margin"
            value={gizmo.margin}
            onChange={(margin) => update({ margin })}
          />
        </>
      )}
    </div>
  );
}

const DEFAULT_GIZMO_PROPS = {
  alignX: +1,
  alignY: -1,
  size: 128,
  margin: 8,
};

function resolveGizmo(
  value: boolean | { alignX: number; alignY: number; size: number; margin: number }
): { alignX: number; alignY: number; size: number; margin: number } {
  if (typeof value === "boolean") return DEFAULT_GIZMO_PROPS;
  return {
    ...DEFAULT_GIZMO_PROPS,
    ...value,
  };
}
