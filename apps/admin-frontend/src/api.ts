import type {
  ApiError,
  CreateLinkInput,
  CreateThemeInput,
  LinkResponse,
  LinkStats,
  ListLinksResponse,
  ListServiceTokensResponse,
  ListThemesResponse,
  ServiceToken,
  StatsBreakdownRow,
  StatsPoint,
  Theme,
  UpdateLinkInput,
  UpdateThemeInput,
  WhoAmIResponse,
} from '@domk/shared-types';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, string>;

  constructor(status: number, body: ApiError['error']) {
    super(body.message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

/**
 * The SPA and the API share the same admin origin, so the Access session
 * cookie rides along on its own — there is no token for this app to hold.
 *
 * A 401 here means Access itself expired rather than anything about the app
 * state, and the only cure is a full reload so Access can bounce the user
 * through the IdP.
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = (body as ApiError | null)?.error;
    throw new ApiRequestError(
      response.status,
      error ?? { code: 'unknown', message: `Request failed (HTTP ${response.status})` },
    );
  }
  return body as T;
}

export interface OverviewStats {
  since: number;
  until: number;
  days: number;
  totalClicks: number;
  series: StatsPoint[];
  topLinks: StatsBreakdownRow[];
  byCountry: StatsBreakdownRow[];
  topMisses: StatsBreakdownRow[];
}

export interface AdminRecord {
  email: string;
  role: 'owner' | 'editor';
  createdAt: number;
}

export const api = {
  whoami: () => request<WhoAmIResponse>('/whoami'),

  listLinks: (params: Record<string, string> = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== ''),
    ).toString();
    return request<ListLinksResponse>(`/links${query ? `?${query}` : ''}`);
  },
  createLink: (input: CreateLinkInput) =>
    request<LinkResponse>('/links', { method: 'POST', body: JSON.stringify(input) }),
  updateLink: (id: number, input: UpdateLinkInput) =>
    request<LinkResponse>(`/links/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteLink: (id: number) => request<void>(`/links/${id}`, { method: 'DELETE' }),

  overview: (days: number) => request<OverviewStats>(`/stats/overview?days=${days}`),
  linkStats: (slug: string, days: number) =>
    request<LinkStats>(`/stats/links/${encodeURIComponent(slug)}?days=${days}`),

  listTokens: () => request<ListServiceTokensResponse>('/tokens'),
  createToken: (name: string, description?: string) =>
    request<ServiceToken>('/tokens', { method: 'POST', body: JSON.stringify({ name, description }) }),
  setTokenActive: (name: string, active: boolean) =>
    request<ServiceToken>(`/tokens/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    }),
  deleteToken: (name: string) =>
    request<void>(`/tokens/${encodeURIComponent(name)}`, { method: 'DELETE' }),

  listAdmins: () => request<{ items: AdminRecord[] }>('/admins'),
  createAdmin: (email: string, role: 'owner' | 'editor') =>
    request<AdminRecord>('/admins', { method: 'POST', body: JSON.stringify({ email, role }) }),
  deleteAdmin: (email: string) =>
    request<void>(`/admins/${encodeURIComponent(email)}`, { method: 'DELETE' }),

  listThemes: () => request<ListThemesResponse>('/themes'),
  createTheme: (input: CreateThemeInput) =>
    request<Theme>('/themes', { method: 'POST', body: JSON.stringify(input) }),
  updateTheme: (id: number, input: UpdateThemeInput) =>
    request<Theme>(`/themes/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteTheme: (id: number) => request<void>(`/themes/${id}`, { method: 'DELETE' }),
};
