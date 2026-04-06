import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getCharacter, updateCharacter, rollDice, RollResult, uploadAvatar, deleteAvatar } from '../api';
import { useCatalog } from '../context/CatalogContext';
import PowerForge from '../components/PowerForge';
import EquipmentArmory from '../components/EquipmentArmory';
import BaseArchitect from '../components/BaseArchitect';

/* ─── Types ─── */
interface CharacterFull {
  id: number;
  name: string;
  concept: string;
  origin_descriptors: string;
  power_level: number;
  pp_total: number;
  pp_spent: number;
  attributes: Record<string, number>;
  skills: { name: string; ranks: number; specialization?: string }[];
  powers: PowerEntry[];
  advantages: { name: string; ranks?: number; cost: number; description?: string }[];
  equipment: { name: string; cost: number; description?: string }[];
  complications: { type: string; description: string }[];
  base_hq: Record<string, unknown> | null;
  vitalidade_max: number;
  vitalidade_current: number;
  ferimentos: number[];
  hero_dice: number;
  active_conditions: string[];
  dodge: number;
  parry: number;
  fortitude: number;
  willpower: number;
  notes: string;
  avatar_url: string;
}

export interface PowerEntry {
  id?: string;
  name: string;
  effect: string;
  dp: number;
  extras: { name: string; ranks?: number }[];
  flaws: { name: string; ranks?: number }[];
  descriptors: string[];
  final_cost: number;
  array_id?: string;
  is_alternate?: boolean;
}

const ATTR_NAMES: Record<string, string> = {
  FOR: 'Força', RES: 'Resistência', AGI: 'Agilidade', DES: 'Destreza',
  CMB: 'Combate', INT: 'Intelecto', PER: 'Percepção', PRE: 'Presença',
};

const ATTR_PP_COST: Record<number, number> = { 1: -1, 2: 0, 3: 2, 4: 4, 5: 8, 6: 14 };
const ATTR_MAX_RANK = 6;

