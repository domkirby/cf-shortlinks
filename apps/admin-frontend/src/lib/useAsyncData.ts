import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from './errors';

interface AsyncData<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
  setError: (message: string | null) => void;
}

/**
 * Fetch-on-mount with a manual `reload()`. `deps` controls when the fetch
 * re-runs (e.g. a changed filter or route param).
 */
export function useAsyncData<T>(fn: () => Promise<T>, deps: unknown[]): AsyncData<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(fn, deps);

  const reload = useCallback(() => {
    setLoading(true);
    load()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, error, loading, reload, setError };
}
