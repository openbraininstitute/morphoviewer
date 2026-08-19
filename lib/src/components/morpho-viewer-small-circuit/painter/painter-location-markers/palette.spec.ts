import { buildMarkerPalette } from "./palette"

const AMBER = "#ef9f27"

describe("buildMarkerPalette", () => {
    it("uses the fallback colour when no marker names one", () => {
        const { palette, slots } = buildMarkerPalette(
            [{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }],
            AMBER
        )

        expect(palette).toEqual([AMBER])
        expect(slots).toEqual([0, 0])
    })

    it("gives each colour one palette entry, shared by every marker using it", () => {
        const { palette, slots } = buildMarkerPalette(
            [
                { x: 0, y: 0, z: 0, color: "#f00" },
                { x: 0, y: 0, z: 0, color: "#0f0" },
                { x: 0, y: 0, z: 0, color: "#f00" },
            ],
            AMBER
        )

        expect(palette).toEqual(["#f00", "#0f0"])
        expect(slots).toEqual([0, 1, 0])
    })

    it("mixes markers with and without a colour", () => {
        const { palette, slots } = buildMarkerPalette(
            [{ x: 0, y: 0, z: 0, color: "#f00" }, { x: 0, y: 0, z: 0 }],
            AMBER
        )

        expect(palette).toEqual(["#f00", AMBER])
        expect(slots).toEqual([0, 1])
    })

    it("has nothing to build for no markers", () => {
        expect(buildMarkerPalette([], AMBER)).toEqual({ palette: [], slots: [] })
    })
})
