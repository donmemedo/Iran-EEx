"""Authentication: login, registration and the current user."""
from fastapi import APIRouter, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import select
from typing import Annotated
from fastapi import Depends

from ..models import Organization, User
from ..schemas import LoginRequest, Token, UserOut
from ..security import CurrentUser, DbSession, authenticate, create_access_token, hash_password

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_out(session, user: User) -> UserOut:
    org = session.get(Organization, user.organization_id) if user.organization_id else None
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        locale=user.locale,
        organization_id=user.organization_id,
        organization_name_fa=org.name_fa if org else None,
        organization_name_en=org.name_en if org else None,
    )


@router.post("/login", response_model=Token)
def login(payload: LoginRequest, session: DbSession) -> Token:
    user = authenticate(session, payload.email.strip().lower(), payload.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ایمیل یا رمز عبور نادرست است | Email or password is incorrect",
        )
    return Token(access_token=create_access_token(user.email))


@router.post("/token", response_model=Token, include_in_schema=False)
def login_form(
    form: Annotated[OAuth2PasswordRequestForm, Depends()], session: DbSession
) -> Token:
    """OAuth2 password flow, so the interactive API docs can authorise."""
    user = authenticate(session, form.username.strip().lower(), form.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect credentials")
    return Token(access_token=create_access_token(user.email))


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(payload: LoginRequest, session: DbSession) -> Token:
    email = payload.email.strip().lower()
    if session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="این ایمیل قبلاً ثبت شده است | This email is already registered",
        )
    if len(payload.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="رمز عبور باید دست‌کم ۸ نویسه باشد | Password must be at least 8 characters",
        )
    org = session.exec(select(Organization)).first()
    user = User(
        email=email,
        hashed_password=hash_password(payload.password),
        full_name=email.split("@")[0],
        role="manager",
        organization_id=org.id if org else None,
    )
    session.add(user)
    session.commit()
    return Token(access_token=create_access_token(user.email))


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser, session: DbSession) -> UserOut:
    return _user_out(session, user)
