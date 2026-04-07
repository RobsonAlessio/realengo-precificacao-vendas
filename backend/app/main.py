import os
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.limiter import limiter
from app.database import Base, engine, SessionLocal
from app import models
from app.auth import hash_password
from app.routes import auth, prices, config, representantes, admin

logger = logging.getLogger(__name__)

app = FastAPI(title="Precificação de Vendas Realengo", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://192.168.0.236:3000,https://precificacao.realengo.com.br",
)
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    max_age=3600,
)

app.include_router(auth.router)
app.include_router(prices.router)
app.include_router(config.router)
app.include_router(representantes.router)
app.include_router(admin.router)


@app.on_event("startup")
def startup():
    # Migrations gerenciadas pelo Alembic (alembic upgrade head).
    # Não usar Base.metadata.create_all() — o schema é controlado via
    # /home/suporte/precificacao/backend/alembic/versions/

    db = SessionLocal()
    try:
        admin_user = db.query(models.User).filter(models.User.username == "admin").first()
        if not admin_user:
            initial_password = os.getenv("ADMIN_INITIAL_PASSWORD")
            if not initial_password:
                raise RuntimeError(
                    "ADMIN_INITIAL_PASSWORD não definida. "
                    "Configure esta variável no .env antes de iniciar o servidor."
                )
            admin_user = models.User(
                username="admin",
                hashed_password=hash_password(initial_password),
                is_active=True,
                role="admin",
                auth_provider="local",
            )
            db.add(admin_user)
            db.commit()
            logger.info("Usuário admin criado com sucesso.")
        elif not admin_user.role:
            admin_user.role = "admin"
            db.commit()
            logger.info("Role admin atribuído ao usuário admin.")
    finally:
        db.close()


@app.get("/health")
def health():
    return {"status": "ok"}
