import { useState, useMemo } from 'react';
import { useCatalog, Effect, Extra, Flaw } from '../context/CatalogContext';
import { PowerEntry } from '../pages/CharacterSheet';

interface Props {
  plCap: number;
  initialPower?: PowerEntry;
  onSave: (power: PowerEntry) => void;
  onCancel: () => void;
}

function uid() { return Math.random().toString(36).slice(2, 10); }

export default function PowerForge({ plCap, initialPower, onSave, onCancel }: Props) {
  const { catalog } = useCatalog();
  const effects = catalog?.effects ?? [];
  const allExtras = catalog?.extras ?? [];
  const allFlaws = catalog?.flaws ?? [];
  const descriptorSuggestions = catalog?.descriptor_suggestions ?? {};

  /* ─── State ─── */
  const [name, setName] = useState(initialPower?.name ?? '');
  const [selectedEffect, setSelectedEffect] = useState<string>(initialPower?.effect ?? '');
  const [dp, setDp] = useState(initialPower?.dp ?? 1);
  const [activeExtras, setActiveExtras] = useState<{ name: string; ranks: number }[]>(
    initialPower?.extras.map(e => ({ name: e.name, ranks: e.ranks ?? 1 })) ?? []
  );
  const [activeFlaws, setActiveFlaws] = useState<{ name: string; ranks: number }[]>(
    initialPower?.flaws.map(f => ({ name: f.name, ranks: f.ranks ?? 1 })) ?? []
  );
  const [descriptors, setDescriptors] = useState<string[]>(initialPower?.descriptors ?? []);
  const [newDescriptor, setNewDescriptor] = useState('');
  const [effectFilter, setEffectFilter] = useState('');
  const [effectCategory, setEffectCategory] = useState<string>('all');

  /* ─── Derived ─── */
  const effect: Effect | undefined = effects.find(e => e.name === selectedEffect);

  const filteredEffects = effects.filter(e => {
    const matchCat = effectCategory === 'all' || e.category === effectCategory;
    const matchSearch = effectFilter === '' ||
      e.name.toLowerCase().includes(effectFilter.toLowerCase()) ||
      e.name_pt.toLowerCase().includes(effectFilter.toLowerCase()) ||
      e.description.toLowerCase().includes(effectFilter.toLowerCase());
    return matchCat && matchSearch;
  });

  const categories = [...new Set(effects.map(e => e.category))];

  // Cost calculation
  const { perDpExtras, flatExtras, perDpFlaws, flatFlaws, totalCost, breakdown } = useMemo(() => {
    if (!effect) return { perDpExtras: 0, flatExtras: 0, perDpFlaws: 0, flatFlaws: 0, totalCost: 0, breakdown: '' };

    let perDpE = 0, flatE = 0, perDpF = 0, flatF = 0;

    for (const ae of activeExtras) {
      const def = allExtras.find(e => e.name === ae.name);
      if (!def) continue;
      if (def.cost_type === 'per_dp') perDpE += def.cost * ae.ranks;
      else flatE += def.cost * ae.ranks;
    }

    for (const af of activeFlaws) {
      const def = allFlaws.find(f => f.name === af.name);
      if (!def) continue;
      if (def.cost_type === 'per_dp') perDpF += def.discount * af.ranks;
      else flatF += def.discount * af.ranks;
    }

    const baseCost = effect.base_cost;
    const costPerDp = Math.max(1, baseCost + perDpE - perDpF);
    const total = (costPerDp * dp) + flatE - flatF;
    const bd = `(${baseCost}${perDpE > 0 ? ' +' + perDpE : ''}${perDpF > 0 ? ' −' + perDpF : ''}) × ${dp}dP${flatE > 0 ? ' +' + flatE : ''}${flatF > 0 ? ' −' + flatF : ''} = ${total} PP`;

    return { perDpExtras: perDpE, flatExtras: flatE, perDpFlaws: perDpF, flatFlaws: flatF, totalCost: Math.max(1, total), breakdown: bd };
  }, [effect, dp, activeExtras, activeFlaws, allExtras, allFlaws]);

  /* ─── Extras/Flaws helpers ─── */
  const toggleExtra = (extra: Extra) => {
    if (activeExtras.find(e => e.name === extra.name)) {
      setActiveExtras(activeExtras.filter(e => e.name !== extra.name));
    } else {
      setActiveExtras([...activeExtras, { name: extra.name, ranks: 1 }]);
    }
  };

  const toggleFlaw = (flaw: Flaw) => {
    if (activeFlaws.find(f => f.name === flaw.name)) {
      setActiveFlaws(activeFlaws.filter(f => f.name !== flaw.name));
    } else {
      setActiveFlaws([...activeFlaws, { name: flaw.name, ranks: 1 }]);
    }
  };

  const setExtraRanks = (name: string, ranks: number) => {
    setActiveExtras(activeExtras.map(e => e.name === name ? { ...e, ranks } : e));
  };

  const setFlawRanks = (name: string, ranks: number) => {
    setActiveFlaws(activeFlaws.map(f => f.name === name ? { ...f, ranks } : f));
  };

  // Partition extras/flaws into exclusive (for this effect) + universal
  const exclusiveExtras = effect ? allExtras.filter(e => effect.exclusive_extras.includes(e.name)) : [];
  const universalExtras = allExtras.filter(e => !effect?.exclusive_extras.includes(e.name));
  const exclusiveFlaws = effect ? allFlaws.filter(f => effect.exclusive_flaws.includes(f.name)) : [];
  const universalFlaws = allFlaws.filter(f => !effect?.exclusive_flaws.includes(f.name));

  /* ─── Descriptors ─── */
  const addDescriptor = (d: string) => {
    const trimmed = d.trim();
    if (trimmed && !descriptors.includes(trimmed)) {
      setDescriptors([...descriptors, trimmed]);
    }
    setNewDescriptor('');
  };

  /* ─── Save ─── */
  const handleSave = () => {
    onSave({
      id: initialPower?.id ?? uid(),
      name: name || effect?.name_pt || selectedEffect,
      effect: selectedEffect,
      dp,
      extras: activeExtras,
      flaws: activeFlaws,
      descriptors,
      final_cost: totalCost,
      array_id: initialPower?.array_id,
      is_alternate: initialPower?.is_alternate,
    });
  };

  /* ═════════════════════════════ RENDER ═════════════════════════════ */
  return (
    <div className="space-y-5">
      {/* Step 1: Name */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">Nome do Poder</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ex: Rajada de Plasma, Telecinese, Campo Mental..."
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:border-hero-500 outline-none"
        />
      </div>

      {/* Step 2: Select Effect */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">Efeito Base</label>
        <div className="flex gap-2 mb-2 flex-wrap">
          <button
            onClick={() => setEffectCategory('all')}
            className={`px-3 py-1 rounded-full text-xs transition ${effectCategory === 'all' ? 'bg-hero-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >Todos</button>
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setEffectCategory(c)}
              className={`px-3 py-1 rounded-full text-xs transition capitalize
                ${effectCategory === c ? 'bg-hero-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >{c}</button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Buscar efeito..."
          value={effectFilter}
          onChange={e => setEffectFilter(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white mb-2"
        />
        <div className="max-h-48 overflow-y-auto space-y-1 border border-gray-800 rounded-lg p-2">
          {filteredEffects.map(e => (
            <button
              key={e.name}
              onClick={() => { setSelectedEffect(e.name); setActiveExtras([]); setActiveFlaws([]); }}
              className={`w-full text-left rounded-lg px-3 py-2 transition
                ${selectedEffect === e.name ? 'bg-hero-600/20 border border-hero-600' : 'bg-gray-800 hover:bg-gray-700'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-white">{e.name_pt} <span className="text-gray-500">({e.name})</span></span>
                <span className="text-[10px] text-gray-500">{e.base_cost} PP/dP</span>
              </div>
              <p className="text-[10px] text-gray-500 mt-0.5">{e.description}</p>
              <div className="flex gap-2 text-[9px] text-gray-600 mt-1">
                <span>⚡ {e.action}</span>
                <span>📏 {e.range}</span>
                <span>⏱ {e.duration}</span>
                {e.resistance && <span>🛡 {e.resistance}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Step 3+: Only show if effect selected */}
      {effect && (
        <>
          {/* dP slider */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Dados de Poder (dP): <span className="text-white font-bold">{dp}</span>
              <span className="text-gray-600 ml-1">(cap: {plCap})</span>
            </label>
            <input
              type="range"
              min={1}
              max={plCap}
              value={dp}
              onChange={e => setDp(Number(e.target.value))}
              className="w-full accent-hero-500"
            />
            <div className="flex justify-between text-[10px] text-gray-600">
              <span>1</span><span>{plCap}</span>
            </div>
          </div>

          {/* Extras */}
          <div>
            <h3 className="text-sm font-semibold text-green-400 mb-2">Extras</h3>
            {exclusiveExtras.length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] text-gray-500 mb-1">Exclusivos de {effect.name_pt}:</p>
                <ExtrasGrid
                  extras={exclusiveExtras}
                  active={activeExtras}
                  onToggle={toggleExtra}
                  onSetRanks={setExtraRanks}
                />
              </div>
            )}
            <p className="text-[10px] text-gray-500 mb-1">Universais:</p>
            <ExtrasGrid
              extras={universalExtras}
              active={activeExtras}
              onToggle={toggleExtra}
              onSetRanks={setExtraRanks}
            />
          </div>

          {/* Flaws */}
          <div>
            <h3 className="text-sm font-semibold text-red-400 mb-2">Flaws</h3>
            {exclusiveFlaws.length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] text-gray-500 mb-1">Exclusivos de {effect.name_pt}:</p>
                <FlawsGrid
                  flaws={exclusiveFlaws}
                  active={activeFlaws}
                  onToggle={toggleFlaw}
                  onSetRanks={setFlawRanks}
                />
              </div>
            )}
            <p className="text-[10px] text-gray-500 mb-1">Universais:</p>
            <FlawsGrid
              flaws={universalFlaws}
              active={activeFlaws}
              onToggle={toggleFlaw}
              onSetRanks={setFlawRanks}
            />
          </div>

          {/* Descriptors */}
          <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-2">Descritores</h3>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {descriptors.map(d => (
                <span key={d} className="flex items-center gap-1 bg-gray-800 text-gray-300 px-2.5 py-1 rounded-full text-xs">
                  {d}
                  <button onClick={() => setDescriptors(descriptors.filter(x => x !== d))} className="text-gray-500 hover:text-red-400">✕</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newDescriptor}
                onChange={e => setNewDescriptor(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addDescriptor(newDescriptor)}
                placeholder="Adicionar descritor..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white"
              />
              <button
                onClick={() => addDescriptor(newDescriptor)}
                className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 rounded-lg text-sm"
              >+</button>
            </div>
            <div className="flex flex-wrap gap-1">
              {Object.entries(descriptorSuggestions).map(([cat, items]) => (
                items.map(item => (
                  <button
                    key={`${cat}-${item}`}
                    onClick={() => addDescriptor(item)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition
                      ${descriptors.includes(item)
                        ? 'border-hero-600 bg-hero-600/20 text-hero-400'
                        : 'border-gray-700 bg-gray-800 text-gray-500 hover:bg-gray-700'}`}
                  >{item}</button>
                ))
              ))}
            </div>
          </div>

          {/* Cost breakdown */}
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Custo Final</span>
              <span className="text-2xl font-bold text-hero-400">{totalCost} PP</span>
            </div>
            <p className="text-[10px] text-gray-500 mt-1 font-mono">{breakdown}</p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={!selectedEffect}
              className="flex-1 bg-hero-600 hover:bg-hero-700 disabled:opacity-50 text-white py-3 rounded-lg font-semibold transition"
            >
              {initialPower ? 'Salvar Alterações' : 'Adicionar Poder'}
            </button>
            <button
              onClick={onCancel}
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-6 py-3 rounded-lg transition"
            >
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Extras Grid ─── */
function ExtrasGrid({
  extras, active, onToggle, onSetRanks,
}: {
  extras: Extra[];
  active: { name: string; ranks: number }[];
  onToggle: (e: Extra) => void;
  onSetRanks: (name: string, ranks: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? extras : extras.slice(0, 12);

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {shown.map(extra => {
          const ae = active.find(a => a.name === extra.name);
          const isActive = !!ae;
          return (
            <div key={extra.name} className="flex items-center gap-1">
              <button
                onClick={() => onToggle(extra)}
                title={extra.description}
                className={`px-2.5 py-1 rounded-full text-[11px] border transition
                  ${isActive
                    ? 'border-green-600 bg-green-700/30 text-green-300'
                    : 'border-gray-700 bg-gray-800 text-gray-500 hover:bg-gray-700'}`}
              >
                {extra.name}
                <span className="text-[9px] ml-1 opacity-60">
                  +{extra.cost}{extra.cost_type === 'per_dp' ? '/dP' : ''}
                </span>
              </button>
              {isActive && (extra.max_ranks ?? 0) > 1 && (
                <div className="flex items-center gap-0.5">
                  <button onClick={() => ae!.ranks > 1 && onSetRanks(extra.name, ae!.ranks - 1)} className="w-4 h-4 rounded bg-gray-700 text-[10px]">−</button>
                  <span className="text-[10px] w-3 text-center text-white">{ae!.ranks}</span>
                  <button onClick={() => onSetRanks(extra.name, ae!.ranks + 1)} className="w-4 h-4 rounded bg-gray-700 text-[10px]">+</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {extras.length > 12 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-hero-400 hover:underline mt-1"
        >{expanded ? 'Ver menos' : `+${extras.length - 12} mais...`}</button>
      )}
    </div>
  );
}

/* ─── Flaws Grid ─── */
function FlawsGrid({
  flaws, active, onToggle, onSetRanks,
}: {
  flaws: Flaw[];
  active: { name: string; ranks: number }[];
  onToggle: (f: Flaw) => void;
  onSetRanks: (name: string, ranks: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? flaws : flaws.slice(0, 12);

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {shown.map(flaw => {
          const af = active.find(a => a.name === flaw.name);
          const isActive = !!af;
          return (
            <div key={flaw.name} className="flex items-center gap-1">
              <button
                onClick={() => onToggle(flaw)}
                title={flaw.description}
                className={`px-2.5 py-1 rounded-full text-[11px] border transition
                  ${isActive
                    ? 'border-red-600 bg-red-700/30 text-red-300'
                    : 'border-gray-700 bg-gray-800 text-gray-500 hover:bg-gray-700'}`}
              >
                {flaw.name}
                <span className="text-[9px] ml-1 opacity-60">
                  −{flaw.discount}{flaw.cost_type === 'per_dp' ? '/dP' : ''}
                </span>
              </button>
              {isActive && (flaw.max_ranks ?? 0) > 1 && (
                <div className="flex items-center gap-0.5">
                  <button onClick={() => af!.ranks > 1 && onSetRanks(flaw.name, af!.ranks - 1)} className="w-4 h-4 rounded bg-gray-700 text-[10px]">−</button>
                  <span className="text-[10px] w-3 text-center text-white">{af!.ranks}</span>
                  <button onClick={() => onSetRanks(flaw.name, af!.ranks + 1)} className="w-4 h-4 rounded bg-gray-700 text-[10px]">+</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {flaws.length > 12 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-hero-400 hover:underline mt-1"
        >{expanded ? 'Ver menos' : `+${flaws.length - 12} mais...`}</button>
      )}
    </div>
  );
}
