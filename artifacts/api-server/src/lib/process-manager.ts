import { spawn, type ChildProcess } from "child_process";
import * as path from "path";
import * as os from "os";
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
  return entry.process.exitCode === null;
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

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    ...envVars,
    PORT: String(assignedPort),
    NODE_ENV: "production",
  };

  const [cmd, ...args] = parseCommand(startCmd);

  await appendLog(deploymentId, `Starting process on port ${assignedPort}: ${startCmd}`, "runtime");

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
        entry.process.kill("SIGKILL");
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

export function getAllProcesses(): Array<{ subdomain: string; port: number; deploymentId: string; startedAt: Date; running: boolean }> {
  return Array.from(runningProcesses.entries()).map(([subdomain, entry]) => ({
    subdomain,
    port: entry.port,
    deploymentId: entry.deploymentId,
    startedAt: entry.startedAt,
    running: entry.process.exitCode === null,
  }));
}

function parseCommand(cmd: string): [string, ...string[]] {
  // replace pm2 start ... --attach with direct node execution
  if (cmd.includes("pm2")) {
    // extract the main file from pm2 command
    const match = cmd.match(/pm2 start\s+(\S+)/);
    if (match) {
      return ["node", match[1]];
    }
  }
  const parts = cmd.split(/\s+/);
  return [parts[0], ...parts.slice(1)] as [string, ...string[]];
}
