"""Adaptador para AWS Lambda via Mangum.

Deploy:
  - configure as env vars (AZURE_ORG, AZURE_PROJECT, AZURE_PAT, ALLOWED_ORIGINS)
    no Lambda; guarde o PAT no Secrets Manager / SSM Parameter Store, não no código.
  - handler = lambda_handler.handler
  - empacote com: pip install -r requirements.txt -t package/ && zip -r ...
    (ou use container image / AWS SAM).
"""
from mangum import Mangum
from main import app

handler = Mangum(app)
