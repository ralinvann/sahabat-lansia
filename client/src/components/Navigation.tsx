import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Home, User, Users, HelpCircle, Upload, FileText, LogIn, LogOut } from "lucide-react";

interface NavigationProps {
  currentPage: string;
  onPageChange: (page: string) => void;
  isAuthed: boolean;
  userRole?: "superadmin" | "admin" | "officer";
  onShowLogin: () => void;
  onLogout: () => void;
}

export function Navigation({ currentPage, onPageChange, isAuthed, userRole, onShowLogin, onLogout }: NavigationProps) {
  const handleLogout = () => {
    onLogout();
  };

  const publicNavItems = [
    { id: 'dashboard', label: 'Home', icon: Home },
    { id: 'help', label: 'Bantuan', icon: HelpCircle },
  ];

  const authenticatedNavItems = [
    { id: 'dashboard', label: 'Home', icon: Home },
    { id: 'upload', label: 'Unggah', icon: Upload },
    { id: 'preview', label: 'Pratinjau', icon: FileText },
    { id: 'account', label: 'Akun', icon: User },
    ...(userRole === "admin" || userRole === "superadmin"
      ? [{ id: 'users', label: 'Pengguna', icon: Users }]
      : []),
    { id: 'help', label: 'Bantuan', icon: HelpCircle },
  ];

  const navItems = isAuthed ? authenticatedNavItems : publicNavItems;

  const handleNavClick = (itemId: string) => {
    if (!isAuthed && !['dashboard', 'help'].includes(itemId)) {
      onShowLogin();
    } else {
      onPageChange(itemId);
    }
  };

  return (
    <nav className="bg-white shadow-sm border-b border-border">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-foreground" style={{ fontSize: "1.5rem", fontWeight: 600 }}>Sahabat Lansia</h1>
            {!isAuthed && (
              <Badge variant="outline" className="px-2.5 py-0.5">
                Mode Tamu
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              Monitoring Kesehatan Lansia
            </span>
            {!isAuthed ? (
              <Button
                onClick={onShowLogin}
                className="gap-2 transition-all duration-200 hover:scale-[1.03] active:scale-[0.97]"
              >
                <LogIn size={18} />
                Masuk
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={handleLogout}
                className="gap-2 transition-all duration-200 hover:scale-[1.03] active:scale-[0.97]"
              >
                <LogOut size={18} />
                Keluar
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            const isRestricted = !isAuthed && !['dashboard', 'help'].includes(item.id);
            return (
              <Button
                key={item.id}
                variant={isActive ? "default" : "ghost"}
                size="sm"
                onClick={() => handleNavClick(item.id)}
                className={`gap-2 transition-all duration-200 hover:scale-[1.03] active:scale-[0.97] ${
                  isRestricted ? 'opacity-50' : ''
                } ${isActive ? 'shadow-sm' : ''}`}
              >
                <Icon size={16} />
                {item.label}
                {isRestricted && <span className="text-xs opacity-70">🔒</span>}
              </Button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
