import type { SaveDocument } from "../codec/save";
import { CHARACTER_FIELDS, characterMap, IDENTITY_FIELDS, setCharacterField, setTotalGold, totalGold } from "../model/character";
import { NumberField } from "./NumberField";

interface Props {
  document: SaveDocument;
  onChange: (next: SaveDocument) => void;
  onError: (message: string) => void;
}

export function CharacterPanel({ document, onChange, onError }: Props) {
  const character = characterMap(document);
  const gold = totalGold(document);

  function setNumber(key: string, value: number) {
    onChange(setCharacterField(document, key, value));
  }

  function setGold(value: number) {
    try {
      onChange(setTotalGold(document, value));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <section className="panel character">
      <h2>{String(character.nameKey ?? "Character")}</h2>
      <p className="muted">{IDENTITY_FIELDS.map((key) => character[key]).filter(Boolean).join(" · ")}</p>
      <label className="field gold">
        <span>Gold</span>
        <NumberField value={gold} min={0} onCommit={setGold} />
      </label>
      <p className="hint">Coins go into your purse if you carry one, otherwise into a free bag slot.</p>
      <div className="fields">
        {CHARACTER_FIELDS.map((field) => (
          <label key={field.key} className="field" title={field.hint}>
            <span>{field.label}</span>
            <NumberField value={numberValue(character[field.key])} onCommit={(value) => setNumber(field.key, value)} />
          </label>
        ))}
      </div>
      <p className="hint">
        Raising an attribute past 15, 20 or 25 here may not grant its threshold bonus until the attribute changes in play.
      </p>
    </section>
  );
}

function numberValue(value: unknown): number | "" {
  return typeof value === "number" ? value : "";
}
