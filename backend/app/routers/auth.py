"""Authentication: login and the current user.

There is no public sign-up. It used to attach every new account to the first
organization in the database, which handed its data to anyone. Accounts are
provisioned for a customer's organization; add an owner-only invitation endpoint
when self-service onboarding is needed.
"""
import logging

from fastapi import APIRouter, HTTPException, Request, status

from ..models import Organization
from ..ratelimit import redact, client_ip, login_by_email, login_by_ip, login_by_ip_email
from ..schemas import LoginRequest, Token, UserOut
from ..security import CurrentUser, DbSession, authenticate, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])
log = logging.getLogger("eex.security")

INVALID_CREDENTIALS = "ایمیل یا رمز عبور نادرست است | Email or password is incorrect"


def _login(request: Request, session, email: str, password: str) -> Token:
    email = email.strip().lower()
    ip = client_ip(request)
    login_by_ip.hit(ip)
    login_by_ip_email.hit(f"{ip}|{email}")
    login_by_email.hit(email)
    user = authenticate(session, email, password)
    if not user:
        log.warning("login_failed ip=%s email=%s", ip, redact(email))
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_CREDENTIALS)
    log.info("login_ok user_id=%s ip=%s", user.id, ip)
    return Token(access_token=create_access_token(user))


@router.post("/login", response_model=Token)
def login(payload: LoginRequest, request: Request, session: DbSession) -> Token:
    return _login(request, session, payload.email, payload.password)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser, session: DbSession) -> UserOut:
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
