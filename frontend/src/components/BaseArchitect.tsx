import { useState } from 'react';
import { useCatalog } from '../context/CatalogContext';

interface BaseHQ {
  name: string;
  size: string;
  size_cost: number;
  toughness: number;
  features: string[];
  total_cost: number;
}

export default function BaseArchitect({
  baseHq, onChange,
}: {
  baseHq: Record<string, unknown> | null;
  onChange: (base: Record<string, unknown> | null) => void;
}) {
  const { catalog } = useCatalog();
  const sizes = catalog?.base_sizes ?? [];
  const featureDefs = catalog?.base_features ?? [];

  const base = (baseHq as BaseHQ | null) ?? null;
  const [expanded, setExpanded] = useState(!!base);

  const createBase = () => {
    const newBase: BaseHQ = {
      name: 'Nova Base',
      size: sizes[1]?.name ?? 'Pequena',
      size_cost: sizes[1]?.cost ?? 1,
      toughness: 5,
      features: [],
      total_cost: sizes[1]?.cost ?? 1,
    };
    onChange(newBase as unknown as Record<string, unknown>);
    setExpanded(true);
  };

  const updateBase = (fields: Partial<BaseHQ>) => {
    if (!base) return;
    const updated = { ...base, ...fields };
    // Recalculate total cost
    const sizeCost = updated.size_cost;
    const toughCost = updated.toughness;
    const featureCost = updated.features.length;
    updated.total_cost = sizeCost + toughCost + featureCost;
    onChange(updated as unknown as Record<string, unknown>);
  };

  const removeBase = () => {
    onChange(null);
    setExpanded(false);
  };

  const toggleFeature = (name: string) => {
    if (!base) return;
    const features = base.features.includes(name)
      ? base.features.filter(f => f !== name)
      : [...base.features, name];
    updateBase({ features });
  };

  if (!base && !expanded) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-hero-400">Base / QG</h2>
          <button
            onClick={createBase}
            className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg"
          >
            + Criar Base
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-2">Construa uma base de operações usando pontos de equipamento (EP)</p>
      </div>
    );
  }

  if (!base) return null;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-hero-400">Base / QG</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{base.total_cost} EP total</span>
          <button onClick={removeBase} className="text-xs text-red-400 hover:text-red-300">Remover</button>
        </div>
      </div>

      {/* Name */}
      <div className="mb-4">
        <input
          type="text"
          value={base.name}
          onChange={e => updateBase({ name: e.target.value })}
          placeholder="Nome da base..."
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Size */}
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-2">Tamanho</h3>
          <div className="space-y-1">
            {sizes.map(s => (
              <button
                key={s.name}
                onClick={() => updateBase({ size: s.name, size_cost: s.cost })}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition
                  ${base.size === s.name
                    ? 'bg-hero-600/20 border border-hero-600 text-hero-300'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-400 border border-transparent'}`}
              >
                <div className="flex justify-between">
                  <span>{s.name}</span>
                  <span className="text-xs text-gray-500">{s.cost} EP</span>
                </div>
                <p className="text-[10px] text-gray-500">{s.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Toughness */}
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-2">
            Resistência Estrutural
            <span className="text-xs text-gray-600 ml-1">({base.toughness} EP)</span>
          </h3>
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => base.toughness > 0 && updateBase({ toughness: base.toughness - 1 })}
              className="w-8 h-8 rounded bg-gray-700 hover:bg-gray-600 text-gray-300"
            >−</button>
            <span className="text-2xl font-bold text-white w-8 text-center">{base.toughness}</span>
            <button
              onClick={() => updateBase({ toughness: base.toughness + 1 })}
              className="w-8 h-8 rounded bg-gray-700 hover:bg-gray-600 text-gray-300"
            >+</button>
            <span className="text-xs text-gray-500">Vitalidade da estrutura</span>
          </div>

          {/* Cost breakdown */}
          <div className="bg-gray-800 rounded-lg p-3 text-xs text-gray-400 space-y-1">
            <div className="flex justify-between"><span>Tamanho ({base.size})</span><span>{base.size_cost} EP</span></div>
            <div className="flex justify-between"><span>Resistência</span><span>{base.toughness} EP</span></div>
            <div className="flex justify-between"><span>Características ({base.features.length})</span><span>{base.features.length} EP</span></div>
            <div className="flex justify-between border-t border-gray-700 pt-1 font-semibold text-white">
              <span>Total</span><span>{base.total_cost} EP</span>
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="mt-4">
        <h3 className="text-sm font-semibold text-gray-400 mb-2">
          Características
          <span className="text-xs text-gray-600 ml-1">(1 EP cada)</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {featureDefs.map(f => {
            const active = base.features.includes(f.name);
            return (
              <button
                key={f.name}
                onClick={() => toggleFeature(f.name)}
                className={`text-left px-3 py-2 rounded-lg text-sm transition border
                  ${active
                    ? 'bg-hero-600/20 border-hero-600 text-hero-300'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-400 border-transparent'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{f.name}</span>
                  <span className="text-xs">{f.cost} EP</span>
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5">{f.description}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
