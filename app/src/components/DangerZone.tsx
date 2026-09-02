import { useState } from "react";
import type { SaveDocument } from "../codec/save";
import { CHARACTER_FIELDS, characterMap, setCharacterField } from "../model/character";
import { NumberField } from "./NumberField";

interface Props {
  document: SaveDocument;
  showHidden: boolean;
  onShowHidden: (value: boolean) => void;
  onChange: (next: SaveDocument) => void;
}

const SAFE_KEYS = new Set(CHARACTER_FIELDS.map((field) => field.key));

export function DangerZone({ document, showHidden, onShowHidden, onChange }: Props) {
  const [rawJson, setRawJson] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const character = characterMap(document);
  const rawFields = Object.entries(character)
    .filter(([key, value]) => !SAFE_KEYS.has(key) && (typeof value === "number" || typeof value === "string" || typeof value === "boolean"))
    .sort(([a], [b]) => a.localeCompare(b));

  function applyJson() {
    if (rawJson === null) return;
    try {
      const parsed = JSON.parse(rawJson) as SaveDocument;
      if (!parsed || typeof parsed !== "object" || !parsed.characterDataMap) throw new Error("Not a save document.");
      onChange(parsed);
      setRawJson(null);
      setJsonError(null);
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <details className="panel danger-zone">
      <summary>Danger zone: raw fields the game may not expect you to change</summary>
      <p className="hint">
        Nothing here is verified. Wrong values can break a character or soft-lock a game. Keep a copy of your original
        save.
      </p>
      <label className="field toggle">
        <span>Show quest and hidden items in the picker</span>
        <input type="checkbox" checked={showHidden} onChange={(event) => onShowHidden(event.target.checked)} />
      </label>
      <h3>Character map</h3>
      <div className="raw-fields">
        {rawFields.map(([key, value]) => (
          <label key={key} className="field">
            <span>{key}</span>
            {typeof value === "boolean" ? (
              <input type="checkbox" checked={value} onChange={(event) => onChange(setCharacterField(document, key, event.target.checked))} />
            ) : typeof value === "number" ? (
              <NumberField value={value} integer={Number.isInteger(value)} onCommit={(next) => onChange(setCharacterField(document, key, next))} />
            ) : (
              <input type="text" value={String(value)} onChange={(event) => onChange(setCharacterField(document, key, event.target.value))} />
            )}
          </label>
        ))}
      </div>
      <h3>Whole save as JSON</h3>
      {rawJson === null ? (
        <button type="button" onClick={() => setRawJson(JSON.stringify(document, null, 2))}>
          Open JSON editor
        </button>
      ) : (
        <>
          <textarea value={rawJson} onChange={(event) => setRawJson(event.target.value)} spellCheck={false} />
          {jsonError && <p className="error">{jsonError}</p>}
          <div className="actions">
            <button type="button" onClick={applyJson}>
              Apply JSON
            </button>
            <button type="button" className="link" onClick={() => setRawJson(null)}>
              Cancel
            </button>
          </div>
        </>
      )}
    </details>
  );
}
