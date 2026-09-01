import { useState } from 'react';
import { Badge, Button, Dialog, Input, Select, Table, Text } from '@cloudflare/kumo';
import { Plus } from '@phosphor-icons/react';
import { api, type AdminRecord } from '../api';
import { errorMessage } from '../lib/errors';
import { useAsyncData } from '../lib/useAsyncData';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { ErrorBanner } from '../components/ErrorBanner';
import { ConfirmButton } from '../components/ConfirmButton';
import { toast } from '../lib/toast';

export function AdminsView() {
  const admins = useAsyncData(() => api.listAdmins().then((r) => r.items), []);

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'owner' | 'editor'>('editor');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await api.createAdmin(email.trim(), role);
      toast('Admin added', 'success');
      setOpen(false);
      setEmail('');
      setRole('editor');
      admins.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(record: AdminRecord) {
    try {
      await api.deleteAdmin(record.email);
      toast(`Removed ${record.email}`, 'success');
      admins.reload();
    } catch (err) {
      admins.setError(errorMessage(err));
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Admins"
        description="Cloudflare Access decides who can reach this app. This list decides who can use it once they're through, and in what role — adding someone here does nothing unless the Access policy also lets them in."
        actions={
          <Button variant="primary" icon={<Plus />} onClick={() => setOpen(true)}>
            Add admin
          </Button>
        }
      />

      <ErrorBanner message={admins.error} />

      <Card flush>
        {admins.data && admins.data.length > 0 ? (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>Email</Table.Head>
                <Table.Head>Role</Table.Head>
                <Table.Head className="text-right">Actions</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {admins.data.map((record) => (
                <Table.Row key={record.email}>
                  <Table.Cell>
                    <Text variant="mono">{record.email}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge variant={record.role === 'owner' ? 'primary' : 'neutral'}>
                      {record.role}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    <ConfirmButton
                      label="Remove"
                      confirmLabel="Remove"
                      title={`Remove ${record.email}?`}
                      description="They lose access to this app immediately. Access itself is unaffected."
                      onConfirm={() => remove(record)}
                    />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        ) : (
          <p className="card-body text-sm text-kumo-subtle">No admins yet.</p>
        )}
      </Card>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog className="p-6">
          <Dialog.Title className="text-lg font-semibold">Add an admin</Dialog.Title>
          <Dialog.Description className="mt-1 mb-4">
            <Text variant="secondary">Enter the email exactly as your IdP reports it.</Text>
          </Dialog.Description>
          <form className="grid gap-4" onSubmit={add}>
            {formError ? (
              <Text variant="error" size="sm">
                {formError}
              </Text>
            ) : null}
            <Input
              label="Email"
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
            <Select
              label="Role"
              value={role}
              onValueChange={(v) => setRole((v as 'owner' | 'editor') ?? 'editor')}
              items={{
                editor: 'editor — manage links',
                owner: 'owner — also manage admins and tokens',
              }}
            />
            <div className="mt-2 flex justify-end gap-2">
              <Dialog.Close render={(p) => <Button {...p} variant="secondary">Cancel</Button>} />
              <Button type="submit" variant="primary" loading={busy}>
                Add
              </Button>
            </div>
          </form>
        </Dialog>
      </Dialog.Root>
    </div>
  );
}
