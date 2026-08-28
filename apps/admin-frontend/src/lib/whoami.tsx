import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { isOwner as actorIsOwner, type Actor } from '@domk/shared-types';
import { api, ApiRequestError } from '../api';

interface WhoamiState {
  actor: Actor | null;
  error: string | null;
  loading: boolean;
}

const WhoamiContext = createContext<WhoamiState>({ actor: null, error: null, loading: true });

/**
 * `whoami` doubles as the app's readiness check: it proves Access let us
 * through *and* that this identity is in the admins table, which are two
 * different failures worth telling apart on screen.
 */
export function WhoamiProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WhoamiState>({ actor: null, error: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    api
      .whoami()
      .then((res) => {
        if (!cancelled) setState({ actor: res.actor, error: null, loading: false });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const error =
          err instanceof ApiRequestError
            ? `${err.message} (${err.code})`
            : 'Could not reach the admin API';
        setState({ actor: null, error, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <WhoamiContext.Provider value={state}>{children}</WhoamiContext.Provider>;
}

export function useWhoami(): WhoamiState {
  return useContext(WhoamiContext);
}

export function useIsOwner(): boolean {
  const { actor } = useWhoami();
  return actor != null && actorIsOwner(actor);
}
