import type { CatalogCategory } from '@zahumny/shared';
import { ensureKc } from '@zahumny/shared';
import ContextBar from '../components/ContextBar.js';

interface ConfirmItem {
  name: string;
  quantity: string;
  price: string;
}

interface ConfirmProps {
  buyer: number;
  category: CatalogCategory;
  item: ConfirmItem;
  onConfirm: (operation: '+' | '-') => void;
  onCancel: () => void;
  isSending: boolean;
  pendingOperation: '+' | '-' | null;
  error: string | null;
  onErrorDismiss: () => void;
}

export default function Confirm({ buyer, category, item, onConfirm, onCancel, isSending, pendingOperation, error, onErrorDismiss }: ConfirmProps) {
  return (
    <div className="screen">
      <ContextBar buyer={buyer} category={category.name} />
      <div className="screen-body">
        <div className="screen-title">Potvrďte záznam</div>
        <div className="confirm-summary">
          <div className="confirm-row">
            <span className="confirm-row__label">Kupující</span>
            <span className="confirm-row__value">#{buyer}</span>
          </div>
          <div className="confirm-row">
            <span className="confirm-row__label">Kategorie</span>
            <span className="confirm-row__value">{category.name}</span>
          </div>
          <div className="confirm-row">
            <span className="confirm-row__label">Položka</span>
            <span className="confirm-row__value">{item.name}</span>
          </div>
          {item.quantity && (
            <div className="confirm-row">
              <span className="confirm-row__label">Množství</span>
              <span className="confirm-row__value">{item.quantity}</span>
            </div>
          )}
          {item.price && (
            <div className="confirm-row">
              <span className="confirm-row__label">Cena</span>
              <span className="confirm-row__value">{ensureKc(item.price)}</span>
            </div>
          )}
        </div>

        {error && (
          <div className="confirm-error">
            <span>{error}</span>
            <button className="confirm-error__dismiss" onClick={onErrorDismiss} type="button">✕</button>
          </div>
        )}

        {isSending ? (
          <div className="sending-overlay">
            {pendingOperation === '+' ? 'Přidávám…' : 'Odebírám…'}
          </div>
        ) : (
          <div className="confirm-actions confirm-actions--three">
            <button className="btn-confirm btn-confirm--add" onClick={() => onConfirm('+')} type="button">
              + Přidat
            </button>
            <button className="btn-confirm btn-confirm--remove" onClick={() => onConfirm('-')} type="button">
              − Odebrat
            </button>
            <button className="btn-confirm btn-confirm--cancel" onClick={onCancel} type="button">
              Zpět na hlavní menu
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
