import { MorphoViewerSignals } from "@openbraininstitute/morphoviewer";
import React from "react";

export function useSignals(): MorphoViewerSignals {
  const ref = React.useRef<MorphoViewerSignals>(null);
  if (!ref.current) ref.current = new MorphoViewerSignals();
  return ref.current;
}
