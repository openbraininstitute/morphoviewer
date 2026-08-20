import { SpikingCircuit } from "./spiking-circuit";

import type { MorphoViewerSpikes } from "./types";

afterEach(() => {
  jest.restoreAllMocks();
});

/** Three cells; cell 0 fires at 100 ms, cell 1 at 200 ms, cell 2 twice. */
const SPIKES: MorphoViewerSpikes = {
  cellIndices: Uint32Array.from([0, 1, 2, 2]),
  times: Float32Array.from([100, 200, 300, 340]),
  timeMinInMs: 0,
  timeMaxInMs: 1000,
};

/** 0.1 s afterglow at 100 simulated ms per second gives a 10 ms decay constant. */
function circuitAt(timeInMs: number, cellCount = 3) {
  const spiking = new SpikingCircuit();
  spiking.setSpikes(SPIKES, cellCount);
  spiking.speed = 100;
  spiking.afterglowInSeconds = 0.1;
  spiking.timeInMs = timeInMs;
  return spiking;
}

describe("SpikingCircuit glow", () => {
  it("puts a cell at full brightness on its own spike", () => {
    expect(circuitAt(100).glow[0]).toBeCloseTo(1);
  });

  it("leaves cells that have not fired yet dark", () => {
    const { glow } = circuitAt(100);
    expect(glow[1]).toBe(0);
    expect(glow[2]).toBe(0);
  });

  it("decays to 1/e after one time constant", () => {
    expect(circuitAt(110).glow[0]).toBeCloseTo(Math.exp(-1));
  });

  it("drops a spike once it is past the cutoff", () => {
    // Five time constants on: below 1% and no longer worth drawing.
    expect(circuitAt(151).glow[0]).toBe(0);
  });

  it("keeps the brighter of two spikes on the same cell", () => {
    // The 340 ms spike is the recent one, so it wins over the 300 ms one.
    expect(circuitAt(345).glow[2]).toBeCloseTo(Math.exp(-0.5));
  });

  it("never lights a cell from a spike still in the future", () => {
    expect(circuitAt(199).glow[1]).toBe(0);
  });

  it("holds visibility constant in wall-clock time as speed changes", () => {
    const slow = circuitAt(110);
    const fast = circuitAt(100);
    fast.speed = 1000;
    // Ten times the speed covers ten times the simulated milliseconds in the
    // same second, so the same wall-clock moment is 100 simulated ms later.
    fast.timeInMs = 200;
    expect(fast.glow[0]).toBeCloseTo(slow.glow[0]);
  });

  it("ignores spikes for cells the circuit does not have", () => {
    // A `node_id` past the end of the circuit must not corrupt a neighbour.
    const spiking = circuitAt(300, 2);
    expect(Array.from(spiking.glow)).toEqual([0, 0]);
  });
});

describe("SpikingCircuit clock", () => {
  it("starts at the beginning of the recording", () => {
    const spiking = new SpikingCircuit();
    spiking.setSpikes({ ...SPIKES, timeMinInMs: 40 }, 3);
    expect(spiking.timeInMs).toBe(40);
  });

  it("clamps a seek to the recording", () => {
    const spiking = circuitAt(0);
    spiking.timeInMs = 5000;
    expect(spiking.timeInMs).toBe(1000);
    spiking.timeInMs = -20;
    expect(spiking.timeInMs).toBe(0);
  });

  it("rewinds when play is pressed at the end", () => {
    const spiking = circuitAt(1000);
    spiking.playing = true;
    expect(spiking.timeInMs).toBe(0);
  });

  it("does not advance while paused", () => {
    const spiking = circuitAt(500);
    expect(spiking.advance()).toBe(false);
    expect(spiking.timeInMs).toBe(500);
  });

  it("advances by however long the frame took", () => {
    const clock = fakeClock();
    const spiking = circuitAt(0);
    spiking.playing = true;
    clock.advanceBy(100);
    expect(spiking.advance()).toBe(false);
    // 100 simulated ms per wall-clock second, so a tenth of a second of frame
    // is ten simulated milliseconds.
    expect(spiking.timeInMs).toBeCloseTo(10);
  });

  it("stops at the end of the recording and says so", () => {
    const clock = fakeClock();
    const spiking = circuitAt(990);
    spiking.playing = true;
    clock.advanceBy(1000);
    expect(spiking.advance()).toBe(true);
    expect(spiking.timeInMs).toBe(1000);
    expect(spiking.playing).toBe(false);
  });

  it("never steps further in one frame than a spike stays visible", () => {
    const clock = fakeClock();
    const spiking = circuitAt(0);
    spiking.speed = 1000;
    // A 10 ms decay constant, so nothing is worth drawing more than 50 ms on.
    spiking.afterglowInSeconds = 0.01;
    spiking.playing = true;
    // Four frames a second: unclamped this would be a 250 ms step, straight
    // over every spike in the recording without drawing one of them.
    clock.advanceBy(400);
    spiking.advance();
    expect(spiking.timeInMs).toBeCloseTo(50);
  });

  it("stops playback when a new recording arrives", () => {
    const spiking = circuitAt(300);
    spiking.playing = true;
    spiking.setSpikes({ ...SPIKES, timeMinInMs: 40 }, 3);
    expect(spiking.playing).toBe(false);
    expect(spiking.timeInMs).toBe(40);
  });
});

describe("SpikingCircuit input", () => {
  it("reports a spike train that is out of order", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const spiking = new SpikingCircuit();
    spiking.setSpikes({ ...SPIKES, times: Float32Array.from([100, 200, 150, 340]) }, 3);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("says nothing about a sorted one", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    new SpikingCircuit().setSpikes(SPIKES, 3);
    expect(warn).not.toHaveBeenCalled();
  });
});

/**
 * Take over the wall clock the replay reads, so that a frame can be made to
 * take as long as the test needs it to.
 */
function fakeClock() {
  let nowInMs = 0;
  jest.spyOn(performance, "now").mockImplementation(() => nowInMs);
  return {
    advanceBy(durationInMs: number) {
      nowInMs += durationInMs;
    },
  };
}
