"""Character calculator — derives Vitalidade, defenses, PP spent from raw character data."""

from __future__ import annotations

# Attribute PP cost table (cumulative from rank 2 base)
# Ranks 1-6 = compra direta; acima de 6, use Enhanced Trait
_ATTR_PP_COST = {1: -1, 2: 0, 3: 2, 4: 4, 5: 8, 6: 14}
_ATTR_MAX_RANK = 6

# Power Level → initial PP
PL_TABLE = {3: 45, 5: 75, 7: 105, 10: 150, 13: 195, 15: 225}


def attr_pp_cost(rank: int) -> int:
    """PP cost for a single attribute at given rank (relative to free rank 2)."""
    clamped = max(1, min(rank, _ATTR_MAX_RANK))
    return _ATTR_PP_COST.get(clamped, 0)


def calc_attributes_pp(attrs: dict) -> int:
    return sum(attr_pp_cost(v) for v in attrs.values())


def calc_skills_pp(skills: list[dict]) -> int:
    total_ranks = sum(s.get("ranks", 0) for s in skills)
    return total_ranks // 2 + total_ranks % 2  # ceil(total_ranks / 2), i.e. 1 PP per 2 ranks


def calc_power_cost(power: dict) -> int:
    """Calculate final PP cost for a single power entry."""
    return power.get("final_cost", 0)


def calc_powers_pp(powers: list[dict]) -> int:
    return sum(calc_power_cost(p) for p in powers)


def calc_advantages_pp(advantages: list[dict]) -> int:
    return sum(a.get("cost", 1) for a in advantages)


def calc_equipment_ranks(advantages: list[dict]) -> int:
    """Count total ranks of the Equipment advantage (5 eq-points per rank)."""
    return sum(a.get("ranks", 1) for a in advantages if a.get("name", "").lower() == "equipment")


def calc_total_pp_spent(char_data: dict) -> int:
    attrs = char_data.get("attributes", {})
    skills = char_data.get("skills", [])
    powers = char_data.get("powers", [])
    advantages = char_data.get("advantages", [])

    return (
        calc_attributes_pp(attrs)
        + calc_skills_pp(skills)
        + calc_powers_pp(powers)
        + calc_advantages_pp(advantages)
    )


def calc_vitalidade_max(attrs: dict, powers: list[dict], equipment: list[dict]) -> int:
    """Vitalidade = 3 + RES + Protection bonuses + Force Field bonuses + armor."""
    res = attrs.get("RES", 2)
    base = 3 + res

    # Protection from powers
    for p in powers:
        effect = (p.get("effect", "") or "").lower()
        if effect in ("protection", "proteção"):
            base += p.get("dp", 0)
        elif effect in ("force field", "campo de força", "force_field"):
            base += p.get("dp", 0)

    # Armor from equipment
    for eq in equipment:
        base += eq.get("vitalidade_bonus", 0)

    return base


def calc_defenses(attrs: dict) -> dict:
    return {
        "dodge": attrs.get("AGI", 2),
        "parry": attrs.get("CMB", 2),
        "fortitude": attrs.get("RES", 2),
        "willpower": attrs.get("PER", 2),
    }


def recalculate_character(char_data: dict) -> dict:
    """Given raw character data dict, return updated derived values."""
    attrs = char_data.get("attributes", {})
    powers = char_data.get("powers", [])
    equipment = char_data.get("equipment", [])
    advantages = char_data.get("advantages", [])
    pl = char_data.get("power_level", 10)

    pp_total = PL_TABLE.get(pl, 150)
    pp_spent = calc_total_pp_spent(char_data)
    vit_max = calc_vitalidade_max(attrs, powers, equipment)
    defenses = calc_defenses(attrs)

    return {
        "pp_total": pp_total,
        "pp_spent": pp_spent,
        "vitalidade_max": vit_max,
        **defenses,
    }
