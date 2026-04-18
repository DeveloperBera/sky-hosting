import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { db, deploymentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { logActivity } from "./activity";
import { startProcess, stopProcess } from "./process-manager";

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

export async function detectFramework(repoDir: string): Promise<string> {
  const files = fs.readdirSync(repoDir);

  if (files.includes("Dockerfile")) return "docker";
  if (files.includes("package.json")) {
    const pkgJson = JSON.parse(fs.readFileSync(path.join(repoDir, "package.json"), "utf-8"));
    if (pkgJson.dependencies?.next || pkgJson.devDependencies?.next) return "nodejs";
    if (pkgJson.scripts?.build && !pkgJson.scripts?.start) return "static";
    return "nodejs";
  }
  if (files.includes("requirements.txt") || files.includes("setup.py") || files.includes("pyproject.toml")) return "python";
  if (files.includes("go.mod")) return "go";
  if (files.includes("index.html")) return "static";
  return "static";
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
  const newLog = existing + line;

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
    await db.update(deploymentsTable)
      .set({ status: "building", buildLogs: "" })
      .where(eq(deploymentsTable.id, deploymentId));

    if (!fs.existsSync(DEPLOY_BASE_DIR)) {
      fs.mkdirSync(DEPLOY_BASE_DIR, { recursive: true });
    }

    if (fs.existsSync(deployDir)) {
      fs.rmSync(deployDir, { recursive: true, force: true });
    }

    await appendLog(deploymentId, `Cloning repository: ${deployment.githubUrl} (branch: ${deployment.branch})`);

    let cloneUrl = deployment.githubUrl;
    if (deployment.githubToken) {
      const url = new URL(deployment.githubUrl);
      cloneUrl = `https://${deployment.githubToken}@${url.host}${url.pathname}`;
    }

    try {
      const { stdout: cloneOut, stderr: cloneErr } = await execAsync(
        `git clone --depth 1 --branch ${deployment.branch} ${cloneUrl} ${deployDir}`,
        { timeout: 120000 }
      );
      if (cloneOut) await appendLog(deploymentId, cloneOut);
      if (cloneErr) await appendLog(deploymentId, cloneErr);
    } catch (err: unknown) {
      const error = err as { message?: string };
      await appendLog(deploymentId, `Clone failed: ${error.message}`);
      await db.update(deploymentsTable)
        .set({ status: "failed", errorMessage: `Clone failed: ${error.message}` })
        .where(eq(deploymentsTable.id, deploymentId));
      return;
    }

    const framework = deployment.framework || await detectFramework(deployDir);
    await appendLog(deploymentId, `Detected framework: ${framework}`);

    await db.update(deploymentsTable)
      .set({ framework: framework as "nodejs" | "python" | "static" | "docker" | "go" })
      .where(eq(deploymentsTable.id, deploymentId));

    let buildCmd = deployment.buildCommand;
    let startCmd = deployment.startCommand;

    if (framework === "nodejs") {
      buildCmd = buildCmd || "npm install && npm run build 2>/dev/null || npm install";
      startCmd = startCmd || "npm start";
    } else if (framework === "python") {
      buildCmd = buildCmd || "pip install -r requirements.txt 2>/dev/null || pip install -r setup.py 2>/dev/null || echo 'No dependencies found'";
      startCmd = startCmd || "python app.py";
    } else if (framework === "static") {
      buildCmd = buildCmd || "npm install && npm run build 2>/dev/null || echo 'No build step'";
      startCmd = null;
    } else if (framework === "go") {
      buildCmd = buildCmd || "go build -o app ./...";
      startCmd = startCmd || "./app";
    }

    if (buildCmd) {
      await appendLog(deploymentId, `Running build: ${buildCmd}`);
      try {
        const envStr = buildEnvString(deployment.envVarsEncrypted);
        const { stdout: buildOut, stderr: buildErr } = await execAsync(
          buildCmd,
          { cwd: deployDir, timeout: 600000, env: { ...process.env, ...envStr } }
        );
        if (buildOut) await appendLog(deploymentId, buildOut);
        if (buildErr) await appendLog(deploymentId, buildErr);
        await appendLog(deploymentId, "Build completed successfully");
      } catch (err: unknown) {
        const error = err as { message?: string; stdout?: string; stderr?: string };
        if (error.stdout) await appendLog(deploymentId, error.stdout);
        if (error.stderr) await appendLog(deploymentId, error.stderr);
        await appendLog(deploymentId, `Build failed: ${error.message}`);
        await db.update(deploymentsTable)
          .set({ status: "failed", errorMessage: `Build failed: ${error.message}` })
          .where(eq(deploymentsTable.id, deploymentId));
        return;
      }
    }

    const subdomain = deployment.subdomain!;
    const liveUrl = getLiveUrl(subdomain);

    if (framework === "static") {
      const distDir = findStaticDir(deployDir);
      await appendLog(deploymentId, `Static site ready at: ${distDir}`);
      await db.update(deploymentsTable)
        .set({
          status: "running",
          liveUrl,
          deployedAt: new Date(),
          buildCommand: buildCmd,
          startCommand: null,
        })
        .where(eq(deploymentsTable.id, deploymentId));
      await appendLog(deploymentId, `Static site deployed at: ${liveUrl}`);
    } else if (startCmd) {
      await appendLog(deploymentId, `Starting application with: ${startCmd}`);
      const envVars = buildEnvString(deployment.envVarsEncrypted);
      const assignedPort = await startProcess(deploymentId, subdomain, startCmd, envVars);

      await db.update(deploymentsTable)
        .set({
          status: "running",
          liveUrl,
          deployedAt: new Date(),
          buildCommand: buildCmd,
          startCommand: startCmd,
          port: assignedPort,
        })
        .where(eq(deploymentsTable.id, deploymentId));
      await appendLog(deploymentId, `Application live at: ${liveUrl} (internal port: ${assignedPort})`);
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
    await appendLog(deploymentId, `Unexpected error: ${error.message}`);
    await db.update(deploymentsTable)
      .set({ status: "failed", errorMessage: `Unexpected error: ${error.message}` })
      .where(eq(deploymentsTable.id, deploymentId));
  }
}

function findStaticDir(repoDir: string): string {
  const candidates = ["dist", "build", "out", "public", "_site"];
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
