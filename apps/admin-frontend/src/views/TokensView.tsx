import { useState } from 'react';
import { Badge, Banner, Button, Dialog, Input, Table, Text } from '@cloudflare/kumo';
import { Info, Plus } from '@phosphor-icons/react';
import type { ServiceToken } from '@domk/shared-types';
import { api } from '../api';
import { errorMessage } from '../lib/errors';
import { useAsyncData } from '../lib/useAsyncData';
import { formatDate } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { ErrorBanner } from '../components/ErrorBanner';
import { ConfirmButton } from '../components/ConfirmButton';
import { toast } from '../lib/toast';

const adminDomain = import.meta.env.VITE_ADMIN_DOMAIN;

export function TokensView() {
  const tokens = useAsyncData(() => api.listTokens().then((r) => r.items), []);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      tokens.reload();
    } catch (err) {
      tokens.setError(errorMessage(err));
    }
  }

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await api.createToken(name.trim(), description.trim() || undefined);
      toast('Token registered', 'success');
      setOpen(false);
      setName('');
      setDescription('');
      tokens.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Service tokens"
        actions={
          <Button variant="primary" icon={<Plus />} onClick={() => setOpen(true)}>
            Register a token
          </Button>
        }
      />

      <Banner
        variant="secondary"
        icon={<Info weight="fill" />}
        title="How these work"
        description={
          <>
            The credential itself lives in Cloudflare Access — create the service token in Zero
            Trust, scoped to the <span className="font-mono text-[0.9em]">{adminDomain}</span>{' '}
            application, then register its name here so this API will honour it. Revocation has two
            independent levers: disable it here to cut it off at the app layer instantly, or delete
            it in Access to stop it at the edge. Retiring a token for good means doing both.
          </>
        }
      />

      <ErrorBanner message={tokens.error} />

      <Card className="!p-0">
        {tokens.data && tokens.data.length > 0 ? (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>Name</Table.Head>
                <Table.Head>State</Table.Head>
                <Table.Head>Registered</Table.Head>
                <Table.Head className="text-right">Actions</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {tokens.data.map((token: ServiceToken) => (
                <Table.Row key={token.name}>
                  <Table.Cell>
                    <Text variant="mono">{token.name}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge
                      variant={token.active ? 'success' : 'neutral'}
                      appearance="dot"
                    >
                      {token.active ? 'active' : 'revoked'}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Text variant="secondary">{formatDate(token.createdAt)}</Text>
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    <span className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => run(() => api.setTokenActive(token.name, !token.active))}
                      >
                        {token.active ? 'Revoke' : 'Re-enable'}
                      </Button>
                      <ConfirmButton
                        label="Forget"
                        confirmLabel="Forget"
                        title={`Forget "${token.name}"?`}
                        description="The credential keeps passing Access until you delete it there too — this only removes the app-layer record."
                        onConfirm={() => run(() => api.deleteToken(token.name))}
                      />
                    </span>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        ) : (
          <p className="px-5 py-4 text-sm text-kumo-subtle">No service tokens registered.</p>
        )}
      </Card>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog className="p-6">
          <Dialog.Title className="text-lg font-semibold">Register a token</Dialog.Title>
          <Dialog.Description className="mt-1 mb-4">
            <Text variant="secondary">
              This records the name only — it does not mint a secret.
            </Text>
          </Dialog.Description>
          <form className="grid gap-4" onSubmit={register}>
            {formError ? (
              <Text variant="error" size="sm">
                {formError}
              </Text>
            ) : null}
            <Input
              label="Name"
              description="Must match the Access service-token name exactly."
              required
              placeholder="ci-deploy"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
            <Input
              label="What is it for?"
              required={false}
              placeholder="n8n workflow, release job…"
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
            />
            <div className="mt-2 flex justify-end gap-2">
              <Dialog.Close render={(p) => <Button {...p} variant="secondary">Cancel</Button>} />
              <Button type="submit" variant="primary" loading={busy}>
                Register
              </Button>
            </div>
          </form>
        </Dialog>
      </Dialog.Root>
    </div>
  );
}
