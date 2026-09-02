export type DragPayload = { from: "bag"; index: number } | { from: "catalog"; key: string } | { from: "equipment"; position: number };

export type Selection = { kind: "bag"; index: number } | { kind: "equipment"; position: number };
