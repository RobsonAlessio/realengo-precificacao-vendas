import os
import re
import logging
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app import models

logger = logging.getLogger(__name__)

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY não definida. Configure esta variável no .env.")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8 horas

LDAP_URL = os.getenv("LDAP_URL", "ldap://arrozrealengo.local:389")
AD_DOMAIN = os.getenv("AD_DOMAIN", "arrozrealengo.local")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# Padrão seguro: apenas letras, números, ponto, hífen e underscore
_USERNAME_RE = re.compile(r"^[a-zA-Z0-9._\-]{1,64}$")


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def authenticate_ldap(username: str, password: str) -> bool:
    """Tenta autenticar no AD via LDAP. Retorna True se autenticado."""
    if not _USERNAME_RE.match(username):
        logger.warning("LDAP: username rejeitado por formato inválido.")
        return False
    try:
        from ldap3 import Server, Connection
        server = Server(LDAP_URL, connect_timeout=5)
        user_dn = f"{username}@{AD_DOMAIN}"
        conn = Connection(server, user=user_dn, password=password, auto_bind=True)
        conn.unbind()
        return True
    except Exception:
        # Não logar a exceção completa para não expor detalhes do AD
        logger.info("LDAP: autenticação falhou para o usuário '%s'.", username)
        return False


def create_access_token(data: dict) -> str:
    """Cria JWT com sub, role e exp."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido ou expirado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None or not user.is_active:
        raise credentials_exception
    return user


def require_role(*roles: str):
    """Dependência que exige que o usuário tenha um dos roles especificados."""
    def check_role(current_user: models.User = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permissão insuficiente",
            )
        return current_user
    return Depends(check_role)
