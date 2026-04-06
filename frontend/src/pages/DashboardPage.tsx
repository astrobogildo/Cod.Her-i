import { useEffect, useState } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listCharacters, listTables, CharacterSummary, TableSummary } from '../api';
import CharactersPage from './CharactersPage';
import TablesPage from './TablesPage';

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth();
  const location = useLocation();

  const links = [
    { to: '/', label: 'Painel', icon: '🏠' },
    { to: '/characters', label: 'Personagens', icon: '🦸' },
    { to: '/tables', label: 'Mesas', icon: '🎲' },
  ];

  const isAdmin = user?.is_admin;

  return (
    <>
      {/* Backdrop (mobile only) */}
      {open && <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={onClose} />}

      <aside className={`fixed md:static inset-y-0 left-0 z-50 w-64 bg-gray-900 border-r border-gray-800 flex flex-col min-h-screen transform transition-transform duration-300 ease-in-out ${
        open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-hero-400">Código: Herói</h2>
            <p className="text-xs text-gray-500 mt-1">v2.0</p>
          </div>
          <button onClick={onClose} className="md:hidden text-gray-400 hover:text-white text-lg">✕</button>
        </div>

      <nav className="flex-1 p-4 space-y-1">
        {links.map(l => (
          <Link
            key={l.to}
            to={l.to}
            onClick={onClose}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition
              ${location.pathname === l.to ? 'bg-hero-600/20 text-hero-400' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
          >
            <span>{l.icon}</span>
            {l.label}
          </Link>
        ))}

        {isAdmin && (
          <>
            <div className="mt-4 mb-1 px-4 text-[10px] text-gray-600 uppercase tracking-wider">Administração</div>
            <Link
              to="/tables"
              onClick={() => { onClose(); setTimeout(() => window.dispatchEvent(new CustomEvent('open-admin-tab')), 100); }}
              className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-yellow-500 hover:bg-yellow-900/20 hover:text-yellow-400 transition"
            >
              <span>⚙️</span>
              Gerenciar Usuários
            </Link>
          </>
        )}
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
    </>
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

      {/* GM / Admin Quick Guide */}
      {(user?.is_admin || user?.role === 'gm' || user?.role === 'admin') && (
        <div className="bg-gradient-to-br from-gray-900 to-gray-900/70 rounded-2xl border border-hero-700/30 p-6">
          <h2 className="text-lg font-bold text-hero-400 mb-4 flex items-center gap-2">
            🎭 Guia Rápido {user?.is_admin ? 'do Admin / Mestre' : 'do Mestre'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {user?.is_admin && (
              <div className="bg-yellow-900/15 border border-yellow-700/25 rounded-xl p-4">
                <p className="text-sm font-semibold text-yellow-400 mb-2">⚙️ Administração</p>
                <p className="text-xs text-gray-400 leading-relaxed">Vá em <strong className="text-yellow-300">Mesas → aba Administração</strong> para gerenciar usuários, promover jogadores a Mestre, ou conceder Admin.</p>
              </div>
            )}
            <div className="bg-purple-900/15 border border-purple-700/25 rounded-xl p-4">
              <p className="text-sm font-semibold text-purple-400 mb-2">🎲 Criar & Mestrar Mesa</p>
              <p className="text-xs text-gray-400 leading-relaxed">Em <strong className="text-purple-300">Mesas → + Criar Mesa</strong>, defina nome e NP. Depois clique <strong className="text-purple-300">▶ Entrar</strong> para abrir a sessão. Você será o Mestre.</p>
            </div>
            <div className="bg-green-900/15 border border-green-700/25 rounded-xl p-4">
              <p className="text-sm font-semibold text-green-400 mb-2">▶ Iniciar Sessão</p>
              <p className="text-xs text-gray-400 leading-relaxed">Dentro da sessão, clique <strong className="text-green-300">▶ Iniciar</strong> para mudar o status para <em>Em Jogo</em>. Jogadores entram com o código da mesa.</p>
            </div>
            <div className="bg-orange-900/15 border border-orange-700/25 rounded-xl p-4">
              <p className="text-sm font-semibold text-orange-400 mb-2">⚔ Encontros</p>
              <p className="text-xs text-gray-400 leading-relaxed">Na sessão, clique <strong className="text-orange-300">🎭 Ferramentas</strong> → <strong className="text-orange-300">⚔ Iniciar Encontro</strong>. Crie zonas (locais), adicione PJs, role iniciativa e controle turnos.</p>
            </div>
            <div className="bg-blue-900/15 border border-blue-700/25 rounded-xl p-4">
              <p className="text-sm font-semibold text-blue-400 mb-2">📋 Testes Genéricos</p>
              <p className="text-xs text-gray-400 leading-relaxed">Em <strong className="text-blue-300">🎭 Ferramentas</strong>, use <strong className="text-blue-300">TESTE</strong> para pedir rolagens específicas aos jogadores — ideal para improvisação.</p>
            </div>
            <div className="bg-gray-800/60 border border-gray-700/40 rounded-xl p-4">
              <p className="text-sm font-semibold text-gray-300 mb-2">👥 Convidar Jogadores</p>
              <p className="text-xs text-gray-400 leading-relaxed">Compartilhe o <strong className="text-gray-200">código da mesa</strong> (6 letras). Jogadores criam conta, fazem um personagem e entram com <strong className="text-gray-200">Entrar por Código</strong>.</p>
            </div>
          </div>
        </div>
      )}

      {/* Lobby tables — quick start */}
      {lobbyTables.length > 0 && !activeTables.length && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <span className="w-2 h-2 bg-yellow-400 rounded-full" />
            Mesas Aguardando
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {lobbyTables.map(t => (
              <button
                key={t.id}
                onClick={() => navigate(`/session/${t.id}`)}
                className="bg-gray-900 border border-yellow-800/40 rounded-xl p-5 hover:border-yellow-500/60 transition text-left group"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white">{t.name}</h3>
                  <span className="text-xs bg-yellow-600/20 text-yellow-400 px-2.5 py-1 rounded-full">Aguardando</span>
                </div>
                <p className="text-sm text-gray-400 mt-1">{t.description || `NP ${t.power_level}`}</p>
                <p className="text-xs text-hero-400 mt-3 group-hover:underline">▶ Entrar e Iniciar →</p>
              </button>
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-950">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header with hamburger */}
        <header className="md:hidden flex items-center justify-between bg-gray-900 border-b border-gray-800 px-4 py-3 shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white text-xl">☰</button>
          <span className="text-sm font-bold text-hero-400">Código: Herói</span>
          <div className="w-6" />
        </header>
        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          <Routes>
            <Route index element={<Home />} />
            <Route path="characters/*" element={<CharactersPage />} />
            <Route path="tables" element={<TablesPlaceholder />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
