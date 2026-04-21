export type AuthUser = {
  user_id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  access_token: string;
};

const KEY = "medsoft_auth";

export function saveAuth(data: AuthUser): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(KEY, JSON.stringify(data));
  }
}

export function getAuth(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function clearAuth(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(KEY);
  }
}

export function getToken(): string | null {
  return getAuth()?.access_token ?? null;
}

export function hasPermission(permission: string): boolean {
  return getAuth()?.permissions.includes(permission) ?? false;
}
