import { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
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
import type { Link, Theme } from '@domk/shared-types';
import { api } from '../api';
import { errorMessage } from '../lib/errors';
import { useAsyncData } from '../lib/useAsyncData';
import { formatDate, truncateUrl } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { ErrorBanner } from '../components/ErrorBanner';
import { toast } from '../lib/toast';

const PAGE_SIZE = 25;
const SHORT_DOMAIN = import.meta.env.VITE_SHORT_DOMAIN;

const shortUrlFor = (slug: string) => `https://${SHORT_DOMAIN}/${slug}`;
const linkPath = (slug: string, section: string) => `/links/${encodeURIComponent(slug)}/${section}`;

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

  function runSearch() {
    setOffset(0);
    setQ(queryInput);
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
          <Button variant="primary" icon={<Plus />} onClick={() => navigate('/links/new')}>
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
          <div className="flex-1">
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

      <Card flush>
        {page.loading && !page.data ? (
          <div className="flex justify-center py-16">
            <Loader />
          </div>
        ) : links.length === 0 ? (
          <p className="card-body text-sm text-kumo-subtle">No links found.</p>
        ) : (
          <div className="overflow-x-auto">
          <Table layout="fixed">
            <colgroup>
              <col style={{ width: '22%' }} />
              <col style={{ width: '44%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '16%' }} />
            </colgroup>
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
                    <RouterLink
                      to={linkPath(link.slug, 'edit')}
                      className="block truncate mono-inline text-kumo-link hover-underline"
                    >
                      /{link.slug}
                    </RouterLink>
                  </Table.Cell>
                  <Table.Cell>
                    <a
                      href={link.destination}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={link.destination}
                      className="block truncate mono-inline text-kumo-link hover-underline"
                    >
                      {truncateUrl(link.destination)}
                    </a>
                    {secondaryLine(link) ? (
                      <Text variant="secondary" size="xs" truncate>
                        {secondaryLine(link)}
                      </Text>
                    ) : null}
                  </Table.Cell>
                  <Table.Cell>
                    <span className="flex flex-wrap items-center gap-1.5">
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
                        <DropdownMenu.Item
                          icon={<PencilSimple />}
                          onClick={() => navigate(linkPath(link.slug, 'edit'))}
                        >
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
                          onClick={() => navigate(linkPath(link.slug, 'analytics'))}
                        >
                          Analytics
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
          </div>
        )}
        <div className="flex items-center justify-between gap-4 card-body">
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

      {/* Deleting from the list stays a confirmation dialog — it's an
          acknowledgement, not a settings surface. Always mounted (Kumo rule). */}
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
