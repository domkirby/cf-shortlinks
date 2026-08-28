import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader } from '@cloudflare/kumo';
import { useWhoami, useIsOwner } from './whoami';

/** Owner-only routes redirect editors back to the links list. */
export function RequireOwner({ children }: { children: ReactNode }) {
  const { loading } = useWhoami();
  const isowner = useIsOwner();

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader />
      </div>
    );
  }
  if (!isowner) return <Navigate to="/links" replace />;
  return <>{children}</>;
}
