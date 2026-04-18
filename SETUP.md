# Sky-Hosting Setup Guide

Sky-Hosting is a self-hosted deployment platform for GitHub repositories. It deploys Node.js, Python, static sites, and Docker-based apps.

## Quick Start (Local Development)

### Prerequisites
- Node.js 24+
- pnpm 10+
- PostgreSQL 16+

### 1. Clone and Install

```bash
git clone <your-repo>
cd sky-hosting
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/sky_hosting
JWT_SECRET=your-long-random-secret-key
PORT=8080
BASE_DOMAIN=sky-hosting.com
NODE_ENV=development
```

### 3. Setup Database

```bash
# Push schema
pnpm --filter @workspace/db run push

# Create admin account
pnpm --filter @workspace/scripts run seed-admin
```

### 4. Build and Start

```bash
# Build API server
pnpm --filter @workspace/api-server run build

# Start API server
pnpm --filter @workspace/api-server run start

# In another terminal, start the dashboard
pnpm --filter @workspace/admin-dashboard run dev
```

Visit `http://localhost:3000` to access the admin dashboard.

---

## Deploy to Render.com

1. Create a new account at [render.com](https://render.com)
2. Connect your GitHub repo
3. Create a new **Blueprint** and use `render.yaml`
4. Set environment variables in Render dashboard
5. Deploy!

Post-deploy: SSH into the server and run:
```bash
ADMIN_PASSWORD=your-secure-password pnpm --filter @workspace/scripts run seed-admin
```

---

## Deploy to Railway.app

1. Install Railway CLI: `npm i -g @railway/cli`
2. Login: `railway login`
3. Create project: `railway new`
4. Add PostgreSQL: In Railway dashboard → Add Service → Database → PostgreSQL
5. Deploy: `railway up`
6. Set environment variables in Railway dashboard

---

## Deploy with Docker

```bash
# Build and start everything
docker-compose up -d

# Create admin account
docker-compose exec api node --enable-source-maps dist/index.mjs seed
```

---

## API Documentation

### Authentication

All API endpoints require authentication via either:
- **JWT Token** (admin dashboard): `Authorization: Bearer <jwt_token>`
- **API Key** (bot/service integration): `Authorization: Bearer sk_live_<key>`

### Core Endpoints

#### Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{"username": "admin", "password": "your-password"}
```

Response:
```json
{
  "token": "eyJ...",
  "user": {"id": "usr_...", "username": "admin", "role": "admin", ...}
}
```

#### Deploy a Repository
```bash
curl -X POST https://your-domain.com/api/v1/deploy \
  -H "Authorization: Bearer sk_live_xxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "github_url": "https://github.com/user/repo",
    "branch": "main",
    "env_vars": {"NODE_ENV": "production"}
  }'
```

Response:
```json
{
  "id": "dep_abc123",
  "status": "building",
  "liveUrl": "https://repo-abc123.sky-hosting.com",
  "logsUrl": "/api/v1/deployments/dep_abc123",
  ...
}
```

#### Get Deployment Status & Logs
```bash
curl https://your-domain.com/api/v1/deployments/dep_abc123 \
  -H "Authorization: Bearer sk_live_xxxx"
```

#### List Deployments
```bash
curl https://your-domain.com/api/v1/deployments \
  -H "Authorization: Bearer sk_live_xxxx"
```

#### Delete Deployment
```bash
curl -X DELETE https://your-domain.com/api/v1/deployments/dep_abc123 \
  -H "Authorization: Bearer sk_live_xxxx"
```

### Admin Endpoints

#### List Users
```bash
curl https://your-domain.com/api/v1/admin/users \
  -H "Authorization: Bearer <admin_jwt_token>"
```

#### Create User
```bash
curl -X POST https://your-domain.com/api/v1/admin/users \
  -H "Authorization: Bearer <admin_jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{"username": "newuser", "password": "secure123", "role": "user"}'
```

Response includes a one-time `apiKey` field.

#### System Stats
```bash
curl https://your-domain.com/api/v1/admin/stats \
  -H "Authorization: Bearer <admin_jwt_token>"
```

---

## Default Credentials

After running `seed-admin`:
- **Username**: `admin`
- **Password**: `admin123` (change immediately in production!)
- **Admin API Key**: Shown once in terminal output

---

## Environment Variables Reference

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `JWT_SECRET` | Secret for signing JWT tokens | Required |
| `PORT` | API server port | `8080` |
| `BASE_DOMAIN` | Domain for deployed app URLs | `sky-hosting.com` |
| `NODE_ENV` | Environment (`development`/`production`) | `development` |
| `DEPLOY_DIR` | Directory for deployed apps | `~/sky-hosting-apps` |
| `ADMIN_USERNAME` | Initial admin username | `admin` |
| `ADMIN_PASSWORD` | Initial admin password | `admin123` |

---

## Supported Frameworks

| Framework | Auto-Detection | Build Command | Start Command |
|-----------|---------------|---------------|---------------|
| Node.js | `package.json` with `start` script | `npm install && npm run build` | `npm start` |
| Static | `package.json` without `start`, or `index.html` | `npm install && npm run build` | N/A (served statically) |
| Python | `requirements.txt`, `setup.py`, or `pyproject.toml` | `pip install -r requirements.txt` | `python app.py` |
| Go | `go.mod` | `go build -o app ./...` | `./app` |
| Docker | `Dockerfile` present | Docker build | Docker run |

---

## Verification Checklist

- [ ] `GET /api/healthz` returns `{"status":"ok"}`
- [ ] Login via dashboard at `/` with admin credentials
- [ ] Create a new user via Users page — receive API key
- [ ] Deploy a GitHub repo via API key
- [ ] Access deployed app at returned `liveUrl`
- [ ] View build logs in deployment detail page
- [ ] Delete deployment and verify cleanup
