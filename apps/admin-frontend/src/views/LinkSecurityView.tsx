import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Loader, Text } from '@cloudflare/kumo';
import { TrashSimple } from '@phosphor-icons/react';
import { api } from '../api';
import { errorMessage } from '../lib/errors';
import { useAsyncData } from '../lib/useAsyncData';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { ErrorBanner } from '../components/ErrorBanner';
import { ConfirmButton } from '../components/ConfirmButton';
import { toast } from '../lib/toast';
import { BLANK_FORM, SecurityFields, formFromLink, securityPayload, type FormState } from '../components/link-form';

/** `/links/:slug/security` — password protection, unlock-page theme, deletion. */
export function LinkSecurityView() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const link = useAsyncData(() => api.getLink(slug), [slug]);
  const themes = useAsyncData(() => api.listThemes().then((r) => r.items), []);

  const [form, setForm] = useState<FormState>(BLANK_FORM);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (link.data) setForm(formFromLink(link.data.link));
  }, [link.data]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!link.data) return;
    setError(null);

    const payload = await securityPayload(form, { editing: true });
    if ('error' in payload) {
      setError(payload.error);
      return;
    }

    setBusy(true);
    try {
      await api.updateLink(link.data.link.id, payload);
      toast(`Saved /${link.data.link.slug}`, 'success');
      link.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!link.data) return;
    try {
      await api.deleteLink(link.data.link.id);
      toast(`Deleted /${link.data.link.slug}`, 'success');
      navigate('/links');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="settings-column">
      <PageHeader title="Security" description="Who gets through, and what they see first." />

      <ErrorBanner message={link.error} />

      {link.loading && !link.data ? (
        <div className="flex justify-center py-16">
          <Loader />
        </div>
      ) : link.data ? (
        <>
          <form className="grid gap-6" onSubmit={submit}>
            <Card>
              <SecurityFields
                form={form}
                onChange={setForm}
                themes={themes.data ?? []}
                editing
              />
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

          <div className="grid gap-1.5">
            <Text as="h2" variant="heading">
              Delete this link
            </Text>
            <Text variant="secondary">
              The short link stops working immediately. Its click history goes with it.
            </Text>
            <div className="mt-4">
              <ConfirmButton
                label="Delete link"
                icon={<TrashSimple />}
                title={`Delete /${link.data.link.slug}?`}
                description="The short link stops working immediately."
                onConfirm={remove}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
