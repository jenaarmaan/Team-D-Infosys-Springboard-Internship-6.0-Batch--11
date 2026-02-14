import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useGovind } from '@/contexts/GovindContext';
import { 
  Home, 
  LayoutDashboard, 
  Mail, 
  MessageSquare, 
  Send, 
  Phone,
  Settings, 
  FileText, 
  ChevronLeft,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface NavItem {
  icon: React.ElementType;
  label: string;
  href: string;
  badge?: string;
}

const mainNavItems: NavItem[] = [
  { icon: Home, label: 'Home', href: '/' },
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
];

const platformItems: NavItem[] = [
  { icon: Mail, label: 'Gmail', href: '/gmail', badge: '3' },
  { icon: MessageSquare, label: 'Outlook', href: '/outlook' },
  { icon: Send, label: 'Telegram', href: '/telegram' },
  { icon: Phone, label: 'WhatsApp', href: '/whatsapp' },
];

const bottomItems: NavItem[] = [
  { icon: FileText, label: 'Docs', href: '/docs' },
  { icon: Settings, label: 'Settings', href: '/settings' },
];

export const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { isAuthenticated } = useGovind();

  const NavLink = ({ item }: { item: NavItem }) => {
    const isActive = location.pathname === item.href;
    const Icon = item.icon;

    const linkContent = (
      <Link
        to={item.href}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative",
          isActive 
            ? "bg-primary/10 text-primary" 
            : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
        )}
      >
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
        )}
        <Icon className={cn("w-5 h-5 flex-shrink-0", isActive && "text-primary")} />
        {!collapsed && (
          <>
            <span className="flex-1 text-sm font-medium">{item.label}</span>
            {item.badge && (
              <span className="px-2 py-0.5 text-xs font-medium bg-primary/20 text-primary rounded-full">
                {item.badge}
              </span>
            )}
          </>
        )}
      </Link>
    );

    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            {linkContent}
          </TooltipTrigger>
          <TooltipContent side="right">
            {item.label}
          </TooltipContent>
        </Tooltip>
      );
    }

    return linkContent;
  };

  return (
    <aside 
      className={cn(
        "fixed left-0 top-16 bottom-0 glass border-r border-border/50 transition-all duration-300 z-40",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex flex-col h-full p-3">
        {/* Collapse Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-6 w-6 h-6 rounded-full bg-card border border-border shadow-md hover:bg-secondary"
        >
          {collapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronLeft className="w-3 h-3" />
          )}
        </Button>

        {/* Main Navigation */}
        <nav className="flex-1 space-y-1">
          {mainNavItems.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}

          {isAuthenticated && (
            <>
              {/* Platforms Section */}
              <div className="pt-4">
                {!collapsed && (
                  <h3 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Platforms
                  </h3>
                )}
                <div className="space-y-1">
                  {platformItems.map((item) => (
                    <NavLink key={item.href} item={item} />
                  ))}
                </div>
              </div>
            </>
          )}
        </nav>

        {/* Bottom Navigation */}
        <div className="space-y-1 pt-4 border-t border-border/50">
          {bottomItems.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>

        {/* Pro Badge */}
        {!collapsed && (
          <div className="mt-4 p-3 rounded-lg bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Upgrade to Pro</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Unlock advanced AI features and priority support.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
};
