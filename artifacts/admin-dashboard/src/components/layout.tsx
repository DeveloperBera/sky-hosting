import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { LayoutDashboard, Server, Users, Settings, LogOut, TerminalSquare, Key } from "lucide-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { logout, user } = useAuth();

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Deployments", href: "/deployments", icon: Server },
    { name: "API Keys", href: "/api-keys", icon: Key },
    { name: "Users", href: "/users", icon: Users },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar className="border-r border-sidebar-border">
          <SidebarContent>
            <SidebarGroup>
              <div className="px-4 py-6 flex items-center gap-2 text-primary">
                <TerminalSquare className="h-6 w-6" />
                <span className="font-mono font-bold tracking-tight text-lg text-foreground">
                  SKY-HOSTING
                </span>
              </div>
              <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
                Platform Admin
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navigation.map((item) => {
                    const isActive = location === item.href || (location.startsWith(item.href) && item.href !== "/");
                    return (
                      <SidebarMenuItem key={item.name}>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={item.name}>
                          <Link href={item.href} className="flex items-center gap-3">
                            <item.icon className="h-4 w-4" />
                            <span>{item.name}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <div className="mt-auto p-4 border-t border-sidebar-border">
            <div className="flex items-center justify-between mb-4">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">{user?.username}</span>
                <span className="text-xs text-muted-foreground font-mono truncate max-w-[140px]">{user?.email || 'admin'}</span>
              </div>
            </div>
            <button
              onClick={() => logout()}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full p-2 rounded-md hover:bg-sidebar-accent"
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </button>
          </div>
        </Sidebar>
        
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
          <div className="h-14 border-b flex items-center px-4 md:hidden">
            <SidebarTrigger />
            <span className="ml-4 font-mono font-bold text-primary">SKY-HOSTING</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 md:p-8">
            <div className="mx-auto max-w-6xl">
              {children}
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
