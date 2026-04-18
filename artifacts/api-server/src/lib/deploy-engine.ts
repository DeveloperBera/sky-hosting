import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { db, deploymentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { logActivity } from "./activity";
import { startProcess, stopProcess, resolveNodeStartCommand } from "./process-manager";

const execAsync = promisify(exec);

const DEPLOY_BASE_DIR = process.env.DEPLOY_DIR || path.join(os.homedir(), "sky-hosting-apps");
const BASE_DOMAIN = process.env.BASE_DOMAIN || "sky-hosting.com";

export function getDeploymentDir(deploymentId: string): string {
  return path.join(DEPLOY_BASE_DIR, deploymentId);
}

export function getLiveUrl(subdomain: string): string {
  const replit_domain = process.env.REPLIT_DEV_DOMAIN;
  if (replit_domain) {
    return `https://${replit_domain}/api/proxy/${subdomain}`;
  }
  return `https://${subdomain}.${BASE_DOMAIN}`;
}

interface FrameworkInfo {
  name: "nodejs" | "python" | "static" | "docker" | "go" | "ruby" | "bun";
  buildCmd: string | null;
  startCmd: string | null;
}

export async function detectFramework(repoDir: string): Promise<FrameworkInfo> {
  const files = fs.readdirSync(repoDir);

  // Docker first — always explicit
  if (files.includes("Dockerfile")) {
    return { name: "docker", buildCmd: null, startCmd: null };
  }

  // Bun
  if (files.includes("bun.lockb") || files.includes("bun.lock")) {
    const startCmd = resolveBunStartCmd(repoDir);
    return {
      name: "bun",
      buildCmd: "bun install",
      startCmd,
    };
  }

  // Node.js / Static
  if (files.includes("package.json")) {
    const pkgPath = path.join(repoDir, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
      scripts?: Record<string, string>;
      main?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const hasStart = !!pkg.scripts?.start;
    const hasBuild = !!pkg.scripts?.build;
    const hasNext = !!(pkg.dependencies?.next || pkg.devDependencies?.next);
    const hasNuxt = !!(pkg.dependencies?.nuxt || pkg.devDependencies?.nuxt);
    const hasVite = !!(pkg.devDependencies?.vite || pkg.dependencies?.vite);
    const hasReact = !!(pkg.dependencies?.react || pkg.devDependencies?.react);

    const buildCmd = hasBuild
      ? "npm ci --include=dev 2>/dev/null || npm install && npm run build"
      : "npm ci 2>/dev/null || npm install";

    if (hasNext) {
      const resolvedStart = resolveNodeStartCommand(repoDir, pkg.scripts?.start || "next start");
      return { name: "nodejs", buildCmd, startCmd: resolvedStart };
    }

    if (hasNuxt) {
      return { name: "nodejs", buildCmd, startCmd: "node .output/server/index.mjs" };
    }

    // Static site builders — no start script or only a build
    if ((hasVite || hasReact) && !hasStart && hasBuild) {
      return { name: "static", buildCmd, startCmd: null };
    }

    if (hasStart) {
      const resolvedStart = resolveNodeStartCommand(repoDir, pkg.scripts.start);
      return { name: "nodejs", buildCmd, startCmd: resolvedStart };
    }

    // Only a build script, no server → static
    if (hasBuild && !hasStart) {
      return { name: "static", buildCmd, startCmd: null };
    }

    // Has an index.html → static
    if (files.includes("index.html")) {
      return { name: "static", buildCmd: null, startCmd: null };
    }

    // Default Node.js
    const main = pkg.main || "index.js";
    return {
      name: "nodejs",
      buildCmd: "npm ci 2>/dev/null || npm install",
      startCmd: `node ${main}`,
    };
  }

  // Python
  if (files.includes("requirements.txt") || files.includes("setup.py") || files.includes("pyproject.toml")) {
    const buildCmd = files.includes("requirements.txt")
      ? "pip install -r requirements.txt"
      : files.includes("pyproject.toml")
        ? "pip install ."
        : "python setup.py install";

    // Detect entry point
    const serverFiles = ["app.py", "main.py", "server.py", "run.py", "wsgi.py", "asgi.py", "manage.py"];
    const serverFile = serverFiles.find((f) => files.includes(f)) || "app.py";

    let startCmd = `python ${serverFile}`;
    if (serverFile === "manage.py") startCmd = "python manage.py runserver 0.0.0.0:$PORT";
    else if (serverFile === "wsgi.py") startCmd = "gunicorn wsgi:app";

    return { name: "python", buildCmd, startCmd };
  }

  // Go
  if (files.includes("go.mod")) {
    return {
      name: "go",
      buildCmd: "go mod download && go build -o app ./...",
      startCmd: "./app",
    };
  }

  // Ruby
  if (files.includes("Gemfile")) {
    const hasRails = fs.existsSync(path.join(repoDir, "config", "application.rb"));
    return {
      name: "ruby",
      buildCmd: "bundle install",
      startCmd: hasRails ? "bundle exec rails server -b 0.0.0.0 -p $PORT" : "bundle exec ruby app.rb",
    };
  }

  // Bare HTML
  if (files.includes("index.html")) {
    return { name: "static", buildCmd: null, startCmd: null };
  }

  return { name: "static", buildCmd: null, startCmd: null };
}

function resolveBunStartCmd(repoDir: string): string {
  const pkgPath = path.join(repoDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { scripts?: Record<string, string>; main?: string };
    if (pkg.scripts?.start) return `bun run start`;
    if (pkg.main) return `bun ${pkg.main}`;
  }
  return "bun index.ts";
}

export async function appendLog(deploymentId: string, logLine: string, logType: "build" | "runtime" = "build"): Promise<void> {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${logLine}\n`;

  const field = logType === "build" ? "buildLogs" : "runtimeLogs";
  const [current] = await db.select({ buildLogs: deploymentsTable.buildLogs, runtimeLogs: deploymentsTable.runtimeLogs })
    .from(deploymentsTable)
    .where(eq(deploymentsTable.id, deploymentId));

  if (!current) return;

  const existing = (logType === "build" ? current.buildLogs : current.runtimeLogs) || "";

  // Keep last 200KB of logs
  const newLog = (existing + line).slice(-200_000);

  await db.update(deploymentsTable)
    .set({ [field]: newLog } as Record<string, string>)
    .where(eq(deploymentsTable.id, deploymentId));
}

export async function runDeployment(deploymentId: string): Promise<void> {
  const [deployment] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, deploymentId));
  if (!deployment) {
    logger.error({ deploymentId }, "Deployment not found");
    return;
  }

  const deployDir = getDeploymentDir(deploymentId);

  try {
    // Stop any existing process for this subdomain
    if (deployment.subdomain) await stopProcess(deployment.subdomain).catch(() => {});

    await db.update(deploymentsTable)
      .set({ status: "building", buildLogs: "", runtimeLogs: "", errorMessage: null })
      .where(eq(deploymentsTable.id, deploymentId));

    if (!fs.existsSync(DEPLOY_BASE_DIR)) {
      fs.mkdirSync(DEPLOY_BASE_DIR, { recursive: true });
    }

    if (fs.existsSync(deployDir)) {
      fs.rmSync(deployDir, { recursive: true, force: true });
    }

    await appendLog(deploymentId, `=== Sky-Hosting Deploy ===`);
    await appendLog(deploymentId, `Repository: ${deployment.githubUrl}`);
    await appendLog(deploymentId, `Branch: ${deployment.branch}`);
    await appendLog(deploymentId, `Cloning repository...`);

    let cloneUrl = deployment.githubUrl;
    if (deployment.githubToken) {
      const url = new URL(deployment.githubUrl);
      cloneUrl = `https://${deployment.githubToken}@${url.host}${url.pathname}`;
    }

    try {
      await execAsync(
        `git clone --depth 1 --branch ${deployment.branch} "${cloneUrl}" "${deployDir}"`,
        { timeout: 120000 }
      );
      await appendLog(deploymentId, `✓ Repository cloned`);
    } catch (err: unknown) {
      const error = err as { message?: string; stderr?: string };
      const msg = error.stderr || error.message || "Unknown clone error";
      await appendLog(deploymentId, `✗ Clone failed: ${msg}`);
      await db.update(deploymentsTable)
        .set({ status: "failed", errorMessage: `Clone failed: ${msg}` })
        .where(eq(deploymentsTable.id, deploymentId));
      return;
    }

    // Detect framework (or use override)
    let framework: FrameworkInfo;
    if (deployment.framework) {
      // User-specified framework — still auto-detect build/start
      const detected = await detectFramework(deployDir);
      framework = {
        name: deployment.framework as FrameworkInfo["name"],
        buildCmd: deployment.buildCommand || detected.buildCmd,
        startCmd: deployment.startCommand || detected.startCmd,
      };
    } else {
      framework = await detectFramework(deployDir);
      if (deployment.buildCommand) framework.buildCmd = deployment.buildCommand;
      if (deployment.startCommand) framework.startCmd = deployment.startCommand;
    }

    await appendLog(deploymentId, `✓ Framework detected: ${framework.name}`);

    await db.update(deploymentsTable)
      .set({ framework: framework.name as "nodejs" | "python" | "static" | "docker" | "go" })
      .where(eq(deploymentsTable.id, deploymentId));

    // Build step
    if (framework.buildCmd) {
      await appendLog(deploymentId, `\n=== Build ===`);
      await appendLog(deploymentId, `$ ${framework.buildCmd}`);
      try {
        const envStr = buildEnvString(deployment.envVarsEncrypted);
        const { stdout: buildOut, stderr: buildErr } = await execAsync(
          framework.buildCmd,
          {
            cwd: deployDir,
            timeout: 600_000,
            env: { ...process.env, ...envStr, PORT: "3000" },
          }
        );
        if (buildOut) await appendLog(deploymentId, buildOut);
        if (buildErr) await appendLog(deploymentId, buildErr);
        await appendLog(deploymentId, `✓ Build completed`);
      } catch (err: unknown) {
        const error = err as { message?: string; stdout?: string; stderr?: string };
        if (error.stdout) await appendLog(deploymentId, error.stdout);
        if (error.stderr) await appendLog(deploymentId, error.stderr);
        await appendLog(deploymentId, `✗ Build failed: ${error.message}`);
        await db.update(deploymentsTable)
          .set({ status: "failed", errorMessage: `Build failed: ${error.message}` })
          .where(eq(deploymentsTable.id, deploymentId));
        return;
      }
    }

    const subdomain = deployment.subdomain!;
    const liveUrl = getLiveUrl(subdomain);

    if (framework.name === "static") {
      const distDir = findStaticDir(deployDir);
      await appendLog(deploymentId, `\n=== Deploy ===`);
      await appendLog(deploymentId, `✓ Static site ready: ${distDir}`);
      await db.update(deploymentsTable)
        .set({
          status: "running",
          liveUrl,
          deployedAt: new Date(),
          buildCommand: framework.buildCmd,
          startCommand: null,
        })
        .where(eq(deploymentsTable.id, deploymentId));
      await appendLog(deploymentId, `🌐 Live at: ${liveUrl}`);

    } else if (framework.startCmd) {
      await appendLog(deploymentId, `\n=== Start ===`);
      await appendLog(deploymentId, `$ ${framework.startCmd}`);

      const envVars = buildEnvString(deployment.envVarsEncrypted);
      const assignedPort = await startProcess(deploymentId, subdomain, framework.startCmd, envVars);

      await db.update(deploymentsTable)
        .set({
          status: "running",
          liveUrl,
          deployedAt: new Date(),
          buildCommand: framework.buildCmd,
          startCommand: framework.startCmd,
          port: assignedPort,
        })
        .where(eq(deploymentsTable.id, deploymentId));

      await appendLog(deploymentId, `✓ Process started on port ${assignedPort}`);
      await appendLog(deploymentId, `🌐 Live at: ${liveUrl}`);
    }

    await logActivity({
      type: "deployment_success",
      message: `Deployment ${deployment.name} is now running`,
      userId: deployment.userId,
      username: "system",
      deploymentId: deployment.id,
      deploymentName: deployment.name,
    });

  } catch (err: unknown) {
    const error = err as { message?: string };
    logger.error({ err, deploymentId }, "Unexpected deployment error");
    await appendLog(deploymentId, `✗ Unexpected error: ${error.message}`);
    await db.update(deploymentsTable)
      .set({ status: "failed", errorMessage: `Unexpected error: ${error.message}` })
      .where(eq(deploymentsTable.id, deploymentId));
  }
}

export function findStaticDir(repoDir: string): string {
  const candidates = ["dist", "build", "out", "public", "_site", "www", ".next/static"];
  for (const dir of candidates) {
    const p = path.join(repoDir, dir);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
  }
  return repoDir;
}

function buildEnvString(envVarsEncrypted: string | null | undefined): Record<string, string> {
  if (!envVarsEncrypted) return {};
  try {
    return JSON.parse(envVarsEncrypted) as Record<string, string>;
  } catch {
    return {};
  }
}
