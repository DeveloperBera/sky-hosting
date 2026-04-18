import { useState, useEffect } from "react";
import { useAdminGetSettings, getAdminGetSettingsQueryKey, useAdminUpdateSettings } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Settings2, Globe, Shield, Zap, Save } from "lucide-react";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: settings, isLoading } = useAdminGetSettings({
    query: {
      queryKey: getAdminGetSettingsQueryKey()
    }
  });

  const [formData, setFormData] = useState({
    baseDomain: "",
    maxDeploymentsPerUser: 10,
    defaultBuildTimeout: 600,
    rateLimitPerMinute: 60,
    allowPublicRegistration: false,
    enableDockerDeployments: true,
    maintenanceMode: false,
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        baseDomain: settings.baseDomain || "",
        maxDeploymentsPerUser: settings.maxDeploymentsPerUser || 10,
        defaultBuildTimeout: settings.defaultBuildTimeout || 600,
        rateLimitPerMinute: settings.rateLimitPerMinute || 60,
        allowPublicRegistration: settings.allowPublicRegistration || false,
        enableDockerDeployments: settings.enableDockerDeployments || true,
        maintenanceMode: settings.maintenanceMode || false,
      });
    }
  }, [settings]);

  const updateMutation = useAdminUpdateSettings({
    mutation: {
      onSuccess: () => {
        toast({ title: "Settings updated successfully" });
        queryClient.invalidateQueries({ queryKey: getAdminGetSettingsQueryKey() });
      },
      onError: (error: any) => {
        toast({ 
          variant: "destructive", 
          title: "Failed to update settings", 
          description: error?.data?.error || error.message 
        });
      }
    }
  });

  const handleSave = () => {
    updateMutation.mutate({ data: formData });
  };

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-mono tracking-tight flex items-center gap-2">
          <Settings2 className="h-8 w-8 text-primary" /> System Configuration
        </h1>
        <p className="text-muted-foreground mt-1">Platform-wide settings and limits</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="col-span-1 md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5 text-primary" /> Routing & Domains</CardTitle>
            <CardDescription>Configure how deployments are exposed to the internet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 max-w-md">
              <Label htmlFor="baseDomain">Base Domain</Label>
              <Input 
                id="baseDomain" 
                value={formData.baseDomain} 
                onChange={(e) => setFormData({...formData, baseDomain: e.target.value})} 
                placeholder="sky-hosting.local"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">Deployments will be routed to [name].[base-domain]</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5 text-primary" /> Security & Access</CardTitle>
            <CardDescription>Control who can use the platform.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="publicReg">Public Registration</Label>
                <p className="text-sm text-muted-foreground">Allow anyone to create an account</p>
              </div>
              <Switch 
                id="publicReg" 
                checked={formData.allowPublicRegistration}
                onCheckedChange={(c) => setFormData({...formData, allowPublicRegistration: c})}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="maintenance">Maintenance Mode</Label>
                <p className="text-sm text-muted-foreground">Pause all new deployments</p>
              </div>
              <Switch 
                id="maintenance" 
                checked={formData.maintenanceMode}
                onCheckedChange={(c) => setFormData({...formData, maintenanceMode: c})}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="docker">Docker Deployments</Label>
                <p className="text-sm text-muted-foreground">Allow deploying raw Dockerfiles</p>
              </div>
              <Switch 
                id="docker" 
                checked={formData.enableDockerDeployments}
                onCheckedChange={(c) => setFormData({...formData, enableDockerDeployments: c})}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-primary" /> Limits & Resources</CardTitle>
            <CardDescription>Prevent abuse and manage capacity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="maxDeploy">Max Deployments per User</Label>
              <Input 
                id="maxDeploy" 
                type="number"
                value={formData.maxDeploymentsPerUser} 
                onChange={(e) => setFormData({...formData, maxDeploymentsPerUser: parseInt(e.target.value) || 0})} 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timeout">Build Timeout (seconds)</Label>
              <Input 
                id="timeout" 
                type="number"
                value={formData.defaultBuildTimeout} 
                onChange={(e) => setFormData({...formData, defaultBuildTimeout: parseInt(e.target.value) || 0})} 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rateLimit">API Rate Limit (req/min)</Label>
              <Input 
                id="rateLimit" 
                type="number"
                value={formData.rateLimitPerMinute} 
                onChange={(e) => setFormData({...formData, rateLimitPerMinute: parseInt(e.target.value) || 0})} 
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button 
          size="lg" 
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="w-full sm:w-auto"
        >
          <Save className="h-4 w-4 mr-2" />
          {updateMutation.isPending ? "Saving..." : "Save Configuration"}
        </Button>
      </div>
    </div>
  );
}
