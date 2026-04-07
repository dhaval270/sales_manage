'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';

const profileSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
});

const passwordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

export default function SettingsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const { register: regProfile, handleSubmit: handleProfile, reset: resetProfile, formState: { errors: profileErrors } } = useForm<ProfileForm>({ resolver: zodResolver(profileSchema) });
  const { register: regPassword, handleSubmit: handlePassword, reset: resetPassword, formState: { errors: passwordErrors } } = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? '');
      const { data: profile } = await supabase.from('profiles').select('first_name, last_name').eq('id', user.id).single();
      if (profile) resetProfile({ first_name: profile.first_name, last_name: profile.last_name });
    };
    load();
  }, [resetProfile]);

  const onProfileSubmit = async (data: ProfileForm) => {
    setProfileLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('profiles').update({ first_name: data.first_name, last_name: data.last_name }).eq('id', user.id);
    setProfileLoading(false);
    if (error) { toast({ title: 'Update failed', description: error.message, variant: 'destructive' }); }
    else { toast({ title: 'Profile updated' }); }
  };

  const onPasswordSubmit = async (data: PasswordForm) => {
    setPasswordLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: data.password });
    setPasswordLoading(false);
    if (error) { toast({ title: 'Password change failed', description: error.message, variant: 'destructive' }); }
    else { toast({ title: 'Password updated' }); resetPassword(); }
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm">Manage your account</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>{email}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfile(onProfileSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input {...regProfile('first_name')} />
                {profileErrors.first_name && <p className="text-xs text-destructive">{profileErrors.first_name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input {...regProfile('last_name')} />
                {profileErrors.last_name && <p className="text-xs text-destructive">{profileErrors.last_name.message}</p>}
              </div>
            </div>
            <Button type="submit" disabled={profileLoading}>
              {profileLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePassword(onPasswordSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input type="password" {...regPassword('password')} />
              {passwordErrors.password && <p className="text-xs text-destructive">{passwordErrors.password.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Confirm New Password</Label>
              <Input type="password" {...regPassword('confirmPassword')} />
              {passwordErrors.confirmPassword && <p className="text-xs text-destructive">{passwordErrors.confirmPassword.message}</p>}
            </div>
            <Button type="submit" disabled={passwordLoading}>
              {passwordLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Password
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" className="gap-2" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
