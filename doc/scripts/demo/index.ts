import FS from "node:fs/promises"
import { existsSync, statSync } from "node:fs"
import Path, { dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const [_node, _script, arg] = process.argv
if (!arg) {
    console.error("")
    console.error("This script expect one and only one argument:")
    console.error("the path of the folder to parse.")
    console.error("")
    console.error('It will search for any file ending with ".demo.tsx".')
    console.error("This file must default export a React component.")
    console.error(
        'Then the script will generate a file "index.tsx" with a component'
    )
    console.error("that will demonstate it, along with the highlighted code.")
    console.error("")
    process.exit(1)
}
const ROOT = Path.resolve(__dirname, "../../")

function mtime(path: string): number {
    if (!existsSync(path)) return 0

    const stat = statSync(path)
    return stat.mtime.getTime()
}

async function processDemo(relPath: string) {
    try {
        const file = Path.resolve(ROOT, relPath)
        const filename = Path.basename(file)

        const path = Path.resolve(Path.dirname(file), "index.tsx")
        if (mtime(path) >= mtime(file)) {
            return
        }

        console.log("[Demo]", file.substring(ROOT.length))
        const code = await loadText(file)
        const [fullCode, focusedCode] = await parseCode(
            code,
            Path.dirname(file)
        )

        await saveText(
            path,
            codeLinesToString([
                `/**`,
                ` * Warning! This code has been generated automatically.`,
                ` */`,
                `import React from "react"`,
                `import { ViewButton } from "@tolokoban/ui"`,
                `import CodeViewer from "@/components/demo/CodeViewer"`,
                `import Demo from "./${filename.substring(
                    0,
                    filename.length - ".tsx".length
                )}"`,
                "",
                `const FOCUS = ${JSON.stringify(focusedCode)}`,
                `const FULL = ${JSON.stringify(fullCode)}`,
                "",
                "export default function DemoContainer() {",
                [
                    "const [full, setFull] = React.useState(false)",
                    "return <>",
                    [
                        `<div className="half-left"><Demo /></div>`,
                        `<div className="half-right">`,
                        [
                            "<div>",
                            [
                                `<ViewButton variant="elevated" onClick={() => setFull(!full)}>`,
                                [
                                    `{full ? "Show code details" : "Show full code"}`,
                                ],
                                `</ViewButton>`,
                            ],
                            "</div>",
                            `<CodeViewer language="tsx" value={full ? FULL : FOCUS} />`,
                        ],
                        "</div>",
                    ],
                    "</>",
                ],
                "}",
            ])
        )
    } catch (ex) {
        const msg = ex instanceof Error ? ex.message : JSON.stringify(ex)
        throw Error(`Unable to process demo file "${relPath}":\n${msg}`)
    }
}

const RX_BEGIN = /^\/\/[ \t]*#(begin|region)[ \t]*([^\n\r]*)$/g
const RX_END = /^\/\/[ \t]*#(end|endregion)[ \t]*$/g

class Matcher {
    private countForAnonymousRegions = 1

    matchBegin(line: string): null | string {
        RX_BEGIN.lastIndex = -1
        const match = RX_BEGIN.exec(line)
        if (!match) return null

        return match[2]?.trim() || `Detail #${this.countForAnonymousRegions++}`
    }

    matchEnd(line: string): boolean {
        RX_END.lastIndex = -1
        return RX_END.test(line)
    }
}

const RX_IMPORT =
    /^[ \t]*import[ \t]*[a-zA-Z0-9_]+[ \t]*from[ \t]*["'](\.[a-zA-Z0-9_\.\/\-\$\@]+\.(vert|frag))["']$/g

async function findShaderCodes(
    code: string,
    focused: Record<string, string>,
    folder: string
) {
    const lines = code.split("\n")
    for (const line of lines) {
        RX_IMPORT.lastIndex = -1
        const match = RX_IMPORT.exec(line)
        if (!match) continue

        const [, filename] = match
        const content = await loadText(Path.resolve(folder, filename))
        focused[
            `${
                filename.endsWith(".vert") ? "Vertex" : "Fragment"
            } shader "${filename}"`
        ] = content
    }
}

async function parseCode(
    code: string,
    folder: string
): Promise<[string, Record<string, string>]> {
    const matcher = new Matcher()
    const lines = code.split("\n")
    const full: string[] = []
    const focused: Record<string, string> = {}
    let activeRegion: string | null = null
    let currentRegion: string[] = []
    for (const line of lines) {
        const short = line.trim()
        const begin = matcher.matchBegin(short)
        if (begin) {
            activeRegion = begin
            currentRegion = []
            continue
        }
        if (activeRegion && matcher.matchEnd(short)) {
            if (focused[activeRegion]) {
                throw Error(
                    `The code region "${activeRegion}" has been defined twice in the same demo file!`
                )
            }
            focused[activeRegion] = currentRegion.join("\n")
            activeRegion = null
            continue
        }
        full.push(line)
        if (activeRegion) currentRegion.push(line)
    }
    await findShaderCodes(code, focused, folder)
    return [full.join("\n"), focused]
}

async function saveText(path: string, content: string) {
    return await FS.writeFile(path, content, { encoding: "utf-8" })
}

async function loadText(path: string): Promise<string> {
    if (!existsSync(path)) {
        console.warn("This file does not exist:", path)
        return ""
    }

    const content = await FS.readFile(path)
    return content.toString()
}

type Code = string | boolean | Code[]

function codeToString(code: Code, indent = "") {
    if (typeof code === "boolean") return ""
    if (typeof code === "string") return `${indent}${code}`

    const subIndent = `${indent}    `
    return code.map(section => codeToString(section, subIndent)).join("\n")
}

function codeLinesToString(lines: Code[]) {
    return lines
        .filter(line => typeof line !== "boolean")
        .map(line => codeToString(line))
        .join("\n")
}

async function findFiles(path: string, acceptedExtensions: string[]) {
    const jsFilter = info =>
        !info.isDirectory() && matchAnyExtension(info.name, acceptedExtensions)
    const dirFilter = info => !info.name.startsWith(".") && info.isDirectory()
    const files = await readDir(path, jsFilter)
    const fringe = await readDir(path, dirFilter)
    while (fringe.length > 0) {
        const folder = fringe.shift()
        if (!folder) continue

        const subFolders = await readDir(folder, dirFilter)
        subFolders.forEach(dir => fringe.push(dir))
        const subFiles = await readDir(folder, jsFilter)
        subFiles.forEach(f => files.push(f))
    }
    return files.map(f => Path.relative(path, f))
}

function matchAnyExtension(name, acceptedExtensions) {
    for (const ext of acceptedExtensions) {
        if (name.endsWith(ext)) return true
    }
    return false
}

/**
 * @param root {string}
 * @param filters {Array<(info: Dirent) => boolean>}
 * @return {Promise<string[]>}
 */
async function readDir(
    root: string,
    ...filters: Array<(info: Dirent) => boolean>
) {
    if (!existsSync(root)) throw Error(`[readDir] Path not found: "${root}"!`)

    const folders = []
    const items = await FS.readdir(root, {
        withFileTypes: true,
        encoding: "utf-8",
    })
    for (const item of items) {
        const { name } = item
        if (name === "." || name === "..") continue

        let pass = true
        for (const filter of filters) {
            if (!filter(item)) {
                pass = false
                break
            }
        }
        if (pass) folders.push(name)
    }
    folders.sort()
    return folders.map(name => Path.resolve(root, name))
}

async function start() {
    try {
        const demos = await findFiles(ROOT, [".demo.tsx"])
        console.log("Number of demos to inspect:", demos.length)
        for (const file of demos) {
            await processDemo(file)
        }
    } catch (ex) {
        if (ex instanceof Error) {
            console.error(ex.message)
        } else {
            console.error(ex)
        }
    }
}

console.log('Looking for demos: files ending with ".demo.tsx".')
void start()
