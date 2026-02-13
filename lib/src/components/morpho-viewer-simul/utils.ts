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
