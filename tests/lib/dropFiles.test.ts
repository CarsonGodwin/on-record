import { describe, expect, it } from 'vitest'
import { filesFromDrop } from '../../src/lib/dropFiles'

const refused = () => new DOMException('A requested file or directory could not be found', 'NotFoundError')
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

/** What the browser hands over for a dropped file. `works: false` is one it won't open. */
function fileEntry(fullPath: string, works = true) {
  return {
    isFile: true,
    isDirectory: false,
    fullPath,
    name: baseName(fullPath),
    file: (resolve: (f: File) => void, reject: (err: unknown) => void) => (works ? resolve(new File(['[]'], baseName(fullPath))) : reject(refused())),
  }
}

/** A dropped folder, which lists its children in one chunk and then an empty one */
function folderEntry(fullPath: string, children: unknown[], works = true) {
  return {
    isFile: false,
    isDirectory: true,
    fullPath,
    name: baseName(fullPath),
    createReader: () => {
      let done = false
      return {
        readEntries(resolve: (entries: unknown[]) => void, reject: (err: unknown) => void) {
          if (!works) return reject(refused())
          resolve(done ? [] : children)
          done = true
        },
      }
    },
  }
}

function drop(...entries: unknown[]): DataTransfer {
  return { items: entries.map((entry) => ({ webkitGetAsEntry: () => entry })), files: [] } as unknown as DataTransfer
}

const names = (files: File[]) => files.map((f) => f.name).sort()

describe('filesFromDrop', () => {
  it('walks into folders, keeping only what could be history', async () => {
    const picked = await filesFromDrop(
      drop(
        folderEntry('/export', [
          fileEntry('/export/Streaming_History_Audio_2023.json'),
          fileEntry('/export/ReadMeFirst.pdf'),
          folderEntry('/export/more', [fileEntry('/export/more/Streaming_History_Audio_2024.json')]),
        ]),
      ),
    )
    expect(names(picked.files)).toEqual(['Streaming_History_Audio_2023.json', 'Streaming_History_Audio_2024.json'])
    expect(picked.unreadable).toEqual([])
  })

  it('keeps the other files when the browser won’t open one', async () => {
    const picked = await filesFromDrop(
      drop(folderEntry('/export', [fileEntry('/export/Streaming_History_Audio_2022.json', false), fileEntry('/export/Streaming_History_Audio_2023.json')])),
    )
    expect(names(picked.files)).toEqual(['Streaming_History_Audio_2023.json'])
    expect(picked.unreadable).toEqual(['Streaming_History_Audio_2022.json'])
  })

  it('keeps the other files when the browser won’t list a folder', async () => {
    const picked = await filesFromDrop(drop(folderEntry('/stuck', [], false), fileEntry('/Streaming_History_Audio_2023.json')))
    expect(names(picked.files)).toEqual(['Streaming_History_Audio_2023.json'])
    expect(picked.unreadable).toEqual(['stuck'])
  })

  it('doesn’t name a file it would have left out anyway', async () => {
    const picked = await filesFromDrop(drop(folderEntry('/export', [fileEntry('/export/ReadMeFirst.pdf', false)])))
    expect(picked).toEqual({ files: [], unreadable: [] })
  })

  it('falls back to the plain file list when there are no entries', async () => {
    const dropped = new File(['[]'], 'Streaming_History_Audio_2023.json')
    const picked = await filesFromDrop({ items: [], files: [dropped] } as unknown as DataTransfer)
    expect(picked).toEqual({ files: [dropped], unreadable: [] })
  })
})
