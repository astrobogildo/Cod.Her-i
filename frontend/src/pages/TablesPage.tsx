import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  listTables,
  createTable,
  joinTable,
  listCharacters,
  listUsers,
  setUserRole,
  TableSummary,
  CharacterSummary,
  User,
} from '../api';

/* ─── Create Table Modal ─── */
function CreateTableModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (table: TableSummary) => void;
}) {
  const [name, setName] = useState('');
  const [pl, setPl] = useState(10);
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const PL_OPTIONS = [
    { pl: 3, label: 'NP 3 — Início de campanha' },
    { pl: 5, label: 'NP 5 — Agentes de elite' },
    { pl: 7, label: 'NP 7 — Super-humanos' },
    { pl: 10, label: 'NP 10 — Padrão' },
    { pl: 13, label: 'NP 13 — Icônicos' },
    { pl: 15, label: 'NP 15 — Cósmicos' },
  ];

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const table = await createTable(name.trim(), pl, desc.trim());
      onCreate(table);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar mesa');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-hero-400 mb-4">Criar Mesa</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Nome da Mesa</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Sentinelas de Nova Arcádia"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:border-hero-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Nível de Poder</label>
            <select
              value={pl}
              onChange={e => setPl(Number(e.target.value))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white outline-none"
            >
              {PL_OPTIONS.map(o => <option key={o.pl} value={o.pl}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Descrição (opcional)</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              rows={2}
              placeholder="Uma breve descrição da campanha..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white outline-none resize-none"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={handleCreate}
              disabled={saving || !name.trim()}
              className="flex-1 bg-hero-600 hover:bg-hero-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition"
            >
              {saving ? 'Criando...' : 'Criar Mesa'}
            </button>
            <button
              onClick={onClose}
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2.5 rounded-lg"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Join Table Modal ─── */
function JoinTableModal({ onClose, onJoin }: {
  onClose: () => void;
  onJoin: () => void;
}) {
  const [code, setCode] = useState('');
  const [chars, setChars] = useState<CharacterSummary[]>([]);
  const [charId, setCharId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    listCharacters().then(c => {
      setChars(c);
      if (c.length > 0) setCharId(c[0].id);
    });
  }, []);

  const handleJoin = async () => {
    if (!code.trim() || !charId) return;
    setSaving(true);
    setError('');
    try {
      const result = await joinTable(code.trim().toUpperCase(), charId);
      setSuccess(result.detail);
      setTimeout(() => { onJoin(); }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao entrar na mesa');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-hero-400 mb-4">Entrar em Mesa</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Código da Mesa</label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="Ex: AB12CD"
              maxLength={6}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-center text-xl font-mono tracking-widest focus:border-hero-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Personagem</label>
            {chars.length === 0 ? (
              <p className="text-sm text-yellow-400">Crie um personagem primeiro!</p>
            ) : (
              <select
                value={charId ?? ''}
                onChange={e => setCharId(Number(e.target.value))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white outline-none"
              >
                {chars.map(c => (
                  <option key={c.id} value={c.id}>{c.name} (NP {c.power_level})</option>
                ))}
              </select>
            )}
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {success && <p className="text-sm text-green-400">{success}</p>}
          <div className="flex gap-3">
            <button
              onClick={handleJoin}
              disabled={saving || !code.trim() || !charId}
              className="flex-1 bg-hero-600 hover:bg-hero-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition"
            >
              {saving ? 'Entrando...' : 'Entrar'}
            </button>
            <button
              onClick={onClose}
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2.5 rounded-lg"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Admin Panel ─── */
function AdminPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    listUsers()
      .then(setUsers)
      .catch(() => setLoading(false))
      .finally(() => setLoading(false));
  }, []);

  const toggleAdmin = async (u: User) => {
    try {
      const updated = await setUserRole(u.id, u.is_admin ? 'player' : 'admin', !u.is_admin);
      setUsers(prev => prev.map(x => x.id === updated.id ? updated : x));
      setMessage(`${updated.display_name} agora é ${updated.is_admin ? 'Admin' : 'Jogador'}`);
      setTimeout(() => setMessage(''), 3000);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Erro');
    }
  };

  const toggleGM = async (u: User) => {
    const newRole = u.role === 'gm' ? 'player' : 'gm';
    try {
      const updated = await setUserRole(u.id, newRole, u.is_admin);
      setUsers(prev => prev.map(x => x.id === updated.id ? updated : x));
      setMessage(`${updated.display_name} agora é ${updated.role === 'gm' ? 'Mestre' : 'Jogador'}`);
      setTimeout(() => setMessage(''), 3000);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Erro');
    }
  };

  if (loading) return <p className="text-gray-500">Carregando usuários...</p>;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <h2 className="text-lg font-bold text-hero-400 mb-4">Gerenciar Usuários</h2>
      {message && (
        <p className="text-sm text-green-400 bg-green-900/20 rounded-lg px-3 py-2 mb-3">{message}</p>
      )}
      <div className="space-y-2">
        {users.map(u => (
          <div key={u.id} className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-3">
            <div className="flex-1">
              <span className="text-sm font-medium text-white">{u.display_name}</span>
              <span className="text-xs text-gray-500 ml-2">@{u.username}</span>
            </div>
            <div className="flex items-center gap-2">
              {u.is_admin && (
                <span className="text-[10px] bg-yellow-700/30 text-yellow-400 px-2 py-0.5 rounded-full">Admin</span>
              )}
              {u.role === 'gm' && (
                <span className="text-[10px] bg-purple-700/30 text-purple-400 px-2 py-0.5 rounded-full">Mestre</span>
              )}
              <button
                onClick={() => toggleGM(u)}
                className={`text-xs px-3 py-1.5 rounded-lg transition ${
                  u.role === 'gm'
                    ? 'bg-purple-900/30 text-purple-400 hover:bg-purple-800/40'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                {u.role === 'gm' ? 'Remover Mestre' : 'Tornar Mestre'}
              </button>
              <button
                onClick={() => toggleAdmin(u)}
                className={`text-xs px-3 py-1.5 rounded-lg transition ${
                  u.is_admin
                    ? 'bg-yellow-900/30 text-yellow-400 hover:bg-yellow-800/40'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                {u.is_admin ? 'Remover Admin' : 'Tornar Admin'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══ MAIN TABLES PAGE ═══ */
export default function TablesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [tab, setTab] = useState<'tables' | 'admin'>('tables');

  const canCreateTable = user?.is_admin || user?.role === 'gm' || user?.role === 'admin';

  useEffect(() => {
    listTables()
      .then(setTables)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Listen for sidebar "Gerenciar Usuários" click
  useEffect(() => {
    const handler = () => setTab('admin');
    window.addEventListener('open-admin-tab', handler);
    return () => window.removeEventListener('open-admin-tab', handler);
  }, []);

  const reload = () => {
    listTables().then(setTables).catch(console.error);
  };

  const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    lobby: { label: 'Aguardando', color: 'text-yellow-400 bg-yellow-900/30' },
    active: { label: 'Em Jogo', color: 'text-green-400 bg-green-900/30' },
    archived: { label: 'Encerrada', color: 'text-gray-500 bg-gray-800' },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mesas</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowJoin(true)}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2.5 rounded-lg font-medium transition"
          >
            🔗 Entrar por Código
          </button>
          {canCreateTable && (
            <button
              onClick={() => setShowCreate(true)}
              className="bg-hero-600 hover:bg-hero-700 text-white px-5 py-2.5 rounded-lg font-medium transition"
            >
              + Criar Mesa
            </button>
          )}
        </div>
      </div>

      {/* Tabs (if admin) */}
      {user?.is_admin && (
        <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-800">
          <button
            onClick={() => setTab('tables')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition
              ${tab === 'tables' ? 'bg-hero-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            🎲 Mesas
          </button>
          <button
            onClick={() => setTab('admin')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition
              ${tab === 'admin' ? 'bg-hero-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            ⚙️ Administração
          </button>
        </div>
      )}

      {tab === 'admin' && user?.is_admin && <AdminPanel />}

      {tab === 'tables' && (
        <>
          {loading ? (
            <p className="text-gray-400">Carregando mesas...</p>
          ) : tables.length === 0 ? (
            <div className="text-center py-16 bg-gray-900 rounded-xl border border-gray-800">
              <p className="text-4xl mb-4">🎲</p>
              <p className="text-gray-400 mb-2">Nenhuma mesa disponível</p>
              {canCreateTable ? (
                <button
                  onClick={() => setShowCreate(true)}
                  className="bg-hero-600 hover:bg-hero-700 text-white px-6 py-2.5 rounded-lg font-medium transition mt-3"
                >
                  Criar Primeira Mesa
                </button>
              ) : (
                <p className="text-xs text-gray-600">Peça ao administrador para criar uma mesa ou lhe conceder permissão de Mestre</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tables.map(t => {
                const status = STATUS_LABELS[t.status] ?? STATUS_LABELS.lobby;
                const isGM = t.gm_user_id === user?.id;
                return (
                  <div
                    key={t.id}
                    className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-hero-600 transition"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-white">{t.name}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${status.color}`}>
                        {status.label}
                      </span>
                    </div>
                    {t.description && (
                      <p className="text-sm text-gray-400 mb-3">{t.description}</p>
                    )}
                    <div className="flex gap-4 text-xs text-gray-500 mb-3">
                      <span>NP {t.power_level}</span>
                      {isGM && <span className="text-purple-400">Você é o Mestre</span>}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-mono bg-gray-800 text-hero-400 px-3 py-1 rounded-lg tracking-wider">
                        {t.code}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(t.code);
                          }}
                          className="text-xs text-gray-500 hover:text-gray-300"
                          title="Copiar código"
                        >
                          📋
                        </button>
                        {t.status !== 'archived' && (
                          <button
                            onClick={() => navigate(`/session/${t.id}`)}
                            className="text-xs bg-hero-600 hover:bg-hero-700 text-white px-3 py-1.5 rounded-lg font-medium transition"
                          >
                            ▶ Entrar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateTableModal
          onClose={() => setShowCreate(false)}
          onCreate={(table) => {
            setTables(prev => [table, ...prev]);
            setShowCreate(false);
          }}
        />
      )}
      {showJoin && (
        <JoinTableModal
          onClose={() => setShowJoin(false)}
          onJoin={() => {
            setShowJoin(false);
            reload();
          }}
        />
      )}
    </div>
  );
}
