# Deploy no AWS App Runner

O painel (backend FastAPI + frontend React) vai num **único container**: o FastAPI
serve a API em `/api/...` e o painel em `/`, na mesma origem — então **não há CORS**
para configurar. Você builda a imagem uma vez, envia para o registro da AWS (ECR) e o
App Runner cuida de hospedar, HTTPS e escala.

```
   Dockerfile  ──build──▶  imagem  ──push──▶  Amazon ECR  ──▶  App Runner  ──▶  https://....awsapprunner.com
 (front+back)                                  (registro)      (hospeda + HTTPS)
```

> **Custo:** na configuração menor (0.25 vCPU / 0.5 GB), o App Runner sai por volta de
> **US$ 5/mês** mesmo ocioso, porque ele mantém uma instância de pé (não escala a zero).
> Se ficar sem usar por um tempo, dá para **pausar** o serviço no console e o custo de
> computação para.

---

## Pré-requisitos (uma vez)

1. **Conta AWS** com um usuário IAM que tenha permissão de ECR e App Runner. O caminho
   mais rápido: no IAM, anexe as policies gerenciadas `AmazonEC2ContainerRegistryFullAccess`
   e `AWSAppRunnerFullAccess` ao seu usuário, e gere um par de **Access Key / Secret Key**.

2. **Na sua VM de desenvolvimento**, instale Docker e a AWS CLI:
   ```bash
   # Docker
   sudo apt update && sudo apt install -y docker.io
   sudo usermod -aG docker $USER          # depois saia e entre de novo no SSH

   # AWS CLI v2
   curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscliv2.zip
   sudo apt install -y unzip && unzip awscliv2.zip && sudo ./aws/install
   ```

3. **Configure suas credenciais** (cole a Access Key / Secret quando pedir):
   ```bash
   aws configure
   # Default region: us-east-1   (mais barato; use sa-east-1 p/ menor latência no Brasil)
   # Output format:  json
   ```

> **Região:** `us-east-1` (Virgínia) tem os preços citados acima e é a mais econômica.
> `sa-east-1` (São Paulo) reduz a latência no Brasil, mas custa um pouco mais. Para uma
> ferramenta interna de baixo volume, `us-east-1` é uma escolha sensata.

---

## Passo 1 — Criar o repositório no ECR

```bash
aws ecr create-repository --repository-name painel-roadmap --region us-east-1
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "Seu registro: $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com"
```

## Passo 2 — Build da imagem

Na raiz do projeto (onde está o `Dockerfile`):
```bash
docker build -t painel-roadmap .
```

## Passo 3 — Enviar a imagem para o ECR

```bash
# autentica o Docker no seu ECR
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# etiqueta e envia
docker tag painel-roadmap:latest $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/painel-roadmap:latest
docker push $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/painel-roadmap:latest
```

## Passo 4 — Criar o serviço no App Runner (pelo console)

Pelo console é o caminho de menos atrito:

1. AWS Console → **App Runner** → **Create service**.
2. **Source:** *Container registry* → *Amazon ECR* → **Browse** e selecione a imagem
   `painel-roadmap:latest`.
3. **Deployment trigger:** *Manual* (você dispara o redeploy quando enviar uma imagem nova).
4. **ECR access role:** escolha *Create new service role* (deixa o App Runner ler o ECR).
5. **Service settings:**
   - **Virtual CPU:** 0.25 vCPU · **Memory:** 0.5 GB (o menor, para custo mínimo)
   - **Port:** `8080`
   - **Health check** (opcional, recomendado): protocolo HTTP, caminho `/health`
6. **Environment variables** — adicione:
   - `AZURE_ORG` = sua organização (ex.: `nstech`)
   - `AZURE_PROJECT` = seu projeto (ex.: `KMM`)
   - `AZURE_PAT` = seu Personal Access Token *(veja a nota de segurança abaixo)*
   - `ALLOWED_ORIGINS` = a URL do próprio serviço depois que ele subir (opcional —
     como front e back têm a mesma origem, o CORS não é acionado)
7. **Create & deploy.** Em alguns minutos o serviço fica *Running* e o App Runner te dá
   uma URL `https://xxxxx.us-east-1.awsapprunner.com`. Abra: é o painel, já puxando os
   dados reais do Azure DevOps.

---

## Atualizar a aplicação depois

Toda vez que mudar o código:
```bash
docker build -t painel-roadmap .
docker tag painel-roadmap:latest $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/painel-roadmap:latest
docker push $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/painel-roadmap:latest
```
Depois, no console do App Runner, clique em **Deploy** (ou deixe o trigger em *Automatic*
para ele redesdobrar sozinho a cada push — custa US$ 1/mês a mais por app).

---

## Segurança do PAT

Colocar o `AZURE_PAT` como variável de ambiente direta **funciona** e é o caminho mais
rápido para começar (a AWS criptografa em repouso). A ressalva: quem tiver acesso ao
console da conta consegue vê-lo.

Quando quiser apertar isso, mova o token para o **AWS Secrets Manager**:
```bash
aws secretsmanager create-secret --name roadmap/azure-pat \
  --secret-string "SEU_PAT" --region us-east-1
```
e, na configuração do App Runner, referencie o secret na variável `AZURE_PAT` em vez do
valor literal (o App Runner pede uma *instance role* com permissão de leitura do secret).
Posso te passar esse ajuste quando chegar a hora.

---

## Desenvolvimento local (antes de cada deploy)

Para rodar o conjunto na VM e testar com dados reais antes de publicar:

```bash
# terminal 1 — backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # preencha org/projeto/PAT
uvicorn main:app --reload   # http://localhost:8000

# terminal 2 — frontend (o Vite faz proxy de /api para o backend)
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

O painel em `localhost:5173` chama `/api/roadmap`, o Vite encaminha para o backend, e você
vê os dados reais. Quando estiver bom, é só buildar a imagem e seguir os passos de deploy.
