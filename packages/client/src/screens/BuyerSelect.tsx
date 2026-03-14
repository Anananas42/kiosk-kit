import type { Apartment } from '@zahumny/shared';
import Tile from '../components/Tile.js';
import ScreenHeader from '../components/ScreenHeader.js';

interface BuyerSelectProps {
  apartments: Apartment[];
  onSelect: (buyer: number) => void;
  error: boolean;
}

export default function BuyerSelect({ apartments, onSelect, error }: BuyerSelectProps) {
  return (
    <div className="screen">
      <ScreenHeader title="Vyberte apartmán" />
      <div className="screen-body">
        {apartments.length === 0 ? (
          <div className="empty-state">
            {error ? 'Nelze načíst data' : 'Načítám\u2026'}
          </div>
        ) : (
          <div className="tile-grid tile-grid--buyers">
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
