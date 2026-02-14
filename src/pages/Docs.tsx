import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Mic,
  Mail,
  MessageSquare,
  Settings,
  User,
  Navigation,
  HelpCircle,
  Volume2,
  ShieldCheck,
  Zap,
  Smartphone,
  Info,
  AlertCircle
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const Docs = () => {
  const sections = [
    {
      category: 'General & System',
      description: 'Core commands to control the assistant and manage your session.',
      icon: Mic,
      items: [
        { command: '"Hey Govind"', description: 'Wake up the assistant from idle mode.' },
        { command: '"Stop listening"', description: 'Deactivate the microphone and put Govind into sleep mode.' },
        { command: '"Repeat that"', description: 'Ask Govind to repeat the last spoken response.' },
        { command: '"Cancel"', description: 'Immediately abort the current action or clear any active drafts.' },
        { command: '"Pause / Resume"', description: 'Temporarily stop Govind from speaking or resume a paused sequence.' },
      ],
    },
    {
      category: 'Email (Gmail)',
      description: 'Manage your inbox, send new messages, and summarize long threads using AI.',
      icon: Mail,
      items: [
        { command: '"Check my emails"', description: 'Hear a summary of your unread messages for today.' },
        { command: '"Read my inbox"', description: 'Lists your most recent emails with sender and subject.' },
        { command: '"Send email to [name]"', description: 'Start the flow to compose a new email. Govind will ask for details.' },
        { command: '"Reply to this email"', description: 'Reply to the email you are currently viewing or just heard.' },
        { command: '"Summarize this thread"', description: 'Use AI to extract key points from a long email chain.' },
      ],
    },
    {
      category: 'Messaging (Telegram & WhatsApp)',
      description: 'Stay connected across platforms with voice-to-text messaging features.',
      icon: MessageSquare,
      items: [
        { command: '"Open Telegram"', description: 'Navigate to the Telegram dashboard.' },
        { command: '"Check Telegram messages"', description: 'Read latest messages from your active chats.' },
        { command: '"Send message on WhatsApp to [name]"', description: 'Address a contact and dictate a message for WhatsApp.' },
        { command: '"Reply on Telegram [message]"', description: 'Send a quick reply to the last person who messaged you.' },
        { command: '"Draft WhatsApp to [name]"', description: 'Create a draft that you can review before sending.' },
      ],
    },
    {
      category: 'Navigation & UI',
      description: 'Move quickly between different parts of the application.',
      icon: Navigation,
      items: [
        { command: '"Go to dashboard"', description: 'Return to the main overview screen.' },
        { command: '"Open settings"', description: 'Access account, voice, and notification settings.' },
        { command: '"View my profile"', description: 'See your account details and security settings.' },
        { command: '"Go back"', description: 'Return to the previously visited page.' },
        { command: '"Scroll down / up"', description: 'Control the dashboard layout if your hands are busy.' },
      ],
    },
    {
      category: 'Security & Auth',
      description: 'Protect your privacy and manage your biometric and voice credentials.',
      icon: ShieldCheck,
      details: 'Govind uses Hybrid Real-Time Security (HRTS) for all authentication.',
      items: [
        { command: '"Log me in"', description: 'Initiate Secure Login with Face & Voice Verification.' },
        { command: '"Log out"', description: 'Securely end your session and lock the interface.' },
        { command: '"Verify identity"', description: 'Triggers a quick biometric check for sensitive actions.' },
        { command: '"Change my PIN"', description: 'Update your secondary numeric or voice-based PIN.' },
      ],
    },
    {
      category: 'Help & Knowledge',
      description: 'Get guidance on how to use specific features or ask about capabilities.',
      icon: HelpCircle,
      items: [
        { command: '"Help"', description: 'Get immediate context-aware assistance for the current screen.' },
        { command: '"What can you do?"', description: 'Hear a list of currently available voice commands.' },
        { command: '"Show me commands for [platform]"', description: 'Get specific advice for Gmail, Telegram, etc.' },
      ],
    },
  ];

  return (
    <Layout>
      <div className="p-6 lg:p-10 max-w-5xl mx-auto space-y-12 pb-32">
        {/* Header Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="border-primary/50 text-primary animate-pulse">
              VERSION 2.1.0
            </Badge>
            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500 border-none">
              LIVE PIPELINE READY
            </Badge>
          </div>
          <h1 className="text-4xl lg:text-5xl font-display font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
            System Documentation
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl leading-relaxed">
            Welcome to Govind, your secure, voice-first personal assistant. This guide covers everything from basic operations to advanced AI-enabled workflows.
          </p>
        </div>

        {/* Quick Start Guide */}
        <section className="space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-5 h-5 text-amber-500" />
            <h2 className="text-2xl font-bold">Getting Started Fast</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { step: 1, title: 'Wake Word', text: 'Say "Hey Govind" at any time. The top indicator will pulse blue when active.', icon: Mic },
              { step: 2, title: 'Wait for Signal', text: 'Wait for the "Yes, I\'m listening" prompt before giving your command.', icon: Volume2 },
              { step: 3, title: 'Speak Naturally', text: 'You don\'t need to be robot; say things like "Check my mail from John".', icon: MessageSquare },
              { step: 4, title: 'Confirmation', text: 'Govind will summarize what it heard and ask for confirmation for actions.', icon: ShieldCheck },
            ].map((s) => (
              <Card key={s.step} className="bg-card/30 border-border/50 backdrop-blur-sm relative overflow-hidden group hover:border-primary/30 transition-all">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <s.icon className="w-12 h-12" />
                </div>
                <CardContent className="p-6 space-y-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">
                    {s.step}
                  </div>
                  <h3 className="font-bold text-lg">{s.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{s.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Detailed Command Sections */}
        <section className="space-y-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Info className="w-5 h-5 text-blue-500" />
              <h2 className="text-2xl font-bold">Command Directory</h2>
            </div>
            <p className="text-xs text-muted-foreground hidden md:block italic">
              "Action-Intent-Platform" routing enabled
            </p>
          </div>

          <div className="grid gap-8">
            {sections.map((section) => (
              <Card key={section.category} className="bg-card/20 border-border/40 backdrop-blur-md overflow-hidden hover:bg-card/30 transition-colors">
                <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b border-border/30 pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-3 text-xl font-bold">
                      <div className="p-2 rounded-xl bg-primary/10">
                        <section.icon className="w-5 h-5 text-primary" />
                      </div>
                      {section.category}
                    </CardTitle>
                    {section.details && (
                      <Badge variant="outline" className="text-[10px] text-primary/70 uppercase tracking-widest px-2 py-0 border-primary/20">
                        {section.category === 'Security & Auth' ? 'HRTS Enabled' : 'Active'}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
                    {section.description}
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border/20">
                    {section.items.map((item, index) => (
                      <div
                        key={index}
                        className="flex flex-col md:flex-row md:items-center gap-4 p-4 lg:p-6 hover:bg-white/[0.02] transition-colors group"
                      >
                        <div className="md:w-1/3 flex-shrink-0">
                          <code className="text-[13px] font-mono text-primary bg-primary/10 px-3 py-1.5 rounded-lg border border-primary/20 shadow-sm inline-block group-hover:scale-[1.02] transition-transform">
                            {item.command}
                          </code>
                        </div>
                        <div className="md:w-2/3">
                          <p className="text-sm text-muted-foreground group-hover:text-white/80 transition-colors">
                            {item.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Tips & Best Practices */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Card className="lg:col-span-2 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 border-indigo-500/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-indigo-400" />
                Tips for Best Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center flex-shrink-0 text-[10px]">•</div>
                    <p className="text-muted-foreground"><strong>Ambient Noise</strong>: Speak clearly in a quiet environment. High background noise may affect intent accuracy.</p>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center flex-shrink-0 text-[10px]">•</div>
                    <p className="text-muted-foreground"><strong>Wait for Beep</strong>: Always wait for the visual or audio acknowledgment before speaking your intent.</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center flex-shrink-0 text-[10px]">•</div>
                    <p className="text-muted-foreground"><strong>Correction</strong>: If Govind mishears you, immediately say "Cancel" or "No, I meant..." to correct the flow.</p>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center flex-shrink-0 text-[10px]">•</div>
                    <p className="text-muted-foreground"><strong>Deduplication</strong>: If you say a command and nothing happens, wait 2 seconds for the network sync before retrying.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-destructive/5 border-destructive/20 h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="w-5 h-5" />
                Important Notice
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-xs text-muted-foreground leading-relaxed">
              <p>
                Govind transmits voice packets for intent processing. No audio is stored permanently unless "Learning Mode" is explicitly enabled in Settings.
              </p>
              <p>
                Platform integrations (Gmail/Telegram) require active session tokens. If a platform stops responding, please re-authenticate from the <span className="text-primary font-bold">Profile</span> page.
              </p>
              <div className="pt-4 border-t border-destructive/10">
                <p className="font-bold mb-1">Emergency Reset:</p>
                <p>If voice recognition locks up, refresh the browser page (F5) to re-initialize the SpeechRecognition API.</p>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </Layout>
  );
};

export default Docs;
