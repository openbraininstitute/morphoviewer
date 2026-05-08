import React from "react";

import styles from "./success-grid.module.css";

export interface SuccessGridProps {
  filesGood: string[];
  filesBad: string[];
}

export function SuccessGrid({ filesGood, filesBad }: SuccessGridProps) {
  const diagnostic = React.useMemo(() => {
    const countsGood = countPerLevel(filesGood);
    const countsBad = countPerLevel(filesBad);
    const result: Array<{ good: number; total: number }> = [];
    for (let i = 0; i < Math.max(countsBad.length, countsGood.length); i++) {
      const good = countsGood[i] ?? 0;
      const total = good + (countsBad[i] ?? 0);
      result.push({ good, total });
    }
    if (result.length === 1) {
      if (result[0].total === 0) return [];
    }
    return result;
  }, [filesGood, filesBad]);
  if (diagnostic.length === 0) return null;

  const good: number = diagnostic.reduce((acc, item) => acc + (item?.good ?? 0), 0);
  const total: number = diagnostic.reduce((acc, item) => acc + (item?.total ?? 0), 0);

  return (
    <table className={styles.successGrid}>
      <tr>
        <th className={styles.empty}></th>
        <th>Good</th>
        <th>Total</th>
        <th>Percent</th>
      </tr>
      {diagnostic.map(({ good, total }, index) => (
        <tr key={`level-${index}`}>
          <th key={`level-${index}`}>LOD #{index}</th>
          <td key={`good-${index}`} className={styles.good}>
            {good}
          </td>
          <td key={`bad-${index}`} className={styles.total}>
            {total}
          </td>
          <td key={`success-${index}`} className={styles.success}>
            {Math.round((100 * good) / total)} %
          </td>
        </tr>
      ))}
      <tr>
        <th>Total</th>
        <td className={styles.good}>{good}</td>
        <td className={styles.total}>{total}</td>
        <td className={styles.success}>{Math.round((100 * good) / total)} %</td>
      </tr>
    </table>
  );
}

function countPerLevel(files: string[]) {
  let maxLevel = 0;
  const map = new Map<number, number>();
  for (const file of files) {
    const level = Math.floor(file.length / 3);
    maxLevel = Math.max(maxLevel, level);
    const previousValue = map.get(level);
    map.set(level, (previousValue ?? 0) + 1);
  }
  const result: number[] = [];
  for (let level = 0; level <= maxLevel; level++) {
    result.push(map.get(level) ?? 0);
  }
  return result;
}
