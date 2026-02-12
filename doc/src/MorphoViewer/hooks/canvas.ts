import { GizmoCanvas, MorphologyCanvas } from "@bbp/morphoviewer";
import React from "react";

export function useMorphologyCanvas() {
  const ref = React.useRef<MorphologyCanvas | null>(null);
  if (!ref.current) ref.current = new MorphologyCanvas();
  return ref.current;
}

export function useGizmoCanvas() {
  const ref = React.useRef<GizmoCanvas | null>(null);
  if (!ref.current) ref.current = new GizmoCanvas();
  return ref.current;
}
