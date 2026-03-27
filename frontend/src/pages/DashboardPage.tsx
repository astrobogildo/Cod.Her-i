import { useEffect, useState } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listCharacters, CharacterSummary } from '../api';
import CharactersPage from './CharactersPage';

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
            <p className="text-xs text-gray-500">@{user?.username}</p>
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
  const [chars, setChars] = useState<CharacterSummary[]>([]);

  useEffect(() => {
    listCharacters().then(setChars).catch(console.error);
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Bem-vindo, {user?.display_name}!</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <p className="text-3xl font-bold text-hero-400">{chars.length}</p>
          <p className="text-sm text-gray-400 mt-1">Personagens</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <p className="text-3xl font-bold text-hero-400">—</p>
          <p className="text-sm text-gray-400 mt-1">Mesas ativas</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <p className="text-3xl font-bold text-hero-400">—</p>
          <p className="text-sm text-gray-400 mt-1">Rolagens na sessão</p>
        </div>
      </div>

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

      {chars.length === 0 && (
        <div className="text-center py-12 bg-gray-900 rounded-xl border border-gray-800">
          <p className="text-gray-400 mb-4">Nenhum personagem ainda.</p>
          <Link
            to="/characters"
            className="inline-block bg-hero-600 hover:bg-hero-700 text-white px-6 py-2.5 rounded-lg font-medium transition"
          >
            Criar Personagem
          </Link>
        </div>
      )}
    </div>
  );
}

function TablesPlaceholder() {
  return (
    <div className="text-center py-12 bg-gray-900 rounded-xl border border-gray-800">
      <p className="text-4xl mb-4">🎲</p>
      <p className="text-gray-400">Mesas - em breve!</p>
    </div>
  );
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
