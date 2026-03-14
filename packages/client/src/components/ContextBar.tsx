interface ContextBarProps {
  buyer: number;
  category?: string;
  item?: string;
}

export default function ContextBar({ buyer, category, item }: ContextBarProps) {
  return (
    <div className="context-bar">
      <div className="context-bar__item">
        <div className="context-bar__label">Kupující</div>
        <div className="context-bar__value">#{buyer}</div>
      </div>
      {category && (
        <div className="context-bar__item">
          <div className="context-bar__label">Kategorie</div>
          <div className="context-bar__value">{category}</div>
        </div>
      )}
      {item && (
        <div className="context-bar__item">
          <div className="context-bar__label">Položka</div>
          <div className="context-bar__value">{item}</div>
        </div>
      )}
    </div>
  );
}
