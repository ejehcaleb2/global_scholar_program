"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/ui/pending-link";
import { useMutation } from "@tanstack/react-query";
import { login } from "@/lib/api/index";
import { useCopy } from "@/lib/copy/provider";
import { useAuth } from "@/components/auth/auth-provider";
import { useRateLimit } from "@/components/auth/use-rate-limit";
import { RateLimitAlert } from "@/components/auth/rate-limit-alert";
import { PasswordInput } from "@/components/auth/password-input";
import { AuthShell, FormAlert } from "@/components/layout/auth-shell";
import { FormField } from "@/components/admin/ui/primitives";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { useHydrated } from "@/components/ui/use-hydrated";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  try { const target = new URL(value, window.location.origin); return target.origin === window.location.origin ? `${target.pathname}${target.search}${target.hash}` : null; }
  catch { return null; }
}

export default function LoginForm() {
  const { t } = useCopy();
  const router = useRouter();
  const { login: saveSession } = useAuth();
  const { addToast } = useToast();
  const hydrated = useHydrated();
  const rate = useRateLimit();
  const ref = useRef<HTMLFormElement>(null);
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: login,
    onSuccess: response => {
      saveSession(response.tokens.access_token, response.user, response.tokens.refresh_token);
      addToast(t.auth.loginTitle, t.common.loginSuccess, "success");
      const destination = safeNextPath(new URLSearchParams(window.location.search).get("next")) ?? (response.user.role === "admin" ? "/admin" : "/dashboard");
      router.replace(destination);
    },
    onError: error => {
      if (rate.accept(error)) { addToast(t.auth.loginTitle, t.apiErrors.rateLimit, "error"); return; }
      setFailure(t.auth.loginFailed); addToast(t.auth.loginTitle, t.auth.loginFailed, "error");
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault(); if (!hydrated || mutation.isPending || rate.remaining > 0) return;
    const invalid: Record<string, string> = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) invalid.email = t.auth.loginInvalid;
    if (!form.password) invalid.password = t.auth.loginPasswordRequired;
    setErrors(invalid); setFailure(null);
    if (Object.keys(invalid).length) { ref.current?.querySelector<HTMLInputElement>(`[name="${Object.keys(invalid)[0]}"]`)?.focus(); return; }
    mutation.mutate({ email: form.email.trim().toLowerCase(), password: form.password });
  }
  return <AuthShell><header className="mb-7"><h1 className="font-heading text-4xl text-text">{t.auth.loginTitle}</h1><p className="mt-3 text-base text-text">{t.auth.loginSubtitle}</p></header>
    <form ref={ref} onSubmit={submit} noValidate className="space-y-5">
      <FormAlert message={failure} />
      {!hydrated && <p role="status" className="text-sm text-text">{t.auth.readyHelp}</p>}
      <fieldset disabled={!hydrated || mutation.isPending} className="min-w-0 space-y-5">
        <FormField htmlFor="email" label={t.auth.email} error={errors.email}><input id="email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required value={form.email} onChange={event => { setForm({ ...form, email: event.target.value }); setErrors(current => ({ ...current, email: "" })); }} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined} className="field-input" /></FormField>
        <FormField htmlFor="password" label={t.auth.password} error={errors.password} hint={t.auth.passwordResetUnavailable}><PasswordInput id="password" name="password" autoComplete="current-password" required value={form.password} onChange={event => { setForm({ ...form, password: event.target.value }); setErrors(current => ({ ...current, password: "" })); }} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "password-error password-hint" : "password-hint"} /></FormField>
      </fieldset>
      <RateLimitAlert seconds={rate.remaining} />
      <Button type="submit" variant="primary" size="md" disabled={!hydrated || rate.remaining > 0} loading={!hydrated || mutation.isPending} loadingLabel={!hydrated ? t.auth.readyPending : t.auth.loginPending} className="w-full rounded-[8px]">{t.auth.loginSubmit}</Button>
      <p className="text-base text-text">{t.auth.signupPrompt} <Link href="/signup" className="inline-flex min-h-10 items-center font-semibold text-primary underline">{t.auth.signupLink}</Link></p>
    </form>
  </AuthShell>;
}
