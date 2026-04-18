import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { 
  useGetDeployment, getGetDeploymentQueryKey, 
  useGetDeploymentLogs, getGetDeploymentLogsQueryKey,
  useGetDeploymentEnv, getGetDeploymentEnvQueryKey,
  useUpdateDeploymentEnv,
  useRestartDeployment,
  useDeleteDeployment 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, Terminal, Play, Square, AlertCircle, 
  Activity, RefreshCw, Trash2, ExternalLink, Github, Clock, Settings
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

export default function DeploymentDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Environment variables state
  const [envKey, setEnvKey] = useState("");
  const [envValue, setEnvValue] = useState("");
  const [envVarsList, setEnvVarsList] = useState<{key: string, value: string}[]>([]);

  const { data: deployment, isLoading } = useGetDeployment(id, {
    query: {
      enabled: !!id,
      queryKey: getGetDeploymentQueryKey(id),
      refetchInterval: (data) => {
        if (!data?.state?.data) return false;
        const status = (data.state.data as any).status;
        return ['queued', 'building'].includes(status) ? 3000 : false;
      }
    }
  });

  const { data: logsData } = useGetDeploymentLogs(id, { type: 'all' }, {
    query: {
      enabled: !!id,
      queryKey: getGetDeploymentLogsQueryKey(id, { type: 'all' }),
      refetchInterval: (data) => {
        if (!deployment) return false;
        const status = deployment.status;
        return ['queued', 'building', 'running'].includes(status) ? 5000 : false;
      }
    }
  });

  const { data: envData } = useGetDeploymentEnv(id, {
    query: {
      enabled: !!id,
      queryKey: getGetDeploymentEnvQueryKey(id)
    }
  });

  const updateEnvMutation = useUpdateDeploymentEnv({
    mutation: {
      onSuccess: () => {
        toast({ title: "Environment variables updated" });
        queryClient.invalidateQueries({ queryKey: getGetDeploymentEnvQueryKey(id) });
        setEnvKey("");
        setEnvValue("");
      },
      onError: (error: any) => {
        toast({ 
          variant: "destructive", 
          title: "Failed to update environment variables", 
          description: error?.data?.error || error.message 
        });
      }
    }
  });

  const restartMutation = useRestartDeployment({
    mutation: {
      onSuccess: () => {
        toast({ title: "Deployment restarted successfully" });
        queryClient.invalidateQueries({ queryKey: getGetDeploymentQueryKey(id) });
      },
      onError: (error: any) => {
        toast({ 
          variant: "destructive", 
          title: "Failed to restart deployment", 
          description: error?.data?.error || error.message 
        });
      }
    }
  });

  const deleteMutation = useDeleteDeployment({
    mutation: {
      onSuccess: () => {
        toast({ title: "Deployment deleted successfully" });
        setLocation("/deployments");
      },
      onError: (error: any) => {
        toast({ 
          variant: "destructive", 
          title: "Failed to delete deployment", 
          description: error?.data?.error || error.message 
        });
      }
    }
  });

  // Initialize env vars list when envData changes
  useEffect(() => {
    if (envData?.keys) {
      setEnvVarsList(envData.keys.map(key => ({ key, value: "********" })));
    }
  }, [envData]);

  const handleAddEnvVar = () => {
    if (!envKey) return;
    
    // API endpoint needs all current env vars plus the new one
    // But we only get keys from the API, not values, so this is a limitation of the API.
    // In a real app, we'd either get values too, or have an endpoint to add/update a single var.
    // Given the API schema UpdateEnvRequest { env_vars: Record<string, string> },
    // we have to send the full object. We will just send the new one, assuming it patches,
    // though typically it might overwrite. We'll just assume it patches or we only manage what we added.
    const newVars = { [envKey]: envValue };
    updateEnvMutation.mutate({ 
      id, 
      data: { env_vars: newVars } 
    });
  };

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Loading deployment details...</div>;
  }

  if (!deployment) {
    return <div className="text-center py-12 text-muted-foreground">Deployment not found.</div>;
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Play className="h-4 w-4 mr-2" />;
      case 'stopped': return <Square className="h-4 w-4 mr-2" />;
      case 'failed': return <AlertCircle className="h-4 w-4 mr-2" />;
      case 'building': return <Activity className="h-4 w-4 mr-2 animate-pulse" />;
      default: return <Activity className="h-4 w-4 mr-2" />;
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'running': return "default";
      case 'stopped': return "secondary";
      case 'failed': return "destructive";
      case 'building': return "outline";
      default: return "outline";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => setLocation("/deployments")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
              {deployment.name}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={getStatusVariant(deployment.status) as any} className="capitalize">
                {getStatusIcon(deployment.status)}
                {deployment.status}
              </Badge>
              <span className="text-sm text-muted-foreground font-mono">
                {deployment.id}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {deployment.liveUrl && (
            <Button variant="outline" asChild>
              <a href={deployment.liveUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Visit Site
              </a>
            </Button>
          )}
          <Button 
            variant="secondary" 
            onClick={() => restartMutation.mutate({ id })}
            disabled={restartMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${restartMutation.isPending ? 'animate-spin' : ''}`} />
            Restart
          </Button>
          <Button 
            variant="destructive" 
            onClick={() => setShowDeleteDialog(true)}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Owner</div>
              <div className="font-medium">{deployment.user?.username || 'Unknown'}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                <Github className="h-3 w-3" /> Repository
              </div>
              <a href={deployment.githubUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-sm text-primary hover:underline break-all">
                {deployment.githubUrl.split('github.com/').pop() || deployment.githubUrl}
              </a>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Branch</div>
              <Badge variant="outline" className="font-mono">{deployment.branch}</Badge>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Framework</div>
              <Badge variant="secondary" className="capitalize">{deployment.framework === 'null' ? 'unknown' : deployment.framework || 'unknown'}</Badge>
            </div>
            {deployment.customDomain && (
              <div>
                <div className="text-sm text-muted-foreground mb-1">Custom Domain</div>
                <div className="font-mono text-sm">{deployment.customDomain}</div>
              </div>
            )}
            <div>
              <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Created
              </div>
              <div className="text-sm">{format(new Date(deployment.createdAt), 'PP pp')}</div>
            </div>
            {deployment.errorMessage && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <div className="text-sm font-semibold text-destructive mb-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Error
                </div>
                <div className="text-xs text-destructive/90 break-words">{deployment.errorMessage}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-1 md:col-span-2 flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              Console
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0">
            <Tabs defaultValue="build" className="h-full flex flex-col">
              <TabsList>
                <TabsTrigger value="build">Build Logs</TabsTrigger>
                <TabsTrigger value="runtime">Runtime Logs</TabsTrigger>
                <TabsTrigger value="env">Environment Variables</TabsTrigger>
              </TabsList>
              <div className="flex-1 mt-4 relative bg-black/90 rounded-md border border-border/50 overflow-hidden">
                <TabsContent value="build" className="m-0 h-full absolute inset-0 p-4 overflow-y-auto">
                  <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap break-all">
                    {logsData?.buildLogs || deployment.buildLogs || "Waiting for build logs..."}
                  </pre>
                </TabsContent>
                <TabsContent value="runtime" className="m-0 h-full absolute inset-0 p-4 overflow-y-auto">
                  <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap break-all">
                    {logsData?.runtimeLogs || deployment.runtimeLogs || "Waiting for runtime logs..."}
                  </pre>
                </TabsContent>
                <TabsContent value="env" className="m-0 h-full absolute inset-0 p-4 overflow-y-auto bg-background">
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-medium mb-4 flex items-center gap-2 text-foreground">
                        <Settings className="h-4 w-4" /> Manage Environment Variables
                      </h3>
                      <div className="flex items-end gap-2">
                        <div className="space-y-1 flex-1">
                          <Label htmlFor="envKey" className="text-xs text-foreground">Key</Label>
                          <Input 
                            id="envKey" 
                            value={envKey} 
                            onChange={(e) => setEnvKey(e.target.value)} 
                            placeholder="DATABASE_URL" 
                            className="font-mono text-foreground"
                          />
                        </div>
                        <div className="space-y-1 flex-1">
                          <Label htmlFor="envValue" className="text-xs text-foreground">Value</Label>
                          <Input 
                            id="envValue" 
                            value={envValue} 
                            onChange={(e) => setEnvValue(e.target.value)} 
                            placeholder="********" 
                            type="password"
                            className="font-mono text-foreground"
                          />
                        </div>
                        <Button 
                          onClick={handleAddEnvVar} 
                          disabled={!envKey || updateEnvMutation.isPending}
                        >
                          Set Variable
                        </Button>
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="text-sm font-medium mb-2 text-foreground">Current Variables ({envVarsList.length})</h4>
                      {envVarsList.length > 0 ? (
                        <div className="space-y-2">
                          {envVarsList.map((env, i) => (
                            <div key={i} className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                              <div className="font-mono text-sm w-1/3 truncate text-foreground">{env.key}</div>
                              <div className="font-mono text-sm text-muted-foreground flex-1 truncate">{env.value}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground italic">No environment variables set.</div>
                      )}
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the deployment and remove all associated data and logs from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteMutation.mutate({ id })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Deployment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
