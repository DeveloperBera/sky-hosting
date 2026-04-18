import { useAdminGetStats, getAdminGetStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Server, Activity, AlertCircle, Play, StopCircle, HardDrive } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function DashboardPage() {
  const { data: stats, isLoading } = useAdminGetStats({
    query: {
      queryKey: getAdminGetStatsQueryKey()
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tight">System Overview</h1>
          <p className="text-muted-foreground mt-1">Platform telemetrics and real-time status</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-[100px]" />
                <Skeleton className="h-4 w-4 rounded-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-[60px]" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-mono tracking-tight">System Overview</h1>
        <p className="text-muted-foreground mt-1">Platform telemetrics and real-time status</p>
      </div>

      {/* Primary Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Deployments</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="metric-total-deployments">{stats.totalDeployments}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-primary">{stats.deploymentsThisWeek}</span> this week
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Running Instances</CardTitle>
            <Play className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="metric-running-deployments">{stats.runningDeployments}</div>
            <p className="text-xs text-muted-foreground mt-1">Active environments</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Users</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="metric-active-users">{stats.activeUsers}</div>
            <p className="text-xs text-muted-foreground mt-1">Out of {stats.totalUsers} total registered</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">System Health</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">Nominal</div>
            <p className="text-xs text-muted-foreground mt-1">All services operational</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* State Breakdown */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle className="font-mono text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Deployment Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-sm font-medium">Building</span>
                </div>
                <span className="font-mono">{stats.buildingDeployments}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm font-medium">Running</span>
                </div>
                <span className="font-mono">{stats.runningDeployments}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-sm font-medium">Failed</span>
                </div>
                <span className="font-mono">{stats.failedDeployments}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                  <span className="text-sm font-medium">Stopped</span>
                </div>
                <span className="font-mono">{stats.stoppedDeployments}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Framework Breakdown */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle className="font-mono text-lg flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-primary" />
              Runtime Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(stats.frameworkBreakdown || {}).sort((a, b) => b[1] - a[1]).map(([framework, count]) => (
                <div key={framework} className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize">{framework === 'null' ? 'Unknown' : framework}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary" 
                        style={{ width: `${(count / stats.totalDeployments) * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-sm w-8 text-right">{count}</span>
                  </div>
                </div>
              ))}
              {Object.keys(stats.frameworkBreakdown || {}).length === 0 && (
                <div className="text-sm text-muted-foreground py-4 text-center">No frameworks detected yet.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity Feed */}
      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-lg">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats.recentActivity && stats.recentActivity.length > 0 ? (
              stats.recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-start gap-4 pb-4 border-b border-border/50 last:border-0 last:pb-0">
                  <div className="mt-0.5 p-1.5 bg-muted rounded-md text-muted-foreground">
                    {activity.type === 'deployment_created' && <Server className="h-4 w-4" />}
                    {activity.type === 'user_created' && <Users className="h-4 w-4" />}
                    {activity.type === 'deployment_failed' && <AlertCircle className="h-4 w-4 text-destructive" />}
                    {!['deployment_created', 'user_created', 'deployment_failed'].includes(activity.type) && <Activity className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm">
                      <span className="font-medium text-foreground">{activity.username}</span>
                      {" "}
                      <span className="text-muted-foreground">{activity.message}</span>
                      {activity.deploymentName && (
                        <span className="font-mono text-xs ml-2 px-1.5 py-0.5 bg-muted rounded">
                          {activity.deploymentName}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No recent activity to display.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
