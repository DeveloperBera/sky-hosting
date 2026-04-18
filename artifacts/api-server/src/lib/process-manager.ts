import { spawn, type ChildProcess } from "child_process";
import * as net from "net";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { db, deploymentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { appendLog } from "./deploy-engine";

const DEPLOY_BASE_DIR = process.env.DEPLOY_DIR || path.join(os.homedir(), "sky-hosting-apps");
const PORT_START = 15000;
const PORT_END = 19999;

interface ProcessEntry {
  process: ChildProcess;
  port: number;
  subdomain: string;
  deploymentId: string;
  startedAt: Date;
}

const runningProcesses = new Map<string, ProcessEntry>();
const usedPorts = new Set<number>();

export function allocatePort(): number {
  for (let p = PORT_START; p <= PORT_END; p++) {
    if (!usedPorts.has(p)) {
      usedPorts.add(p);
      return p;
    }
  }
  throw new Error("No available ports");
}

export function releasePort(port: number): void {
  usedPorts.delete(port);
}

export function getProcessPort(subdomain: string): number | undefined {
  return runningProcesses.get(subdomain)?.port;
}

export function isProcessRunning(subdomain: string): boolean {
  const entry = runningProcesses.get(subdomain);
  if (!entry) return false;
  return entry.process.exitCode === null && entry.process.killed === false;
}

/** Detect if something is listening on a port (for PM2-managed or externally started processes) */
export function isPortListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 300);
    socket.connect(port, "127.0.0.1", () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

/**
 * Resolve the actual start command for a Node.js app.
 * Bypasses PM2 — runs node directly for reliable process management.
 */
export function resolveNodeStartCommand(deployDir: string, scriptCmd: string | null): string {
  const pkgPath = path.join(deployDir, "package.json");

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
      main?: string;
      scripts?: Record<string, string>;
    };

    // Check for Procfile (Heroku-style) first
    const procfilePath = path.join(deployDir, "Procfile");
    if (fs.existsSync(procfilePath)) {
      const procfile = fs.readFileSync(procfilePath, "utf-8");
      const webLine = procfile.split("\n").find((l) => l.trim().startsWith("web:"));
      if (webLine) {
        const cmd = webLine.replace(/^web:\s*/i, "").trim();
        // If web line also uses PM2, bypass it
        if (!cmd.includes("pm2")) return cmd;
        const match = cmd.match(/pm2\s+start\s+(\S+)/);
        if (match) return `node ${match[1]}`;
      }
    }

    // If the start script uses PM2, get the actual file from the PM2 command
    const startScript = pkg.scripts?.start || scriptCmd || "";
    if (startScript.includes("pm2")) {
      // Extract main file from pm2 command: "pm2 start index.js ..." -> "index.js"
      const match = startScript.match(/pm2\s+start\s+([^\s]+\.(?:js|mjs|cjs))/);
      if (match) return `node ${match[1]}`;
      // Fall back to main field in package.json
      const mainFile = pkg.main || "index.js";
      return `node ${mainFile}`;
    }

    return startScript || `node ${pkg.main || "index.js"}`;
  } catch {
    return scriptCmd || "node index.js";
  }
}

