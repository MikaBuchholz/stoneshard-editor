import { useMemo, useState } from "react";
import type { Catalog, CatalogItem } from "../model/catalog";
import { isCatalogAddable } from "../model/catalog";
import { hasTemplate } from "../model/records";
import { ItemSprite } from "./ItemSprite";
import type { DragPayload } from "./dragData";

interface Props {
  catalog: Catalog;
  showHidden: boolean;
  dragHandle: (payload: DragPayload) => { onPointerDown: (event: React.PointerEvent) => void };
  onAdd: (item: CatalogItem) => void;
}

const PAGE = 60;

export function ItemPicker({ catalog, showHidden, dragHandle, onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [limit, setLimit] = useState(PAGE);

  const categories = useMemo(() => {
    const names = new Set(catalog.items.filter((item) => showHidden || !item.hidden).map((item) => item.category));
    return Array.from(names).sort();
  }, [catalog, showHidden]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog.items.filter(
      (item) =>
        (showHidden || !item.hidden) &&
        (category === "all" || item.category === category) &&
        (!needle || item.name.toLowerCase().includes(needle) || item.key.toLowerCase().includes(needle)),
    );
  }, [catalog, query, category, showHidden]);

  return (
    <section className="panel picker-panel">
      <h2>Items</h2>
      <div className="picker-controls">
        <input
          type="search"
          placeholder="Search items"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setLimit(PAGE);
          }}
        />
        <select
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            setLimit(PAGE);
          }}
        >
          <option value="all">All categories</option>
          {categories.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <p className="hint">
        {results.length} items. Weapons and armor are added at base quality with full durability, no enchantment.
        Items marked "generic" have no example in a real save yet, so their record is a best guess.
      </p>
      <ul className="item-list">
        {results.slice(0, limit).map((item) => {
          const addable = isCatalogAddable(item);
          return (
            <li
              key={item.key}
              className={addable ? "item-row" : "item-row disabled"}
              {...(addable ? dragHandle({ from: "catalog", key: item.key }) : {})}
              title={addable ? "Drag into the bag, or press Add" : "Cannot be generated"}
            >
              <span className="item-icon">
                <ItemSprite item={item} fallback="?" />
              </span>
              <span className="item-text">
                <span>{item.name}</span>
                <span className="muted">
                  {item.category}
                  {item.subcategory ? ` · ${item.subcategory}` : ""} · {item.w}×{item.h}
                  {addable && !hasTemplate(item, catalog) ? " · generic" : ""}
                </span>
              </span>
              {addable && (
                <button type="button" onClick={() => onAdd(item)}>
                  Add
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {results.length > limit && (
        <button type="button" className="link" onClick={() => setLimit(limit + PAGE)}>
          Show more
        </button>
      )}
    </section>
  );
}
