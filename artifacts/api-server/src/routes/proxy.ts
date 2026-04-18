import { Router } from "express";
import * as http from "http";
import { db, deploymentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getProcessPort, isProcessRunning, isPortListening } from "../lib/process-manager";
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
    sendPage(res, 404, "Not Found", `No deployment found for <strong>${subdomain}</strong>`);
    return;
  }

  if (deployment.status === "failed") {
    const msg = deployment.errorMessage || "Unknown error";
    sendPage(res, 502, "Deployment Failed", `<strong>${deployment.name}</strong> failed to deploy.<br><code>${msg}</code>`);
    return;
  }

  if (deployment.status === "building" || deployment.status === "queued") {
    res.setHeader("Refresh", "3");
    sendPage(res, 503, "Building…", `<strong>${deployment.name}</strong> is still building. This page will refresh automatically.`);
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
    const urlPath = "/" + ((req.params as Record<string, string>).path || "");
    const filePath = path.join(staticDir, urlPath === "/" ? "index.html" : urlPath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.sendFile(filePath);
    } else {
      const indexPath = path.join(staticDir, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        sendPage(res, 404, "Not Found", "File not found in static site");
      }
    }
    return;
  }

  // Dynamic app — proxy to the running process
  const port = getProcessPort(subdomain) || deployment.port;

  if (!port) {
    sendPage(res, 503, "Not Running",
      `<strong>${deployment.name}</strong> has no assigned port. Restart from the dashboard.`);
    return;
  }

  // Check if the process is alive (either tracked or port-alive, e.g. PM2)
  const alive = isProcessRunning(subdomain) || await isPortListening(port);

  if (!alive) {
    sendPage(res, 503, "Process Stopped",
      `<strong>${deployment.name}</strong> is not running on port ${port}.<br>
       <a href="javascript:location.reload()" style="color:#58a6ff">Retry</a> or restart from the dashboard.`);
    return;
  }

  // Forward the request to the child process
  const rawPath = (req.params as Record<string, string>).path || "";
  const targetPath = rawPath ? `/${rawPath}` : "/";
  const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";

  const proxyHeaders: http.OutgoingHttpHeaders = {
    ...req.headers,
    host: `localhost:${port}`,
    "x-forwarded-for": req.ip || "",
    "x-forwarded-proto": "https",
    "x-real-ip": req.ip || "",
    "x-sky-hosting-subdomain": subdomain,
  };
  // Remove headers that shouldn't be forwarded
  delete proxyHeaders["content-length"];

  const options: http.RequestOptions = {
    hostname: "127.0.0.1",
    port,
    path: targetPath + query,
    method: req.method,
    headers: proxyHeaders,
    timeout: 30000,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode || 200);
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (value && key.toLowerCase() !== "transfer-encoding") {
        res.setHeader(key, value);
      }
    }
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    if (!res.headersSent) {
      sendPage(res, 502, "Gateway Error",
        `Could not reach <strong>${deployment.name}</strong> on port ${port}.<br>
         ${err.message}<br>
         <a href="javascript:location.reload()" style="color:#58a6ff;margin-top:1rem;display:inline-block">Retry</a>`);
    }
  });

  proxyReq.on("timeout", () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      sendPage(res, 504, "Gateway Timeout",
        `<strong>${deployment.name}</strong> did not respond in time.`);
    }
  });

  if (["POST", "PUT", "PATCH"].includes(req.method) && req.body) {
    const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    proxyReq.setHeader("content-length", Buffer.byteLength(body));
    proxyReq.write(body);
  }

  req.pipe(proxyReq, { end: true });
});

function sendPage(
  res: import("express").Response,
  status: number,
  title: string,
  body: string
): void {
  const color = status >= 500 ? "#f85149" : status === 503 ? "#e3b341" : "#58a6ff";
  res.status(status).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} — Sky-Hosting</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:monospace;background:#0d1117;color:#c9d1d9;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem}
    .card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:2.5rem;max-width:480px;width:100%;text-align:center}
    .status{font-size:3rem;font-weight:700;color:${color};margin-bottom:.5rem}
    .title{font-size:1.4rem;font-weight:600;margin-bottom:1rem;color:#e6edf3}
    .msg{font-size:.875rem;color:#8b949e;line-height:1.6}
    .badge{display:inline-block;background:#21262d;border:1px solid #30363d;border-radius:6px;padding:.25rem .75rem;font-size:.75rem;margin-top:1.5rem;color:#58a6ff}
  </style>
</head>
<body>
  <div class="card">
    <div class="status">${status}</div>
    <div class="title">${title}</div>
    <div class="msg">${body}</div>
    <div class="badge">⚡ Sky-Hosting</div>
  </div>
</body>
</html>`);
}

export default router;
