from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.database import get_db
from app import models, schemas, auth as auth_utils
from app.audit import log_audit

router = APIRouter(prefix="/changelog", tags=["changelog"])


def _serialize(entry: models.ChangelogEntry) -> dict:
    return {
        "id": entry.id,
        "versao": entry.versao,
        "data_lancamento": entry.data_lancamento.isoformat() if entry.data_lancamento else None,
        "tipo": entry.tipo,
        "titulo": entry.titulo,
        "descricao": entry.descricao,
        "criado_em": (entry.criado_em.isoformat() + "Z") if entry.criado_em else None,
        "criado_por": entry.criado_por,
    }


@router.get("")
def list_changelog(
    current_user: models.User = auth_utils.require_role("admin"),
    db: Session = Depends(get_db),
):
    """Lista todas as entradas do histórico de versões, ordenadas por data decrescente."""
    entries = (
        db.query(models.ChangelogEntry)
        .order_by(desc(models.ChangelogEntry.data_lancamento), desc(models.ChangelogEntry.id))
        .all()
    )
    return [_serialize(e) for e in entries]


@router.post("", status_code=201)
def create_changelog(
    payload: schemas.ChangelogEntryCreate,
    current_user: models.User = auth_utils.require_role("admin"),
    db: Session = Depends(get_db),
):
    """Cria uma nova entrada no histórico de versões (admin only)."""
    entry = models.ChangelogEntry(
        versao=payload.versao.strip(),
        data_lancamento=payload.data_lancamento,
        tipo=payload.tipo,
        titulo=payload.titulo.strip(),
        descricao=payload.descricao.strip() if payload.descricao else None,
        criado_por=current_user.username,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    log_audit(db, current_user.id, "CHANGELOG_CREATE", "success", {
        "entry_id": entry.id,
        "versao": entry.versao,
        "tipo": entry.tipo,
        "titulo": entry.titulo,
        "created_by": current_user.username,
    })
    return _serialize(entry)


@router.put("/{entry_id}")
def update_changelog(
    entry_id: int,
    payload: schemas.ChangelogEntryUpdate,
    current_user: models.User = auth_utils.require_role("admin"),
    db: Session = Depends(get_db),
):
    """Atualiza uma entrada do histórico de versões (admin only)."""
    entry = db.query(models.ChangelogEntry).filter_by(id=entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entrada não encontrada")

    if payload.versao is not None:
        entry.versao = payload.versao.strip()
    if payload.data_lancamento is not None:
        entry.data_lancamento = payload.data_lancamento
    if payload.tipo is not None:
        entry.tipo = payload.tipo
    if payload.titulo is not None:
        entry.titulo = payload.titulo.strip()
    if payload.descricao is not None:
        entry.descricao = payload.descricao.strip() if payload.descricao else None

    db.commit()
    db.refresh(entry)
    log_audit(db, current_user.id, "CHANGELOG_UPDATE", "success", {
        "entry_id": entry.id,
        "versao": entry.versao,
        "tipo": entry.tipo,
        "titulo": entry.titulo,
        "updated_by": current_user.username,
    })
    return _serialize(entry)


@router.delete("/{entry_id}")
def delete_changelog(
    entry_id: int,
    current_user: models.User = auth_utils.require_role("admin"),
    db: Session = Depends(get_db),
):
    """Remove uma entrada do histórico de versões (admin only)."""
    entry = db.query(models.ChangelogEntry).filter_by(id=entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entrada não encontrada")

    versao = entry.versao
    titulo = entry.titulo
    db.delete(entry)
    db.commit()
    log_audit(db, current_user.id, "CHANGELOG_DELETE", "success", {
        "entry_id": entry_id,
        "versao": versao,
        "titulo": titulo,
        "deleted_by": current_user.username,
    })
    return {"deleted": entry_id}
