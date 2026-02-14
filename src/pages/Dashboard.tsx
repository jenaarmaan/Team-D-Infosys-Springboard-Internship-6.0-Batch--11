import { useNavigate } from 'react-router-dom';
import { useGovind } from '@/contexts/GovindContext';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Mail, 
  MessageSquare, 
  Mic,
  Clock,
  TrendingUp,
  CheckCircle2,
  ArrowRight,
  Activity,
  Inbox,
  Send as SendIcon
} from 'lucide-react';

const Dashboard = () => {
  const navigate = useNavigate();
  const { userName, speak, addMessage } = useGovind();

  const stats = [
    { label: 'Unread Emails', value: '12', icon: Mail, color: 'text-red-400' },
    { label: 'Messages', value: '8', icon: MessageSquare, color: 'text-blue-400' },
    { label: 'Voice Commands', value: '47', icon: Mic, color: 'text-primary' },
    { label: 'Tasks Complete', value: '15', icon: CheckCircle2, color: 'text-green-400' },
  ];

  const recentActivity = [
    { action: 'Email from John Smith', time: '5 min ago', type: 'email' },
    { action: 'Telegram message from Team', time: '15 min ago', type: 'message' },
    { action: 'Voice command: Check weather', time: '1 hour ago', type: 'voice' },
    { action: 'Email sent to client', time: '2 hours ago', type: 'sent' },
  ];

  const quickActions = [
    { label: 'Check Gmail', icon: Inbox, action: () => {
      addMessage('user', 'Check my Gmail');
      speak("Opening Gmail. You have 12 unread emails. Would you like me to read the most important ones?");
      navigate('/gmail');
    }},
    { label: 'Send Email', icon: SendIcon, action: () => {
      addMessage('user', 'I want to send an email');
      speak("Sure, who would you like to send an email to?");
    }},
    { label: 'Voice Note', icon: Mic, action: () => {
      addMessage('user', 'Record a voice note');
      speak("I'm ready to record your voice note. Start speaking whenever you're ready.");
    }},
  ];

  return (
    <Layout>
      <div className="p-6 lg:p-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold">
              Welcome back, {userName || 'User'}
            </h1>
            <p className="text-muted-foreground">
              Here's what's happening with your accounts today.
            </p>
          </div>
          <Button onClick={() => {
            speak("How can I help you today?");
          }}>
            <Mic className="w-4 h-4 mr-2" />
            Voice Command
          </Button>
        </div>

        {/* Stats */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="bg-card/50 border-border/50 hover:border-primary/30 transition-colors">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-3xl font-display font-bold mt-1">{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-lg bg-secondary ${stat.color}`}>
                    <stat.icon className="w-6 h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Quick Actions */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {quickActions.map((action) => (
                <Button
                  key={action.label}
                  variant="secondary"
                  className="w-full justify-start h-12"
                  onClick={action.action}
                >
                  <action.icon className="w-5 h-5 mr-3" />
                  {action.label}
                  <ArrowRight className="w-4 h-4 ml-auto" />
                </Button>
              ))}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="lg:col-span-2 bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivity.map((item, index) => (
                  <div 
                    key={index} 
                    className="flex items-center justify-between py-3 border-b border-border/50 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        item.type === 'email' ? 'bg-red-500/10 text-red-400' :
                        item.type === 'message' ? 'bg-blue-500/10 text-blue-400' :
                        item.type === 'voice' ? 'bg-primary/10 text-primary' :
                        'bg-green-500/10 text-green-400'
                      }`}>
                        {item.type === 'email' && <Mail className="w-5 h-5" />}
                        {item.type === 'message' && <MessageSquare className="w-5 h-5" />}
                        {item.type === 'voice' && <Mic className="w-5 h-5" />}
                        {item.type === 'sent' && <SendIcon className="w-5 h-5" />}
                      </div>
                      <span className="text-sm">{item.action}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      {item.time}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Voice Tips */}
        <Card className="bg-gradient-to-r from-primary/10 to-accent/10 border-primary/20">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="p-3 rounded-lg bg-primary/20">
                <Mic className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Voice Command Tips</h3>
                <p className="text-sm text-muted-foreground">
                  Try saying "Hey Govind, read my unread emails" or "What's on my schedule today?" 
                  Govind understands natural language, so just speak naturally.
                </p>
              </div>
              <Button variant="secondary" className="flex-shrink-0">
                View All Commands
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Dashboard;
