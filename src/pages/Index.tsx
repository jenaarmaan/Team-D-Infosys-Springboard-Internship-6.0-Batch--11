// src/pages/Index.tsx

import { useNavigate } from 'react-router-dom';
import { useGovind } from '@/contexts/GovindContext';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { 
  Mic, 
  Shield, 
  Fingerprint, 
  Sparkles, 
  ArrowRight,
  Mail,
  MessageSquare,
  Zap,
  Lock,
  Globe
} from 'lucide-react';
import { startListening } from "@/lib/govind/voiceStateController";

const features = [
  {
    icon: Mic,
    title: 'Voice-First Interaction',
    description: 'Speak naturally to manage emails, messages, and tasks. No typing required.',
  },
  {
    icon: Fingerprint,
    title: 'Face Recognition Login',
    description: 'Secure, hands-free authentication using advanced facial recognition.',
  },
  {
    icon: Shield,
    title: 'Privacy-Preserving Design',
    description: 'Your data stays encrypted. Voice and face data never leave your device.',
  },
  {
    icon: Sparkles,
    title: 'AI-Powered Assistant',
    description: 'Intelligent context awareness that understands your intent, not just keywords.',
  },
];

const platforms = [
  { icon: Mail, name: 'Gmail', color: 'from-red-500 to-orange-500' },
  { icon: MessageSquare, name: 'Outlook', color: 'from-blue-500 to-cyan-500' },
  { icon: Globe, name: 'Telegram', color: 'from-sky-400 to-blue-500' },
  { icon: Lock, name: 'WhatsApp', color: 'from-green-500 to-emerald-500' },
];

const Index = () => {
    
  const navigate = useNavigate();
  const { wakeUp, speak, addMessage } = useGovind();

  const unlockVoice = () => {
  startListening(); // browser gesture-safe
  wakeUp();
};

  const handleVoiceLogin = () => {

     unlockVoice();
    addMessage('user', 'I want to login');
    setTimeout(() => {
      speak("Let's get you logged in. Please look at your camera for face recognition.");
      navigate('/login');
    }, 500);
  };

  const handleVoiceRegister = () => {

     unlockVoice();
    addMessage('user', 'I want to register');
    setTimeout(() => {
      speak("Great! Let's create your account. I'll guide you through each step.");
      navigate('/register');
    }, 500);
  };

  return (
    <Layout fullWidth>
      <div className="min-h-screen">
        {/* Hero Section */}
        <section className="relative py-20 lg:py-32 px-6 overflow-hidden bg-hero-pattern">
          {/* Background effects */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
          </div>

          <div className="max-w-6xl mx-auto relative z-10">
            <div className="text-center mb-12">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-8 animate-fade-in">
                <Zap className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-primary">Hands-Free Voice Assistant</span>
              </div>

              {/* Main heading */}
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-display font-bold mb-6 animate-slide-up">
                Meet{' '}
                <span className="gradient-text text-glow">Govind</span>
                <br />
                Your Voice-First Assistant
              </h1>

              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 animate-slide-up" style={{ animationDelay: '0.1s' }}>
                Manage your emails, messages, and digital life completely hands-free. 
                Just say <span className="text-primary font-medium">"Hey Govind"</span> to get started.
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
                <Button 
                  size="lg" 
                  onClick={handleVoiceLogin}
                  className="text-lg px-8 py-6 rounded-xl glow-primary"
                >
                  <Mic className="w-5 h-5 mr-2" />
                  Voice Login
                </Button>
                <Button 
                  size="lg" 
                  variant="secondary"
                  onClick={handleVoiceRegister}
                  className="text-lg px-8 py-6 rounded-xl"
                >
                  Create Account
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </div>

            {/* Hero Visual */}
            <div className="relative max-w-3xl mx-auto mt-16 animate-float">
              <div className="aspect-video rounded-2xl bg-card/50 border border-border/50 backdrop-blur-xl overflow-hidden shadow-2xl">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative">
                    {/* Animated orb */}
                    <div className="w-32 h-32 rounded-full voice-orb voice-orb-speaking">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="sound-wave">
                          <div className="sound-bar h-3" />
                          <div className="sound-bar h-5" />
                          <div className="sound-bar h-8" />
                          <div className="sound-bar h-5" />
                          <div className="sound-bar h-3" />
                        </div>
                      </div>
                    </div>
                    {/* Glow rings */}
                    <div className="absolute inset-0 -m-8 rounded-full border border-primary/30 animate-pulse-ring" />
                    <div className="absolute inset-0 -m-16 rounded-full border border-primary/20 animate-pulse-ring" style={{ animationDelay: '0.5s' }} />
                  </div>
                </div>
                {/* Transcript preview */}
                <div className="absolute bottom-6 left-6 right-6">
                  <div className="glass-subtle rounded-lg px-4 py-3">
                    <p className="text-sm text-muted-foreground">
                      <span className="text-primary">"Hey Govind, </span>
                      check my emails and summarize the important ones."
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-20 px-6 border-t border-border/30">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
                Experience True Hands-Free Computing
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Govind isn't just a voice assistant — it's a complete hands-free platform 
                designed for accessibility and efficiency.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feature, index) => (
                <div 
                  key={feature.title}
                  className="p-6 rounded-xl bg-card/50 border border-border/50 hover:border-primary/30 transition-all duration-300 group animate-slide-up"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Platforms Section */}
        <section className="py-20 px-6 border-t border-border/30">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
                Unified Communication Hub
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Manage all your communication platforms with voice commands. 
                Read, reply, and organize without lifting a finger.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {platforms.map((platform, index) => (
                <div 
                  key={platform.name}
                  className="p-6 rounded-xl bg-card/50 border border-border/50 hover:border-primary/30 transition-all duration-300 text-center group cursor-pointer animate-slide-up"
                  style={{ animationDelay: `${index * 0.1}s` }}
                  onClick={() => navigate(`/${platform.name.toLowerCase()}`)}
                >
                  <div className={`w-16 h-16 mx-auto rounded-xl bg-gradient-to-br ${platform.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <platform.icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold">{platform.name}</h3>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-6 border-t border-border/30">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-6">
              Ready to Go Hands-Free?
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Join thousands of users who have transformed their digital experience 
              with voice-first interaction.
            </p>
            <Button 
              size="lg" 
              onClick={handleVoiceRegister}
              className="text-lg px-8 py-6 rounded-xl glow-primary"
            >
              Get Started for Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-8 px-6 border-t border-border/30">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <span className="text-sm font-bold text-primary-foreground">G</span>
              </div>
              <span className="font-display font-semibold">Govind</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2024 Govind. All rights reserved.
            </p>
          </div>
        </footer>
      </div>
    </Layout>
  );
};

export default Index;
