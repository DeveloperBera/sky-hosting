import { useState } from "react";
import { Link } from "wouter";
import { useAdminListDeployments, getAdminListDeploymentsQueryKey, useDeleteDeployment, useRestartDeployment } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { MoreHorizontal, Search, Server, Play, Square, AlertCircle, RefreshCw, Trash2, ExternalLink, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function DeploymentsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [deploymentToDelete, setDeploymentToDelete] = useState<string | null>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useAdminListDeployments({ limit: 100 }, {
    query: {
      queryKey: getAdminListDeploymentsQueryKey({ limit: 100 })
    }
  });

  const deleteMutation = useDeleteDeployment({
    mutation: {
      onSuccess: () => {
        toast({ title: "Deployment deleted successfully" });
        queryClient.invalidateQueries({ queryKey: getAdminListDeploymentsQueryKey({ limit: 100 }) });
        setDeploymentToDelete(null);
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

  const restartMutation = useRestartDeployment({
    mutation: {
      onSuccess: () => {
        toast({ title: "Deployment restarted successfully" });
        queryClient.invalidateQueries({ queryKey: getAdminListDeploymentsQueryKey({ limit: 100 }) });
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

  const deployments = data?.deployments || [];
  const filteredDeployments = deployments.filter(d => 
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (d.user?.username || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Play className="h-3 w-3 mr-1" />;
      case 'stopped': return <Square className="h-3 w-3 mr-1" />;
      case 'failed': return <AlertCircle className="h-3 w-3 mr-1" />;
      case 'building': return <Activity className="h-3 w-3 mr-1 animate-pulse" />;
      default: return <Server className="h-3 w-3 mr-1" />;
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tight">Deployments</h1>
          <p className="text-muted-foreground mt-1">Manage all platform deployments</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search deployments..."
            className="pl-9 bg-background font-mono"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-testid="input-search-deployments"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Framework</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Loading deployments...
                  </TableCell>
                </TableRow>
              ) : filteredDeployments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No deployments found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredDeployments.map((deployment) => (
                  <TableRow key={deployment.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <Link href={`/deployments/${deployment.id}`} className="font-medium hover:underline text-primary">
                          {deployment.name}
                        </Link>
                        <span className="text-xs text-muted-foreground font-mono">{deployment.id.substring(0, 8)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(deployment.status) as any} className="capitalize">
                        {getStatusIcon(deployment.status)}
                        {deployment.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">{deployment.user?.username}</span>
                        <span className="text-xs text-muted-foreground font-mono truncate max-w-[120px]">{deployment.user?.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {deployment.framework === 'null' ? 'unknown' : deployment.framework || 'unknown'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(deployment.updatedAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {deployment.liveUrl && (
                          <Button variant="ghost" size="icon" asChild>
                            <a href={deployment.liveUrl} target="_blank" rel="noopener noreferrer" title="Open Live URL">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-deployment-actions-${deployment.id}`}>
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Open menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem asChild>
                              <Link href={`/deployments/${deployment.id}`}>View Details</Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => restartMutation.mutate({ id: deployment.id })}
                              disabled={restartMutation.isPending}
                            >
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Restart
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                              onClick={() => setDeploymentToDelete(deployment.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!deploymentToDelete} onOpenChange={(open) => !open && setDeploymentToDelete(null)}>
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
              onClick={() => deploymentToDelete && deleteMutation.mutate({ id: deploymentToDelete })}
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
