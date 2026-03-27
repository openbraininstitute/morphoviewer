import FS from "fs"
import Path from "path"

const [, prg, source, ...targets] = process.argv
if (
    typeof source !== "string" ||
    !Array.isArray(targets) ||
    targets.length === 0
) {
    console.log("")
    console.log("Usage: ", prg, "./source ./dest1 ./dest2 ...")
    console.log("")
    process.exit(1)
}

const src = Path.resolve(source, "package.json")
const pkgSrc = JSON.parse(FS.readFileSync(src).toString())
const { name, version, description, homepage } = pkgSrc
console.log(`${name} v${version}: ${description}`)
for (const target of targets) {
    const dst = Path.resolve(target, "package.json")
    const pkgDst = JSON.parse(FS.readFileSync(dst).toString())
    pkgDst.name = name
    pkgDst.version = version
    pkgDst.description = description
    pkgDst.homepage = homepage
    FS.writeFileSync(dst, JSON.stringify(pkgDst, null, "    "))
}
