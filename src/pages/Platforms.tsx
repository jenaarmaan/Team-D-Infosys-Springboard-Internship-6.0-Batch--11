import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Construction } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PlatformPageProps {
  name: string;
  description: string;
}

const PlatformPage = ({ name, description }: PlatformPageProps) => {
  const navigate = useNavigate();

  return (
    <Layout>
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-6">
        <Card className="max-w-md w-full bg-card/50 border-border/50 text-center">
          <CardHeader>
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Construction className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">{name}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-6">
              {description}
            </p>
            <Button variant="secondary" onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export const Outlook = () => (
  <PlatformPage 
    name="Outlook" 
    description="Outlook integration is coming soon. You'll be able to manage your Outlook emails with voice commands." 
  />
);

export const Telegram = () => (
  <PlatformPage 
    name="Telegram" 
    description="Telegram integration is coming soon. Send and receive messages hands-free." 
  />
);

export const WhatsApp = () => (
  <PlatformPage 
    name="WhatsApp" 
    description="WhatsApp integration is coming soon. Manage your WhatsApp conversations with voice." 
  />
);
