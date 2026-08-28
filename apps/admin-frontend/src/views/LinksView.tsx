import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DropdownMenu,
  Input,
  Loader,
  Select,
  Table,
  Text,
} from '@cloudflare/kumo';
import {
  Copy,
  DotsThreeVertical,
  PencilSimple,
  Plus,
  Prohibit,
  TrashSimple,
  ChartBar,
  CheckCircle,
} from '@phosphor-icons/react';
import type { CreateLinkInput, Link, Theme, UpdateLinkInput } from '@domk/shared-types';
import { api } from '../api';
import { derivePasswordPayload } from '../pbkdf2';
import { errorMessage } from '../lib/errors';
import { useAsyncData } from '../lib/useAsyncData';
import { formatDate, toLocalInput } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { ErrorBanner } from '../components/ErrorBanner';
import { toast } from '../lib/toast';

const PAGE_SIZE = 25;
const SHORT_DOMAIN = import.meta.env.VITE_SHORT_DOMAIN;

const BLANK_FORM = {
  slug: '',
  destination: '',
  expiresAt: '',
  tags: '',
  active: true,
  passwordEnabled: false,
  passwordPlaintext: '',
  themeId: null as number | null,
};
type FormState = typeof BLANK_FORM;

const shortUrlFor = (slug: string) => `https://${SHORT_DOMAIN}/${slug}`;

