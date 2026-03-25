import { useEffect, useState } from "react";

export default function LoadingDots() {
  const [count, setCount] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setCount((c) => (c % 3) + 1);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return <span className="loading-dots">{".".repeat(count)}</span>;
}
