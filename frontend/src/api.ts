const BASE = '';  // proxy via Vite dev server

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/* ─── Auth ─── */
export interface User {
  id: number;
  username: string;
  display_name: string;
  role: string;
  is_admin: boolean;
}

export function register(username: string, password: string, display_name: string) {
  return request<User>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, display_name }),
  });
}

export function login(username: string, password: string) {
  return request<{ access_token: string; token_type: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export function getMe() {
  return request<User>('/api/auth/me');
}

export function listUsers() {
  return request<User[]>('/api/auth/users');
}

export function setUserRole(user_id: number, role: string, is_admin: boolean) {
  return request<User>('/api/auth/set-role', {
    method: 'POST',
    body: JSON.stringify({ user_id, role, is_admin }),
  });
}

/* ─── Characters ─── */
export interface CharacterSummary {
  id: number;
  name: string;
  concept: string;
  power_level: number;
  pp_total: number;
  pp_spent: number;
  vitalidade_max: number;
  vitalidade_current: number;
}

export function listCharacters() {
  return request<CharacterSummary[]>('/api/characters/');
}

export function getCharacter(id: number) {
  return request<Record<string, unknown>>(`/api/characters/${id}`);
}

export function createCharacter(data: Record<string, unknown>) {
  return request<Record<string, unknown>>('/api/characters/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateCharacter(id: number, data: Record<string, unknown>) {
  return request<Record<string, unknown>>(`/api/characters/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deleteCharacter(id: number) {
  return request<void>(`/api/characters/${id}`, { method: 'DELETE' });
}

/* ─── Tables ─── */
export interface TableSummary {
  id: number;
  name: string;
  code: string;
  gm_user_id: number;
  power_level: number;
  description: string;
  status: string;
}

export function listTables() {
  return request<TableSummary[]>('/api/tables/');
}

export function createTable(name: string, power_level: number, description: string) {
  return request<TableSummary>('/api/tables/', {
    method: 'POST',
    body: JSON.stringify({ name, power_level, description }),
  });
}

export function joinTable(code: string, character_id: number) {
  return request<{ detail: string; table_id: number }>('/api/tables/join', {
    method: 'POST',
    body: JSON.stringify({ code, character_id }),
  });
}

/* ─── Rolls ─── */
export interface RollResult {
  dice: { type: string; face_value: number; successes: number; complication: boolean }[];
  total_successes: number;
  total_complications: number;
  tn: number;
  margin: number;
  result_label: string;
}

export function rollDice(pool_size: number, hero_dice: number, tn: number, opts?: {
  table_id?: number;
  character_id?: number;
  roll_type?: string;
  description?: string;
  exploding?: boolean;
}) {
  return request<RollResult>('/api/rolls/', {
    method: 'POST',
    body: JSON.stringify({
      pool_size,
      hero_dice,
      tn,
      ...opts,
    }),
  });
}

/* ─── System Catalog ─── */
export function getSystemCatalog() {
  return request<Record<string, unknown[]>>('/api/system/catalog');
}
