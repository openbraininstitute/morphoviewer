import { IconSpinner } from "@/icons/spinner";
import { classNames } from "@/utils";

import styles from "./morpho-viewer-spinner.module.css";

export interface MorphoViewerSpinnerProps {
  className?: string;
  label?: string;
}

export function MorphoViewerSpinner({ className, label = "Neuron" }: MorphoViewerSpinnerProps) {
  return (
    <div className={classNames(className, styles.morphoViewerSpinner)}>
      <IconSpinner />
      <div>
        Loading
        <br />
        {label}
      </div>
    </div>
  );
}
