import { useEffect, useState } from "react";
import { decodeSave, saltFor, verifyChecksum, type DecodedSave } from "./codec/save";
import { Editor } from "./components/Editor";
import { FolderPicker } from "./components/FolderPicker";
import { SaveList } from "./components/SaveList";
import type { CharacterFolder, SaveEntry } from "./files/folder";
import { loadCatalog, type Catalog } from "./model/catalog";
import { loadSkillCatalog, type SkillCatalog } from "./model/skills";
import { saveVersion } from "./model/character";

const SUPPORTED_VERSION = "0.9";

type Stage =
  | { kind: "pick" }
  | { kind: "saves"; characters: CharacterFolder[] }
  | { kind: "edit"; characters: CharacterFolder[]; characterFolder: string; save: SaveEntry; original: DecodedSave; warning: string | null };

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [skills, setSkills] = useState<SkillCatalog | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: "pick" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCatalog().then(setCatalog, (reason) => setError(String(reason)));
    loadSkillCatalog().then(setSkills, (reason) => setError(String(reason)));
  }, []);

  async function openSave(character: CharacterFolder, save: SaveEntry, characters: CharacterFolder[]) {
    try {
      if (save.handle) save = { ...save, file: await save.handle.getFile() };
      const bytes = new Uint8Array(await save.file.arrayBuffer());
      const decoded = await decodeSave(bytes);
      const version = saveVersion(decoded.document);
      if (version !== SUPPORTED_VERSION) {
        throw new Error(`This save is version ${version ?? "unknown"}; the editor supports ${SUPPORTED_VERSION} saves only.`);
      }
      const signedForTheseFolders = verifyChecksum(decoded, saltFor(character.folder, save.folder));
      const warning = signedForTheseFolders
        ? null
        : `This file was not signed for ${character.folder}/${save.folder}, so it was probably copied from another folder. ` +
          `The download will be signed for ${character.folder}/${save.folder}; put it in exactly that folder on your PC.`;
      setError(null);
      setStage({ kind: "edit", characters, characterFolder: character.folder, save, original: decoded, warning });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  if (!catalog || !skills) return <main className="app">{error ? <p className="error">{error}</p> : <p className="muted">Loading item catalog…</p>}</main>;

  return (
    <main className="app">
      {error && <p className="error">{error}</p>}
      {stage.kind === "pick" && (
        <FolderPicker
          onCharacters={(characters) => {
            setError(null);
            if (characters.length === 1 && characters[0].saves.length === 1) {
              void openSave(characters[0], characters[0].saves[0], characters);
            } else {
              setStage({ kind: "saves", characters });
            }
          }}
        />
      )}
      {stage.kind === "saves" && (
        <SaveList characters={stage.characters} onPick={(character, save) => openSave(character, save, stage.characters)} onBack={() => setStage({ kind: "pick" })} />
      )}
      {stage.kind === "edit" && (
        <Editor
          key={`${stage.characterFolder}/${stage.save.folder}`}
          catalog={catalog}
          skills={skills}
          characterFolder={stage.characterFolder}
          save={stage.save}
          onReload={() => openSave(stage.characters.find((c) => c.folder === stage.characterFolder)!, stage.save, stage.characters)}
          original={stage.original}
          warning={stage.warning}
          onBack={() => setStage({ kind: "saves", characters: stage.characters })}
        />
      )}
    </main>
  );
}
