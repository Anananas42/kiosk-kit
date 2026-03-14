interface ContextBarProps {
  buyer: number | null;
  category?: string;
}

export default function ContextBar({ buyer, category }: ContextBarProps) {
  return (
    <div className="context-bar">
      <div className="context-bar__item">
        <div className="context-bar__label">Kupující</div>
        <div className="context-bar__value">{buyer != null ? `#${buyer}` : '—'}</div>
      </div>
      <div className="context-bar__item">
        <div className="context-bar__label">Kategorie</div>
        <div className="context-bar__value">{category ?? '—'}</div>
      </div>
    </div>
  );
}
