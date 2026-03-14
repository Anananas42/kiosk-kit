interface TileProps {
  label: string;
  subtitle?: string;
  icon?: string;
  variant?: 'neutral' | 'category' | 'item' | 'add' | 'remove' | 'overview';
  className?: string;
  onClick?: () => void;
}

export default function Tile({ label, subtitle, icon, variant = 'neutral', className = '', onClick }: TileProps) {
  return (
    <button
      className={`tile tile--${variant} ${className}`}
      onClick={onClick}
      type="button"
    >
      {icon && <span className="tile-icon">{icon}</span>}
      <span className="tile-label">{label}</span>
      {subtitle && <span className="tile-subtitle">{subtitle}</span>}
    </button>
  );
}
