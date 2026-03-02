import { Link, useNavigate } from 'react-router-dom';
import { useGovind } from '@/contexts/GovindContext';
import { useGmail } from '@/contexts/GmailContext';
import { useTelegram } from '@/contexts/TelegramContext';
import { Mic, MicOff, User, LogOut, Settings, Bell, Mail, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export const Navbar = () => {
  const { state, isAuthenticated, userName, wakeUp, sleep, setIsAuthenticated, clearMessages, addMessage, speak, performLogout } = useGovind();
  const { unreadCount: gmailUnread } = useGmail();
  const { unreadChats } = useTelegram();
  const navigate = useNavigate();

  const telegramUnread = unreadChats.reduce((acc, chat) => acc + (chat.unreadCount || 0), 0);
  const totalUnread = gmailUnread + telegramUnread;

  const handleMicToggle = () => {
    if (state === 'DORMANT') {
      wakeUp();
    } else {
      sleep();
    }
  };

  const handleLogout = async () => {
    speak("Goodbye! See you soon.");
    setTimeout(async () => {
      await performLogout();
      clearMessages();
      addMessage('system', 'Say "Hey Govind" to wake me up');
    }, 1500);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 h-16 glass border-b border-border/50 z-50">
      <div className="flex items-center justify-between h-full px-4 lg:px-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center glow-primary transition-transform group-hover:scale-105">
            <span className="text-lg font-bold font-display text-primary-foreground">G</span>
          </div>
          <span className="text-xl font-display font-semibold gradient-text hidden sm:block">
            Govind
          </span>
        </Link>

        {/* Center: Status */}
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full transition-colors ${state === 'DORMANT' ? 'bg-govind-dormant' :
              state === 'LISTENING' || state === 'AWAKE' ? 'bg-govind-listening animate-pulse' :
                state === 'PROCESSING' ? 'bg-govind-processing animate-pulse' :
                  state === 'RESPONDING' ? 'bg-govind-speaking animate-pulse' :
                    'bg-primary'
              }`}
          />
          <span className="text-sm text-muted-foreground capitalize hidden sm:inline">
            {state === 'DORMANT' ? 'Waiting for wake word' : state.replace('_', ' ')}
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Mic Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleMicToggle}
            className={`relative ${state !== 'DORMANT' ? 'text-govind-listening' : 'text-muted-foreground'}`}
          >
            {state !== 'DORMANT' ? (
              <Mic className="w-5 h-5" />
            ) : (
              <MicOff className="w-5 h-5" />
            )}
            {state !== 'DORMANT' && (
              <span className="absolute inset-0 rounded-md border-2 border-govind-listening animate-pulse-ring" />
            )}
          </Button>

          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground relative">
                <Bell className="w-5 h-5" />
                {totalUnread > 0 && (
                  <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white border-2 border-background">
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <p className="px-3 py-2 text-sm font-semibold border-b border-border/50">Notifications</p>

              {gmailUnread > 0 && (
                <DropdownMenuItem onClick={() => navigate('/gmail')} className="flex justify-between items-center py-3 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-primary" />
                    <span>Unread Emails</span>
                  </div>
                  <Badge variant="secondary" className="bg-primary/20 text-primary">{gmailUnread}</Badge>
                </DropdownMenuItem>
              )}

              {telegramUnread > 0 && (
                <DropdownMenuItem onClick={() => navigate('/telegram')} className="flex justify-between items-center py-3 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Send className="w-4 h-4 text-primary" />
                    <span>Unread Messages</span>
                  </div>
                  <Badge variant="secondary" className="bg-primary/20 text-primary">{telegramUnread}</Badge>
                </DropdownMenuItem>
              )}

              {totalUnread === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p>Everything is up to date!</p>
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User Menu */}
          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <span className="hidden sm:inline text-sm">{userName || 'User'}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <User className="w-4 h-4 mr-2" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/settings')}>
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>
                Login
              </Button>
              <Button size="sm" onClick={() => navigate('/register')}>
                Get Started
              </Button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};
