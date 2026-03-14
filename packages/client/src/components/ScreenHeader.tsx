interface Crumb {
  label: string;
  value: string;
}

interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  backLabel?: string;
  crumbs?: Crumb[];
}

export default function ScreenHeader({ title, onBack, backLabel, crumbs }: ScreenHeaderProps) {
  const backContent = onBack ? `\u2190 ${backLabel ?? ''}` : null;

  return (
    <div className="screen-header">
      {onBack && (
        <button className="screen-header__back" onClick={onBack} type="button">
          &larr; {backLabel}
        </button>
      )}
      <div className="screen-header__center">
        <div className="screen-header__title">{title}</div>
        {crumbs && crumbs.length > 0 && (
          <div className="screen-header__crumbs">
            {crumbs.map((c, i) => (
              <span key={c.label}>
                {i > 0 && <span className="screen-header__crumb-sep"> &middot; </span>}
                <span className="screen-header__crumb-value">{c.value}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      {backContent && (
        <div className="screen-header__spacer" aria-hidden="true">{backContent}</div>
      )}
    </div>
  );
}