/* ─── Attribute Editor ─── */
function AttributeBlock({
  attrs, onChange, onRoll,
}: {
  attrs: Record<string, number>;
  onChange: (key: string, val: number) => void;
  onRoll: (pool: number, label: string) => void;
}) {
  const totalPP = Object.values(attrs).reduce((s, v) => s + (ATTR_PP_COST[v] ?? 0), 0);

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-hero-400">Atributos</h2>
        <span className="text-xs text-gray-500">{totalPP} PP <span className="text-gray-600">(máx rank {ATTR_MAX_RANK})</span></span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(attrs).map(([key, val]) => (
          <div key={key} className="bg-gray-800 rounded-lg p-3 text-center">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">{key}</div>
            <div className="text-xs text-gray-400 mb-1">{ATTR_NAMES[key]}</div>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => val > 1 && onChange(key, val - 1)}
                className="w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm"
              >−</button>
              <span className="text-2xl font-bold text-white w-8">{val}</span>
              <button
                onClick={() => val < ATTR_MAX_RANK && onChange(key, val + 1)}
                className={`w-6 h-6 rounded text-sm ${val >= ATTR_MAX_RANK ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
                disabled={val >= ATTR_MAX_RANK}
              >+</button>
            </div>
            <div className="text-[10px] text-gray-600 mt-1">{ATTR_PP_COST[val] ?? '?'} PP</div>
            <button
              onClick={() => onRoll(val, ATTR_NAMES[key])}
              className="mt-2 text-[10px] bg-hero-600/20 hover:bg-hero-600/40 text-hero-400 px-3 py-1 rounded-full transition"
            >
              🎲 Rolar
            </button>
          </div>
        ))}
      </div>
      {Object.values(attrs).some(v => v >= ATTR_MAX_RANK) && (
        <p className="text-[10px] text-gray-600 mt-2 text-center">Acima de {ATTR_MAX_RANK}? Use o poder "Atributo Aprimorado" (Enhanced Trait)</p>
      )}
    </div>
  );
}

/* ─── Skills Editor ─── */
function SkillsBlock({
  skills, attrs, plCap, onChange, onRoll,
}: {
  skills: { name: string; ranks: number; specialization?: string }[];
  attrs: Record<string, number>;
  plCap: number;
  onChange: (skills: { name: string; ranks: number; specialization?: string }[]) => void;
  onRoll: (pool: number, label: string) => void;
}) {
  const { catalog } = useCatalog();
  const skillDefs = catalog?.skills ?? [];
  const totalRanks = skills.reduce((s, sk) => s + sk.ranks, 0);
  const totalPP = Math.ceil(totalRanks / 2);

  const mergedSkills = skillDefs.map(def => {
    const existing = skills.find(s => s.name === def.name);
    return { ...def, ranks: existing?.ranks ?? 0, specialization: existing?.specialization ?? '' };
  });

  const setRank = (name: string, ranks: number) => {
    const next = skills.filter(s => s.name !== name);
    if (ranks > 0) next.push({ name, ranks });
    onChange(next);
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-hero-400">Habilidades</h2>
        <span className="text-xs text-gray-500">{totalRanks} ranks = {totalPP} PP</span>
      </div>
      <div className="space-y-1 max-h-80 overflow-y-auto pr-2">
        {mergedSkills.map(sk => {
          const attrVal = attrs[sk.attribute] ?? 2;
          const pool = attrVal + sk.ranks;
          return (
            <div key={sk.name} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-800/60">
              <div className="flex-1 min-w-0">
                <span className="text-sm text-white">{sk.name}</span>
                <span className="text-[10px] text-gray-500 ml-1">({sk.attribute})</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => sk.ranks > 0 && setRank(sk.name, sk.ranks - 1)}
                  className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 text-gray-400 text-xs"
                >−</button>
                <span className="text-sm font-mono w-6 text-center text-white">{sk.ranks}</span>
                <button
                  onClick={() => sk.ranks < plCap && setRank(sk.name, sk.ranks + 1)}
                  className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 text-gray-400 text-xs"
                >+</button>
              </div>
              <span className="text-xs text-gray-500 w-8 text-right">{pool}d</span>
              <button
                onClick={() => onRoll(pool, sk.name)}
                className="text-[10px] bg-hero-600/20 hover:bg-hero-600/40 text-hero-400 px-2 py-0.5 rounded-full"
              >🎲</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Defenses ─── */
function DefensesBlock({
  char, onRoll,
}: {
  char: CharacterFull;
  onRoll: (pool: number, label: string) => void;
}) {
  const attrMap: Record<string, string> = { dodge: 'AGI', parry: 'CMB', fortitude: 'RES', willpower: 'PER' };
  const attrKeyMap: Record<string, string> = { dodge: 'AGI', parry: 'CMB', fortitude: 'RES', willpower: 'PER' };
  const defs = [
    { name: 'Esquiva', key: 'dodge', val: char.dodge },
    { name: 'Aparar', key: 'parry', val: char.parry },
    { name: 'Fortitude', key: 'fortitude', val: char.fortitude },
    { name: 'Vontade', key: 'willpower', val: char.willpower },
  ];

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <h2 className="text-lg font-bold text-hero-400 mb-4">Defesas</h2>
      <div className="grid grid-cols-2 gap-3">
        {defs.map(d => {
          const baseAttr = attrKeyMap[d.key];
          const baseVal = char.attributes[baseAttr] ?? 0;
          const bonus = d.val - baseVal;
          return (
            <div key={d.key} className="bg-gray-800 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-400">{d.name}</div>
              <div className="text-2xl font-bold text-white">{d.val}</div>
              <div className="text-[10px] text-gray-500">
                {attrMap[d.key]} {baseVal}{bonus > 0 ? ` +${bonus}` : ''}
              </div>
              <button
                onClick={() => onRoll(d.val, d.name)}
                className="mt-1 text-[10px] bg-hero-600/20 hover:bg-hero-600/40 text-hero-400 px-3 py-1 rounded-full"
              >🎲 Rolar</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Vitalidade & Ferimentos ─── */
function VitalidadeBlock({
  char, onUpdate,
}: {
  char: CharacterFull;
  onUpdate: (fields: Partial<CharacterFull>) => void;
}) {
  const pct = char.vitalidade_max > 0 ? (char.vitalidade_current / char.vitalidade_max) * 100 : 0;
  const barColor = pct > 60 ? 'bg-green-500' : pct > 30 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <h2 className="text-lg font-bold text-hero-400 mb-4">Vitalidade</h2>
      <div className="text-center mb-3">
        <span className="text-4xl font-bold text-white">{char.vitalidade_current}</span>
        <span className="text-lg text-gray-500"> / {char.vitalidade_max}</span>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-3 mb-3">
        <div className={`${barColor} h-3 rounded-full transition-all duration-300`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
      <div className="flex gap-2 justify-center mb-4">
        <button
          onClick={() => onUpdate({ vitalidade_current: Math.max(0, char.vitalidade_current - 1) })}
          className="bg-red-900/40 hover:bg-red-800/50 text-red-400 px-3 py-1.5 rounded-lg text-sm"
        >−1 Dano</button>
        <button
          onClick={() => onUpdate({ vitalidade_current: Math.min(char.vitalidade_max, char.vitalidade_current + 1) })}
          className="bg-green-900/40 hover:bg-green-800/50 text-green-400 px-3 py-1.5 rounded-lg text-sm"
        >+1 Cura</button>
        <button
          onClick={() => onUpdate({ vitalidade_current: char.vitalidade_max })}
          className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg text-sm"
        >Max</button>
      </div>

      {/* Ferimentos */}
      <h3 className="text-sm font-semibold text-gray-400 mb-2">Ferimentos</h3>
      <div className="flex gap-2 justify-center">
        {char.ferimentos.map((f, i) => (
          <button
            key={i}
            onClick={() => {
              const next = [...char.ferimentos];
              next[i] = next[i] === 0 ? 1 : 0;
              onUpdate({ ferimentos: next } as Partial<CharacterFull>);
            }}
            className={`w-10 h-10 rounded-lg border-2 text-sm font-bold transition
              ${f > 0 ? 'border-red-500 bg-red-900/40 text-red-400' : 'border-gray-700 bg-gray-800 text-gray-500'}`}
          >
            {f > 0 ? '✕' : i + 1}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-gray-600 text-center mt-1">
        −1d por Ferimento ativo em rolagens de resistência
      </p>

      {/* Hero Dice */}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-gray-400">Hero Dice (d12)</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => char.hero_dice > 0 && onUpdate({ hero_dice: char.hero_dice - 1 })}
            className="w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-sm"
          >−</button>
          <span className="text-lg font-bold text-yellow-400">{char.hero_dice}</span>
          <button
            onClick={() => onUpdate({ hero_dice: char.hero_dice + 1 })}
            className="w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-sm"
          >+</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Conditions Tracker ─── */
function ConditionsBlock({
  activeConditions, onUpdate,
}: {
  activeConditions: string[];
  onUpdate: (conditions: string[]) => void;
}) {
  const { catalog } = useCatalog();
  const allConditions = catalog?.conditions ?? [];

  const toggle = (name: string) => {
    if (activeConditions.includes(name)) {
      onUpdate(activeConditions.filter(c => c !== name));
    } else {
      onUpdate([...activeConditions, name]);
    }
  };

  const activeDetails = allConditions.filter(c => activeConditions.includes(c.name));

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <h2 className="text-lg font-bold text-hero-400 mb-3">Condições</h2>
      {activeDetails.length > 0 && (
        <div className="space-y-2 mb-3">
          {activeDetails.map(c => {
            const sevColors: Record<number, string> = {
              1: 'border-yellow-600/40 bg-yellow-900/20',
              2: 'border-orange-600/40 bg-orange-900/20',
              3: 'border-red-600/40 bg-red-900/20',
            };
            return (
              <div key={c.name} className={`rounded-lg border p-3 ${sevColors[c.severity]}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">{c.name_pt} <span className="text-[10px] text-gray-500">({c.name})</span></span>
                  <button onClick={() => toggle(c.name)} className="text-[10px] text-red-400 hover:text-red-300">✕ Remover</button>
                </div>
                <p className="text-[11px] text-gray-300 mt-1">{c.effect}</p>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {allConditions.map(c => {
          const active = activeConditions.includes(c.name);
          const sevColors: Record<number, string> = {
            1: active ? 'bg-yellow-700/50 border-yellow-600 text-yellow-300' : '',
            2: active ? 'bg-orange-700/50 border-orange-600 text-orange-300' : '',
            3: active ? 'bg-red-700/50 border-red-600 text-red-300' : '',
          };
          return (
            <button
              key={c.name}
              onClick={() => toggle(c.name)}
              title={`${c.name_pt}: ${c.effect}`}
              className={`px-2.5 py-1 rounded-full text-[11px] border transition
                ${active ? sevColors[c.severity] : 'border-gray-700 bg-gray-800 text-gray-500 hover:bg-gray-700'}`}
            >
              {c.name_pt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Advantages List ─── */
function AdvantagesBlock({
  advantages, onChange,
}: {
  advantages: { name: string; ranks?: number; cost: number; description?: string }[];
  onChange: (adv: { name: string; ranks?: number; cost: number }[]) => void;
}) {
  const { catalog } = useCatalog();
  const allAdvantages = catalog?.advantages ?? [];
  const totalPP = advantages.reduce((s, a) => s + a.cost, 0);
  const [showPicker, setShowPicker] = useState(false);
  const [filter, setFilter] = useState('');

  const addAdvantage = (adv: { name: string; ranked: boolean; cost: number }) => {
    onChange([...advantages, { name: adv.name, ranks: adv.ranked ? 1 : undefined, cost: adv.cost }]);
  };

  const removeAdvantage = (idx: number) => {
    onChange(advantages.filter((_, i) => i !== idx));
  };

  const setRanks = (idx: number, ranks: number) => {
    const next = [...advantages];
    next[idx] = { ...next[idx], ranks, cost: ranks * (allAdvantages.find(a => a.name === next[idx].name)?.cost ?? 1) };
    onChange(next);
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-hero-400">Vantagens</h2>
        <span className="text-xs text-gray-500">{totalPP} PP</span>
      </div>
      {advantages.length > 0 && (
        <div className="space-y-1 mb-3">
          {advantages.map((a, i) => {
            const def = allAdvantages.find(d => d.name === a.name);
            return (
              <div key={i} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
                <span className="text-sm text-white flex-1">{a.name}</span>
                {def?.ranked && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => (a.ranks ?? 1) > 1 && setRanks(i, (a.ranks ?? 1) - 1)} className="w-5 h-5 rounded bg-gray-700 text-xs">−</button>
                    <span className="text-xs w-4 text-center">{a.ranks ?? 1}</span>
                    <button onClick={() => setRanks(i, (a.ranks ?? 1) + 1)} className="w-5 h-5 rounded bg-gray-700 text-xs">+</button>
                  </div>
                )}
                <span className="text-xs text-gray-500">{a.cost} PP</span>
                <button onClick={() => removeAdvantage(i)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
              </div>
            );
          })}
        </div>
      )}
      <button
        onClick={() => setShowPicker(!showPicker)}
        className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg w-full"
      >
        {showPicker ? '− Fechar' : '+ Adicionar Vantagem'}
      </button>
      {showPicker && (
        <div className="mt-3 space-y-2">
          <input
            type="text"
            placeholder="Buscar vantagem..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
          />
          <div className="max-h-48 overflow-y-auto space-y-1">
            {allAdvantages
              .filter(a => a.name.toLowerCase().includes(filter.toLowerCase()) || a.description.toLowerCase().includes(filter.toLowerCase()))
              .map(a => (
                <button
                  key={a.name}
                  onClick={() => { addAdvantage(a); setShowPicker(false); setFilter(''); }}
                  className="w-full text-left bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-2"
                >
                  <span className="text-sm text-white">{a.name}</span>
                  <span className="text-[10px] text-gray-500 ml-2">{a.category} • {a.cost} PP{a.ranked ? '/rank' : ''}</span>
                  <p className="text-[10px] text-gray-500">{a.description}</p>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Powers List ─── */
function powerArrayCost(powers: PowerEntry[]): number {
  // Standalone powers: full cost. Array base: full cost. Alternates: 1 PP each.
  let total = 0;
  const arrays = new Map<string, PowerEntry[]>();
  for (const p of powers) {
    if (p.array_id) {
      const arr = arrays.get(p.array_id) ?? [];
      arr.push(p);
      arrays.set(p.array_id, arr);
    } else {
      total += p.final_cost;
    }
  }
  for (const arr of arrays.values()) {
    const base = arr.find(p => !p.is_alternate);
    if (base) total += base.final_cost;
    const alts = arr.filter(p => p.is_alternate);
    total += alts.length; // 1 PP each
  }
  return total;
}

function uid() { return Math.random().toString(36).slice(2, 10); }

function PowersBlock({
  powers, plCap, onChange,
}: {
  powers: PowerEntry[];
  plCap: number;
  onChange: (powers: PowerEntry[]) => void;
}) {
  const [showForge, setShowForge] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [forgeArrayId, setForgeArrayId] = useState<string | undefined>(undefined);
  const [forgeIsAlternate, setForgeIsAlternate] = useState(false);
  const totalPP = powerArrayCost(powers);

  const addPower = (power: PowerEntry) => {
    const p = { ...power, array_id: forgeArrayId, is_alternate: forgeIsAlternate };
    if (editIndex !== null) {
      const next = [...powers];
      next[editIndex] = p;
      onChange(next);
      setEditIndex(null);
    } else {
      onChange([...powers, p]);
    }
    setShowForge(false);
    setForgeArrayId(undefined);
    setForgeIsAlternate(false);
  };

  const removePower = (idx: number) => {
    onChange(powers.filter((_, i) => i !== idx));
  };

  const startEdit = (idx: number) => {
    const p = powers[idx];
    setForgeArrayId(p.array_id);
    setForgeIsAlternate(!!p.is_alternate);
    setEditIndex(idx);
    setShowForge(true);
  };

  const startNewArray = () => {
    setForgeArrayId(uid());
    setForgeIsAlternate(false);
    setEditIndex(null);
    setShowForge(true);
  };

  const addAlternate = (arrayId: string) => {
    setForgeArrayId(arrayId);
    setForgeIsAlternate(true);
    setEditIndex(null);
    setShowForge(true);
  };

  // Group powers: standalone and arrays
  const arrays = new Map<string, PowerEntry[]>();
  const standalone: { power: PowerEntry; idx: number }[] = [];
  powers.forEach((p, i) => {
    if (p.array_id) {
      const arr = arrays.get(p.array_id) ?? [];
      arr.push({ ...p, _idx: i } as any);
      arrays.set(p.array_id, arr);
    } else {
      standalone.push({ power: p, idx: i });
    }
  });

  const PowerCard = ({ p, idx, indent }: { p: PowerEntry; idx: number; indent?: boolean }) => (
    <div className={`bg-gray-800 rounded-lg p-3 ${indent ? 'ml-4 border-l-2 border-hero-600/30' : ''}`}>
      <div className="flex items-center justify-between">
        <div>
          {p.is_alternate && <span className="text-[9px] text-hero-400 mr-1.5">↳ ALT</span>}
          <span className="text-sm font-semibold text-white">{p.name || p.effect}</span>
          <span className="text-[10px] text-gray-500 ml-2">{p.effect} {p.dp}dP</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-hero-400 font-mono">{p.is_alternate ? '1' : p.final_cost} PP</span>
          <button onClick={() => startEdit(idx)} className="text-[10px] text-gray-400 hover:text-white">✎</button>
          <button onClick={() => removePower(idx)} className="text-[10px] text-red-400 hover:text-red-300">✕</button>
        </div>
      </div>
      {p.extras.length > 0 && (
        <div className="text-[10px] text-green-400 mt-1">
          +{p.extras.map(e => e.name + (e.ranks && e.ranks > 1 ? ` ${e.ranks}` : '')).join(', ')}
        </div>
      )}
      {p.flaws.length > 0 && (
        <div className="text-[10px] text-red-400 mt-0.5">
          −{p.flaws.map(f => f.name + (f.ranks && f.ranks > 1 ? ` ${f.ranks}` : '')).join(', ')}
        </div>
      )}
      {p.descriptors.length > 0 && (
        <div className="flex gap-1 mt-1 flex-wrap">
          {p.descriptors.map(d => (
            <span key={d} className="text-[9px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">{d}</span>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-hero-400">Poderes</h2>
        <span className="text-xs text-gray-500">{totalPP} PP</span>
      </div>

      {/* Standalone powers */}
      {standalone.length > 0 && (
        <div className="space-y-2 mb-3">
          {standalone.map(({ power, idx }) => (
            <PowerCard key={idx} p={power} idx={idx} />
          ))}
        </div>
      )}

      {/* Power Arrays */}
      {[...arrays.entries()].map(([arrayId, arrPowers]) => {
        const base = arrPowers.find(p => !(p as any).is_alternate);
        const alts = arrPowers.filter(p => (p as any).is_alternate);
        const arrayCost = (base ? base.final_cost : 0) + alts.length;
        return (
          <div key={arrayId} className="mb-3 bg-gray-800/50 rounded-xl border border-hero-600/20 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-hero-400">⚡ Arranjo de Poderes</span>
              <span className="text-[10px] text-gray-500">{arrayCost} PP total</span>
            </div>
            <div className="space-y-2">
              {base && <PowerCard p={base} idx={(base as any)._idx} />}
              {alts.map(p => (
                <PowerCard key={(p as any)._idx} p={p} idx={(p as any)._idx} indent />
              ))}
            </div>
            <button
              onClick={() => addAlternate(arrayId)}
              className="mt-2 text-[11px] text-hero-400 hover:text-hero-300 transition"
            >
              + Poder Alternativo (1 PP)
            </button>
          </div>
        );
      })}

      <div className="flex gap-2">
        <button
          onClick={() => { setForgeArrayId(undefined); setForgeIsAlternate(false); setEditIndex(null); setShowForge(true); }}
          className="flex-1 text-sm bg-hero-600 hover:bg-hero-700 text-white px-4 py-2 rounded-lg transition"
        >
          + Criar Poder
        </button>
        <button
          onClick={startNewArray}
          className="text-sm bg-gray-800 hover:bg-gray-700 text-hero-400 px-4 py-2 rounded-lg border border-hero-600/30 transition"
        >
          + Arranjo
        </button>
      </div>

      {showForge && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gray-900 border-b border-gray-800 p-4 flex items-center justify-between z-10">
              <h3 className="text-lg font-bold text-hero-400">
                {editIndex !== null ? 'Editar Poder' : forgeIsAlternate ? 'Poder Alternativo (1 PP)' : forgeArrayId ? 'Poder Base do Arranjo' : 'Power Forge — Criar Poder'}
              </h3>
              <button onClick={() => { setShowForge(false); setForgeArrayId(undefined); setForgeIsAlternate(false); }} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            {forgeIsAlternate && (
              <div className="px-4 pt-2">
                <div className="text-[11px] bg-hero-600/10 border border-hero-600/20 rounded-lg px-3 py-2 text-hero-300">
                  💡 Poder Alternativo: custa apenas 1 PP. Seu custo em PP não pode exceder o do poder base do arranjo. Só pode usar um poder do arranjo por turno.
                </div>
              </div>
            )}
            <div className="p-4">
              <PowerForge
                plCap={plCap}
                initialPower={editIndex !== null ? powers[editIndex] : undefined}
                onSave={addPower}
                onCancel={() => { setShowForge(false); setForgeArrayId(undefined); setForgeIsAlternate(false); }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Complications ─── */
function ComplicationsBlock({
  complications, onChange,
}: {
  complications: { type: string; description: string }[];
  onChange: (c: { type: string; description: string }[]) => void;
}) {
  const TYPES = ['Motivação', 'Identidade', 'Vulnerabilidade', 'Responsabilidade', 'Rivalidade', 'Obsessão', 'Deficiência', 'Outro'];
  const [newType, setNewType] = useState('Motivação');
  const [newDesc, setNewDesc] = useState('');

  const add = () => {
    if (!newDesc.trim()) return;
    onChange([...complications, { type: newType, description: newDesc.trim() }]);
    setNewDesc('');
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <h2 className="text-lg font-bold text-hero-400 mb-3">Complicações</h2>
      {complications.length > 0 && (
        <div className="space-y-2 mb-3">
          {complications.map((c, i) => (
            <div key={i} className="flex items-start gap-2 bg-gray-800 rounded-lg px-3 py-2">
              <span className="text-[10px] bg-gray-700 text-gray-300 px-2 py-0.5 rounded mt-0.5 shrink-0">{c.type}</span>
              <span className="text-sm text-gray-300 flex-1">{c.description}</span>
              <button onClick={() => onChange(complications.filter((_, j) => j !== i))} className="text-red-400 text-xs shrink-0">✕</button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <select
          value={newType}
          onChange={e => setNewType(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm text-white"
        >
          {TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <input
          type="text"
          value={newDesc}
          onChange={e => setNewDesc(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Descrição..."
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
        />
        <button onClick={add} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 rounded-lg text-sm">+</button>
      </div>
    </div>
  );
}

/* ─── Roll Result Toast ─── */
function RollToast({ result, label, onClose }: { result: RollResult; label: string; onClose: () => void }) {
  const borderColor = result.margin >= 0 ? 'border-green-600' : 'border-red-600';

  return (
    <div className={`fixed bottom-6 right-6 bg-gray-900 border-2 ${borderColor} rounded-2xl p-5 shadow-2xl z-50 w-80 animate-slide-in`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-white">{label}</span>
        <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
      </div>
      <div className="flex gap-1.5 flex-wrap mb-3">
        {result.dice.map((d, i) => (
          <div
            key={i}
            className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold
              ${d.type === 'hero' ? 'bg-yellow-700/50 text-yellow-300 border border-yellow-600' :
                d.complication ? 'bg-red-700/40 text-red-300' :
                d.successes > 0 ? 'bg-green-700/40 text-green-300' :
                'bg-gray-700 text-gray-400'}`}
          >
            {d.face_value}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xl font-bold text-white">{result.total_successes}</span>
          <span className="text-xs text-gray-400 ml-1">sucessos</span>
          {result.total_complications > 0 && (
            <span className="text-xs text-red-400 ml-2">{result.total_complications} comp.</span>
          )}
        </div>
        <span className={`text-sm font-bold ${result.margin >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {result.result_label}
        </span>
      </div>
    </div>
  );
}

/* ─── PP Summary Bar ─── */
function PPBar({ spent, total }: { spent: number; total: number }) {
  const pct = total > 0 ? (spent / total) * 100 : 0;
  const over = spent > total;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-400">Pontos de Poder</span>
        <span className={`text-lg font-bold ${over ? 'text-red-400' : 'text-white'}`}>
          {spent} / {total} PP
        </span>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${over ? 'bg-red-500' : 'bg-hero-500'}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      {over && <p className="text-xs text-red-400 mt-1">Excedeu em {spent - total} PP!</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   AVATAR UPLOAD
   ═══════════════════════════════════════════════ */
function AvatarUpload({ charId, avatarUrl, onUpdate }: { charId: number; avatarUrl: string; onUpdate: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) { alert('Imagem muito grande (máx 2MB)'); return; }
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) { alert('Formato inválido. Use PNG, JPEG, WebP ou GIF.'); return; }
    setUploading(true);
    try { await uploadAvatar(charId, file); onUpdate(); } catch (e) { console.error(e); alert('Erro ao enviar avatar'); }
    finally { setUploading(false); }
  };

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); };
  const handleRemove = async () => { if (!confirm('Remover avatar?')) return; try { await deleteAvatar(charId); onUpdate(); } catch {} };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <h2 className="text-lg font-bold text-hero-400 mb-4">Avatar</h2>
      <div className="flex items-start gap-5">
        {avatarUrl ? (
          <div className="relative group">
            <img src={avatarUrl} alt="Avatar" className="w-24 h-24 rounded-2xl object-cover border-2 border-gray-700" />
            <button onClick={handleRemove}
              className="absolute -top-2 -right-2 bg-red-600 hover:bg-red-500 text-white w-6 h-6 rounded-full text-xs opacity-0 group-hover:opacity-100 transition">✕</button>
          </div>
        ) : (
          <div className="w-24 h-24 rounded-2xl bg-gray-800 border-2 border-dashed border-gray-700 flex items-center justify-center text-gray-600 text-3xl">?</div>
        )}
        <div className="flex-1">
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer ${dragOver ? 'border-hero-500 bg-hero-600/10' : 'border-gray-700 hover:border-gray-600'}`}
            onClick={() => document.getElementById(`avatar-input-${charId}`)?.click()}
          >
            <input id={`avatar-input-${charId}`} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
              onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
            {uploading ? (
              <span className="text-sm text-hero-400">Enviando...</span>
            ) : (
              <div>
                <p className="text-sm text-gray-400">Arraste uma imagem ou clique para selecionar</p>
                <p className="text-[10px] text-gray-600 mt-1">PNG, JPEG, WebP ou GIF • Máx 2MB • Sem fundo (ideal)</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN CHARACTER SHEET
   ═══════════════════════════════════════════════ */
export default function CharacterSheet() {
  const { id } = useParams<{ id: string }>();
  const [char, setChar] = useState<CharacterFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rollResult, setRollResult] = useState<{ result: RollResult; label: string } | null>(null);
  const [tab, setTab] = useState<'build' | 'play' | 'bio'>('build');

  const load = useCallback(() => {
    if (!id) return;
    getCharacter(Number(id))
      .then(data => setChar(data as unknown as CharacterFull))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const save = async (fields: Partial<CharacterFull>) => {
    if (!char) return;
    setSaving(true);
    try {
      const updated = await updateCharacter(char.id, fields as Record<string, unknown>);
      setChar(updated as unknown as CharacterFull);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleRoll = async (pool: number, label: string) => {
    try {
      const ferimentosPenalty = char?.ferimentos.filter(f => f > 0).length ?? 0;
      const result = await rollDice(Math.max(1, pool - ferimentosPenalty), char?.hero_dice ?? 0 > 0 ? 0 : 0, 1);
      setRollResult({ result, label });
      setTimeout(() => setRollResult(null), 6000);
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Carregando ficha...</div>;
  if (!char) return <div className="text-red-400">Personagem não encontrado.</div>;

  const TABS = [
    { key: 'build' as const, label: 'Construção' },
    { key: 'play' as const, label: 'Jogo' },
    { key: 'bio' as const, label: 'Identidade' },
  ];

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link to="/characters" className="text-xs text-gray-500 hover:text-gray-300">← Personagens</Link>
          <h1 className="text-2xl font-bold text-white">{char.name}</h1>
          <p className="text-sm text-gray-400">{char.concept || 'Sem conceito'}</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">NP {char.power_level}</div>
          {saving && <span className="text-xs text-yellow-400">Salvando...</span>}
        </div>
      </div>

      <PPBar spent={char.pp_spent} total={char.pp_total} />

      {/* Tab toggle */}
      <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-800">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition
              ${tab === t.key ? 'bg-hero-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'build' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AttributeBlock
            attrs={char.attributes}
            onChange={(key, val) => {
              const next = { ...char.attributes, [key]: val };
              save({ attributes: next });
            }}
            onRoll={handleRoll}
          />
          <SkillsBlock
            skills={char.skills}
            attrs={char.attributes}
            plCap={char.power_level}
            onChange={skills => save({ skills })}
            onRoll={handleRoll}
          />
          <div className="lg:col-span-2">
            <PowersBlock
              powers={char.powers}
              plCap={char.power_level}
              onChange={powers => save({ powers })}
            />
          </div>
          <AdvantagesBlock
            advantages={char.advantages}
            onChange={advantages => save({ advantages })}
          />
          <ComplicationsBlock
            complications={char.complications}
            onChange={complications => save({ complications })}
          />
          <EquipmentArmory
            equipment={char.equipment}
            advantages={char.advantages}
            onChange={equipment => save({ equipment })}
          />
          <div className="lg:col-span-2">
            <BaseArchitect
              baseHq={char.base_hq}
              onChange={base_hq => save({ base_hq })}
            />
          </div>
          {/* Notes */}
          <div className="lg:col-span-2 bg-gray-900 rounded-xl border border-gray-800 p-5">
            <h2 className="text-lg font-bold text-hero-400 mb-3">Anotações</h2>
            <textarea
              value={char.notes}
              onChange={e => save({ notes: e.target.value })}
              rows={4}
              placeholder="Anotações livres sobre o personagem..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm text-white resize-none outline-none focus:border-hero-500"
            />
          </div>
        </div>
      )}

      {tab === 'bio' && (
        <div className="space-y-4 max-w-2xl">
          {/* Avatar upload */}
          <AvatarUpload charId={char.id} avatarUrl={char.avatar_url} onUpdate={load} />

          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
            <h2 className="text-lg font-bold text-hero-400">Identidade do Herói</h2>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nome do Herói</label>
              <input
                type="text"
                value={char.name}
                onChange={e => save({ name: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-hero-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Conceito</label>
              <input
                type="text"
                value={char.concept}
                onChange={e => save({ concept: e.target.value })}
                placeholder="Ex: Vigilante noturno com poderes sombrios"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-hero-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Descritores de Origem</label>
              <textarea
                value={char.origin_descriptors}
                onChange={e => save({ origin_descriptors: e.target.value })}
                rows={3}
                placeholder="Descreva a origem dos poderes: Mutante? Tecnológico? Mágico? Alienígena?"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm text-white resize-none outline-none focus:border-hero-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nível de Poder</label>
              <select
                value={char.power_level}
                onChange={e => save({ power_level: Number(e.target.value) })}
                className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white outline-none"
              >
                {[3, 5, 7, 10, 13, 15].map(pl => (
                  <option key={pl} value={pl}>NP {pl} — {pl <= 3 ? 'Início' : pl <= 5 ? 'Agentes' : pl <= 7 ? 'Super-humanos' : pl <= 10 ? 'Padrão' : pl <= 13 ? 'Icônicos' : 'Cósmicos'} ({pl <= 3 ? 45 : pl <= 5 ? 75 : pl <= 7 ? 105 : pl <= 10 ? 150 : pl <= 13 ? 195 : 225} PP)</option>
                ))}
              </select>
            </div>
          </div>
          {/* Notes */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <h2 className="text-lg font-bold text-hero-400 mb-3">Anotações</h2>
            <textarea
              value={char.notes}
              onChange={e => save({ notes: e.target.value })}
              rows={6}
              placeholder="História, aparência, personalidade, aliados, inimigos..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm text-white resize-none outline-none focus:border-hero-500"
            />
          </div>
        </div>
      )}

      {tab === 'play' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <VitalidadeBlock char={char} onUpdate={save} />
          <DefensesBlock char={char} onRoll={handleRoll} />
          <div className="lg:col-span-2">
            <ConditionsBlock
              activeConditions={char.active_conditions}
              onUpdate={conditions => save({ active_conditions: conditions })}
            />
          </div>
          {/* Quick-roll powers */}
          {char.powers.length > 0 && (
            <div className="lg:col-span-2 bg-gray-900 rounded-xl border border-gray-800 p-5">
              <h2 className="text-lg font-bold text-hero-400 mb-3">Poderes — Rolagem Rápida</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {char.powers.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => handleRoll(p.dp, p.name || p.effect)}
                    className="bg-gray-800 hover:bg-gray-700 rounded-lg p-3 text-left transition"
                  >
                    <span className="text-sm font-semibold text-white">{p.name || p.effect}</span>
                    <span className="text-[10px] text-gray-500 ml-2">{p.dp}dP</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Roll Toast */}
      {rollResult && (
        <RollToast
          result={rollResult.result}
          label={rollResult.label}
          onClose={() => setRollResult(null)}
        />
      )}
    </div>
  );
}
