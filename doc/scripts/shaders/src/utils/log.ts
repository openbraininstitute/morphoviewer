export function logError(...args: unknown[]) {
    const text = args
        .map(arg => {
            if (arg instanceof Error) {
                if (arg.stack) console.error(arg.stack)
                return arg.message
            }
            if (typeof arg === "string") return arg
            if (typeof arg === "number") return color(`${arg}`, "Yellow")
            return color(stringify(arg), "LightRed")
        })
        .join(" ")
    console.error(color(text, "White", "BgRed"))
}

export function logWarning(...args: unknown[]) {
    const text = args
        .map(arg => {
            if (typeof arg === "string") return arg
            if (typeof arg === "number") return color(`${arg}`, "Yellow")
            return color(stringify(arg), "Yellow")
        })
        .join(" ")
    console.error(color(text, "Black", "BgYellow"))
}

export function logDebug(...args: unknown[]) {
    const text = args
        .map(arg => {
            if (typeof arg === "string") return color(arg, "Cyan")
            if (typeof arg === "number") return color(`${arg}`, "Yellow")
            return color(stringify(arg), "LightCyan")
        })
        .join(" ")
    console.log(text)
}

function stringify(data: unknown): string {
    try {
        return JSON.stringify(data, null, "  ")
    } catch (ex) {
        return `${ex}`
    }
}

const COLORS = {
    Black: "30",
    BgBlack: "40",
    Red: "31",
    BgRed: "41",
    Green: "32",
    BgGreen: "42",
    Brown: "33",
    BgBrown: "43",
    Blue: "34",
    BgBlue: "44",
    Purple: "35",
    BgPurple: "45",
    Cyan: "36",
    BgCyan: "46",
    LightGray: "37",
    BgLightGray: "47",
    DarkGray: "1;30",
    BgDarkGray: "1;40",
    LightRed: "1;31",
    BgLightRed: "1;41",
    LightGreen: "1;32",
    BgLightGreen: "1;42",
    Yellow: "1;33",
    BgYellow: "1;43",
    LightBlue: "1;34",
    BgLightBlue: "1;44",
    LightPurple: "1;35",
    BgLightPurple: "1;45",
    LightCyan: "1;36",
    BgLightCyan: "1;46",
    White: "1;37",
    BgWhite: "1;47",
}

export function color(text: string, ...codes: Array<keyof typeof COLORS>) {
    return `\x1b[${codes.map(key => COLORS[key]).join(";")}m${text}\x1b[0m`
}
