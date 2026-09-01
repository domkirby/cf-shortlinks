import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Text } from '@cloudflare/kumo';
import type { CreateLinkInput } from '@domk/shared-types';
import { api } from '../api';
import { errorMessage } from '../lib/errors';
import { useAsyncData } from '../lib/useAsyncData';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { toast } from '../lib/toast';
import {
  BLANK_FORM,
  GeneralFields,
  SecurityFields,
  generalPayload,
  securityPayload,
  type FormState,
} from '../components/link-form';

/**
 * Creating a link is the one place both halves of the form appear together —
 * splitting a link that doesn't exist yet across subpages would mean saving it
 * half-configured.
 */
export function LinkNewView() {
  const navigate = useNavigate();
  const themes = useAsyncData(() => api.listThemes().then((r) => r.items), []);

  const [form, setForm] = useState<FormState>(BLANK_FORM);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const security = await securityPayload(form, { editing: false });
    if ('error' in security) {
      setError(security.error);
      return;
    }

    setBusy(true);
    try {
      const result = await api.createLink({
        ...generalPayload(form),
        ...security,
      } as CreateLinkInput);
      toast(`Created ${result.shortUrl}`, 'success');
      navigate(`/links/${encodeURIComponent(result.link.slug)}/edit`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="settings-column" onSubmit={submit}>
      <PageHeader title="New link" description="Where it points and who can follow it." />

      <Card>
        <div className="grid gap-4">
          <Text as="h2" variant="heading">
            General
          </Text>
          <GeneralFields form={form} onChange={setForm} />
        </div>
      </Card>

      <Card>
        <div className="grid gap-4">
          <Text as="h2" variant="heading">
            Security
          </Text>
          <SecurityFields
            form={form}
            onChange={setForm}
            themes={themes.data ?? []}
            editing={false}
          />
        </div>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {error ? (
          <Text variant="error" size="sm">
            {error}
          </Text>
        ) : null}
        <Button type="button" variant="secondary" onClick={() => navigate('/links')}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          Create link
        </Button>
      </div>
    </form>
  );
}
