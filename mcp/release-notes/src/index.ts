import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { execSync } from "node:child_process"
import { readFileSync, mkdirSync, rmSync, writeFileSync, copyFileSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"

const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..", "..")
const RELEASE_NOTES_DIR = resolve(PROJECT_ROOT, ".release-notes")

const VERSION_FILES = ["package.json", "lib/package.json", "doc/package.json"] as const

function git(cmd: string): string {
    return execSync(`git ${cmd}`, {
        cwd: PROJECT_ROOT,
        encoding: "utf-8",
    }).trim()
}

function readVersion(relativePath: string): { path: string; version: string } {
    const path = resolve(PROJECT_ROOT, relativePath)
    const pkg = JSON.parse(readFileSync(path, "utf-8"))
    return { path: relativePath, version: pkg.version ?? "unknown" }
}

const server = new McpServer({
    name: "tgd2-release-notes",
    version: "1.0.0",
})

server.registerTool(
    "generate_release_notes",
    {
        description:
            "Gather git history and project context to draft a release note entry for the tgd2 project",
    },
    async () => {
        const messages: string[] = ["Checking current version"]

        // 1. Check version consistency
        const versions = VERSION_FILES.map(readVersion)
        const rootVersion = versions[0].version
        const allMatch = versions.every((v) => v.version === rootVersion)

        if (!allMatch) {
            const details = versions.map((v) => `  - ${v.path}: ${v.version}`).join("\n")
            return {
                content: [
                    {
                        type: "text" as const,
                        text: [
                            "ERROR: Version mismatch detected:",
                            details,
                            "",
                            `Would you like to apply the version from package.json (${rootVersion}) to the other two files?`,
                        ].join("\n"),
                    },
                ],
            }
        }

        messages.push(`Version: ${rootVersion}`)

        // 2. Find PREV_COMMIT
        const prevCommit = git(
            `rev-parse $(git log --format="%H" -S "${rootVersion}" -- package.json | tail -1)~1`
        )
        messages.push(`Previous commit: ${prevCommit}`)

        // 3. Create .release-notes directory structure
        if (existsSync(RELEASE_NOTES_DIR)) {
            rmSync(RELEASE_NOTES_DIR, { recursive: true })
        }
        mkdirSync(resolve(RELEASE_NOTES_DIR, "current"), { recursive: true })
        mkdirSync(resolve(RELEASE_NOTES_DIR, "previous"), { recursive: true })

        // 4. Get commit log and store in log.txt
        const log = git(`log ${prevCommit}..HEAD --format="%s"`)
        writeFileSync(resolve(RELEASE_NOTES_DIR, "log.txt"), log, "utf-8")

        // 5. Get changed files list
        const filesRaw = git(`diff --name-only ${prevCommit} HEAD`)
        const files = filesRaw.split("\n").filter(Boolean)
        writeFileSync(resolve(RELEASE_NOTES_DIR, "files.txt"), filesRaw, "utf-8")

        // 6. For each file, store previous and current versions
        for (const file of files) {
            // Previous version from PREV_COMMIT
            const prevPath = resolve(RELEASE_NOTES_DIR, "previous", file)
            mkdirSync(dirname(prevPath), { recursive: true })
            try {
                const content = git(`show ${prevCommit}:${file}`)
                writeFileSync(prevPath, content, "utf-8")
            } catch {
                // File didn't exist in previous commit
            }

            // Current version from workspace
            const currPath = resolve(RELEASE_NOTES_DIR, "current", file)
            mkdirSync(dirname(currPath), { recursive: true })
            const srcPath = resolve(PROJECT_ROOT, file)
            if (existsSync(srcPath)) {
                copyFileSync(srcPath, currPath)
            }
        }

        messages.push(`Changed files: ${files.length}`)

        // 7. Ask agent to write release notes
        return {
            content: [
                {
                    type: "text" as const,
                    text: [
                        ...messages,
                        "",
                        "All data has been collected in `.release-notes/`.",
                        "",
                        "Now, add a release notes section for version `" + rootVersion + "` in `README.md`.",
                        "To do this, do NOT use any shell command.",
                        "Only rely on the content of `.release-notes/` (log.txt, files.txt, previous/, current/) and the current version.",
                        "Match the existing style in README.md under '## Release notes'.",
                        "Use `### v" + rootVersion + "` as the version header.",
                        "Use bold (**text**) for key feature/area names.",
                        "Group related changes together.",
                        "Be concise but informative.",
                        "Only report changes that have occurred under `lib/` folder.",
                    ].join("\n"),
                },
            ],
        }
    },
)

const transport = new StdioServerTransport()
await server.connect(transport)
