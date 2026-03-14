import type { Apartment } from '@zahumny/shared';
import Tile from '../components/Tile.js';

interface BuyerSelectProps {
  apartments: Apartment[];
  onSelect: (buyer: number) => void;
}

export default function BuyerSelect({ apartments, onSelect }: BuyerSelectProps) {
  return (
    <div className="screen">
      <div className="screen-body">
        <div className="screen-title">Vyber číslo apartmánu</div>
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
      </div>
    </div>
  );
}
