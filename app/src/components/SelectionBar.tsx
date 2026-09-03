import type { Catalog } from "../model/catalog";
import { catalogItemFor, displayName, type ItemRecord } from "../model/records";
import { ItemSprite } from "./ItemSprite";

interface Props {
  catalog: Catalog;
  /** The records the actions apply to, in selection order. */
  records: ItemRecord[];
  canDuplicate: boolean;
  onDuplicate: () => void;
  onRemove: () => void;
  onClear: () => void;
}

/**
 * Actions for the current selection, pinned to the bottom of the window so they never scroll away.
 * The details panel in the sidebar still carries the stats; this is only the things you press.
 */
export function SelectionBar({ catalog, records, canDuplicate, onDuplicate, onRemove, onClear }: Props) {
  if (records.length === 0) return null;
  const names = records.map((record) => displayName(record, catalog));
  return (
    <div className="selection-bar" role="toolbar" aria-label="Selected items">
      <span className="selection-items" title={names.join("\n")}>
        {records.slice(0, 6).map((record, index) => (
          <span key={index} className="selection-chip">
            <ItemSprite item={catalogItemFor(record, catalog)} fallback="?" />
          </span>
        ))}
        {records.length > 6 && <span className="muted">+{records.length - 6}</span>}
      </span>
      <span className="selection-label">{records.length === 1 ? names[0] : `${records.length} items selected`}</span>
      <span className="actions">
        {canDuplicate && (
          <button type="button" onClick={onDuplicate}>
            Duplicate
          </button>
        )}
        <button type="button" className="danger" onClick={onRemove}>
          Remove{records.length > 1 ? ` ${records.length}` : ""}
        </button>
        <button type="button" className="link" onClick={onClear}>
          Clear
        </button>
      </span>
      <span className="selection-hint muted">Del removes · Esc clears</span>
    </div>
  );
}
