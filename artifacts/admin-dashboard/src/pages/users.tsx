import { useState } from "react";
import { 
  useAdminListUsers, getAdminListUsersQueryKey, 
  useAdminCreateUser, 
  useAdminUpdateUser, 
  useAdminDeleteUser,
  useAdminRegenerateApiKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Search, MoreHorizontal, Plus, Shield, ShieldAlert, Key, UserX, UserCheck, Trash2, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function UsersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  
  // Create user form state
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useAdminListUsers({ limit: 100 }, {
    query: {
      queryKey: getAdminListUsersQueryKey({ limit: 100 })
    }
  });

  const createMutation = useAdminCreateUser({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "User created successfully" });
        if ((data as any).apiKey) {
          setNewApiKey((data as any).apiKey);
        } else {
          setIsCreateOpen(false);
        }
        queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey({ limit: 100 }) });
        setUsername("");
        setEmail("");
        setPassword("");
        setRole("user");
      },
      onError: (error: any) => {
        toast({ 
          variant: "destructive", 
          title: "Failed to create user", 
          description: error?.data?.error || error.message 
        });
      }
    }
  });

  const updateMutation = useAdminUpdateUser({
    mutation: {
      onSuccess: () => {
        toast({ title: "User updated successfully" });
        queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey({ limit: 100 }) });
      },
      onError: (error: any) => {
        toast({ 
          variant: "destructive", 
          title: "Failed to update user", 
          description: error?.data?.error || error.message 
        });
      }
    }
  });

  const deleteMutation = useAdminDeleteUser({
    mutation: {
      onSuccess: () => {
        toast({ title: "User deleted successfully" });
        queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey({ limit: 100 }) });
      },
      onError: (error: any) => {
        toast({ 
          variant: "destructive", 
          title: "Failed to delete user", 
          description: error?.data?.error || error.message 
        });
      }
    }
  });

  const regenerateKeyMutation = useAdminRegenerateApiKey({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "API key regenerated successfully" });
        setNewApiKey((data as any).apiKey);
        queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey({ limit: 100 }) });
      },
      onError: (error: any) => {
        toast({ 
          variant: "destructive", 
          title: "Failed to regenerate API key", 
          description: error?.data?.error || error.message 
        });
      }
    }
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    
    createMutation.mutate({
      data: { username, email, password, role }
    });
  };

  const users = data?.users || [];
  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (u.email || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tight">Users</h1>
          <p className="text-muted-foreground mt-1">Manage platform accounts and access</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search users..."
              className="pl-9 bg-background font-mono"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Dialog open={isCreateOpen} onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) setNewApiKey(null);
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" /> Add User
              </Button>
            </DialogTrigger>
            <DialogContent>
              {newApiKey ? (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-primary">
                      <CheckCircle2 className="h-5 w-5" /> Success
                    </DialogTitle>
                    <DialogDescription>
                      User created successfully. Please copy the API key now. It will not be shown again.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="p-4 bg-muted rounded-md border border-border font-mono text-sm break-all">
                    {newApiKey}
                  </div>
                  <DialogFooter>
                    <Button onClick={() => { setIsCreateOpen(false); setNewApiKey(null); }}>
                      Done
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                <form onSubmit={handleCreateUser}>
                  <DialogHeader>
                    <DialogTitle>Create New User</DialogTitle>
                    <DialogDescription>
                      Add a new user to the platform. They will be able to create deployments.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="username">Username</Label>
                      <Input id="username" value={username} onChange={e => setUsername(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role">Role</Label>
                      <Select value={role} onValueChange={(val: any) => setRole(val)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={createMutation.isPending || !username || !password}>
                      {createMutation.isPending ? "Creating..." : "Create User"}
                    </Button>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {newApiKey && !isCreateOpen && (
        <Card className="border-primary bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-primary flex items-center gap-2 text-base">
              <Key className="h-4 w-4" /> API Key Regenerated
            </CardTitle>
            <CardDescription>Copy this key now. It will not be shown again.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="p-3 bg-background rounded border font-mono text-sm break-all select-all">
              {newApiKey}
            </div>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setNewApiKey(null)}>Dismiss</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Deployments</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Loading users...
                  </TableCell>
                </TableRow>
              ) : filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow key={user.id} className={!user.isActive ? "opacity-60" : ""}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{user.username}</span>
                        <span className="text-xs text-muted-foreground">{user.email || 'No email'}</span>
                        {user.apiKeyPrefix && (
                          <span className="text-xs font-mono text-muted-foreground/70 mt-0.5">Key: {user.apiKeyPrefix}...</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className="capitalize">
                        {user.role === 'admin' ? <ShieldAlert className="h-3 w-3 mr-1" /> : <Shield className="h-3 w-3 mr-1" />}
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? 'outline' : 'destructive'}>
                        {user.isActive ? 'Active' : 'Disabled'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono">{user.deploymentCount}</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem 
                            onClick={() => updateMutation.mutate({ id: user.id, data: { isActive: !user.isActive } })}
                            disabled={updateMutation.isPending}
                          >
                            {user.isActive ? (
                              <><UserX className="h-4 w-4 mr-2" /> Disable Account</>
                            ) : (
                              <><UserCheck className="h-4 w-4 mr-2" /> Enable Account</>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => regenerateKeyMutation.mutate({ id: user.id })}
                            disabled={regenerateKeyMutation.isPending}
                          >
                            <Key className="h-4 w-4 mr-2" /> Regenerate API Key
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this user? This cannot be undone.')) {
                                deleteMutation.mutate({ id: user.id });
                              }
                            }}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Delete User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
