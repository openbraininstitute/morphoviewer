import type { TgdBoundingBox } from "@tolokoban/tgd";

import styles from "./bbox.module.css";

export interface BboxProps {
  bbox: TgdBoundingBox | null;
}

export default function Bbox({ bbox }: BboxProps) {
  if (!bbox) return null;

  const [minX, minY, minZ] = bbox.min;
  const [maxX, maxY, maxZ] = bbox.max;
  return (
    <div className={styles.bbox}>
      <div />
      <div>X</div>
      <div>Y</div>
      <div>Z</div>
      <div>Min</div>
      <strong>{minX.toFixed(3)}</strong>
      <strong>{minY.toFixed(3)}</strong>
      <strong>{minZ.toFixed(3)}</strong>
      <div>Max</div>
      <strong>{maxX.toFixed(3)}</strong>
      <strong>{maxY.toFixed(3)}</strong>
      <strong>{maxZ.toFixed(3)}</strong>
    </div>
  );
}
