# ---------- Stage 1: build do frontend React ----------
FROM node:20-slim AS frontend
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build          # gera /app/dist

# ---------- Stage 2: runtime (FastAPI serve API + estáticos) ----------
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
# o build do front entra como ./static, que o FastAPI serve em "/"
COPY --from=frontend /app/dist ./static
# App Runner usa a porta 8080 por padrão
EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
