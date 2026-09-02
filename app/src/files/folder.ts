/** Turns a picked or dropped folder into the character/save structure the game uses. */

export interface SaveEntry {
  folder: string;
  file: File;
  /** Present only in "edit in place" mode: lets the editor write the file back and keep a backup beside it. */
  handle?: FileSystemFileHandle;
  directory?: FileSystemDirectoryHandle;
}

/** The File System Access API is Chromium-only; elsewhere the download flow is the only option. */
export function canEditInPlace(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { mode?: "read" | "readwrite"; id?: string }) => Promise<FileSystemDirectoryHandle>;
  }
}

/** Ask for a folder with write access and read its character/save layout. */
export async function pickCharactersForEditing(): Promise<CharacterFolder[] | null> {
  if (!window.showDirectoryPicker) return null;
  let root: FileSystemDirectoryHandle;
  try {
    root = await window.showDirectoryPicker({ mode: "readwrite", id: "stoneshard-characters" });
  } catch {
    return null; // the user cancelled the picker
  }
  return charactersFromDirectoryHandle(root);
}

export async function charactersFromDirectoryHandle(root: FileSystemDirectoryHandle): Promise<CharacterFolder[]> {
  const characters: CharacterFolder[] = [];
  const asCharacter = await readCharacter(root);
  if (asCharacter) characters.push(asCharacter);
  for await (const entry of directoryEntries(root)) {
    if (entry.kind !== "directory") continue;
    const character = await readCharacter(entry);
    if (character) characters.push(character);
  }
  for (const character of characters) character.saves.sort(bySaveNumberDescending);
  return characters.sort((a, b) => a.folder.localeCompare(b.folder, undefined, { numeric: true }));
}

/** A character folder is one whose subfolders contain data.sav files. */
async function readCharacter(directory: FileSystemDirectoryHandle): Promise<CharacterFolder | null> {
  const saves: SaveEntry[] = [];
  for await (const entry of directoryEntries(directory)) {
    if (entry.kind !== "directory") continue;
    try {
      const handle = await entry.getFileHandle("data.sav");
      saves.push({ folder: entry.name, file: await handle.getFile(), handle, directory: entry });
    } catch {
      /* not a save folder */
    }
  }
  return saves.length ? { folder: directory.name, saves } : null;
}

async function* directoryEntries(directory: FileSystemDirectoryHandle): AsyncGenerator<FileSystemDirectoryHandle | FileSystemFileHandle> {
  const iterable = directory as unknown as { values(): AsyncIterable<FileSystemDirectoryHandle | FileSystemFileHandle> };
  for await (const entry of iterable.values()) yield entry;
}

export const ORIGINAL_BACKUP_NAME = "data.sav.original";

/** Write the save back into the game folder, keeping the untouched original beside it the first time. */
export async function writeSaveInPlace(save: SaveEntry, bytes: Uint8Array, loadedModified: number): Promise<{ backedUp: boolean }> {
  if (!save.handle || !save.directory) throw new Error("This save was not opened for editing in place.");
  const current = await save.handle.getFile();
  if (current.lastModified !== loadedModified) {
    throw new Error("The save on disk changed since you loaded it (the game probably saved). Reload from disk, then redo your changes.");
  }
  let backedUp = false;
  try {
    await save.directory.getFileHandle(ORIGINAL_BACKUP_NAME);
  } catch {
    const backup = await save.directory.getFileHandle(ORIGINAL_BACKUP_NAME, { create: true });
    const writable = await backup.createWritable();
    await writable.write(await current.arrayBuffer());
    await writable.close();
    backedUp = true;
  }
  const writable = await save.handle.createWritable();
  await writable.write(bytes as BufferSource);
  await writable.close();
  return { backedUp };
}

export interface CharacterFolder {
  folder: string;
  saves: SaveEntry[];
}

interface PathedFile {
  path: string[];
  file: File;
}

export function charactersFromFileList(files: FileList): CharacterFolder[] {
  const pathed = Array.from(files).map((file) => ({ path: file.webkitRelativePath.split("/"), file }));
  return groupCharacters(pathed);
}

export async function charactersFromDataTransfer(transfer: DataTransfer): Promise<CharacterFolder[]> {
  const entries = Array.from(transfer.items)
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => entry !== null);
  const pathed: PathedFile[] = [];
  for (const entry of entries) await collect(entry, [], pathed);
  return groupCharacters(pathed);
}

async function collect(entry: FileSystemEntry, parents: string[], out: PathedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    out.push({ path: [...parents, entry.name], file });
    return;
  }
  if (!entry.isDirectory) return;
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const children: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) break;
    children.push(...batch);
  }
  for (const child of children) await collect(child, [...parents, entry.name], out);
}

/** Any data.sav two folders deep counts: .../<character>/<save>/data.sav, whichever folder was picked. */
function groupCharacters(files: PathedFile[]): CharacterFolder[] {
  const characters = new Map<string, CharacterFolder>();
  for (const { path, file } of files) {
    if (path.length < 3 || path[path.length - 1] !== "data.sav") continue;
    const characterName = path[path.length - 3];
    const saveName = path[path.length - 2];
    const character = characters.get(characterName) ?? { folder: characterName, saves: [] };
    character.saves.push({ folder: saveName, file });
    characters.set(characterName, character);
  }
  for (const character of characters.values()) character.saves.sort(bySaveNumberDescending);
  return Array.from(characters.values()).sort((a, b) => a.folder.localeCompare(b.folder, undefined, { numeric: true }));
}

function bySaveNumberDescending(a: SaveEntry, b: SaveEntry): number {
  return b.folder.localeCompare(a.folder, undefined, { numeric: true });
}

export const WINDOWS_SAVE_PATH = "%LOCALAPPDATA%\\StoneShard\\characters_v1";
