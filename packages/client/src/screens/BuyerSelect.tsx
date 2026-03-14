import type { Apartment } from '@zahumny/shared';
import Tile from '../components/Tile.js';
import { tileScaleStyle } from '../utils/tileScale.js';

interface BuyerSelectProps {
  apartments: Apartment[];
  onSelect: (buyer: number) => void;
  error: boolean;
}

export default function BuyerSelect({ apartments, onSelect, error }: BuyerSelectProps) {
  const labels = apartments.map((apt) => apt.label);

  return (
    <div className="screen">
      <div className="screen-body">
        <div className="screen-title">1. Vyber číslo apartmánu</div>
        {apartments.length === 0 ? (
          <div className="empty-state">
            {error ? 'Nelze načíst data' : 'Načítám\u2026'}
          </div>
        ) : (
          <div className="tile-grid tile-grid--buyers" style={tileScaleStyle(labels)}>
            {apartments.map((apt) => (
              <Tile
                key={apt.id}
                label={apt.label}
                variant="neutral"
                onClick={() => onSelect(apt.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
