import { WINDOWS_SAVE_PATH } from "../files/folder";

interface Props {
  characterFolder: string;
  saveFolder: string;
  dirty: boolean;
  inPlace: boolean;
  onDownload: () => void;
  onSaveInPlace: () => void;
  onReload: () => void;
  onReset: () => void;
  onBack: () => void;
}

export function DownloadPanel({ characterFolder, saveFolder, dirty, inPlace, onDownload, onSaveInPlace, onReload, onReset, onBack }: Props) {
  const path = `${WINDOWS_SAVE_PATH}\\${characterFolder}\\${saveFolder}`;
  return (
    <header className="topbar">
      <div>
        <strong>
          {characterFolder} / {saveFolder}
        </strong>
        <span className="muted">{inPlace ? " · editing in place, writes go straight to the game folder" : " · your original file is not modified"}</span>
      </div>
      <div className="actions">
        <button type="button" className="link" onClick={onBack}>
          Other save
        </button>
        <button type="button" className="link" onClick={onReset} disabled={!dirty}>
          Undo all changes
        </button>
        {inPlace && (
          <button type="button" className="link" onClick={onReload}>
            Reload from disk
          </button>
        )}
        {inPlace ? (
          <button type="button" className="primary" onClick={onSaveInPlace} disabled={!dirty}>
            Save to game folder
          </button>
        ) : (
          <button type="button" className="primary" onClick={onDownload}>
            Download edited data.sav
          </button>
        )}
        {inPlace && (
          <button type="button" onClick={onDownload}>
            Download instead
          </button>
        )}
      </div>
      {inPlace && (
        <p className="hint wide">
          Close the game before saving here; the game overwrites the file when it saves. To go back to the untouched save,
          delete <code>data.sav</code> in the folder and rename <code>data.sav.original</code> to <code>data.sav</code>.
        </p>
      )}
      <details className="help wide">
        <summary>How do I use the downloaded file?</summary>
        <ol>
          <li>Close Stoneshard completely.</li>
          <li>
            Press <kbd>Win</kbd>+<kbd>R</kbd>, paste <code>{path}</code> and press Enter.
          </li>
          <li>
            Rename the <code>data.sav</code> in that folder to <code>data.sav.backup</code>.
          </li>
          <li>
            Move the downloaded <code>data.sav</code> into that folder, then start the game and load the save.
          </li>
          <li>To go back, delete the new file and rename the backup to <code>data.sav</code>.</li>
        </ol>
      </details>
    </header>
  );
}
