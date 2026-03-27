import { useState } from 'react';
import { useCatalog, EquipmentItem } from '../context/CatalogContext';

interface EquipmentEntry {
  name: string;
  cost: number;
  description?: string;
  custom?: boolean;
}

const CATEGORY_NAMES: Record<string, string> = {
  weapon_melee: '⚔️ Armas Melee',
  weapon_ranged: '🔫 Armas à Distância',
  armor: '🛡️ Armaduras',
  gear: '🎒 Equipamentos',
  vehicle: '🚗 Veículos',
};

const CATEGORY_ORDER = ['weapon_melee', 'weapon_ranged', 'armor', 'gear', 'vehicle'];

export default function EquipmentArmory({
  equipment, advantages, onChange,
}: {
  equipment: EquipmentEntry[];
  advantages: { name: string; ranks?: number; cost: number }[];
  onChange: (equipment: EquipmentEntry[]) => void;
}) {
  const { catalog } = useCatalog();
  const items = catalog?.equipment_items ?? [];

  const [showPicker, setShowPicker] = useState(false);
  const [filter, setFilter] = useState('');
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [customName, setCustomName] = useState('');
  const [customCost, setCustomCost] = useState(1);
  const [customDesc, setCustomDesc] = useState('');

  // Calculate EP budget from Equipment advantage
  const equipRanks = advantages
    .filter(a => a.name.toLowerCase() === 'equipment')
    .reduce((s, a) => s + (a.ranks ?? 1), 0);
  const epBudget = equipRanks * 5;
  const epSpent = equipment.reduce((s, e) => s + e.cost, 0);
  const over = epSpent > epBudget;

  const addItem = (item: EquipmentItem) => {
    onChange([...equipment, { name: item.name, cost: item.cost, description: `${item.effect}` }]);
  };

  const addCustom = () => {
    if (!customName.trim()) return;
    onChange([...equipment, { name: customName.trim(), cost: customCost, description: customDesc.trim(), custom: true }]);
    setCustomName('');
    setCustomCost(1);
    setCustomDesc('');
  };

  const removeItem = (idx: number) => {
    onChange(equipment.filter((_, i) => i !== idx));
  };

  const filtered = items.filter(i => {
    if (catFilter && i.category !== catFilter) return false;
    if (filter && !i.name.toLowerCase().includes(filter.toLowerCase()) && !i.description.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  const grouped: Record<string, EquipmentItem[]> = {};
  for (const item of filtered) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-hero-400">Equipamentos</h2>
        <div className="text-right">
          <span className={`text-xs ${over ? 'text-red-400' : 'text-gray-500'}`}>
            {epSpent}/{epBudget} EP
          </span>
          {equipRanks === 0 && (
            <p className="text-[10px] text-yellow-500">Adicione a vantagem "Equipment" primeiro</p>
          )}
        </div>
      </div>

      {/* EP bar */}
      {epBudget > 0 && (
        <div className="w-full bg-gray-700 rounded-full h-1.5 mb-3">
          <div
            className={`h-1.5 rounded-full transition-all ${over ? 'bg-red-500' : 'bg-blue-500'}`}
            style={{ width: `${Math.min(100, (epSpent / epBudget) * 100)}%` }}
          />
        </div>
      )}

      {/* Equipment list */}
      {equipment.length > 0 && (
        <div className="space-y-1 mb-3">
          {equipment.map((e, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
              <span className="text-sm text-white flex-1">{e.name}</span>
              {e.description && <span className="text-[10px] text-gray-500 hidden sm:block">{e.description}</span>}
              <span className="text-xs text-gray-500 shrink-0">{e.cost} EP</span>
              <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-300 text-xs shrink-0">✕</button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setShowPicker(!showPicker)}
        className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg w-full"
      >
        {showPicker ? '− Fechar Catálogo' : '+ Adicionar Equipamento'}
      </button>

      {showPicker && (
        <div className="mt-3 space-y-3">
          {/* Filters */}
          <input
            type="text"
            placeholder="Buscar..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
          />
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setCatFilter(null)}
              className={`text-[10px] px-2 py-1 rounded-full border ${!catFilter ? 'bg-hero-600/30 border-hero-600 text-hero-300' : 'border-gray-700 text-gray-500'}`}
            >Todos</button>
            {CATEGORY_ORDER.map(cat => (
              <button
                key={cat}
                onClick={() => setCatFilter(catFilter === cat ? null : cat)}
                className={`text-[10px] px-2 py-1 rounded-full border ${catFilter === cat ? 'bg-hero-600/30 border-hero-600 text-hero-300' : 'border-gray-700 text-gray-500'}`}
              >{CATEGORY_NAMES[cat]}</button>
            ))}
          </div>

          {/* Items by category */}
          <div className="max-h-64 overflow-y-auto space-y-3">
            {CATEGORY_ORDER.filter(cat => grouped[cat]).map(cat => (
              <div key={cat}>
                <h3 className="text-xs font-semibold text-gray-400 mb-1">{CATEGORY_NAMES[cat]}</h3>
                <div className="space-y-1">
                  {grouped[cat].map(item => (
                    <button
                      key={item.name}
                      onClick={() => addItem(item)}
                      className="w-full text-left bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-2 transition"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white">{item.name}</span>
                        <span className="text-xs text-blue-400 font-mono">{item.cost} EP</span>
                      </div>
                      <p className="text-[10px] text-gray-500">{item.effect} — {item.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Custom item */}
          <div className="border-t border-gray-800 pt-3">
            <h3 className="text-xs font-semibold text-gray-400 mb-2">Item Personalizado</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                placeholder="Nome"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white"
              />
              <input
                type="number"
                value={customCost}
                onChange={e => setCustomCost(Math.max(1, Number(e.target.value)))}
                min={1}
                className="w-16 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white text-center"
              />
              <input
                type="text"
                value={customDesc}
                onChange={e => setCustomDesc(e.target.value)}
                placeholder="Efeito..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white"
              />
              <button
                onClick={addCustom}
                className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 rounded-lg text-sm"
              >+</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
