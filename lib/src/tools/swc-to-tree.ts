import {
    type MorphoViewerTree,
    type MorphoViewerTreeItem,
    MorphoViewerTreeItemType,
} from "@/components/morpho-viewer-simul/types/public"

export function morphoViewerConvertSwcIntoTree(
    swc: string,
    cellId: string
): MorphoViewerTree {
    const tree: MorphoViewerTree = {
        cellId,
        roots: [],
    }
    const lines = swc
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => !line.startsWith('#'))
        .map((line) => line.split(/[ \t]+/g).map(parseFloat))
        .filter((items) => items.length >= 7)
    const parents = new Map<number, MorphoViewerTreeItem>()
    for (const [index, type, x, y, z, radius, parent] of lines) {
        const item: MorphoViewerTreeItem = {
            distanceFromSoma: 0,
            sectionId: `${index}`,
            segmentId: `${index}.1`,
            type: resolveSwcType(type),
            x,
            y,
            z,
            radius,
        }
        const parentItem = parents.get(parent)
        if (parentItem) {
            if (!parentItem.children) parentItem.children = []
            parentItem.children.push(item)
        } else {
            tree.roots.push(item)
        }
        parents.set(index, item)
    }
    return tree
}

function resolveSwcType(type: number): MorphoViewerTreeItemType {
    switch (type) {
        case 1:
            return MorphoViewerTreeItemType.Soma
        case 2:
            return MorphoViewerTreeItemType.Axon
        case 3:
            return MorphoViewerTreeItemType.BasalDendrite
        case 4:
            return MorphoViewerTreeItemType.ApicalDendrite
        default:
            return MorphoViewerTreeItemType.Unknown
    }
}

