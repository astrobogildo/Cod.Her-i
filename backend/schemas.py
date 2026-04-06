from pydantic import BaseModel, Field


# ── Auth ─────────────────────────────────────────
class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=4, max_length=128)
    display_name: str = Field(min_length=1, max_length=100)


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    username: str
    display_name: str
    role: str
    is_admin: bool = False

    class Config:
        from_attributes = True


class ResetPasswordRequest(BaseModel):
    username: str
    new_password: str = Field(min_length=4, max_length=128)


class SetRoleRequest(BaseModel):
    user_id: int
    role: str = "player"  # player | gm | admin
    is_admin: bool = False


# ── Character ────────────────────────────────────
class CharacterCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    concept: str = ""
    origin_descriptors: str = ""
    power_level: int = 10
    attributes: dict = Field(default_factory=lambda: {"FOR": 2, "RES": 2, "AGI": 2, "DES": 2, "CMB": 2, "INT": 2, "PER": 2, "PRE": 2})
    skills: list = Field(default_factory=list)
    powers: list = Field(default_factory=list)
    advantages: list = Field(default_factory=list)
    equipment: list = Field(default_factory=list)
    complications: list = Field(default_factory=list)
    base_hq: dict | None = None
    notes: str = ""


class CharacterUpdate(BaseModel):
    name: str | None = None
    concept: str | None = None
    origin_descriptors: str | None = None
    power_level: int | None = None
    attributes: dict | None = None
    skills: list | None = None
    powers: list | None = None
    advantages: list | None = None
    equipment: list | None = None
    complications: list | None = None
    base_hq: dict | None = None
    vitalidade_current: int | None = None
    ferimentos: list | None = None
    hero_dice: int | None = None
    active_conditions: list | None = None
    notes: str | None = None


class CharacterResponse(BaseModel):
    id: int
    user_id: int
    name: str
    concept: str
    origin_descriptors: str
    power_level: int
    pp_total: int
    pp_spent: int
    attributes: dict
    skills: list
    powers: list
    advantages: list
    equipment: list
    complications: list
    base_hq: dict | None
    vitalidade_max: int
    vitalidade_current: int
    ferimentos: list
    hero_dice: int
    active_conditions: list
    dodge: int
    parry: int
    fortitude: int
    willpower: int
    notes: str
    avatar_url: str = ""

    class Config:
        from_attributes = True


# ── Game Table ───────────────────────────────────
class TableCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    power_level: int = 10
    description: str = ""
    optional_rules: dict | None = None


class TableResponse(BaseModel):
    id: int
    name: str
    code: str
    gm_user_id: int
    power_level: int
    description: str
    status: str
    optional_rules: dict
    combat_state: dict | None

    class Config:
        from_attributes = True


class JoinTableRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)
    character_id: int


# ── Dice Roll ────────────────────────────────────
class RollRequest(BaseModel):
    table_id: int | None = None
    character_id: int | None = None
    roll_type: str = "custom"
    description: str = ""
    pool_size: int = Field(ge=1, le=30)
    hero_dice: int = Field(default=0, ge=0, le=3)
    tn: int | None = None
    exploding: bool = False


class DieResult(BaseModel):
    value: int
    die_type: str  # d10 | d12
    is_success: bool
    is_critical: bool
    is_complication: bool


class RollResponse(BaseModel):
    dice: list[DieResult]
    total_successes: int
    total_complications: int
    tn: int | None
    margin: int | None
    result_label: str  # falha_critica | falha | sucesso_basico | sucesso_solido | sucesso_excelente | sucesso_lendario
