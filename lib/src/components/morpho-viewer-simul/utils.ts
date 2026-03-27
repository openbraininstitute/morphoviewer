import { MorphoViewerTreeItemType } from "./types/public";

export function resolveTypeName(type: MorphoViewerTreeItemType) {
  switch (type) {
    case MorphoViewerTreeItemType.Soma:
      return "soma";
    case MorphoViewerTreeItemType.Axon:
      return "axon";
    case MorphoViewerTreeItemType.Dendrite:
      return "dend";
    case MorphoViewerTreeItemType.ApicalDendrite:
      return "dend";
    case MorphoViewerTreeItemType.BasalDendrite:
      return "dend";
    case MorphoViewerTreeItemType.Myelin:
      return "myel";
    default:
      return "unknown";
  }
}

/**
 * The section index is at the end of the name, surrounded by square brackets.
 *
 * Example: `dend[32]`
 */
export function resolveSectionIndex(sectionName: string): number {
  const i = sectionName.indexOf("[");
  const suffix = sectionName.slice(i + 1);
  return parseInt(suffix.slice(0, suffix.length - 1), 10);
}
