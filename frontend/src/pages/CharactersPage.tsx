import { useEffect, useState, lazy, Suspense } from 'react';
import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import {
  listCharacters,
  createCharacter,
  deleteCharacter,
  CharacterSummary,
} from '../api';

function CharacterList() {
  const [chars, setChars] = useState<CharacterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    listCharacters()
      .then(setChars)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Deletar "${name}"?`)) return;
    await deleteCharacter(id);
    setChars(prev => prev.filter(c => c.id !== id));
  };

  if (loading) return <p className="text-gray-400">Carregando...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Personagens</h1>
        <button
          onClick={() => navigate('new')}
          className="bg-hero-600 hover:bg-hero-700 text-white px-5 py-2.5 rounded-lg font-medium transition"
        >
          + Novo Personagem
        </button>
      </div>

      {chars.length === 0 ? (
        <div className="text-center py-16 bg-gray-900 rounded-xl border border-gray-800">
          <p className="text-gray-400 mb-4">Nenhum personagem criado.</p>
          <button
            onClick={() => navigate('new')}
            className="bg-hero-600 hover:bg-hero-700 text-white px-6 py-2.5 rounded-lg font-medium transition"
          >
            Criar Primeiro Personagem
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {chars.map(c => (
            <div
              key={c.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-hero-600 transition group"
            >
              <Link to={`${c.id}`}>
                <h3 className="font-semibold text-white group-hover:text-hero-400 transition">{c.name}</h3>
                <p className="text-sm text-gray-400 mt-1">{c.concept || 'Sem conceito'}</p>
              </Link>
              <div className="flex gap-4 mt-3 text-xs text-gray-500">
                <span>NP {c.power_level}</span>
                <span>PP {c.pp_spent}/{c.pp_total}</span>
                <span>Vit {c.vitalidade_current}/{c.vitalidade_max}</span>
              </div>
              <div className="flex gap-2 mt-4">
                <Link
                  to={`${c.id}`}
                  className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-md transition"
                >
                  Abrir
                </Link>
                <button
                  onClick={() => handleDelete(c.id, c.name)}
                  className="text-xs bg-red-900/30 hover:bg-red-800/40 text-red-400 px-3 py-1.5 rounded-md transition"
                >
                  Deletar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewCharacterForm() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [concept, setConcept] = useState('');
  const [powerLevel, setPowerLevel] = useState(10);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const PL_OPTIONS = [
    { pl: 3, pp: 45, label: 'NP 3 — Início de campanha (45 PP)' },
    { pl: 5, pp: 75, label: 'NP 5 — Agentes de elite (75 PP)' },
    { pl: 7, pp: 105, label: 'NP 7 — Super-humanos estabelecidos (105 PP)' },
    { pl: 10, pp: 150, label: 'NP 10 — Padrão (150 PP)' },
    { pl: 13, pp: 195, label: 'NP 13 — Heróis icônicos (195 PP)' },
    { pl: 15, pp: 225, label: 'NP 15 — Quase-divinos (225 PP)' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const char = await createCharacter({
        name,
        concept,
        power_level: powerLevel,
        origin_descriptors: '',
      });
      navigate(`/characters/${(char as { id: number }).id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar personagem');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-6">Novo Personagem</h1>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Nome</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:border-hero-500 focus:ring-1 focus:ring-hero-500 outline-none transition"
            placeholder="Nome do personagem"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Conceito</label>
          <input
            type="text"
            value={concept}
            onChange={e => setConcept(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:border-hero-500 focus:ring-1 focus:ring-hero-500 outline-none transition"
            placeholder="Ex: Vigilante treinado, Alienígena metamorfo..."
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Nível de Poder</label>
          <select
            value={powerLevel}
            onChange={e => setPowerLevel(Number(e.target.value))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:border-hero-500 focus:ring-1 focus:ring-hero-500 outline-none transition"
          >
            {PL_OPTIONS.map(o => (
              <option key={o.pl} value={o.pl}>{o.label}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-2 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-hero-600 hover:bg-hero-700 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-lg transition"
          >
            {saving ? 'Criando...' : 'Criar Personagem'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/characters')}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-6 py-2.5 rounded-lg transition"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

export default function CharactersPage() {
  return (
    <Routes>
      <Route index element={<CharacterList />} />
      <Route path="new" element={<NewCharacterForm />} />
      <Route path=":id" element={<CharacterSheetWrapper />} />
    </Routes>
  );
}

function CharacterSheetWrapper() {
  const CharacterSheet = lazy(() => import('./CharacterSheet'));
  return (
    <Suspense fallback={<div className="text-gray-400 text-center py-12">Carregando ficha...</div>}>
      <CharacterSheet />
    </Suspense>
  );
}
