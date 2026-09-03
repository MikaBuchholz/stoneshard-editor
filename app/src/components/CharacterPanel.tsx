import type { SaveDocument } from "../codec/save";
import { CHARACTER_FIELDS, characterMap, IDENTITY_FIELDS, setCharacterField, setTotalGold, totalGold } from "../model/character";
import { NumberField } from "./NumberField";
import { energyBreakdown, healthBreakdown, type VitalBreakdown } from "../model/vitals";
import type { Catalog } from "../model/catalog";
import { catalogItemFor } from "../model/records";

interface Props {
  document: SaveDocument;
  catalog: Catalog;
  onChange: (next: SaveDocument) => void;
  onError: (message: string) => void;
}

export function CharacterPanel({ document, catalog, onChange, onError }: Props) {
  const character = characterMap(document);
  const gold = totalGold(document);

  function setNumber(key: string, value: number) {
    onChange(setCharacterField(document, key, value));
  }

  function setGold(value: number) {
    try {
      onChange(setTotalGold(document, value, (record) => catalogItemFor(record, catalog) ?? { w: 1, h: 1 }));
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
      <p className="hint">Coins fill your purses first, 2000 each, then loose piles of 100 in free bag cells. A number bigger than that settles at what fits.</p>
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
      <Vitals title="Max health" breakdown={healthBreakdown(document, catalog)} />
      <Vitals title="Max energy" breakdown={energyBreakdown(document, catalog)} />
      <p className="hint">
        Health and energy cannot be edited. The save only records what you have right now, and the game recalculates the
        maximum from your attributes, gear and skills every time it loads. Some skills also raise or restore these; those
        are not counted here.
      </p>
    </section>
  );
}

/** Where a maximum comes from, part by part. */
function Vitals({ title, breakdown }: { title: string; breakdown: VitalBreakdown }) {
  return (
    <div className="vitals">
      <h3>
        {title} <span className="vitals-total">{breakdown.total}</span>
      </h3>
      <dl>
        {breakdown.parts.map((part) => (
          <div key={part.label}>
            <dt>{part.label}</dt>
            <dd className={part.amount < 0 ? "tone-bad" : undefined}>
              {part.amount > 0 && part.label !== "Base" ? "+" : ""}
              {part.amount}
            </dd>
          </div>
        ))}
        {breakdown.current !== null && (
          <div className="vitals-current">
            <dt>Currently</dt>
            <dd>{breakdown.current}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function numberValue(value: unknown): number | "" {
  return typeof value === "number" ? value : "";
}
