import { Banner } from '@cloudflare/kumo';
import { WarningCircle } from '@phosphor-icons/react';

/** Persistent error surface. Renders nothing when `message` is null. */
export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Banner
      variant="error"
      icon={<WarningCircle weight="fill" />}
      title="Something went wrong"
      description={message}
    />
  );
}
