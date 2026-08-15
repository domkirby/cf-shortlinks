import type { Link } from './link.js';
import type { Actor } from './access.js';
import type { Theme } from './theme.js';

export interface ApiError {
  error: {
    code: string;
    message: string;
    /** Field-level detail for validation failures. */
    details?: Record<string, string>;
  };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export type ListLinksResponse = Paginated<Link>;

export interface LinkResponse {
  link: Link;
  /** Fully-qualified short URL, built from the worker's SHORT_DOMAIN. */
  shortUrl: string;
}

export interface WhoAmIResponse {
  actor: Actor;
}

export interface ServiceToken {
  name: string;
  active: boolean;
  createdAt: number;
}

export interface ListServiceTokensResponse {
  items: ServiceToken[];
}

export interface ListThemesResponse {
  items: Theme[];
}
