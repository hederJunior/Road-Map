"""Configuração da aplicação, carregada de variáveis de ambiente (.env)."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Azure DevOps
    azure_org: str                          # ex: "nstech" (https://dev.azure.com/<org>)
    azure_project: str                      # ex: "KMM" (nome ou GUID do projeto)
    azure_pat: str                          # Personal Access Token (escopo Work Items - Read)
    azure_api_version: str = "7.1"

    # Tipos de work item que entram no roadmap (ajuste se seu processo usa nomes custom)
    epic_type: str = "Epic"
    feature_type: str = "Feature"

    # CORS - origem do frontend (Vite dev = 5173, ajuste em produção)
    allowed_origins: str = "http://localhost:5173,http://localhost:3000"

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def base_url(self) -> str:
        return f"https://dev.azure.com/{self.azure_org}/{self.azure_project}/_apis"


@lru_cache
def get_settings() -> Settings:
    return Settings()
