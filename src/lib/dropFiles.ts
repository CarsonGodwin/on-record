import { isHistoryFileName } from '../data/load'

/**
 * Collects files from a drop event, walking into folders. Safari unzips
 * downloads automatically, so people often drop a folder instead of the zip.
 *
 * Call this synchronously from the drop handler: the browser clears
 * `dataTransfer.items` once the event finishes.
 */
export function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = Array.from(dt.items)
    .map((item) => item.webkitGetAsEntry())
    .filter((e): e is FileSystemEntry => e !== null)
  if (entries.length === 0) return Promise.resolve(Array.from(dt.files))

  return (async () => {
    const files: File[] = []
    await Promise.all(entries.map((e) => walk(e, files, false)))
    return files
  })()
}

async function walk(entry: FileSystemEntry, out: File[], insideFolder: boolean): Promise<void> {
  if (entry.isFile) {
    // Inside a folder, keep only history files so the readme etc. don't produce warnings
    if (insideFolder && !isHistoryFileName(entry.fullPath)) return
    out.push(await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject)))
    return
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    // readEntries returns results in chunks; keep reading until a chunk is empty
    let chunk: FileSystemEntry[]
    do {
      chunk = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
      await Promise.all(chunk.map((e) => walk(e, out, true)))
    } while (chunk.length > 0)
  }
}
