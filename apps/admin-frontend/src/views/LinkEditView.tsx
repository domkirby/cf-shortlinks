import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Loader, Text } from '@cloudflare/kumo';
import type { UpdateLinkInput } from '@domk/shared-types';
import { api } from '../api';
import { errorMessage } from '../lib/errors';
import { useAsyncData } from '../lib/useAsyncData';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { ErrorBanner } from '../components/ErrorBanner';
import { toast } from '../lib/toast';
import { CopyShortUrl } from '../components/CopyShortUrl';
import { BLANK_FORM, GeneralFields, formFromLink, generalPayload, type FormState } from '../components/link-form';

/** `/links/:slug/edit` — the General page of a link's settings. */
export function LinkEditView() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const link = useAsyncData(() => api.getLink(slug), [slug]);

  const [form, setForm] = useState<FormState>(BLANK_FORM);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Seed the form once the link lands, and re-seed after a save so a
  // server-side change (a normalized slug, say) shows up.
  useEffect(() => {
    if (link.data) setForm(formFromLink(link.data.link));
  }, [link.data]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!link.data) return;
    setError(null);
    setBusy(true);
    try {
      const result = await api.updateLink(
        link.data.link.id,
        generalPayload(form) as UpdateLinkInput,
      );
      toast(`Saved ${result.shortUrl}`, 'success');
      // The slug is this page's identity, so renaming one has to move the URL
      // with it — otherwise the next reload 404s on a slug that's gone.
      if (result.link.slug !== slug) {
        navigate(`/links/${encodeURIComponent(result.link.slug)}/edit`, { replace: true });
      } else {
        link.reload();
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-column">
      <PageHeader
        title="General"
        description="Where this link points, and when it stops working."
        actions={link.data ? <CopyShortUrl shortUrl={link.data.shortUrl} /> : null}
      />

      <ErrorBanner message={link.error} />

      {link.loading && !link.data ? (
        <div className="flex justify-center py-16">
          <Loader />
        </div>
      ) : link.data ? (
        <form className="grid gap-6" onSubmit={submit}>
          <Card>
            <GeneralFields form={form} onChange={setForm} />
          </Card>
          <div className="flex items-center justify-end gap-3">
            {error ? (
              <Text variant="error" size="sm">
                {error}
              </Text>
            ) : null}
            <Button type="submit" variant="primary" loading={busy}>
              Save changes
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
