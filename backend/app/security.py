"""Password hashing, JWT access tokens and the access-control dependencies."""
from datetime import UTC, datetime, timedelta
from typing import Annotated

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session, select

from .config import settings
from .database import get_session
from .models import User
from .ratelimit import api_by_user

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_prefix}/auth/token", auto_error=False)

# bcrypt only reads the first 72 bytes; longer input is rejected rather than truncated.
_BCRYPT_MAX_BYTES = 72

ROLES_THAT_CAN_EDIT = frozenset({"owner", "manager", "admin"})


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=settings.bcrypt_rounds)).decode()


# Verified against when the email is unknown, so a miss costs the same bcrypt work
# as a hit and response time does not reveal which emails have accounts.
_DUMMY_HASH = hash_password("timing-equaliser-not-a-real-password")


def verify_password(plain: str, hashed: str) -> bool:
    raw = plain.encode()
    if len(raw) > _BCRYPT_MAX_BYTES:
        bcrypt.checkpw(b"x", _DUMMY_HASH.encode())  # keep the timing uniform
        return False
    try:
        return bcrypt.checkpw(raw, hashed.encode())
    except ValueError:  # malformed stored hash
        return False


def create_access_token(user: User, expires_minutes: int | None = None) -> str:
    now = datetime.now(UTC)
    payload = {
        # The immutable id, not the email: tokens survive an email change and do
        # not put personal data in a value that ends up in logs.
        "sub": str(user.id),
        "iat": now,
        "exp": now + timedelta(minutes=expires_minutes or settings.access_token_expire_minutes),
        "typ": "access",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def authenticate(session: Session, email: str, password: str) -> User | None:
    user = session.exec(select(User).where(User.email == email)).first()
    if user is None:
        verify_password(password, _DUMMY_HASH)
        return None
    if not verify_password(password, user.hashed_password) or not user.is_active:
        return None
    return user


def get_current_user(
    token: Annotated[str | None, Depends(oauth2_scheme)],
    session: Annotated[Session, Depends(get_session)],
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_error
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["exp", "iat", "sub"]},
        )
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        raise credentials_error from None
    if payload.get("typ") != "access":
        raise credentials_error
    user = session.get(User, user_id)
    if not user or not user.is_active:
        raise credentials_error
    return user


def get_org_user(user: Annotated[User, Depends(get_current_user)]) -> User:
    """A user who belongs to an organization. Every data endpoint is scoped to it."""
    if user.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No organization access")
    # A ceiling far above normal use, so one token cannot monopolise the workers.
    api_by_user.hit(f"user:{user.id}")
    return user


def get_editor(user: Annotated[User, Depends(get_org_user)]) -> User:
    """A user allowed to change data. Analysts are read-only."""
    if user.role not in ROLES_THAT_CAN_EDIT:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your role cannot make changes")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
OrgUser = Annotated[User, Depends(get_org_user)]
Editor = Annotated[User, Depends(get_editor)]
DbSession = Annotated[Session, Depends(get_session)]
