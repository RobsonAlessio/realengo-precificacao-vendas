from pydantic import BaseModel
from datetime import datetime, date
from typing import Optional


class UserBase(BaseModel):
    username: str


class CreateLocalUserRequest(BaseModel):
    username: str
    password: str
    role: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    new_password: str


class UserResponse(UserBase):
    id: int
    is_active: bool
    role: Optional[str] = None
    auth_provider: str = "local"
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str


class LoginRequest(BaseModel):
    username: str
    password: str


class ParametroRepresentanteBase(BaseModel):
    representante: str
    data_vigencia: date
    meta_frete_1: Optional[float] = None
    meta_frete_2: Optional[float] = None
    meta_frete_3: Optional[float] = None
    margem_parbo: Optional[float] = None
    margem_branco: Optional[float] = None
    margem_integral: Optional[float] = None


class ParametroRepresentanteCreate(ParametroRepresentanteBase):
    pass


class ParametroRepresentanteResponse(ParametroRepresentanteBase):
    id: int
    codigo_representante: Optional[int] = None
    criado_em: datetime
    atualizado_em: datetime

    class Config:
        from_attributes = True


class RepresentanteAtivo(BaseModel):
    codigo: Optional[int] = None
    fantasia: str


class RepresentanteComParams(BaseModel):
    codigo: Optional[int] = None
    representante: str
    parametros: list[ParametroRepresentanteResponse]
    fallback_parquet: Optional[dict] = None


class ParametrosResponse(BaseModel):
    mes: str
    representantes: list[RepresentanteComParams]


class ImportarParquetResponse(BaseModel):
    importados: int
    pulados: int
    erros: list[str]


class ParametroGeralBase(BaseModel):
    data_vigencia: date
    mp_parbo_saco:    Optional[float] = None
    mp_branco_saco:   Optional[float] = None
    embalagem_parbo:  Optional[float] = None
    embalagem_branco: Optional[float] = None
    energia_parbo:    Optional[float] = None
    energia_branco:   Optional[float] = None
    renda_parbo:      Optional[float] = None
    renda_branco:     Optional[float] = None


class ParametroGeralCreate(ParametroGeralBase):
    pass


class ParametroGeralResponse(ParametroGeralBase):
    id: int
    criado_em: datetime
    atualizado_em: datetime

    class Config:
        from_attributes = True


class ParametrosGeraisListResponse(BaseModel):
    mes: str
    vigencias: list[ParametroGeralResponse]


class ChangelogEntryCreate(BaseModel):
    versao: str
    data_lancamento: date
    tipo: str   # adicionado | corrigido | modificado | removido
    titulo: str
    descricao: Optional[str] = None


class ChangelogEntryUpdate(BaseModel):
    versao: Optional[str] = None
    data_lancamento: Optional[date] = None
    tipo: Optional[str] = None
    titulo: Optional[str] = None
    descricao: Optional[str] = None


class ChangelogEntryResponse(BaseModel):
    id: int
    versao: str
    data_lancamento: date
    tipo: str
    titulo: str
    descricao: Optional[str] = None
    criado_em: datetime
    criado_por: Optional[str] = None

    class Config:
        from_attributes = True
