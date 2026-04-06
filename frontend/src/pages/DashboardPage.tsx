import { useEffect, useState } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listCharacters, listTables, CharacterSummary, TableSummary } from '../api';
import CharactersPage from './CharactersPage';
import TablesPage from './TablesPage';

function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const links = [
    { to: '/', label: 'Painel', icon: '🏠' },
    { to: '/characters', label: 'Personagens', icon: '🦸' },
    { to: '/tables', label: 'Mesas', icon: '🎲' },
  ];

  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col min-h-screen">
      <div className="p-6 border-b border-gray-800">
        <h2 className="text-xl font-bold text-hero-400">Código: Herói</h2>
        <p className="text-xs text-gray-500 mt-1">v2.0</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {links.map(l => (
          <Link
            key={l.to}
            to={l.to}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition
              ${location.pathname === l.to ? 'bg-hero-600/20 text-hero-400' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
          >
            <span>{l.icon}</span>
            {l.label}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">{user?.display_name}</p>
            <div className="flex items-center gap-1.5">
              <p className="text-xs text-gray-500">@{user?.username}</p>
              {user?.is_admin && <span className="text-[9px] bg-yellow-700/30 text-yellow-400 px-1.5 py-0.5 rounded-full">Admin</span>}
              {user?.role === 'gm' && !user?.is_admin && <span className="text-[9px] bg-purple-700/30 text-purple-400 px-1.5 py-0.5 rounded-full">Mestre</span>}
            </div>
          </div>
          <button
            onClick={logout}
            className="text-xs text-gray-500 hover:text-red-400 transition"
          >
            Sair
          </button>
        </div>
      </div>
    </aside>
  );
}

function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [chars, setChars] = useState<CharacterSummary[]>([]);
  const [tables, setTables] = useState<TableSummary[]>([]);

  useEffect(() => {
    listCharacters().then(setChars).catch(console.error);
    listTables().then(setTables).catch(console.error);
  }, []);

  const activeTables = tables.filter(t => t.status === 'active');
  const lobbyTables = tables.filter(t => t.status === 'lobby');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Bem-vindo, {user?.display_name}!</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <p className="text-3xl font-bold text-hero-400">{chars.length}</p>
          <p className="text-sm text-gray-400 mt-1">Personagens</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <p className="text-3xl font-bold text-green-400">{activeTables.length}</p>
          <p className="text-sm text-gray-400 mt-1">Sessões Ativas</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <p className="text-3xl font-bold text-yellow-400">{lobbyTables.length}</p>
          <p className="text-sm text-gray-400 mt-1">Mesas Aguardando</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <p className="text-3xl font-bold text-purple-400">{tables.length}</p>
          <p className="text-sm text-gray-400 mt-1">Total de Mesas</p>
        </div>
      </div>

      {/* Active sessions — quick enter */}
      {activeTables.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            Sessões Ativas
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeTables.map(t => (
              <button
                key={t.id}
                onClick={() => navigate(`/session/${t.id}`)}
                className="bg-gray-900 border border-green-800/40 rounded-xl p-5 hover:border-green-500/60 transition text-left group"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white">{t.name}</h3>
                  <span className="text-xs bg-green-600/20 text-green-400 px-2.5 py-1 rounded-full">Em Jogo</span>
                </div>
                <p className="text-sm text-gray-400 mt-1">{t.description || `NP ${t.power_level}`}</p>
                <p className="text-xs text-hero-400 mt-3 group-hover:underline">▶ Entrar na Sessão →</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Characters */}
      {chars.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Seus Personagens</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {chars.map(c => (
              <Link
                key={c.id}
                to={`/characters/${c.id}`}
                className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-hero-600 transition"
              >
                <h3 className="font-semibold text-white">{c.name}</h3>
                <p className="text-sm text-gray-400">{c.concept || 'Sem conceito'}</p>
                <div className="flex gap-4 mt-3 text-xs text-gray-500">
                  <span>NP {c.power_level}</span>
                  <span>PP {c.pp_spent}/{c.pp_total}</span>
                  <span>Vit {c.vitalidade_current}/{c.vitalidade_max}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      {chars.length === 0 && tables.length === 0 && (
        <div className="text-center py-16 bg-gray-900 rounded-2xl border border-gray-800">
          <p className="text-4xl mb-4">🦸</p>
          <h2 className="text-xl font-bold text-white mb-2">Bem-vindo ao Código: Herói!</h2>
          <p className="text-gray-400 mb-6">Comece criando seu primeiro personagem ou entre em uma mesa.</p>
          <div className="flex gap-3 justify-center">
            <Link
              to="/characters"
              className="bg-hero-600 hover:bg-hero-700 text-white px-6 py-2.5 rounded-lg font-medium transition"
            >
              🦸 Criar Personagem
            </Link>
            <Link
              to="/tables"
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-6 py-2.5 rounded-lg font-medium transition"
            >
              🎲 Ver Mesas
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function TablesPlaceholder() {
  return <TablesPage />;
}

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen bg-gray-950">
      <Sidebar />
      <main className="flex-1 p-8 overflow-y-auto">
        <Routes>
          <Route index element={<Home />} />
          <Route path="characters/*" element={<CharactersPage />} />
          <Route path="tables" element={<TablesPlaceholder />} />
        </Routes>
      </main>
    </div>
  );
}
