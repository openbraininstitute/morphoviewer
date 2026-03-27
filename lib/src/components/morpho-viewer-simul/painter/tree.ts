import { type ArrayNumber3, TgdVec3 } from "@tolokoban/tgd";

import { MorphoViewerTreeItemType } from "../types/public";

import type { StructureItem } from "./structure";

export function builTree(
  items: StructureItem[],
  soma: StructureItem | null,
): StructureItem {
  const map = new Map<string, StructureItem>();
  for (const item of items) map.set(key3D(item.end), item);
  for (const item of items) {
    if (item.parent) continue;

    const parent = map.get(key3D(item.start));
    if (!parent) continue;

    parent.children.push(item);
    item.parent = parent;
    if (parent.type !== MorphoViewerTreeItemType.Soma) {
      item.radiusStart = parent.radiusEnd;
    }
  }
  // Roots: items without parents.
  const [root, ...orphans] = items.filter((item) => !item.parent);
  for (const item of orphans) {
    root.children.push(item);
    item.parent = root;
  }
  populateTree(root);
  computeRanks(root);
  addLiaisons(root, items);
  return root;
}

export function debugTree(item: StructureItem, depth = 0) {
  try {
    // biome-ignore lint/suspicious/noConsole: this function is here for debugging
    console.debug(`${"| ".repeat(depth)}${item.name}`);
    for (const child of item.children) debugTree(child, depth + 1);
  } catch (ex) {
    // biome-ignore lint/suspicious/noConsole: this function is here for debugging
    console.error(ex);
    // biome-ignore lint/suspicious/noConsole: this function is here for debugging
    console.error(item);
  }
}

function key3D([x, y, z]: ArrayNumber3) {
  const PRECISION = 3;
  return `${x.toFixed(PRECISION)}/${y.toFixed(PRECISION)}/${z.toFixed(PRECISION)}`;
}

export function populateTree(item: StructureItem, distance = 0) {
  if (!item) return;

  item.distanceFromSoma = distance;
  const newDistance = distance + item.segmentLength;
  item.leavesCount = item.children.length > 0 ? 0 : 1;
  item.maxLength = 0;
  for (const child of item.children) {
    populateTree(child, newDistance);
    item.leavesCount += child.leavesCount;
    item.maxLength = Math.max(item.maxLength, child.maxLength);
  }
  item.maxLength += item.segmentLength;
}

export function computeRanks(item: StructureItem, rankMin = -1, rankMax = +1) {
  if (!item) return;

  item.rank = (rankMin + rankMax) / 2;
  const rankSize = Math.abs(rankMax - rankMin);
  let rank = rankMin;
  for (const child of item.children) {
    const rankChildSize = (rankSize * child.leavesCount) / item.leavesCount;
    computeRanks(child, rank, rank + rankChildSize);
    rank += rankChildSize;
  }
}

/**
 * We want to be able to transition smoothly between the 3D view and the dendrogram view.
 * That's why we need to have the exact same number of segments in both views.
 * The `liaisons` are non-interactive horizontal segments, that will ony have a non-null length
 * in dendrogram mode.
 */
export function addLiaisons(root: StructureItem, items: StructureItem[]) {
  if (!root) return;

  if (root.children.length > 1) {
    for (let index = 0; index < root.children.length; index++) {
      const child = root.children[index];
      const liaison: StructureItem = {
        ...child,
        name: `${root.name} > ${child.name}`,
        type: MorphoViewerTreeItemType.Liaison,
        index: root.index,
        start: [...root.end],
        end: [...child.start],
        radiusStart: 1e-3,
        radiusEnd: 1e-3,
        children: [child],
      };
      const [x1, y1, z1] = liaison.start;
      const [x2, y2, z2] = liaison.end;
      const x = x2 - x1;
      const y = y2 - y1;
      const z = z2 - z1;
      const distance = x * x + y * y + z * z;
      if (distance > 1e-12) {
        console.log(root.name, "->", child.name, Math.sqrt(distance), liaison);
      }
      items.push(liaison);
      root.children[index] = liaison;
      addLiaisons(child, items);
    }
  } else {
    for (const child of root.children) {
      addLiaisons(child, items);
    }
  }
}
