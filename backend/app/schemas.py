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
