import { CacheLRU } from "@/tools/cache-lru";

import { cachedCellLoader } from "./cached-cell-loader";

import type { MorphoViewerSmallCircuitCellData } from "../types";

/** Stands in for a morphology: the loader only ever passes it along. */
function data(id: string) {
  return { id } as unknown as MorphoViewerSmallCircuitCellData;
}

function setup() {
  const asked: string[] = [];
  const cache = new CacheLRU<Promise<MorphoViewerSmallCircuitCellData | null>>(24);
  const load = cachedCellLoader(cache, (id) => {
    asked.push(id);
    return Promise.resolve(data(id));
  });
  return { asked, cache, load };
}

describe("cachedCellLoader", () => {
  it("asks the host by the path, without the reload key", async () => {
    const { asked, load } = setup();

    await load("circuit/cell#0?axon=on");

    expect(asked).toEqual(["circuit/cell#0"]);
  });

  it("asks once for a cell it has already answered", async () => {
    const { asked, load } = setup();

    await load("circuit/cell#0");
    await load("circuit/cell#0");

    expect(asked).toEqual(["circuit/cell#0"]);
  });

  it("asks again when the reload key changes", async () => {
    const { asked, load } = setup();

    // A population hidden and shown again with the axon filter turned off. The
    // key is the host saying this cell draws something else now, so answering
    // it from what is held would defeat the only thing the key is for.
    await load("circuit/cell#0?axon=on");
    await load("circuit/cell#0?axon=off");

    expect(asked).toEqual(["circuit/cell#0", "circuit/cell#0"]);
  });

  it("shares one request between cells asking at the same time", () => {
    const { load } = setup();

    expect(load("circuit/cell#0")).toBe(load("circuit/cell#0"));
  });
});