export async function startProcess(
  deploymentId: string,
  subdomain: string,
  startCmd: string,
  envVars: Record<string, string> = {},
  port?: number
): Promise<number> {
  await stopProcess(subdomain);

  const assignedPort = port || allocatePort();
  const deployDir = path.join(DEPLOY_BASE_DIR, deploymentId);

  // For Node.js apps: resolve the real start command (bypass PM2)
  const resolvedCmd = resolveNodeStartCommand(deployDir, startCmd);

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ...envVars,
    PORT: String(assignedPort),
    NODE_ENV: process.env.NODE_ENV || "production",
  };

  const [cmd, ...args] = parseCommand(resolvedCmd);

  await appendLog(deploymentId, `Starting process on port ${assignedPort}: ${resolvedCmd}`, "runtime");

  const child = spawn(cmd, args, {
    cwd: deployDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  const entry: ProcessEntry = {
    process: child,
    port: assignedPort,
    subdomain,
    deploymentId,
    startedAt: new Date(),
  };

  runningProcesses.set(subdomain, entry);

  child.stdout?.on("data", async (data: Buffer) => {
    const line = data.toString().trim();
    if (line) {
      await appendLog(deploymentId, line, "runtime").catch(() => {});
    }
  });

  child.stderr?.on("data", async (data: Buffer) => {
    const line = data.toString().trim();
    if (line) {
      await appendLog(deploymentId, `[stderr] ${line}`, "runtime").catch(() => {});
    }
  });

  child.on("exit", async (code, signal) => {
    runningProcesses.delete(subdomain);
    releasePort(assignedPort);
    logger.warn({ deploymentId, subdomain, code, signal }, "Process exited");
    await appendLog(deploymentId, `Process exited with code ${code} signal ${signal}`, "runtime").catch(() => {});

    const [dep] = await db.select({ status: deploymentsTable.status })
      .from(deploymentsTable)
      .where(eq(deploymentsTable.id, deploymentId));

    if (dep?.status === "running") {
      await db.update(deploymentsTable)
        .set({ status: "failed", errorMessage: `Process exited with code ${code}` })
        .where(eq(deploymentsTable.id, deploymentId));
    }
  });

  child.on("error", async (err) => {
    logger.error({ err, deploymentId }, "Process error");
    await appendLog(deploymentId, `Process error: ${err.message}`, "runtime").catch(() => {});
  });

  await db.update(deploymentsTable)
    .set({ port: assignedPort })
    .where(eq(deploymentsTable.id, deploymentId));

  return assignedPort;
}

export async function stopProcess(subdomain: string): Promise<void> {
  const entry = runningProcesses.get(subdomain);
  if (!entry) return;

  runningProcesses.delete(subdomain);
  releasePort(entry.port);

  try {
    entry.process.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try { entry.process.kill("SIGKILL"); } catch {}
        resolve();
      }, 5000);
      entry.process.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  } catch {
    // process may already be dead
  }
}

/** Recover running deployments after server restart */
export async function recoverRunningDeployments(): Promise<void> {
  try {
    const running = await db.select().from(deploymentsTable)
      .where(eq(deploymentsTable.status, "running"));

    let recovered = 0;
    for (const dep of running) {
      if (!dep.startCommand || dep.framework === "static") continue;
      if (!dep.subdomain || !dep.port) continue;

      // Check if something is already listening on the stored port (e.g. PM2 daemon survived)
      const portAlive = await isPortListening(dep.port);
      if (portAlive) {
        // Re-register without spawning — port is already live
        usedPorts.add(dep.port);
        logger.info({ deploymentId: dep.id, port: dep.port }, "Recovered external process");
        recovered++;
        continue;
      }

      // Re-spawn the process
      const envVars = dep.envVarsEncrypted
        ? JSON.parse(dep.envVarsEncrypted) as Record<string, string>
        : {};

      try {
        await startProcess(dep.id, dep.subdomain, dep.startCommand, envVars, dep.port);
        recovered++;
        logger.info({ deploymentId: dep.id }, "Re-spawned deployment on startup");
      } catch (err) {
        logger.error({ err, deploymentId: dep.id }, "Failed to recover deployment");
        await db.update(deploymentsTable)
          .set({ status: "failed", errorMessage: "Process failed to start after server restart" })
          .where(eq(deploymentsTable.id, dep.id));
      }
    }

    if (recovered > 0) {
      logger.info({ recovered }, "Deployment recovery complete");
    }
  } catch (err) {
    logger.error({ err }, "Error during deployment recovery");
  }
}

export function getAllProcesses(): Array<{
  subdomain: string;
  port: number;
  deploymentId: string;
  startedAt: Date;
  running: boolean;
}> {
  return Array.from(runningProcesses.entries()).map(([subdomain, entry]) => ({
    subdomain,
    port: entry.port,
    deploymentId: entry.deploymentId,
    startedAt: entry.startedAt,
    running: entry.process.exitCode === null,
  }));
}

function parseCommand(cmd: string): [string, ...string[]] {
  const parts = cmd.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [cmd];
  const unquoted = parts.map((p) => p.replace(/^["']|["']$/g, ""));
  return [unquoted[0], ...unquoted.slice(1)] as [string, ...string[]];
}
