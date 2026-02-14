import { Layout } from '@/components/layout/Layout';
import { useGovind } from '@/contexts/GovindContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { 
  User, 
  Camera, 
  Mic, 
  Shield, 
  Mail, 
  Fingerprint,
  Edit2
} from 'lucide-react';
import { useState } from 'react';

const Profile = () => {
  const { userName, speak } = useGovind();
  const [isEditing, setIsEditing] = useState(false);

  return (
    <Layout>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold">Profile</h1>
          <p className="text-muted-foreground">Manage your account settings and preferences</p>
        </div>

        {/* Profile Card */}
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              <div className="relative">
                <div className="w-24 h-24 rounded-2xl bg-primary/20 flex items-center justify-center">
                  <User className="w-12 h-12 text-primary" />
                </div>
                <Button size="icon" variant="secondary" className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full">
                  <Camera className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold">{userName || 'Demo User'}</h2>
                <p className="text-muted-foreground">demo@govind.ai</p>
                <p className="text-sm text-primary mt-1">Voice-First User</p>
              </div>
              <Button variant="secondary" onClick={() => setIsEditing(!isEditing)}>
                <Edit2 className="w-4 h-4 mr-2" />
                Edit Profile
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Account Settings */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Account Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input 
                  value={userName || 'Demo User'} 
                  disabled={!isEditing}
                  className="bg-secondary/50"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input 
                  value="demo@govind.ai" 
                  disabled={!isEditing}
                  className="bg-secondary/50"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security Settings */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Security & Authentication
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Fingerprint className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Face Recognition</p>
                  <p className="text-sm text-muted-foreground">Use your face for secure login</p>
                </div>
              </div>
              <Switch defaultChecked />
            </div>
            
            <Separator />
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Mic className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Voice PIN</p>
                  <p className="text-sm text-muted-foreground">4-digit voice authentication</p>
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => {
                speak("To change your voice PIN, please say your current PIN first.");
              }}>
                Change PIN
              </Button>
            </div>
            
            <Separator />
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Gmail App Password</p>
                  <p className="text-sm text-muted-foreground">Connected for email access</p>
                </div>
              </div>
              <Button variant="secondary" size="sm">
                Update
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Privacy */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle>Privacy & Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Your biometric data (face recognition and voice patterns) is processed locally and never 
              stored on our servers. Only encrypted references are used for authentication.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm">Download My Data</Button>
              <Button variant="ghost" size="sm" className="text-destructive">Delete Account</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Profile;
