import { useState, type ReactNode } from 'react';
import { Button, Dialog, Text } from '@cloudflare/kumo';

/**
 * A button that opens an alert dialog before running a destructive action.
 * The dialog is always mounted (Kumo rule: never conditionally render).
 */
export function ConfirmButton({
  label,
  title,
  description,
  confirmLabel = 'Delete',
  onConfirm,
  icon,
  size = 'sm',
}: {
  label: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  icon?: ReactNode;
  size?: 'xs' | 'sm' | 'base';
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root role="alertdialog" open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        render={(p) => (
          <Button {...p} variant="secondary-destructive" size={size} icon={icon}>
            {label}
          </Button>
        )}
      />
      <Dialog className="p-6">
        <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
        <Dialog.Description className="mt-2">
          <Text variant="secondary">{description}</Text>
        </Dialog.Description>
        <div className="mt-6 flex justify-end gap-2">
          <Dialog.Close render={(p) => <Button {...p} variant="secondary">Cancel</Button>} />
          <Button variant="destructive" loading={busy} onClick={run}>
            {confirmLabel}
          </Button>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
