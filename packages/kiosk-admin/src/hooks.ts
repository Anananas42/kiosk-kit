import { useCallback, useEffect, useState } from "react";

export function useData<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    fetcher()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fetcher]);

  useEffect(reload, [reload]);

  return { data, error, loading, reload };
}

export function useFormStatus() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const clear = () => {
    setError(null);
    setSuccess(null);
  };
  return { error, success, setError, setSuccess, clear };
}
