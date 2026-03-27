import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { getSystemCatalog } from '../api';

export interface Effect {
  name: string;
  name_pt: string;
  category: string;
  base_cost: number;
  cost_type: string;
  action: string;
  range: string;
  duration: string;
  resistance: string | null;
  exclusive_extras: string[];
  exclusive_flaws: string[];
  ui_type: string;
  description: string;
}

export interface Extra {
  name: string;
  cost_type: string;
  cost: number;
  description: string;
  max_ranks?: number;
}

export interface Flaw {
  name: string;
  cost_type: string;
  discount: number;
  description: string;
  max_ranks?: number;
}

export interface Condition {
  name: string;
  name_pt: string;
  severity: number;
  effect: string;
}

export interface Advantage {
  name: string;
  category: string;
  ranked: boolean;
  cost: number;
  description: string;
  max_ranks?: number;
}

export interface Skill {
  name: string;
  attribute: string;
  untrained: boolean;
  description: string;
  has_specialization?: boolean;
}

export interface Attribute {
  key: string;
  name: string;
  description: string;
  uses: string;
}

export interface PowerLevel {
  pl: number;
  pp: number;
  dp_cap: number;
  context: string;
}

export interface EquipmentItem {
  name: string;
  category: string;
  cost: number;
  effect: string;
  description: string;
}

export interface BaseSize {
  name: string;
  description: string;
  cost: number;
}

export interface BaseFeature {
  name: string;
  cost: number;
  description: string;
}

export interface SystemCatalog {
  attributes: Attribute[];
  attr_cost_table: { rank: number; description: string; pp_cumulative: number }[];
  skills: Skill[];
  effects: Effect[];
  extras: Extra[];
  flaws: Flaw[];
  conditions: Condition[];
  advantages: Advantage[];
  power_levels: PowerLevel[];
  affliction_conditions: Record<string, string[]>;
  immunity_options: { name: string; cost: number }[];
  descriptor_suggestions: Record<string, string[]>;
  equipment_items: EquipmentItem[];
  base_sizes: BaseSize[];
  base_features: BaseFeature[];
}

interface CatalogState {
  catalog: SystemCatalog | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const CatalogContext = createContext<CatalogState | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<SystemCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    getSystemCatalog()
      .then(data => setCatalog(data as unknown as SystemCatalog))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return (
    <CatalogContext.Provider value={{ catalog, loading, error, reload }}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog(): CatalogState {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be inside CatalogProvider');
  return ctx;
}
