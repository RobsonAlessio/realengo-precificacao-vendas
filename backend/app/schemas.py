import re
from pydantic import BaseModel, Field, field_validator
from datetime import datetime, date
from typing import Literal, Optional


class UserBase(BaseModel):
    username: str


class CreateLocalUserRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64, pattern=r'^[a-zA-Z0-9._\-]+$')
    password: str = Field(min_length=8, max_length=128)
    role: Optional[Literal["admin", "editor", "viewer"]] = None

    @field_validator('username', mode='before')
    @classmethod
    def normalize_username(cls, v: str) -> str:
        return v.strip().lower()


class UpdateUsuarioRequest(BaseModel):
    role: Optional[Literal["admin", "editor", "viewer"]] = None
    is_active: Optional[bool] = None


class ChangePasswordRequest(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)


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
    username: str = Field(min_length=1, max_length=64, pattern=r'^[a-zA-Z0-9._\-]+$')
    password: str = Field(min_length=1, max_length=128)

    @field_validator('username', mode='before')
    @classmethod
    def normalize_username(cls, v: str) -> str:
        return v.strip().lower()


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


_CHANGELOG_TIPOS = Literal["adicionado", "corrigido", "modificado", "removido"]


class ChangelogEntryCreate(BaseModel):
    versao: str = Field(min_length=1, max_length=30)
    data_lancamento: date
    tipo: _CHANGELOG_TIPOS
    titulo: str = Field(min_length=1, max_length=200)
    descricao: Optional[str] = Field(default=None, max_length=1000)
    git_commit: Optional[str] = None


class ChangelogEntryUpdate(BaseModel):
    versao: Optional[str] = Field(default=None, min_length=1, max_length=30)
    data_lancamento: Optional[date] = None
    tipo: Optional[_CHANGELOG_TIPOS] = None
    titulo: Optional[str] = Field(default=None, min_length=1, max_length=200)
    descricao: Optional[str] = Field(default=None, max_length=1000)
    git_commit: Optional[str] = None


class ChangelogEntryResponse(BaseModel):
    id: int
    versao: str
    data_lancamento: date
    tipo: str
    titulo: str
    descricao: Optional[str] = None
    criado_em: datetime
    criado_por: Optional[str] = None
    git_commit: Optional[str] = None

    class Config:
        from_attributes = True


# --- Config (precificacao.json) ---

# Whitelist: apenas letras, números, operadores matemáticos, parênteses,
# espaços, underscore e ponto — impede code injection nas fórmulas.
_FORMULA_RE = re.compile(r'^[a-zA-Z0-9_\s\+\-\*/\(\)\.,]+$')


class ConfigVariavel(BaseModel):
    campo: str = Field(min_length=1, max_length=100)
    label: str = Field(min_length=1, max_length=100)
    formato: Optional[str] = None
    campo_sc: Optional[str] = None


class ConfigCalculo(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    label: str = Field(min_length=1, max_length=100)
    formula: str = Field(min_length=1, max_length=500)
    formato: Optional[str] = None
    grupo: Optional[str] = None
    ativo: bool = True
    variaveis: Optional[list[ConfigVariavel]] = None

    @field_validator('formula')
    @classmethod
    def formula_segura(cls, v: str) -> str:
        if not _FORMULA_RE.match(v):
            raise ValueError('Fórmula contém caracteres não permitidos')
        return v


class ConfigColuna(BaseModel):
    campo: str = Field(min_length=1, max_length=100)
    label: str = Field(min_length=1, max_length=100)
    visivel: bool = True
    formato: Optional[str] = None
    grupo: Optional[str] = None


class ConfigUpdate(BaseModel):
    calculos: Optional[list[ConfigCalculo]] = None
    colunas: Optional[list[ConfigColuna]] = None


# --- Fonte dos Custos (config global) ---

_FONTE_TIPO = Literal["realizado", "parametrizado"]


class FonteCustosResponse(BaseModel):
    fonte_mp: _FONTE_TIPO
    fonte_embalagem: _FONTE_TIPO
    fonte_energia: _FONTE_TIPO
    fonte_renda: _FONTE_TIPO
    atualizado_em: Optional[datetime] = None
    atualizado_por: Optional[str] = None

    class Config:
        from_attributes = True


class FonteCustosUpdate(BaseModel):
    fonte_mp: _FONTE_TIPO = "realizado"
    fonte_embalagem: _FONTE_TIPO = "realizado"
    fonte_energia: _FONTE_TIPO = "realizado"
    fonte_renda: _FONTE_TIPO = "realizado"
