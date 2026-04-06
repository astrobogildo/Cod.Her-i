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

export function getTableDetails(tableId: number) {
  return request<SessionDetails>(`/api/tables/${tableId}/details`);
}

export function getTableRolls(tableId: number, limit = 50) {
  return request<RollEntry[]>(`/api/tables/${tableId}/rolls?limit=${limit}`);
}

export function getTableChat(tableId: number, limit = 100) {
  return request<ChatMsg[]>(`/api/tables/${tableId}/chat?limit=${limit}`);
}

export function postChatMessage(tableId: number, content: string, messageType = 'chat', targetUserId?: number) {
  return request<ChatMsg>(`/api/tables/${tableId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ content, message_type: messageType, target_user_id: targetUserId }),
  });
}

export function startSession(tableId: number) {
  return request<{ detail: string; status: string }>(`/api/tables/${tableId}/start`, { method: 'POST' });
}

export function pauseSession(tableId: number) {
  return request<{ detail: string; status: string }>(`/api/tables/${tableId}/pause`, { method: 'POST' });
}

export function archiveSession(tableId: number) {
  return request<{ detail: string; status: string }>(`/api/tables/${tableId}/archive`, { method: 'POST' });
}

export function removePlayer(tableId: number, characterId: number) {
  return request<{ detail: string }>(`/api/tables/${tableId}/players/${characterId}`, { method: 'DELETE' });
}

export function getTableCharactersFull(tableId: number) {
  return request<Record<string, unknown>[]>(`/api/tables/${tableId}/characters`);
}

/* ─── Session Types ─── */
export interface SessionPlayer {
  user_id: number;
  display_name: string;
  username: string;
  character_id: number;
  character_name: string;
  character_concept: string;
  power_level: number;
  pp_total: number;
  pp_spent: number;
  vitalidade_max: number;
  vitalidade_current: number;
  ferimentos: number[];
  active_conditions: string[];
  hero_dice: number;
  dodge: number;
  parry: number;
  fortitude: number;
  willpower: number;
  status: string;
}

export interface SessionDetails {
  table: {
    id: number;
    name: string;
    code: string;
    power_level: number;
    description: string;
    status: string;
    optional_rules: Record<string, boolean>;
    combat_state: Record<string, unknown> | null;
  };
  gm: { id: number; display_name: string };
  players: SessionPlayer[];
  is_gm: boolean;
}

export interface RollEntry {
  id: number;
  character_name: string;
  roll_type: string;
  description: string;
  dice_results: { value: number; type: string; is_success?: boolean; is_complication?: boolean }[];
  successes: number;
  complications: number;
  tn: number | null;
  margin: number | null;
  timestamp: string;
}

export interface ChatMsg {
  id: number;
  user_id: number;
  display_name: string;
  message_type: string;
  content: string;
  target_user_id?: number | null;
  created_at: string;
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

/* ─── Encounter / Combat ─── */
export interface CombatZone {
  id: string;
  name: string;
  character_ids: number[];
}

export interface InitiativeEntry {
  character_id: number;
  initiative: number;
  roll_detail?: string;
}

export interface PendingTest {
  id: string;
  label: string;
  attribute: string;
  tn: number;
  target_character_ids: number[];
  results: { character_id: number; successes: number; complications: number; passed: boolean }[];
}

export interface CombatState {
  active: boolean;
  round: number;
  current_turn_index: number;
  zones: CombatZone[];
  initiative_order: InitiativeEntry[];
  pending_tests: PendingTest[];
}

export function startEncounter(tableId: number, zoneNames: string[]) {
  return request<CombatState>(`/api/tables/${tableId}/encounter/start`, {
    method: 'POST', body: JSON.stringify({ zone_names: zoneNames }),
  });
}

export function endEncounter(tableId: number) {
  return request<{ detail: string }>(`/api/tables/${tableId}/encounter/end`, { method: 'POST' });
}

export function getEncounter(tableId: number) {
  return request<CombatState>(`/api/tables/${tableId}/encounter`);
}

export function createZone(tableId: number, name: string) {
  return request<CombatState>(`/api/tables/${tableId}/encounter/zones`, {
    method: 'POST', body: JSON.stringify({ name }),
  });
}

export function deleteZone(tableId: number, zoneId: string) {
  return request<CombatState>(`/api/tables/${tableId}/encounter/zones/${zoneId}`, { method: 'DELETE' });
}

export function renameZone(tableId: number, zoneId: string, name: string) {
  return request<CombatState>(`/api/tables/${tableId}/encounter/zones/rename`, {
    method: 'PATCH', body: JSON.stringify({ zone_id: zoneId, name }),
  });
}

export function moveCharacterZone(tableId: number, characterId: number, zoneId: string) {
  return request<CombatState>(`/api/tables/${tableId}/encounter/move`, {
    method: 'POST', body: JSON.stringify({ character_id: characterId, zone_id: zoneId }),
  });
}

export function setInitiative(tableId: number, characterId: number, initiative: number) {
  return request<CombatState>(`/api/tables/${tableId}/encounter/initiative`, {
    method: 'POST', body: JSON.stringify({ character_id: characterId, initiative }),
  });
}

export function rollAllInitiative(tableId: number) {
  return request<CombatState>(`/api/tables/${tableId}/encounter/roll-all-initiative`, { method: 'POST' });
}

export function nextTurn(tableId: number) {
  return request<CombatState>(`/api/tables/${tableId}/encounter/next-turn`, { method: 'POST' });
}

export function prevTurn(tableId: number) {
  return request<CombatState>(`/api/tables/${tableId}/encounter/prev-turn`, { method: 'POST' });
}

export function requestTest(tableId: number, label: string, attribute: string, tn: number, targetCharacterIds: number[]) {
  return request<CombatState>(`/api/tables/${tableId}/encounter/request-test`, {
    method: 'POST', body: JSON.stringify({ label, attribute, tn, target_character_ids: targetCharacterIds }),
  });
}

export function submitTest(tableId: number, testId: string, characterId: number, successes: number, complications: number) {
  return request<CombatState>(`/api/tables/${tableId}/encounter/submit-test`, {
    method: 'POST', body: JSON.stringify({ test_id: testId, character_id: characterId, successes, complications }),
  });
}

export function dismissTest(tableId: number, testId: string) {
  return request<CombatState>(`/api/tables/${tableId}/encounter/tests/${testId}`, { method: 'DELETE' });
}
