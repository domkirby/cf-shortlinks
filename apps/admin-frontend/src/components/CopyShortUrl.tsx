import { Button } from '@cloudflare/kumo';
import { Copy } from '@phosphor-icons/react';
import { toast } from '../lib/toast';

/** The short URL is the thing people came here to hand out — keep it one click away. */
export function CopyShortUrl({ shortUrl }: { shortUrl: string }) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      icon={<Copy />}
      onClick={async () => {
        await navigator.clipboard.writeText(shortUrl);
        toast(`Copied ${shortUrl}`, 'success');
      }}
    >
      Copy short URL
    </Button>
  );
}
