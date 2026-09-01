import { Badge, Button, DropdownMenu, Text } from '@cloudflare/kumo';
import { SignOut, UserCircle } from '@phosphor-icons/react';
import { useWhoami } from '../lib/whoami';

/** Cloudflare Access owns the session; logging out is a redirect, not an API call. */
const LOGOUT_URL = '/cdn-cgi/access/logout';

/**
 * Identity lives in the top-right corner, the way it does in the Cloudflare
 * dashboard — the sidebar is for product navigation only.
 */
export function UserMenu() {
  const { actor, loading } = useWhoami();

  const name = actor ? (actor.type === 'human' ? actor.email : actor.name) : 'Not signed in';
  const role = actor ? (actor.type === 'human' ? actor.role : 'service token') : null;

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <Button
            variant="ghost"
            shape="square"
            size="sm"
            icon={<UserCircle />}
            disabled={loading}
            aria-label={loading ? 'Loading account' : `Account: ${name}`}
          />
        }
      />
      <DropdownMenu.Content>
        <div className="grid gap-1 px-3 py-2">
          <Text size="sm" truncate>
            {name}
          </Text>
          {role ? (
            <span>
              <Badge variant={role === 'owner' ? 'orange' : 'neutral'}>{role}</Badge>
            </span>
          ) : null}
        </div>
        <DropdownMenu.Separator />
        <DropdownMenu.LinkItem href={LOGOUT_URL} icon={SignOut}>
          Log out
        </DropdownMenu.LinkItem>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
