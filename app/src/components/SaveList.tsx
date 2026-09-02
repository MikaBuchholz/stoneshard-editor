import type { CharacterFolder, SaveEntry } from "../files/folder";

interface Props {
  characters: CharacterFolder[];
  onPick: (character: CharacterFolder, save: SaveEntry) => void;
  onBack: () => void;
}

export function SaveList({ characters, onPick, onBack }: Props) {
  return (
    <section className="picker">
      <h1>Pick a save</h1>
      {characters.map((character) => (
        <div key={character.folder} className="character-block">
          <h2>{character.folder}</h2>
          <ul className="save-list">
            {character.saves.map((save) => (
              <li key={save.folder}>
                <button type="button" onClick={() => onPick(character, save)}>
                  <strong>{save.folder}</strong>
                  <span className="muted">{formatDate(save.file.lastModified)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="muted">Saves are listed newest number first. The file date is the last time the game wrote it.</p>
      <button type="button" className="link" onClick={onBack}>
        Pick a different folder
      </button>
    </section>
  );
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}
