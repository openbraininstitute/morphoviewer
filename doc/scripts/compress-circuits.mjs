import { readFileSync, writeFileSync } from "node:fs"
import Path from "node:path"
import { gunzipSync, gzipSync } from "node:zlib"

/**
 * 
 * @param {string} file 
 * @returns {{ 
 *     morphologyId: string
 *     position: [number, number, number]
 *   }[]
 * }
 */

function loadFile(file) {
    const path = Path.resolve(`../public/assets/circuit-cloud/${file}.json.gz`)
    console.log('🐞 [compress-circuits@16] path =', path) // @FIXME: Remove this line written on 2026-06-10 at 15:54
    const data = gunzipSync(readFileSync(path))
    return JSON.parse(data.toString())
}


async function start() {
    const files = [
        "c9e10151-8f07-4158-a3b3-205210ceb075",
        "964a878a-c580-4722-b891-1a078ea9aa76",
        "big",
    ]

    for (const file of files) {
        console.log('🐞 [compress-circuits@30] file =', file) // @FIXME: Remove this line written on 2026-06-10 at 15:50
        const json = loadFile(file)
        const count = json.length
        console.log('🐞 [compress-circuits@32] count =', count) // @FIXME: Remove this line written on 2026-06-10 at 15:50
        const BPE = Float32Array.BYTES_PER_ELEMENT
        const buffer = new ArrayBuffer(BPE * 4 * count)
        const view = new DataView(buffer)
        for (let i = 0; i < count; i++) {
            const item = json[i]
            const [x, y, z] = item.position
            const morphologyId = parseInt(item.morphologyId, 10)
            const ptr = 4 * BPE * i
            view.setFloat32(ptr, x, true)
            view.setFloat32(ptr + BPE, y, true)
            view.setFloat32(ptr + 2 * BPE, z, true)
            view.setUint32(ptr + 3 * BPE, morphologyId, true)
        }
        const path = `../public/assets/circuit-cloud/${file}.gz`
        const compressed = gzipSync(Buffer.from(buffer))
        console.log("Compressed:", compressed.byteLength / (1024 * 1024), "Mb")
        console.log()
        writeFileSync(path, compressed)
    }
}

start()