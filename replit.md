# Sky-Hosting

## Overview

Sky-Hosting is a production-ready self-hosted deployment platform — a Heroku/Vercel alternative. It deploys Node.js, Python, static sites, Go, and Docker applications from GitHub URLs, returning live HTTPS URLs.

## Architecture

- **Admin Dashboard** (`artifacts/admin-dashboard`): React + Vite web app at `/` — dark, dense cockpit UI for managing users, deployments, and system settings
- **API Server** (`artifacts/api-server`): Express 5 REST API at `/api` — handles deployments, auth, admin operations
- **Database** (`lib/db`): PostgreSQL + Drizzle ORM with tables for users, deployments, settings, activity

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: JWT (dashboard sessions) + API keys (bot/service integration)
- **Frontend**: React + Vite + Tailwind + shadcn/ui + TanStack Query

## Key API Endpoints

- `POST /api/v1/auth/login` — Login, returns JWT
- `GET /api/v1/auth/me` — Current user
- `POST /api/v1/deploy` — Deploy a GitHub repository
- `GET /api/v1/deployments` — List user's deployments
- `GET /api/v1/deployments/:id` — Deployment detail + logs
- `DELETE /api/v1/deployments/:id` — Remove deployment
- `POST /api/v1/deployments/:id/restart` — Restart deployment
- `GET /api/v1/admin/users` — List all users (admin)
- `POST /api/v1/admin/users` — Create user with API key (admin)
- `GET /api/v1/admin/stats` — System statistics (admin)
- `GET /api/v1/admin/settings` — System settings (admin)

## Default Credentials

- **Admin Username**: `admin`
- **Admin Password**: `admin123`
- **API Key**: Generated on seed (shown once in terminal)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas
- `pnpm --filter @workspace/db run push` — push DB schema changes
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/scripts run seed-admin` — create initial admin account

## Deployment Configuration Files

- `render.yaml` — One-click Render.com deployment
- `railway.json` + `railway.toml` — Railway.app deployment
- `Dockerfile` — Docker containerization
- `docker-compose.yml` — Local Docker Compose setup
- `SETUP.md` — Full setup and API documentation

## Database Tables

- `users` — User accounts with hashed passwords and API keys
- `deployments` — Deployment records with status, logs, env vars
- `system_settings` — Global platform configuration (singleton)
- `activity` — Audit log of platform events

## Supported Frameworks (Auto-detected)

- Node.js (package.json with start script)
- Static (package.json build-only, or index.html)
- Python (requirements.txt / setup.py / pyproject.toml)
- Go (go.mod)
- Docker (Dockerfile)
