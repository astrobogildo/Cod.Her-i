"""Dice engine for Código: Herói.

d10 pool:
  1     → complication (0 successes)
  2-6   → nothing
  7-9   → 1 success
  10    → 2 successes (critical)

d12 Hero Die:
  1-5   → nothing (NO complication on 1)
  6-12  → 1 success
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass


@dataclass
class DieResult:
    value: int
    die_type: str  # "d10" | "d12"
    is_success: bool = False
    is_critical: bool = False
    is_complication: bool = False


def _roll_d10(exploding: bool = False) -> list[DieResult]:
    results: list[DieResult] = []
    value = secrets.randbelow(10) + 1
    result = DieResult(value=value, die_type="d10")

    if value == 1:
        result.is_complication = True
    elif 7 <= value <= 9:
        result.is_success = True
    elif value == 10:
        result.is_success = True
        result.is_critical = True

    results.append(result)

    # Optional rule: Exploding Dice — a 10 adds an extra d10
    if exploding and value == 10:
        results.extend(_roll_d10(exploding=True))

    return results


def _roll_d12() -> DieResult:
    value = secrets.randbelow(12) + 1
    return DieResult(
        value=value,
        die_type="d12",
        is_success=value >= 6,
        is_critical=False,
        is_complication=False,  # Hero Dice never cause complications
    )


def roll_pool(
    pool_size: int,
    hero_dice: int = 0,
    tn: int | None = None,
    exploding: bool = False,
) -> dict:
    """Roll a full pool and return structured results."""
    all_dice: list[DieResult] = []

    # Roll d10 pool
    for _ in range(pool_size):
        all_dice.extend(_roll_d10(exploding=exploding))

    # Roll Hero Dice (d12)
    for _ in range(hero_dice):
        all_dice.append(_roll_d12())

    total_successes = sum(
        (2 if d.is_critical else 1) if d.is_success else 0
        for d in all_dice
    )
    total_complications = sum(1 for d in all_dice if d.is_complication)

    # Determine margin and result label
    margin: int | None = None
    result_label = "custom"

    if tn is not None:
        margin = total_successes - tn

        if total_successes == 0 and total_complications > total_successes:
            result_label = "falha_critica"
        elif total_successes == 0:
            result_label = "falha"
        elif margin == 0:
            result_label = "sucesso_basico"
        elif margin == 1:
            result_label = "sucesso_solido"
        elif margin == 2:
            result_label = "sucesso_excelente"
        elif margin >= 3:
            result_label = "sucesso_lendario"
        else:
            result_label = "falha"

    return {
        "dice": [
            {
                "value": d.value,
                "die_type": d.die_type,
                "is_success": d.is_success,
                "is_critical": d.is_critical,
                "is_complication": d.is_complication,
            }
            for d in all_dice
        ],
        "total_successes": total_successes,
        "total_complications": total_complications,
        "tn": tn,
        "margin": margin,
        "result_label": result_label,
    }
