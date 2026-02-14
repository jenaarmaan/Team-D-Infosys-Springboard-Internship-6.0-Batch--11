import { Link, useNavigate } from 'react-router-dom';
import { useGovind } from '@/contexts/GovindContext';
import { Mic, MicOff, User, LogOut, Settings, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export const Navbar = () => {
  const { state, isAuthenticated, userName, wakeUp, sleep, setIsAuthenticated, clearMessages, addMessage, speak } = useGovind();
  const navigate = useNavigate();

  const handleMicToggle = () => {
    if (state === 'dormant') {
      wakeUp();
    } else {
      sleep();
    }
  };

  const handleLogout = () => {
    speak("Goodbye! See you soon.");
    setTimeout(() => {
      setIsAuthenticated(false);
      clearMessages();
      navigate('/');
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
            className={`w-2 h-2 rounded-full transition-colors ${
              state === 'dormant' ? 'bg-govind-dormant' :
              state === 'listening' || state === 'awake' ? 'bg-govind-listening animate-pulse' :
              state === 'processing' ? 'bg-govind-processing animate-pulse' :
              state === 'responding' ? 'bg-govind-speaking animate-pulse' :
              'bg-primary'
            }`}
          />
          <span className="text-sm text-muted-foreground capitalize hidden sm:inline">
            {state === 'dormant' ? 'Waiting for wake word' : state.replace('_', ' ')}
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Mic Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleMicToggle}
            className={`relative ${state !== 'dormant' ? 'text-govind-listening' : 'text-muted-foreground'}`}
          >
            {state !== 'dormant' ? (
              <Mic className="w-5 h-5" />
            ) : (
              <MicOff className="w-5 h-5" />
            )}
            {state !== 'dormant' && (
              <span className="absolute inset-0 rounded-md border-2 border-govind-listening animate-pulse-ring" />
            )}
          </Button>

          {/* Notifications */}
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
            <Bell className="w-5 h-5" />
          </Button>

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
