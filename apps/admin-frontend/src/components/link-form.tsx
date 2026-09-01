import { Checkbox, Input, Select } from '@cloudflare/kumo';
import type { Link, Theme, UpdateLinkInput } from '@domk/shared-types';
import { derivePasswordPayload } from '../pbkdf2';
import { toLocalInput } from '../lib/format';

/**
 * One form shape shared by the create page and the two edit pages, so a link's
 * fields are described in exactly one place regardless of which subpage renders
 * them.
 */
export const BLANK_FORM = {
  slug: '',
  destination: '',
  expiresAt: '',
  tags: '',
  active: true,
  passwordEnabled: false,
  passwordPlaintext: '',
  themeId: null as number | null,
};
export type FormState = typeof BLANK_FORM;

export function formFromLink(link: Link): FormState {
  return {
    slug: link.slug,
    destination: link.destination,
    expiresAt: link.expiresAt ? toLocalInput(link.expiresAt) : '',
    tags: link.tags.join(', '),
    active: link.active,
    passwordEnabled: link.passwordProtected,
    // The stored verifier is write-only and never comes back from the API, so
    // an existing password always starts blank here.
    passwordPlaintext: '',
    themeId: link.themeId,
  };
}

/** Slug, destination, expiry, tags, active — the "General" half of a link. */
export function generalPayload(form: FormState) {
  return {
    slug: form.slug.trim() || undefined,
    destination: form.destination.trim(),
    expiresAt: form.expiresAt ? new Date(form.expiresAt).getTime() : null,
    tags: form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    active: form.active,
  };
}

/**
 * Password and unlock-page theme — the "Security" half.
 *
 * The password rules are the subtle part: on an existing link a blank field
 * means "leave the stored password alone" (omit the field entirely), while
 * unchecking the box means "remove it" (send null). A new link with the box
 * checked and no password is an error the caller has to surface.
 */
export async function securityPayload(
  form: FormState,
  { editing }: { editing: boolean },
): Promise<UpdateLinkInput | { error: string }> {
  const payload: UpdateLinkInput = { themeId: form.themeId };

  if (form.passwordEnabled) {
    if (form.passwordPlaintext) {
      payload.passwordVerifier = await derivePasswordPayload(form.passwordPlaintext);
    } else if (!editing) {
      return { error: 'Enter a password to protect a new link.' };
    }
  } else if (editing) {
    payload.passwordVerifier = null;
  }

  return payload;
}

export function themeItems(themes: Theme[]): Record<string, string> {
  const map: Record<string, string> = { '': 'Default' };
  for (const t of themes) map[String(t.id)] = t.name;
  return map;
}

type FieldProps = { form: FormState; onChange: (next: FormState) => void };

export function GeneralFields({ form, onChange }: FieldProps) {
  return (
    <div className="form-column">
      <div className="form-row">
        <Input
          label="Slug"
          required={false}
          description="Leave blank to generate one"
          placeholder="auto"
          value={form.slug}
          onChange={(e) => onChange({ ...form, slug: e.currentTarget.value })}
        />
        <Input
          label="Destination"
          required
          placeholder="https://…"
          value={form.destination}
          onChange={(e) => onChange({ ...form, destination: e.currentTarget.value })}
        />
      </div>
      <div className="form-row">
        <div className="grid gap-1.5">
          <label htmlFor="link-expires" className="text-sm text-kumo-default">
            Expires <span className="text-kumo-subtle">(optional)</span>
          </label>
          <input
            id="link-expires"
            type="datetime-local"
            className="h-9 rounded-md bg-kumo-control px-2 ring ring-kumo-line"
            value={form.expiresAt}
            onChange={(e) => onChange({ ...form, expiresAt: e.currentTarget.value })}
          />
        </div>
        <Input
          label="Tags"
          required={false}
          description="Comma separated"
          placeholder="work, social"
          value={form.tags}
          onChange={(e) => onChange({ ...form, tags: e.currentTarget.value })}
        />
      </div>
      <Checkbox
        label="Active"
        checked={form.active}
        onCheckedChange={(checked) => onChange({ ...form, active: Boolean(checked) })}
      />
    </div>
  );
}

export function SecurityFields({
  form,
  onChange,
  themes,
  editing,
}: FieldProps & { themes: Theme[]; editing: boolean }) {
  return (
    <div className="form-column">
      <Checkbox
        label="Password protect this link"
        checked={form.passwordEnabled}
        onCheckedChange={(checked) => onChange({ ...form, passwordEnabled: Boolean(checked) })}
      />
      {form.passwordEnabled ? (
        <>
          <Input
            label={editing ? 'Password (leave blank to keep current)' : 'Password'}
            type="password"
            placeholder="••••••••"
            value={form.passwordPlaintext}
            onChange={(e) => onChange({ ...form, passwordPlaintext: e.currentTarget.value })}
          />
          <Select
            label="Unlock-page theme"
            value={form.themeId === null ? '' : String(form.themeId)}
            onValueChange={(v) => onChange({ ...form, themeId: v ? Number(v) : null })}
            items={themeItems(themes)}
          />
        </>
      ) : null}
    </div>
  );
}
