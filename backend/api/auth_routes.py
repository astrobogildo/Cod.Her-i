from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.database import get_db
from backend.models.user import User
from backend.auth.security import hash_password, verify_password, create_access_token, get_current_user
from backend.schemas import RegisterRequest, LoginRequest, TokenResponse, UserResponse, SetRoleRequest, ResetPasswordRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username já existe")

    # First user becomes admin
    count_result = await db.execute(select(func.count()).select_from(User))
    is_first = count_result.scalar() == 0

    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        display_name=body.display_name,
        is_admin=is_first,
        role="admin" if is_first else "player",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    token = create_access_token(user.id, user.username)
    return TokenResponse(access_token=token)


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    user.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"detail": f"Senha de '{user.display_name}' redefinida com sucesso"}


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/users", response_model=list[UserResponse])
async def list_users(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Apenas administradores podem listar usuários")
    result = await db.execute(select(User))
    return result.scalars().all()


@router.post("/set-role", response_model=UserResponse)
async def set_role(
    body: SetRoleRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Apenas administradores podem alterar papéis")
    result = await db.execute(select(User).where(User.id == body.user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if body.role not in ("player", "gm", "admin"):
        raise HTTPException(status_code=400, detail="Role inválido")
    target.role = body.role
    target.is_admin = body.is_admin
    await db.commit()
    await db.refresh(target)
    return target
