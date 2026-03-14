import { useEffect } from 'react';

interface SuccessFlashProps {
  message: string;
  onDone: () => void;
}

export default function SuccessFlash({ message, onDone }: SuccessFlashProps) {
  useEffect(() => {
    const timer = setTimeout(onDone, 1500);
    return () => clearTimeout(timer);
  }, [onDone]);

  return <div className="success-flash">{message}</div>;
}
