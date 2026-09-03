interface Props {
  label: string;
  onUndo: () => void;
  onDismiss: () => void;
}

/** Offers to put back what a removal just took away. Any other edit retires it. */
export function UndoBar({ label, onUndo, onDismiss }: Props) {
  return (
    <div className="undo-bar" role="status">
      <span>{label}</span>
      <button type="button" onClick={onUndo}>
        Undo
      </button>
      <button type="button" className="link" onClick={onDismiss} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
