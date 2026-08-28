import { useState } from 'react';
import { Button, Dialog, Input, Table, Text } from '@cloudflare/kumo';
import { Plus } from '@phosphor-icons/react';
import type { Theme } from '@domk/shared-types';
import { api } from '../api';
import { errorMessage } from '../lib/errors';
import { useAsyncData } from '../lib/useAsyncData';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { ErrorBanner } from '../components/ErrorBanner';
import { ConfirmButton } from '../components/ConfirmButton';
import { toast } from '../lib/toast';

const BLANK = { name: '', backgroundColor: '#0f172a', logoUrl: '' };

export function ThemesView() {
  const themes = useAsyncData(() => api.listThemes().then((r) => r.items), []);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(BLANK);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function openCreate() {
    setEditingId(null);
    setForm(BLANK);
    setFormError(null);
    setOpen(true);
  }

  function openEdit(theme: Theme) {
    setEditingId(theme.id);
    setForm({
      name: theme.name,
      backgroundColor: theme.backgroundColor,
      logoUrl: theme.logoUrl ?? '',
    });
    setFormError(null);
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    const payload = {
      name: form.name.trim(),
      backgroundColor: form.backgroundColor,
      logoUrl: form.logoUrl.trim() || null,
    };
    try {
      if (editingId) await api.updateTheme(editingId, payload);
      else await api.createTheme(payload);
      toast('Theme saved', 'success');
      setOpen(false);
      themes.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(theme: Theme) {
    try {
      await api.deleteTheme(theme.id);
      toast(`Deleted "${theme.name}"`, 'success');
      themes.reload();
    } catch (err) {
      themes.setError(errorMessage(err));
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Themes"
        description="Themes control the look of the unlock page shown for password-protected links — a background color and an optional logo. Assign one to a link from the Links page."
        actions={
          <Button variant="primary" icon={<Plus />} onClick={openCreate}>
            New theme
          </Button>
        }
      />

      <ErrorBanner message={themes.error} />

      <Card className="!p-0">
        {themes.data && themes.data.length > 0 ? (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>Name</Table.Head>
                <Table.Head>Background</Table.Head>
                <Table.Head>Logo</Table.Head>
                <Table.Head className="text-right">Actions</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {themes.data.map((theme) => (
                <Table.Row key={theme.id}>
                  <Table.Cell>{theme.name}</Table.Cell>
                  <Table.Cell>
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="inline-block size-3.5 rounded-sm ring ring-kumo-line"
                        style={{ background: theme.backgroundColor }}
                      />
                      <Text variant="mono">{theme.backgroundColor}</Text>
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    <Text variant="secondary" truncate>
                      {theme.logoUrl || '—'}
                    </Text>
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    <span className="flex justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => openEdit(theme)}>
                        Edit
                      </Button>
                      <ConfirmButton
                        label="Delete"
                        title={`Delete theme "${theme.name}"?`}
                        description="Links still assigned to this theme must be reassigned first, or the delete is rejected."
                        onConfirm={() => remove(theme)}
                      />
                    </span>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        ) : (
          <p className="px-5 py-4 text-sm text-kumo-subtle">No themes yet.</p>
        )}
      </Card>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog className="p-6">
          <Dialog.Title className="text-lg font-semibold">
            {editingId ? 'Edit theme' : 'New theme'}
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            Configure the unlock-page appearance.
          </Dialog.Description>
          <form className="mt-4 grid gap-4" onSubmit={submit}>
            {formError ? (
              <Text variant="error" size="sm">
                {formError}
              </Text>
            ) : null}
            <Input
              label="Name"
              required
              placeholder="Default"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.currentTarget.value })}
            />
            <div className="grid gap-1.5">
              <label htmlFor="theme-bg" className="text-sm text-kumo-default">
                Background color
              </label>
              <input
                id="theme-bg"
                type="color"
                className="h-9 w-16 rounded-md ring ring-kumo-line"
                value={form.backgroundColor}
                onChange={(e) => setForm({ ...form, backgroundColor: e.currentTarget.value })}
              />
            </div>
            <Input
              label="Logo URL"
              required={false}
              placeholder="https://…"
              value={form.logoUrl}
              onChange={(e) => setForm({ ...form, logoUrl: e.currentTarget.value })}
            />
            <div className="mt-2 flex justify-end gap-2">
              <Dialog.Close render={(p) => <Button {...p} variant="secondary">Cancel</Button>} />
              <Button type="submit" variant="primary" loading={busy}>
                {editingId ? 'Save changes' : 'Create theme'}
              </Button>
            </div>
          </form>
        </Dialog>
      </Dialog.Root>
    </div>
  );
}
