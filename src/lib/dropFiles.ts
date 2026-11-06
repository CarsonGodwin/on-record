import { isImportFileName } from '../data/load'

/** What someone picked or dropped: the files, and the names of any the browser wouldn't hand over */
export interface PickedFiles {
  files: File[]
  unreadable: string[]
}

/**
 * Collects files from a drop event, walking into folders. Safari unzips
 * downloads automatically, so people often drop a folder instead of the zip.
 * One file the browser won't hand over doesn't sink the others: it's named, and
 * the loader explains it along with anything else it couldn't read.
 *
 * Call this synchronously from the drop handler: the browser clears
 * `dataTransfer.items` once the event finishes.
 */
export function filesFromDrop(dt: DataTransfer): Promise<PickedFiles> {
  const entries = Array.from(dt.items)
    .map((item) => item.webkitGetAsEntry())
    .filter((e): e is FileSystemEntry => e !== null)
  if (entries.length === 0) return Promise.resolve({ files: Array.from(dt.files), unreadable: [] })

  return (async () => {
    const picked: PickedFiles = { files: [], unreadable: [] }
    await Promise.all(entries.map((e) => walk(e, picked, false)))
    return picked
  })()
}

async function walk(entry: FileSystemEntry, out: PickedFiles, insideFolder: boolean): Promise<void> {
  if (entry.isFile) {
    // Inside a folder, keep only history files so the readme etc. don't produce warnings.
    // Apple's export unzips to a folder holding a lot more than music, so this also keeps
    // the rest of it out of the page.
    if (insideFolder && !isImportFileName(entry.fullPath)) return
    try {
      out.files.push(await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject)))
    } catch {
      out.unreadable.push(entry.name)
    }
    return
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    // readEntries returns results in chunks; keep reading until a chunk is empty
    let chunk: FileSystemEntry[]
    do {
      try {
        chunk = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
      } catch {
        out.unreadable.push(entry.name)
        return
      }
      await Promise.all(chunk.map((e) => walk(e, out, true)))
    } while (chunk.length > 0)
  }
}
