import { decompress, type FlateError } from "fflate"

import { getHeaderLength } from "./get-header-length"
import VolumeHeader from "./header"
import Volume from "./volume"

export async function parseNRRD(buffer: ArrayBuffer): Promise<Volume> {
    const data = new Uint8Array(buffer)
    const headerLength = getHeaderLength(data)
    const headerData = data.subarray(0, headerLength)
    const header = new VolumeHeader(new TextDecoder().decode(headerData))
    const zippedBody = data.subarray(headerLength)
    console.log(`Unzippin ${zippedBody.byteLength} bytes...`)
    const body = await gunzip(zippedBody)
    console.log(`...into ${body.byteLength} bytes.`)
    return new Volume(header, body.buffer)
}

async function gunzip(content: Uint8Array): Promise<Uint8Array> {
    return new Promise((resolve) => {
        decompress(content, (err: FlateError | null, data: Uint8Array) => {
            if (err) {
                console.error(err)
                throw Error(`Unable to gunzip NRRD data!\n${err.message}`)
            }
            resolve(data)
        })
    })
}
