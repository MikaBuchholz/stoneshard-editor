import { useRef, useState, type DragEvent } from "react";
import { canEditInPlace, charactersFromDataTransfer, charactersFromFileList, pickCharactersForEditing, type CharacterFolder, WINDOWS_SAVE_PATH } from "../files/folder";

interface Props {
  onCharacters: (characters: CharacterFolder[]) => void;
}

export function FolderPicker({ onCharacters }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function deliver(characters: CharacterFolder[]) {
    if (characters.length === 0) {
      setError("No data.sav found. Pick a character folder such as character_1, which holds save_1, save_2 and so on.");
      return;
    }
    setError(null);
    onCharacters(characters);
  }

  async function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    deliver(await charactersFromDataTransfer(event.dataTransfer));
  }

  return (
    <section className="picker">
      <h1>Stoneshard Save Editor</h1>
      <p className="lede">
        Your save file is never changed. You pick a character folder, edit, and download a new <code>data.sav</code> to
        put in place yourself. Nothing leaves your browser.
      </p>
      <div
        className={dragging ? "dropzone dragging" : "dropzone"}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <p>Drop your character folder here</p>
        <p className="muted">or</p>
        <button type="button" onClick={() => input.current?.click()}>
          Choose folder
        </button>
        <input
          ref={input}
          type="file"
          hidden
          // @ts-expect-error webkitdirectory is not in the React typings but works in every Chromium browser
          webkitdirectory=""
          onChange={(event) => event.target.files && deliver(charactersFromFileList(event.target.files))}
        />
      </div>
      {error && <p className="error">{error}</p>}
      <section className={canEditInPlace() ? "in-place" : "in-place unsupported"}>
        <h2>Edit the save in place</h2>
        <p>
          Instead of downloading a file each time, the editor can write straight into your game folder: edit, press Save,
          restart the game, repeat.
        </p>
        <p className="warning">
          Back up your saves first. The editor keeps an untouched copy as <code>data.sav.original</code> the first time it
          writes, but a save the game refuses to load is still yours to restore.
        </p>
        {canEditInPlace() ? (
          <button
            type="button"
            className="primary"
            onClick={async () => {
              const characters = await pickCharactersForEditing();
              if (characters) deliver(characters);
            }}
          >
            Connect a character folder…
          </button>
        ) : (
          <p className="error">
            Your browser cannot write to folders, so this option is unavailable here. Open this same address in Google
            Chrome or Microsoft Edge to use it. The download option above works in every browser.
          </p>
        )}
      </section>
      <details className="help">
        <summary>Where are my saves?</summary>
        <ol>
          <li>Close Stoneshard completely.</li>
          <li>
            Press <kbd>Win</kbd>+<kbd>R</kbd>, paste <code>{WINDOWS_SAVE_PATH}</code> and press Enter.
          </li>
          <li>
            You will see folders named <code>character_1</code>, <code>character_2</code> and so on. Drop one of them
            here, or use Choose folder and pick it. Each holds your saves as <code>save_1</code>, <code>save_2</code>...
          </li>
        </ol>
      </details>
    </section>
  );
}
