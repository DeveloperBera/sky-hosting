import { useState } from "react";
import { Key, Copy, RefreshCw, CheckCircle, AlertTriangle, Terminal, Bot, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");

async function regenerateKey(token: string): Promise<{ apiKey: string; apiKeyPrefix: string }> {
  const resp = await fetch(`${BASE}/api/v1/auth/regenerate-key`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error("Failed to regenerate key");
  return resp.json() as Promise<{ apiKey: string; apiKeyPrefix: string }>;
}

function CodeBlock({ children }: { children: string }) {
  const { toast } = useToast();
  return (
    <div className="relative group">
      <pre className="bg-black/60 border border-border rounded-md p-4 text-xs font-mono text-green-400 overflow-x-auto whitespace-pre-wrap break-all">
        {children}
      </pre>
      <button
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
        onClick={() => {
          navigator.clipboard.writeText(children);
          toast({ title: "Copied to clipboard" });
        }}
      >
        <Copy className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function ApiKeysPage() {
  const { user, token, login } = useAuth();
  const { toast } = useToast();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const prefix = user?.apiKeyPrefix ?? "sk_live_????????";
  const maskedKey = `${prefix}${"•".repeat(24)}`;

  const handleRegenerate = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await regenerateKey(token);
      setNewKey(result.apiKey);
      // Update user in context so sidebar shows new prefix
      if (user) {
        login(token, { ...user, apiKeyPrefix: result.apiKeyPrefix });
      }
      toast({ title: "New API key generated", description: "Copy it now — it won't be shown again." });
    } catch {
      toast({ variant: "destructive", title: "Failed to regenerate key" });
    } finally {
      setLoading(false);
    }
  };

  const deployUrl = `${window.location.origin}${BASE}/api/v1/deploy`;
  const exampleKey = newKey || maskedKey;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-mono tracking-tight flex items-center gap-2">
          <Key className="h-8 w-8 text-primary" /> API Keys
        </h1>
        <p className="text-muted-foreground mt-1">Use your API key to deploy repositories via bot or automation</p>
      </div>

      {/* Current key */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" /> Your API Key
          </CardTitle>
          <CardDescription>
            Pass this as the <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">Authorization</code> header on every API call.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {newKey ? (
            <div className="rounded-md border border-green-700 bg-green-950/30 p-4 space-y-2">
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span className="font-semibold text-sm">New key generated — copy it now!</span>
              </div>
              <p className="text-xs text-muted-foreground">This full key will never be shown again. If you lose it, regenerate.</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-sm bg-black/60 border border-border rounded px-3 py-2 text-green-300 break-all">
                  {newKey}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(newKey);
                    toast({ title: "Copied!" });
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <code className="flex-1 font-mono text-sm bg-black/60 border border-border rounded px-3 py-2 text-muted-foreground truncate">
                {maskedKey}
              </code>
              <Badge variant="secondary" className="font-mono shrink-0">Prefix: {prefix}</Badge>
            </div>
          )}

          <div className="flex items-center gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={loading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                  Regenerate Key
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" /> Regenerate API Key?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Your current API key will stop working immediately. Any bots or integrations using the old key will need to be updated with the new one.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRegenerate} className="bg-destructive hover:bg-destructive/90">
                    Regenerate
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <span className="text-xs text-muted-foreground">Generates a new key and invalidates the old one</span>
          </div>
        </CardContent>
      </Card>

      {/* Bot integration guide */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" /> Bot Integration
          </CardTitle>
          <CardDescription>
            Deploy any GitHub repository from your bot using one API call.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <p className="text-sm font-medium flex items-center gap-1"><Terminal className="h-4 w-4 text-primary" /> Deploy a GitHub repo</p>
            <CodeBlock>{`curl -X POST ${deployUrl} \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "github_url": "https://github.com/user/repo",
    "branch": "main",
    "name": "my-app",
    "env_vars": {
      "NODE_ENV": "production",
      "PORT": "3000"
    }
  }'`}</CodeBlock>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium flex items-center gap-1"><Zap className="h-4 w-4 text-primary" /> Check deployment status</p>
            <CodeBlock>{`curl ${window.location.origin}${BASE}/api/v1/deployments/DEPLOYMENT_ID \\
  -H "Authorization: Bearer YOUR_API_KEY"`}</CodeBlock>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium flex items-center gap-1"><Terminal className="h-4 w-4 text-primary" /> List your deployments</p>
            <CodeBlock>{`curl ${window.location.origin}${BASE}/api/v1/deployments \\
  -H "Authorization: Bearer YOUR_API_KEY"`}</CodeBlock>
          </div>

          <div className="rounded-md border border-border bg-muted/20 p-4 space-y-2">
            <p className="text-sm font-semibold text-foreground">Response from deploy</p>
            <CodeBlock>{`{
  "id": "dep_abc123",
  "status": "queued",
  "liveUrl": "https://your-app.sky-hosting.com",
  "logsUrl": "/api/v1/deployments/dep_abc123",
  "framework": "nodejs",
  ...
}`}</CodeBlock>
            <p className="text-xs text-muted-foreground">
              Poll <code className="font-mono bg-muted px-1 rounded">liveUrl</code> or <code className="font-mono bg-muted px-1 rounded">status</code> to know when the app is live.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
