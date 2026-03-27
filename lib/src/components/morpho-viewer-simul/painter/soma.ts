import { TgdVec3 } from "@tolokoban/tgd";

import {
  type MorphoViewerTree,
  type MorphoViewerTreeItem,
  MorphoViewerTreeItemType,
} from "../types/public";

export function findSoma(tree: MorphoViewerTree) {
  let somaTreeItem: MorphoViewerTreeItem | null = null;
  const somaCenter = new TgdVec3(0, 0, 0);
  let somaCount = 0;
  const fringe = tree.roots.slice();
  while (fringe.length > 0) {
    const item = fringe.shift();
    if (!item) continue;

    if (item?.children) fringe.push(...item.children);
    if (item.type === MorphoViewerTreeItemType.Soma) {
      if (!somaTreeItem) somaTreeItem = item;
      somaCenter.add([item.x, item.y, item.z]);
      somaCount++;
    }
  }
  if (somaCount > 0) somaCenter.scale(1 / somaCount);
  return {
    somaTreeItem,
    somaCenter: new TgdVec3(),
    somaCount,
  };
}

export function parentOrphansToSoma(
  morphology: MorphoViewerTree,
  somaTreeItem: MorphoViewerTreeItem | null,
) {
  const singleRoot = somaTreeItem ?? morphology.roots[0];
  if (!singleRoot) return;

  const children = singleRoot.children ?? [];
  for (const root of morphology.roots) {
    if (root !== singleRoot) {
      children.push(root);
    }
  }
  singleRoot.children = children;
  morphology.roots = [singleRoot];
  return singleRoot;
}
