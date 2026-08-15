import { Hono } from 'hono';
import { and, count, desc, eq, like, or, sql } from 'drizzle-orm';
import { links } from '@domk/db-schema';
import { actorLabel, type Link, type LinkResponse, type ListLinksResponse } from '@domk/shared-types';
import type { AppEnv } from '../env.js';
import { getDb, isUniqueViolation, serializeTags, toLink } from '../lib/db.js';
import { syncLinkToKv, removeSlugFromKv } from '../lib/kv-sync.js';
import { conflict, notFound } from '../lib/errors.js';
import { generateSlug, parseCreateLink, parsePagination, parseUpdateLink } from '../lib/validate.js';
import { buildStoredVerifier } from '../lib/password.js';

const app = new Hono<AppEnv>();

function shortUrl(domain: string, slug: string): string {
  return `https://${domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/${slug}`;
}

function linkResponse(domain: string, link: Link): LinkResponse {
  return { link, shortUrl: shortUrl(domain, link.slug) };
}

/** GET /api/links — filtered, paginated list. */
app.get('/', async (c) => {
  const db = getDb(c.env);
  const { limit, offset } = parsePagination(c.req.query());
  const q = c.req.query('q')?.trim();
  const tag = c.req.query('tag')?.trim();
  const activeParam = c.req.query('active');

  const filters = [];
  if (q) {
    const needle = `%${q.replace(/[%_]/g, '\\$&')}%`;
    filters.push(
      or(
        like(links.slug, sql`${needle} ESCAPE '\\'`),
        like(links.destination, sql`${needle} ESCAPE '\\'`),
      ),
    );
  }
  if (tag) {
    // tags is a JSON array in a text column; match the quoted element so "go"
    // doesn't match "google".
    filters.push(like(links.tags, `%"${tag.replace(/[%_"]/g, '')}"%`));
  }
  if (activeParam === 'true' || activeParam === 'false') {
    filters.push(eq(links.active, activeParam === 'true' ? 1 : 0));
  }

  const where = filters.length ? and(...filters) : undefined;

  const [rows, totals] = await Promise.all([
    db.select().from(links).where(where).orderBy(desc(links.createdAt)).limit(limit).offset(offset),
    db.select({ value: count() }).from(links).where(where),
  ]);

  const body: ListLinksResponse = {
    items: rows.map(toLink),
    total: totals[0]?.value ?? 0,
    limit,
    offset,
  };
  return c.json(body);
});

/** GET /api/links/:id */
app.get('/:id', async (c) => {
  const link = await loadLink(getDb(c.env), c.req.param('id'));
  return c.json(linkResponse(c.env.SHORT_DOMAIN, link));
});

/** POST /api/links — create, then write through to KV. */
app.post('/', async (c) => {
  const db = getDb(c.env);
  const now = Date.now();
  const input = parseCreateLink(await c.req.json().catch(() => null), now);
  const owner = actorLabel(c.get('actor'));

  const row = input.slug
    ? await insertLink(db, { ...input, slug: input.slug }, owner, now)
    : await insertWithGeneratedSlug(db, input, owner, now);

  const link = toLink(row);
  // Awaited, not fire-and-forget: on the admin surface correctness beats
  // latency, and the caller should learn about a cache that didn't take.
  await syncLinkToKv(c.env, link, now);

  return c.json(linkResponse(c.env.SHORT_DOMAIN, link), 201);
});

/** Hashes the client's password payload against a specific slug, if present. */
async function resolvePasswordVerifier(slug: string, payload: string | undefined): Promise<string | null> {
  return payload ? await buildStoredVerifier(slug, payload) : null;
}

