import { useEffect } from 'react';
import { SUCCESS_FLASH_MS } from '@zahumny/shared';

interface SuccessFlashProps {
  message: string;
  onDone: () => void;
}

export default function SuccessFlash({ message, onDone }: SuccessFlashProps) {
  useEffect(() => {
    const timer = setTimeout(onDone, SUCCESS_FLASH_MS);
    return () => clearTimeout(timer);
  }, [onDone]);

  return <div className="success-flash">{message}</div>;
}
