'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../model/useAuth';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Separator } from '@/shared/ui/separator';
import { Sparkles, Mail, Loader2 } from 'lucide-react';

export function LoginPage() {
  const { signInWithGoogle, signInWithEmail, resetPassword, error, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const router = useRouter();

  // Redirect if already authenticated
  useEffect(() => {
    if (user) {
      router.push('/dashboard');
    }
  }, [user, router]);

  if (user) {
    return null;
  }

  const handleGoogleLogin = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } finally {
      setSigningIn(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigningIn(true);
    try {
      await signInWithEmail(email, password);
    } finally {
      setSigningIn(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    setSigningIn(true);
    try {
      await resetPassword(email);
      setResetSent(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao enviar e-mail de recuperação';
      setResetError(message);
    } finally {
      setSigningIn(false);
    }
  };

  const handleBackToLogin = () => {
    setForgotPassword(false);
    setResetSent(false);
    setResetError(null);
  };

  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-background p-4 relative selection:bg-primary/30 selection:text-primary-foreground overflow-hidden">
      {/* Abstract animated backgrounds */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full bg-primary/20 blur-[120px] mix-blend-screen opacity-50" />
        <div className="absolute bottom-[-10%] right-[-10%] h-[600px] w-[600px] rounded-full bg-primary/10 blur-[150px] mix-blend-screen opacity-50" />
        <div className="absolute top-[40%] left-[60%] h-[300px] w-[300px] rounded-full bg-purple-500/10 blur-[100px] mix-blend-screen opacity-50" />
      </div>

      <Card className="w-full max-w-sm relative z-10">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 border border-border shadow-[inset_0_1px_4px_color-mix(in_oklab,var(--color-foreground)_10%,transparent)] backdrop-blur-md">
            <Sparkles className="h-8 w-8 text-primary drop-shadow-[0_0_8px_rgba(255,100,100,0.5)]" strokeWidth={1.5} />
          </div>
          <CardTitle className="font-display text-3xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent drop-shadow-sm">
            DataViz
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground/80">
            Entre para acessar o dashboard de analytics
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {forgotPassword ? (
            <>
              {resetSent ? (
                <div className="space-y-4">
                  <p className="text-xs text-green-400">
                    E-mail de recuperação enviado. Verifique sua caixa de entrada.
                  </p>
                  <button
                    type="button"
                    onClick={handleBackToLogin}
                    className="text-xs text-primary hover:underline"
                  >
                    Voltar ao login
                  </button>
                </div>
              ) : (
                <>
                  {resetError && (
                    <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {resetError}
                    </div>
                  )}
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="reset-email" className="text-xs font-medium text-foreground ml-1">
                        E-mail
                      </label>
                      <input
                        id="reset-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="flex h-10 w-full rounded-lg border border-border bg-muted/50 px-4 py-2 text-sm text-foreground shadow-[inset_0_1px_4px_rgba(0,0,0,0.1)] backdrop-blur-sm transition-all duration-300 outline-none hover:bg-muted/60 hover:border-border focus-visible:ring-[3px] focus-visible:ring-primary/20 focus-visible:border-primary/50 placeholder:text-muted-foreground/50"
                        placeholder="seuemail@empresa.com"
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full gap-2 mt-2" disabled={signingIn}>
                      {signingIn ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Mail className="h-4 w-4" />
                      )}
                      Enviar e-mail de recuperação
                    </Button>
                  </form>
                  <button
                    type="button"
                    onClick={handleBackToLogin}
                    className="text-xs text-primary hover:underline"
                  >
                    Voltar ao login
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              {error && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={handleGoogleLogin}
                disabled={signingIn}
              >
                {signingIn ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                )}
                Entrar com Google
              </Button>

              <div className="relative">
                <Separator />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                  ou
                </span>
              </div>

              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-xs font-medium text-foreground ml-1">
                    E-mail
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-border bg-muted/50 px-4 py-2 text-sm text-foreground shadow-[inset_0_1px_4px_rgba(0,0,0,0.1)] backdrop-blur-sm transition-all duration-300 outline-none hover:bg-muted/60 hover:border-border focus-visible:ring-[3px] focus-visible:ring-primary/20 focus-visible:border-primary/50 placeholder:text-muted-foreground/50"
                    placeholder="seuemail@empresa.com"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="password" className="text-xs font-medium text-foreground ml-1">
                    Senha
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-border bg-muted/50 px-4 py-2 text-sm text-foreground shadow-[inset_0_1px_4px_rgba(0,0,0,0.1)] backdrop-blur-sm transition-all duration-300 outline-none hover:bg-muted/60 hover:border-border focus-visible:ring-[3px] focus-visible:ring-primary/20 focus-visible:border-primary/50 placeholder:text-muted-foreground/50"
                    placeholder="Sua senha"
                    required
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setForgotPassword(true)}
                    className="text-xs text-primary hover:underline"
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <Button type="submit" className="w-full gap-2" disabled={signingIn}>
                  {signingIn ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  Entrar com E-mail
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
