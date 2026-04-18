import { Router } from "express";
import * as http from "http";
import * as https from "https";
import { db, deploymentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getProcessPort, isProcessRunning } from "../lib/process-manager";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

const router = Router();

const DEPLOY_BASE_DIR = process.env.DEPLOY_DIR || path.join(os.homedir(), "sky-hosting-apps");

// Proxy route — /api/proxy/:subdomain and /api/proxy/:subdomain/*path
router.all("/proxy/:subdomain{/*path}", async (req, res) => {
  const { subdomain } = req.params as { subdomain: string };

  const [deployment] = await db
    .select()
    .from(deploymentsTable)
    .where(eq(deploymentsTable.subdomain, subdomain));

  if (!deployment) {
    res.status(404).json({ error: "Deployment not found", subdomain });
    return;
  }

  if (deployment.status === "failed") {
    res.status(502).json({ error: "Deployment failed", errorMessage: deployment.errorMessage });
    return;
  }

  if (deployment.status === "building" || deployment.status === "queued") {
    res.status(503).send(`
      <html><body style="font-family:monospace;background:#0d1117;color:#58a6ff;padding:2rem">
        <h2>⚙️ Building...</h2>
        <p>Deployment <strong>${deployment.name}</strong> is still building. Check back in a moment.</p>
        <script>setTimeout(()=>location.reload(),3000)</script>
      </body></html>
    `);
    return;
  }

  // Static site — serve files directly
  if (deployment.framework === "static") {
    const deployDir = path.join(DEPLOY_BASE_DIR, deployment.id);
    const candidates = ["dist", "build", "out", "public", "_site", ""];
    let staticDir = deployDir;
    for (const c of candidates) {
      const p = c ? path.join(deployDir, c) : deployDir;
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
        staticDir = p;
        break;
      }
    }
    // Strip the /api/proxy/:subdomain prefix
    const urlPath = "/" + ((req.params as Record<string, string>).path || "");
    const filePath = path.join(staticDir, urlPath === "/" ? "index.html" : urlPath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.sendFile(filePath);
    } else {
      const indexPath = path.join(staticDir, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("File not found");
      }
    }
    return;
  }

  // Dynamic app — proxy to the running process
  const port = getProcessPort(subdomain) || deployment.port;

  if (!port) {
    res.status(503).send(`
      <html><body style="font-family:monospace;background:#0d1117;color:#f85149;padding:2rem">
        <h2>⚠️ Not Running</h2>
        <p>Deployment <strong>${deployment.name}</strong> has no running process. Restart it from the dashboard.</p>
      </body></html>
    `);
    return;
  }

  if (!isProcessRunning(subdomain)) {
    res.status(503).send(`
      <html><body style="font-family:monospace;background:#0d1117;color:#f85149;padding:2rem">
        <h2>⚠️ Process Stopped</h2>
        <p>Deployment <strong>${deployment.name}</strong> process has exited. Restart it from the dashboard.</p>
      </body></html>
    `);
    return;
  }

  // Forward the request to the child process
  const rawPath = (req.params as Record<string, string>).path || "";
  const targetPath = rawPath ? `/${rawPath}` : "/";
  const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";

  const options: http.RequestOptions = {
    hostname: "127.0.0.1",
    port,
    path: targetPath + query,
    method: req.method,
    headers: {
      ...req.headers,
      host: `localhost:${port}`,
      "x-forwarded-for": req.ip || "",
      "x-forwarded-proto": "https",
      "x-real-ip": req.ip || "",
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode || 200);
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (value) res.setHeader(key, value);
    }
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    if (!res.headersSent) {
      res.status(502).send(`
        <html><body style="font-family:monospace;background:#0d1117;color:#f85149;padding:2rem">
          <h2>⚠️ Gateway Error</h2>
          <p>Could not reach <strong>${deployment.name}</strong> on port ${port}: ${err.message}</p>
          <p>The app may still be starting up. <a href="javascript:location.reload()" style="color:#58a6ff">Retry</a></p>
        </body></html>
      `);
    }
  });

  if (req.body && ["POST", "PUT", "PATCH"].includes(req.method)) {
    proxyReq.write(JSON.stringify(req.body));
  }

  proxyReq.end();
});

export default router;
