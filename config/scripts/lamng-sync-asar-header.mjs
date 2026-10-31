#!/usr/bin/env node
// Rewrites the app.asar header so a directory that lives in app.asar.unpacked is
// listed exactly as it is on disk. Electron only serves an unpacked file when the
// header names it, so copying new hashed bundles into app.asar.unpacked without
// this step leaves index.html pointing at files Electron reports as missing
// (blank window). Packed file data is untouched: offsets are relative to the end
// of the header, so only the header is replaced.
import { createHash } from 'node:crypto'
import {
  closeSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  statSync
} from 'node:fs'
import { open } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const BLOCK_SIZE = 4 * 1024 * 1024

function integrity(file) {
  const data = readFileSync(file)
  const blocks = []
  for (let i = 0; i < data.length || i === 0; i += BLOCK_SIZE) {
    blocks.push(
      createHash('sha256')
        .update(data.subarray(i, i + BLOCK_SIZE))
        .digest('hex')
    )
  }
  return {
    algorithm: 'SHA256',
    hash: createHash('sha256').update(data).digest('hex'),
    blockSize: BLOCK_SIZE,
    blocks
  }
}

function unpackedTree(dir) {
  const files = {}
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      files[entry.name] = unpackedTree(path)
    } else if (entry.isFile()) {
      files[entry.name] = { size: statSync(path).size, unpacked: true, integrity: integrity(path) }
    }
  }
  return { files }
}

function readHeader(asarPath) {
  const fd = openSync(asarPath, 'r')
  try {
    const sizePickle = Buffer.alloc(8)
    readSync(fd, sizePickle, 0, 8, 0)
    const headerSize = sizePickle.readUInt32LE(4)
    const headerPickle = Buffer.alloc(headerSize)
    readSync(fd, headerPickle, 0, headerSize, 8)
    const length = headerPickle.readUInt32LE(4)
    return {
      header: JSON.parse(headerPickle.toString('utf8', 8, 8 + length)),
      dataStart: 8 + headerSize
    }
  } finally {
    closeSync(fd)
  }
}

function encodeHeader(header) {
  const json = Buffer.from(JSON.stringify(header), 'utf8')
  const padded = Math.ceil(json.length / 4) * 4
  const headerPickle = Buffer.alloc(8 + padded)
  headerPickle.writeUInt32LE(4 + padded, 0)
  headerPickle.writeUInt32LE(json.length, 4)
  json.copy(headerPickle, 8)
  const sizePickle = Buffer.alloc(8)
  sizePickle.writeUInt32LE(4, 0)
  sizePickle.writeUInt32LE(headerPickle.length, 4)
  return Buffer.concat([sizePickle, headerPickle])
}

/** Re-lists `relDir` (e.g. "out/renderer") in the header from `${asarPath}.unpacked/relDir`. */
export async function syncUnpackedDir(asarPath, relDir) {
  const { header, dataStart } = readHeader(asarPath)
  const parts = relDir.split('/')
  let parent = header
  for (const part of parts.slice(0, -1)) {
    parent = parent.files[part]
    if (!parent?.files) {
      throw new Error(`${relDir} is not a directory in ${asarPath}`)
    }
  }
  const leaf = parts.at(-1)
  const existing = parent.files[leaf]
  const packed = []
  const collectPacked = (node, prefix) => {
    for (const [name, child] of Object.entries(node.files ?? {})) {
      if (child.files) {
        collectPacked(child, `${prefix}${name}/`)
      } else if (!child.unpacked) {
        packed.push(prefix + name)
      }
    }
  }
  collectPacked(existing ?? {}, '')
  if (packed.length > 0) {
    throw new Error(
      `${relDir} has packed files (${packed.slice(0, 3).join(', ')}); refusing to relist`
    )
  }
  parent.files[leaf] = unpackedTree(join(`${asarPath}.unpacked`, relDir))

  const tmp = `${asarPath}.tmp-${process.pid}`
  const out = await open(tmp, 'w')
  const src = await open(asarPath, 'r')
  try {
    await out.write(encodeHeader(header))
    const chunk = Buffer.alloc(BLOCK_SIZE)
    for (let pos = dataStart; ;) {
      const { bytesRead } = await src.read(chunk, 0, chunk.length, pos)
      if (bytesRead === 0) {
        break
      }
      await out.write(chunk, 0, bytesRead)
      pos += bytesRead
    }
    await out.sync()
  } finally {
    await src.close()
    await out.close()
  }
  renameSync(tmp, asarPath)
}

/** Every path under `relDir` that index.html-style references could need, as listed in the header. */
export function listedFiles(asarPath, relDir) {
  let node = readHeader(asarPath).header
  for (const part of relDir.split('/')) {
    node = node.files[part]
  }
  const names = new Set()
  const walk = (n, prefix) => {
    for (const [name, child] of Object.entries(n.files)) {
      if (child.files) {
        walk(child, `${prefix}${name}/`)
      } else {
        names.add(prefix + name)
      }
    }
  }
  walk(node, '')
  return names
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [asarPath, relDir = 'out/renderer'] = process.argv.slice(2)
  if (!asarPath) {
    console.error('usage: lamng-sync-asar-header.mjs <app.asar> [dir-inside-asar]')
    process.exit(2)
  }
  await syncUnpackedDir(asarPath, relDir)
  console.log(`OK: ${relDir} in ${asarPath} now matches ${asarPath}.unpacked/${relDir}`)
}
