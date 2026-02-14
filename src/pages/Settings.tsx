import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import {
  Volume2,
  Mic,
  Languages,
  Moon,
  Sun,
  Monitor,
  Bell,
  Keyboard,
  Zap,
  Accessibility,
  Shield,
  Sparkles,
  Info
} from 'lucide-react';
import { useSettings } from '@/contexts/SettingsContext';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const Settings = () => {
  const {
    continuousListening, setContinuousListening,
    wakeWordSensitivity, setWakeWordSensitivity,
    voiceFeedback, setVoiceFeedback,
    speechVolume, setSpeechVolume,
    speechRate, setSpeechRate,
    theme, setTheme,
    emailNotifications, setEmailNotifications,
    messageAlerts, setMessageAlerts,
    highContrast, setHighContrast,
    screenReader, setScreenReader,
    autoSummarize, setAutoSummarize,
    privacyMasking, setPrivacyMasking,
    experimentalFeatures, setExperimentalFeatures
  } = useSettings();

  return (
    <Layout>
      <div className="p-6 lg:p-10 max-w-5xl mx-auto space-y-10 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="space-y-2">
          <h1 className="text-3xl lg:text-4xl font-display font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-lg">Manage your assistant's behavior and environment.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Main Settings Column */}
          <div className="lg:col-span-2 space-y-8">

            {/* Appearance Section */}
            <Card className="bg-card/30 backdrop-blur-sm border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Moon className="w-5 h-5 text-primary" />
                  Appearance
                </CardTitle>
                <CardDescription>Customize the look and feel of Govind.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { id: 'light', icon: Sun, label: 'Light' },
                    { id: 'dark', icon: Moon, label: 'Dark' },
                    { id: 'system', icon: Monitor, label: 'System' }
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id as any)}
                      className={cn(
                        "flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all gap-2",
                        theme === t.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/50 bg-secondary/20 text-muted-foreground hover:border-border hover:bg-secondary/40"
                      )}
                    >
                      <t.icon className="w-6 h-6" />
                      <span className="text-xs font-semibold">{t.label}</span>
                    </button>
                  ))}
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="font-medium">High Contrast</p>
                    <p className="text-sm text-muted-foreground">Increase visibility for key elements.</p>
                  </div>
                  <Switch checked={highContrast} onCheckedChange={setHighContrast} />
                </div>
              </CardContent>
            </Card>

            {/* Voice & Intelligence */}
            <Card className="bg-card/30 backdrop-blur-sm border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Mic className="w-5 h-5 text-primary" />
                  Voice & Intelligence
                </CardTitle>
                <CardDescription>Fine-tune how Govind hears and responds to you.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="font-medium">Continuous Listening</p>
                    <p className="text-sm text-muted-foreground">Monitor for "Hey Govind" in the background.</p>
                  </div>
                  <Switch checked={continuousListening} onCheckedChange={setContinuousListening} />
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">Wake Word Sensitivity</p>
                    <Badge variant="secondary" className="bg-primary/10 text-primary border-none">{wakeWordSensitivity}%</Badge>
                  </div>
                  <Slider
                    value={[wakeWordSensitivity]}
                    onValueChange={(v) => setWakeWordSensitivity(v[0])}
                    max={100}
                    step={1}
                  />
                  <p className="text-[10px] text-muted-foreground italic text-center">Higher sensitivity may cause accidental triggers in noisy environments.</p>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="font-medium">Voice Feedback</p>
                    <p className="text-sm text-muted-foreground">Enable spoken responses for all actions.</p>
                  </div>
                  <Switch checked={voiceFeedback} onCheckedChange={setVoiceFeedback} />
                </div>
              </CardContent>
            </Card>

            {/* Audio Section */}
            <Card className="bg-card/30 backdrop-blur-sm border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Volume2 className="w-5 h-5 text-primary" />
                  Audio Control
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">Speech Volume</p>
                    <span className="text-sm font-bold text-primary">{speechVolume}%</span>
                  </div>
                  <Slider
                    value={[speechVolume]}
                    onValueChange={(v) => setSpeechVolume(v[0])}
                    max={100}
                    step={1}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">Speech Rate</p>
                    <span className="text-sm font-bold text-primary">
                      {speechRate < 40 ? 'Slow' : speechRate > 60 ? 'Fast' : 'Normal'}
                    </span>
                  </div>
                  <Slider
                    value={[speechRate]}
                    onValueChange={(v) => setSpeechRate(v[0])}
                    max={100}
                    step={1}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Security & Privacy (EXTRA FEATURES) */}
            <Card className="bg-card/30 backdrop-blur-sm border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-emerald-500" />
                  Privacy & Safety
                </CardTitle>
                <CardDescription>Advanced protection for your data during voice interactions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">AI Privacy Masking</p>
                      <Badge className="bg-emerald-500/20 text-emerald-500 border-none text-[9px]">RECOMMENDED</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">Automatically mask PII and sensitive data in drafts.</p>
                  </div>
                  <Switch checked={privacyMasking} onCheckedChange={setPrivacyMasking} />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="font-medium">Auto-Summarization</p>
                    <p className="text-sm text-muted-foreground">Generate AI summaries for incoming notifications.</p>
                  </div>
                  <Switch checked={autoSummarize} onCheckedChange={setAutoSummarize} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar Settings Column */}
          <div className="space-y-8">
            {/* Language Selection */}
            <Card className="bg-card/30 backdrop-blur-sm border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Languages className="w-4 h-4 text-primary" />
                  Language
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full justify-between group">
                  English (US)
                  <Zap className="w-3 h-3 text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Button>
                <p className="text-[10px] text-muted-foreground mt-3 italic">More languages coming in next major update.</p>
              </CardContent>
            </Card>

            {/* Notification Group */}
            <Card className="bg-card/30 backdrop-blur-sm border-border/50 text-white">
              <CardHeader>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Bell className="w-4 h-4 text-primary" />
                  Notifications
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span>Emails</span>
                  <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Messages</span>
                  <Switch checked={messageAlerts} onCheckedChange={setMessageAlerts} />
                </div>
              </CardContent>
            </Card>

            {/* Experimental Features (EXTRA) */}
            <Card className="bg-gradient-to-br from-purple-500/5 to-primary/5 border-purple-500/20">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm text-purple-400">
                  <Sparkles className="w-4 h-4" />
                  Experimental
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Beta Features</span>
                  <Switch checked={experimentalFeatures} onCheckedChange={setExperimentalFeatures} />
                </div>
                {experimentalFeatures && (
                  <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 animate-in zoom-in-95 duration-200">
                    <p className="text-[10px] text-purple-300 leading-relaxed italic">
                      You now have access to "Predictive Intent" and "Voice Mood Detection" beta modules.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Help / Shortcuts */}
            <Card className="bg-secondary/20 border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Shortcuts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { key: 'Space', action: 'Activate Voice' },
                  { key: 'Esc', action: 'Stop Speaking' },
                  { key: 'Ctrl + ,', action: 'Settings' }
                ].map((s) => (
                  <div key={s.key} className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">{s.action}</span>
                    <kbd className="px-1.5 py-0.5 bg-background border border-border/50 rounded shadow-sm font-mono text-[9px]">{s.key}</kbd>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 flex gap-3 items-start">
              <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Settings are synced to your current browser profile. Log in to sync across devices in future versions.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Settings;
