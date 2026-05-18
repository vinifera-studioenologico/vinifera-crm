"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Wine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth/AuthProvider";

const loginSchema = z.object({
  email: z.string().email("Email non valida"),
  password: z.string().min(1, "Password obbligatoria"),
});

type LoginForm = z.infer<typeof loginSchema>;

function LoginForm() {
  const { signIn, user, loading: authLoading, sessionReady } = useAuth();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);

  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  // Se l'utente è già autenticato e il session cookie è pronto, reindirizza.
  // Questo gestisce il caso in cui onAuthStateChanged ha aggiornato il cookie
  // (con getIdToken(true)) dopo che requireAdmin aveva fatto il signout.
  useEffect(() => {
    if (!authLoading && user && sessionReady) {
      window.location.assign(callbackUrl);
    }
  }, [authLoading, user, sessionReady, callbackUrl]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    try {
      await signIn(data.email, data.password);
      // Hard redirect: serve un full reload per sincronizzare lo stato
      // server (cookie) con il client (AuthProvider).
      window.location.assign(callbackUrl);
    } catch {
      toast.error("Credenziali non valide. Riprova.");
    } finally {
      setLoading(false);
    }
  };

  const handleDevBypass = async () => {
    if (process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH !== "true") return;
    setLoading(true);
    try {
      await signIn("dev@vinifera.local", "devpassword123");
      window.location.assign(callbackUrl);
    } catch {
      toast.error("Account dev non configurato. Crealo negli emulatori Firebase.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-3 pb-6">
          <div className="flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Wine className="h-7 w-7 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight">Vinifera CRM</CardTitle>
          <CardDescription>Accedi al gestionale</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="nome@azienda.it"
                disabled={loading}
                {...register("email")}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                disabled={loading}
                {...register("password")}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Accedi
            </Button>

            {/* Bypass dev — visibile SOLO se flag abilitato (mai in produzione) */}
            {process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true" && (
              <Button
                type="button"
                variant="outline"
                className="w-full border-dashed text-muted-foreground"
                disabled={loading}
                onClick={handleDevBypass}
              >
                [DEV] Accedi come admin demo
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
