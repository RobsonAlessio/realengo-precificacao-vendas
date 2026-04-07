from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import Base, engine, SessionLocal
from app import models
from app.auth import hash_password
from app.routes import auth, prices, config, representantes, admin

app = FastAPI(title="Precificação de Vendas Realengo", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
        # Cria usuário admin padrão se não existir
        admin_user = db.query(models.User).filter(models.User.username == "admin").first()
        if not admin_user:
            admin_user = models.User(
                username="admin",
                hashed_password=hash_password("admin123"),
                is_active=True,
                role="admin",
            )
            db.add(admin_user)
            db.commit()
            print("Usuário admin criado com senha padrão: admin123")
        elif not admin_user.role:
            # Se admin não tem role, atribui agora
            admin_user.role = "admin"
            db.commit()
            print("Role admin atribuído ao usuário admin")

    finally:
        db.close()


@app.get("/health")
def health():
    return {"status": "ok"}