/** PATCH /api/links/:id — partial update, write-through handles the rest. */
app.patch('/:id', async (c) => {
  const db = getDb(c.env);
  const now = Date.now();
  const existing = await loadLink(db, c.req.param('id'));
  const update = parseUpdateLink(await c.req.json().catch(() => null), now);

  const patch: Record<string, unknown> = { updatedAt: now };
  if (update.slug !== undefined) patch.slug = update.slug;
  if (update.destination !== undefined) patch.destination = update.destination;
  if (update.expiresAt !== undefined) patch.expiresAt = update.expiresAt;
  if (update.tags !== undefined) patch.tags = serializeTags(update.tags);
  if (update.active !== undefined) patch.active = update.active ? 1 : 0;
  if (update.themeId !== undefined) patch.themeId = update.themeId;
  if (update.passwordVerifierPayload !== undefined) {
    if (update.passwordVerifierPayload === null) {
      patch.passwordProtected = 0;
      patch.passwordVerifier = null;
    } else {
      // Hash against the final (possibly just-renamed) slug.
      const slug = update.slug ?? existing.slug;
      patch.passwordProtected = 1;
      patch.passwordVerifier = await resolvePasswordVerifier(slug, update.passwordVerifierPayload);
    }
  }

  let updated;
  try {
    const rows = await db.update(links).set(patch).where(eq(links.id, existing.id)).returning();
    updated = rows[0];
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw conflict(`Slug "${update.slug}" is already taken`, { slug: String(update.slug) });
    }
    throw err;
  }
  if (!updated) throw notFound(`Link ${existing.id} disappeared mid-update`);

  const link = toLink(updated);
  // Deactivating, expiring, or renaming all resolve to a KV delete of the old
  // key inside syncLinkToKv — nothing here needs to know which happened.
  await syncLinkToKv(c.env, link, now, existing.slug);

  return c.json(linkResponse(c.env.SHORT_DOMAIN, link));
});

/** DELETE /api/links/:id — hard delete in both stores. */
app.delete('/:id', async (c) => {
  const db = getDb(c.env);
  const existing = await loadLink(db, c.req.param('id'));

  await db.delete(links).where(eq(links.id, existing.id));
  // KV last: if this throws, the row is already gone and the caller gets a 503
  // telling them to retry, which is recoverable. The reverse order would leave
  // a live cache entry pointing at a link nobody can see or fix.
  await removeSlugFromKv(c.env, existing.slug);

  return c.body(null, 204);
});

/** Accepts a numeric id or a slug, so scripts can address links by name. */
async function loadLink(db: ReturnType<typeof getDb>, idOrSlug: string): Promise<Link> {
  const numeric = Number.parseInt(idOrSlug, 10);
  const row = await db.query.links.findFirst({
    where: /^\d+$/.test(idOrSlug) ? eq(links.id, numeric) : eq(links.slug, idOrSlug),
  });
  if (!row) throw notFound(`No link matching "${idOrSlug}"`);
  return toLink(row);
}

async function insertLink(
  db: ReturnType<typeof getDb>,
  input: {
    slug: string;
    destination: string;
    expiresAt: number | null;
    tags: string[];
    active: boolean;
    passwordVerifierPayload?: string;
    themeId: number | null;
  },
  owner: string,
  now: number,
) {
  // The HMAC key is the slug, so this has to happen after the slug is known
  // but before insert — safe here since (unlike D1 collision detection) the
  // slug itself is already chosen locally, generated or not, by this point.
  const passwordVerifier = await resolvePasswordVerifier(input.slug, input.passwordVerifierPayload);
  try {
    const rows = await db
      .insert(links)
      .values({
        slug: input.slug,
        destination: input.destination,
        ownerEmail: owner,
        active: input.active ? 1 : 0,
        expiresAt: input.expiresAt,
        tags: serializeTags(input.tags),
        passwordProtected: passwordVerifier ? 1 : 0,
        passwordVerifier,
        themeId: input.themeId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('insert returned no row');
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw conflict(`Slug "${input.slug}" is already taken`, { slug: input.slug });
    }
    throw err;
  }
}

/**
 * Generated slugs collide roughly never, but "roughly never" at the database
 * level still needs a retry rather than a 409 the caller can't act on — they
 * didn't pick the slug.
 */
async function insertWithGeneratedSlug(
  db: ReturnType<typeof getDb>,
  input: {
    destination: string;
    expiresAt: number | null;
    tags: string[];
    active: boolean;
    passwordVerifierPayload?: string;
    themeId: number | null;
  },
  owner: string,
  now: number,
) {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await insertLink(db, { ...input, slug: generateSlug() }, owner, now);
    } catch (err) {
      lastErr = err;
      const isCollision =
        isUniqueViolation(err) ||
        (typeof err === 'object' && err !== null && 'status' in err && err.status === 409);
      if (!isCollision) throw err;
    }
  }
  throw lastErr;
}

export default app;
