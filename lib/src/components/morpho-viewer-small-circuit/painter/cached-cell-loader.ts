import type { CacheLRU } from "@/tools/cache-lru";
import type { MorphoViewerSmallCircuitCellData } from "../types";

type CellLoader = (id: string) => Promise<MorphoViewerSmallCircuitCellData | null>;

/**
 * Ask the host for a morphology once, and hold on to what it answered.
 *
 * Filed under the whole cell id and asked for by the path alone: a cell id's query part is a
 * reload key, the one thing that says this cell wants other geometry than what is held for it,
 * and the host never sees it. A cache that dropped the key before looking would hand back
 * exactly what the key was raised to replace — for a population hidden and shown again under a
 * new key, until the entry aged out of the cache on its own.
 *
 * The promise is cached rather than its result, so cells asking for the same morphology at the
 * same time share one request.
 */
export function cachedCellLoader(
  cache: CacheLRU<Promise<MorphoViewerSmallCircuitCellData | null>>,
  loadCell: CellLoader
): CellLoader {
  return (id: string) => {
    const cached = cache.get(id);
    if (cached) return cached;

    const [path] = id.split("?");
    const promise = loadCell(path);
    cache.set(id, promise);
    return promise;
  };
}
