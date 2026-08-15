/** Reusable unlock-page appearance for password-protected links. */
export interface Theme {
  id: number;
  name: string;
  /** `#rrggbb` */
  backgroundColor: string;
  logoUrl: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateThemeInput {
  name: string;
  backgroundColor: string;
  logoUrl?: string | null;
}

export interface UpdateThemeInput {
  name?: string;
  backgroundColor?: string;
  logoUrl?: string | null;
}