export function LinksView() {
  const navigate = useNavigate();

  const [q, setQ] = useState('');
  const [queryInput, setQueryInput] = useState('');
  const [activeFilter, setActiveFilter] = useState<'' | 'true' | 'false'>('');
  const [offset, setOffset] = useState(0);

  const page = useAsyncData(
    () =>
      api.listLinks({
        q,
        active: activeFilter,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      }),
    [q, activeFilter, offset],
  );
  const themes = useAsyncData(() => api.listThemes().then((r) => r.items), []);
  const themeList: Theme[] = themes.data ?? [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(BLANK_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Link | null>(null);

  const links = page.data?.items ?? [];
  const total = page.data?.total ?? 0;
  const rangeText = useMemo(
    () =>
      total === 0
        ? 'No links'
        : `${offset + 1}–${offset + links.length} of ${total}`,
    [offset, links.length, total],
  );

  const themeItems = useMemo(() => {
    const map: Record<string, string> = { '': 'Default' };
    for (const t of themeList) map[String(t.id)] = t.name;
    return map;
  }, [themeList]);

  function runSearch() {
    setOffset(0);
    setQ(queryInput);
  }

  function openCreate() {
    setEditingId(null);
    setForm(BLANK_FORM);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(link: Link) {
    setEditingId(link.id);
    setForm({
      slug: link.slug,
      destination: link.destination,
      expiresAt: link.expiresAt ? toLocalInput(link.expiresAt) : '',
      tags: link.tags.join(', '),
      active: link.active,
      passwordEnabled: link.passwordProtected,
      passwordPlaintext: '',
      themeId: link.themeId,
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const payload: Record<string, unknown> = {
      slug: form.slug.trim() || undefined,
      destination: form.destination.trim(),
      expiresAt: form.expiresAt ? new Date(form.expiresAt).getTime() : null,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      active: form.active,
      themeId: form.themeId,
    };

    if (form.passwordEnabled) {
      if (form.passwordPlaintext) {
        payload.passwordVerifier = await derivePasswordPayload(form.passwordPlaintext);
      } else if (!editingId) {
        setFormError('Enter a password to protect a new link.');
        return;
      }
      // editing + blank password → leave the stored password untouched (omit the field).
    } else if (editingId) {
      // Explicitly unchecked on an existing link — clear the stored password.
      payload.passwordVerifier = null;
    }

    setBusy(true);
    try {
      const result = editingId
        ? await api.updateLink(editingId, payload as unknown as UpdateLinkInput)
        : await api.createLink(payload as unknown as CreateLinkInput);
      toast(`Saved ${result.shortUrl}`, 'success');
      setDialogOpen(false);
      page.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(link: Link) {
    try {
      await api.updateLink(link.id, { active: !link.active });
      page.reload();
    } catch (err) {
      page.setError(errorMessage(err));
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api.deleteLink(deleteTarget.id);
      toast(`Deleted /${deleteTarget.slug}`, 'success');
      setDeleteTarget(null);
      page.reload();
    } catch (err) {
      page.setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function copy(slug: string) {
    await navigator.clipboard.writeText(shortUrlFor(slug));
    toast(`Copied ${shortUrlFor(slug)}`, 'success');
  }

  function secondaryLine(link: Link): string {
    const parts: string[] = [];
    if (link.tags.length) parts.push(link.tags.join(', '));
    if (link.expiresAt) parts.push(`expires ${formatDate(link.expiresAt)}`);
    if (link.themeId !== null) {
      parts.push(`theme: ${themeList.find((t) => t.id === link.themeId)?.name ?? '—'}`);
    }
    return parts.join(' · ');
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Links"
        actions={
          <Button variant="primary" icon={<Plus />} onClick={openCreate}>
            New link
          </Button>
        }
      />

      <ErrorBanner message={page.error} />

      <Card>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch();
          }}
        >
          <div className="min-w-56 flex-1">
            <Input
              aria-label="Search"
              placeholder="Search slug or destination"
              value={queryInput}
              onChange={(e) => setQueryInput(e.currentTarget.value)}
            />
          </div>
          <Select
            aria-label="Filter by state"
            value={activeFilter}
            onValueChange={(v) => {
              setOffset(0);
              setActiveFilter((v as '' | 'true' | 'false') ?? '');
            }}
            items={{ '': 'All', true: 'Active only', false: 'Inactive only' }}
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      </Card>

      <Card className="!p-0">
        {page.loading && !page.data ? (
          <div className="flex justify-center py-16">
            <Loader />
          </div>
        ) : links.length === 0 ? (
          <p className="px-5 py-4 text-sm text-kumo-subtle">No links found.</p>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>Slug</Table.Head>
                <Table.Head>Destination</Table.Head>
                <Table.Head>State</Table.Head>
                <Table.Head className="text-right">Actions</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {links.map((link) => (
                <Table.Row key={link.id}>
                  <Table.Cell>
                    <Text variant="mono">/{link.slug}</Text>
                  </Table.Cell>
                  <Table.Cell className="max-w-md">
                    <a
                      href={link.destination}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate font-mono text-[0.9em] text-kumo-link hover:underline"
                    >
                      {link.destination}
                    </a>
                    {secondaryLine(link) ? (
                      <Text variant="secondary" size="xs">
                        {secondaryLine(link)}
                      </Text>
                    ) : null}
                  </Table.Cell>
                  <Table.Cell>
                    <span className="flex items-center gap-1.5">
                      <Badge variant={link.active ? 'success' : 'neutral'} appearance="dot">
                        {link.active ? 'active' : 'off'}
                      </Badge>
                      {link.passwordProtected ? <Badge variant="orange">protected</Badge> : null}
                    </span>
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    <DropdownMenu>
                      <DropdownMenu.Trigger
                        render={
                          <Button
                            variant="ghost"
                            shape="square"
                            size="sm"
                            icon={<DotsThreeVertical weight="bold" />}
                            aria-label={`Actions for /${link.slug}`}
                          />
                        }
                      />
                      <DropdownMenu.Content>
                        <DropdownMenu.Item icon={<Copy />} onClick={() => copy(link.slug)}>
                          Copy short URL
                        </DropdownMenu.Item>
                        <DropdownMenu.Item icon={<PencilSimple />} onClick={() => openEdit(link)}>
                          Edit
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          icon={link.active ? <Prohibit /> : <CheckCircle />}
                          onClick={() => toggleActive(link)}
                        >
                          {link.active ? 'Disable' : 'Enable'}
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          icon={<ChartBar />}
                          onClick={() => navigate(`/links/${link.slug}/stats`)}
                        >
                          Stats
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator />
                        <DropdownMenu.Item
                          icon={<TrashSimple />}
                          variant="danger"
                          onClick={() => setDeleteTarget(link)}
                        >
                          Delete
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
        <div className="flex items-center justify-between gap-4 px-5 py-3">
          <Text variant="secondary" size="sm">
            {rangeText}
          </Text>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Prev
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={offset + links.length >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      {/* Create / edit dialog */}
      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog size="lg" className="p-6">
          <Dialog.Title className="text-lg font-semibold">
            {editingId ? 'Edit link' : 'New link'}
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            Configure the short link's destination and options.
          </Dialog.Description>
          <form className="mt-4 grid gap-4" onSubmit={submit}>
            {formError ? (
              <Text variant="error" size="sm">
                {formError}
              </Text>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
              <Input
                label="Slug"
                required={false}
                placeholder="auto"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.currentTarget.value })}
              />
              <Input
                label="Destination"
                required
                placeholder="https://…"
                value={form.destination}
                onChange={(e) => setForm({ ...form, destination: e.currentTarget.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label htmlFor="link-expires" className="text-sm text-kumo-default">
                  Expires <span className="text-kumo-subtle">(optional)</span>
                </label>
                <input
                  id="link-expires"
                  type="datetime-local"
                  className="h-9 rounded-md bg-kumo-control px-2 ring ring-kumo-line"
                  value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.currentTarget.value })}
                />
              </div>
              <Input
                label="Tags"
                required={false}
                description="Comma separated"
                placeholder="work, social"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.currentTarget.value })}
              />
            </div>
            <Checkbox
              label="Active"
              checked={form.active}
              onCheckedChange={(checked) => setForm({ ...form, active: Boolean(checked) })}
            />
            <div className="grid gap-3 rounded-lg bg-kumo-recessed p-4">
              <Checkbox
                label="Password protect this link"
                checked={form.passwordEnabled}
                onCheckedChange={(checked) =>
                  setForm({ ...form, passwordEnabled: Boolean(checked) })
                }
              />
              {form.passwordEnabled ? (
                <Input
                  label={
                    editingId ? 'Password (leave blank to keep current)' : 'Password'
                  }
                  type="password"
                  placeholder="••••••••"
                  value={form.passwordPlaintext}
                  onChange={(e) => setForm({ ...form, passwordPlaintext: e.currentTarget.value })}
                />
              ) : null}
              <Select
                label="Unlock-page theme"
                value={form.themeId === null ? '' : String(form.themeId)}
                onValueChange={(v) =>
                  setForm({ ...form, themeId: v ? Number(v) : null })
                }
                items={themeItems}
              />
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <Dialog.Close render={(p) => <Button {...p} variant="secondary">Cancel</Button>} />
              <Button type="submit" variant="primary" loading={busy}>
                {editingId ? 'Save changes' : 'Create link'}
              </Button>
            </div>
          </form>
        </Dialog>
      </Dialog.Root>

      {/* Delete confirmation */}
      <Dialog.Root
        role="alertdialog"
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <Dialog className="p-6">
          <Dialog.Title className="text-lg font-semibold">
            Delete /{deleteTarget?.slug}?
          </Dialog.Title>
          <Dialog.Description className="mt-2">
            <Text variant="secondary">The short link stops working immediately.</Text>
          </Dialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close render={(p) => <Button {...p} variant="secondary">Cancel</Button>} />
            <Button variant="destructive" loading={busy} onClick={confirmDelete}>
              Delete
            </Button>
          </div>
        </Dialog>
      </Dialog.Root>
    </div>
  );
}
