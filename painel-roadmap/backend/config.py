"""Configuração da aplicação, carregada de variáveis de ambiente (.env)."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Azure DevOps
    azure_org: str                          # ex: "nstech" (https://dev.azure.com/<org>)
    azure_project: str                      # projeto padrão / primeiro da lista
    azure_extra_projects: str = ""          # projetos adicionais separados por vírgula, ex: "KMM5"
    azure_pat: str                          # Personal Access Token (escopo Work Items - Read)
    azure_api_version: str = "7.1"

    # Tipos de work item que entram no roadmap (ajuste se seu processo usa nomes custom)
    epic_type: str = "Epic"
    feature_type: str = "Feature"
    teste_type: str = "PBI"
    


    # CORS - origem do frontend (Vite dev = 5173, ajuste em produção)
    allowed_origins: str = "http://localhost:5173,http://localhost:3000"

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def projects(self) -> list[str]:
        extras = [p.strip() for p in self.azure_extra_projects.split(",") if p.strip()]
        return [self.azure_project] + extras

    def project_base_url(self, project: str) -> str:
        return f"https://dev.azure.com/{self.azure_org}/{project}/_apis"

    @property
    def base_url(self) -> str:
        return self.project_base_url(self.azure_project)


@lru_cache
def get_settings() -> Settings:
    return Settings()
