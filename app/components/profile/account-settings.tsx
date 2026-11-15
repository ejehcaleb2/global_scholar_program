"use client";

import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { PasswordInput } from "@/components/auth/password-input";
import { PasswordHints } from "@/components/auth/password-hints";
import { useRateLimit } from "@/components/auth/use-rate-limit";
import { RateLimitAlert } from "@/components/auth/rate-limit-alert";
import { FormField } from "@/components/admin/ui/primitives";
import { Button } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import { SaveStatusIndicator } from "@/components/ui/save-status";
import { SettingsHeading, SettingsSection, SettingsLoading, SettingsLoadError, useSettingsRetry } from "@/components/ui/settings-layout";
import { SkeletonBlock } from "@/components/ui/page-skeleton";
import { useToast } from "@/components/ui/toast-provider";
import { useUnsavedChanges } from "@/components/ui/use-unsaved-changes";
import { ApiError, getApiErrorMessage, updateProfileEmail, updateProfilePassword } from "@/lib/api/index";
import { useMembershipQuery, useProfileQuery } from "@/lib/queries/index";
import { useCopy } from "@/lib/copy/provider";
import { passwordChecks } from "@/lib/utils/password-policy";

const emptyEmail = { current_password: "", new_email: "" };
const emptyPassword = { current_password: "", new_password: "", confirm_password: "" };

export function AccountSettingsSection() {
  const { t } = useCopy();
  const { currentUser, updateEmail, replaceTokens } = useAuth();
  const { addToast } = useToast();
  const client = useQueryClient();
  const profile = useProfileQuery();
  const membership = useMembershipQuery();
  const profileRetry = useSettingsRetry(() => profile.refetch());
  const membershipRetry = useSettingsRetry(() => membership.refetch());
  const [email, setEmail] = useState(emptyEmail);
  const [password, setPassword] = useState(emptyPassword);
  const [emailErrors, setEmailErrors] = useState<Record<string, string>>({});
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [emailFailure, setEmailFailure] = useState("");
  const [passwordFailure, setPasswordFailure] = useState("");
  const [hints, setHints] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const emailRef = useRef<HTMLFormElement>(null);
  const passwordRef = useRef<HTMLFormElement>(null);
  const emailRate = useRateLimit();
  const passwordRate = useRateLimit();
  const emailDirty = Boolean(email.current_password || email.new_email);
  const passwordDirty = Object.values(password).some(Boolean);
  useUnsavedChanges(emailDirty || passwordDirty, t.profile.leavePrompt);

  function failureMessage(error: unknown, fallback: string, isEmail = false) {
    return error instanceof ApiError && error.status === 401 ? t.profile.incorrectCurrentPassword : error instanceof ApiError && error.status === 409 && isEmail ? t.profile.emailInUse : getApiErrorMessage(error, fallback);
  }
  const emailMutation = useMutation({
    mutationFn: updateProfileEmail,
    onSuccess: (saved, input) => {
      updateEmail(input.new_email.trim().toLowerCase()); client.setQueryData(["student", "profile"], saved);
      setEmail(emptyEmail); setEmailErrors({}); setEmailFailure(""); setResetKey((value) => value + 1);
      addToast(t.profile.emailUpdatedTitle, t.profile.emailUpdatedMessage, "success");
    },
    onError: (error) => {
      const message = failureMessage(error, t.profile.emailErrorMessage, true);
      if (!emailRate.accept(error)) {
        setEmailFailure(message);
        if (error instanceof ApiError && error.status === 401) setEmailErrors({ current_password: message });
        if (error instanceof ApiError && error.status === 409) setEmailErrors({ new_email: message });
      }
      addToast(t.profile.emailErrorTitle, message, "error");
    },
  });
  const passwordMutation = useMutation({
    mutationFn: updateProfilePassword,
    onSuccess: (response) => {
      replaceTokens(response.tokens); setPassword(emptyPassword); setPasswordErrors({}); setPasswordFailure(""); setHints(false); setResetKey((value) => value + 1);
      addToast(t.profile.passwordUpdatedTitle, t.profile.passwordUpdatedMessage, "success");
    },
    onError: (error) => {
      const message = failureMessage(error, t.profile.passwordErrorMessage);
      if (!passwordRate.accept(error)) {
        setPasswordFailure(message);
        if (error instanceof ApiError && error.status === 401) setPasswordErrors({ current_password: message });
        if (error instanceof ApiError && error.status === 422) setPasswordErrors({ new_password: message });
      }
      addToast(t.profile.passwordErrorTitle, message, "error");
    },
  });
  const busy = emailMutation.isPending || passwordMutation.isPending;
  function focusError(ref: HTMLFormElement | null, errors: Record<string, string>) { ref?.querySelector<HTMLInputElement>(`[name="${Object.keys(errors)[0]}"]`)?.focus(); }
  function submitEmail(event: FormEvent) {
    event.preventDefault(); if (busy || emailRate.remaining > 0) return;
    const errors: Record<string, string> = {};
    if (!email.current_password) errors.current_password = t.profile.passwordRequired;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.new_email.trim())) errors.new_email = t.profile.emailInvalid;
    else if (email.new_email.trim().toLowerCase() === currentUser?.email.toLowerCase()) errors.new_email = t.profile.sameEmail;
    setEmailErrors(errors); setEmailFailure("");
    if (Object.keys(errors).length) return focusError(emailRef.current, errors);
    emailMutation.mutate({ ...email, new_email: email.new_email.trim().toLowerCase() });
  }
  function submitPassword(event: FormEvent) {
    event.preventDefault(); if (busy || passwordRate.remaining > 0) return;
    const errors: Record<string, string> = {};
    if (!password.current_password) errors.current_password = t.profile.passwordRequired;
    if (!Object.values(passwordChecks(password.new_password, currentUser?.email ?? "", profile.data?.full_name ?? "")).every(Boolean)) errors.new_password = t.common.passwordPolicy;
    if (!password.confirm_password) errors.confirm_password = t.profile.confirmRequired;
    else if (password.new_password !== password.confirm_password) errors.confirm_password = t.profile.passwordMismatch;
    setPasswordErrors(errors); setPasswordFailure(""); setHints(true);
    if (Object.keys(errors).length) return focusError(passwordRef.current, errors);
    passwordMutation.mutate({ current_password: password.current_password, new_password: password.new_password });
  }
  function changeEmail(key: keyof typeof email, value: string) { setEmail({ ...email, [key]: value }); setEmailErrors((errors) => ({ ...errors, [key]: "" })); setEmailFailure(""); }
  function changePassword(key: keyof typeof password, value: string) { setPassword({ ...password, [key]: value }); setPasswordErrors((errors) => ({ ...errors, [key]: "" })); setPasswordFailure(""); }
  if (profile.isError || profileRetry.isPending) return <SettingsLoadError message={t.profile.profileLoadError} loading={profileRetry.isPending} onRetry={() => profileRetry.mutate()} />;
  if (profile.isPending || !profile.data) return <SettingsLoading />;
  const emailReason = busy ? t.profile.waitForSecurity : !emailDirty ? t.profile.completeEmail : undefined;
  const passwordReason = busy ? t.profile.waitForSecurity : !passwordDirty ? t.profile.completePassword : undefined;

  return <div className="mx-auto max-w-4xl px-5 py-8 lg:px-10 lg:py-10">
    <SettingsHeading eyebrow={t.profile.settingsTitle} title={t.profile.accountTitle} description={t.profile.accountSubtitle} />
    <div className="space-y-8">
      <SettingsSection id="email-heading" title={t.profile.emailAddress} description={t.profile.emailHelp}>
        <p className="mb-5 break-words text-base text-text"><span className="font-semibold">{t.profile.currentEmail}: </span>{currentUser?.email}</p>
        <form ref={emailRef} onSubmit={submitEmail} noValidate className="space-y-5" aria-labelledby="email-heading">
          <fieldset disabled={busy} className="grid min-w-0 gap-5 sm:grid-cols-2">
            <FormField htmlFor="email-current-password" label={t.profile.currentPassword} required error={emailErrors.current_password}><PasswordInput key={`email-${resetKey}`} id="email-current-password" name="current_password" autoComplete="current-password" maxLength={128} required value={email.current_password} onChange={(event) => changeEmail("current_password", event.target.value)} aria-invalid={Boolean(emailErrors.current_password)} aria-describedby={emailErrors.current_password ? "email-current-password-error" : undefined} /></FormField>
            <FormField htmlFor="new-email" label={t.profile.newEmail} required error={emailErrors.new_email}><input id="new-email" name="new_email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required value={email.new_email} onChange={(event) => changeEmail("new_email", event.target.value)} aria-invalid={Boolean(emailErrors.new_email)} aria-describedby={emailErrors.new_email ? "new-email-error" : undefined} className="field-input" /></FormField>
          </fieldset>
          {emailFailure && <p role="alert" className="text-base text-red-600">{emailFailure}</p>}<RateLimitAlert seconds={emailRate.remaining} />
          <div className="flex flex-wrap items-center justify-between gap-4"><div><SaveStatusIndicator status={emailMutation.isPending ? "saving" : emailFailure || Object.values(emailErrors).some(Boolean) ? "error" : emailDirty ? "dirty" : "saved"} />{emailReason && <p id="email-save-reason" className="mt-1 text-sm text-text">{emailReason}</p>}</div><Button type="submit" variant="primary" size="md" disabled={busy || !emailDirty || emailRate.remaining > 0} aria-describedby={emailReason ? "email-save-reason" : undefined} loading={emailMutation.isPending} loadingLabel={t.common.saving} className="rounded-[8px]">{t.profile.updateEmail}</Button></div>
        </form>
      </SettingsSection>
      <SettingsSection id="password-heading" title={t.profile.changePassword} description={t.profile.passwordHelp}>
        <form ref={passwordRef} onSubmit={submitPassword} noValidate className="space-y-5" aria-labelledby="password-heading">
          <fieldset disabled={busy} className="grid min-w-0 gap-5 sm:grid-cols-2">
            {(["current_password", "new_password", "confirm_password"] as const).map((key) => <div key={key} className={key === "current_password" ? "sm:col-span-2 sm:max-w-sm" : ""}><FormField htmlFor={`password-${key}`} label={key === "current_password" ? t.profile.currentPassword : key === "new_password" ? t.profile.newPassword : t.profile.confirmPassword} required error={passwordErrors[key]}><PasswordInput key={`${key}-${resetKey}`} id={`password-${key}`} name={key} autoComplete={key === "current_password" ? "current-password" : "new-password"} maxLength={key === "current_password" ? 128 : undefined} required value={password[key]} onFocus={() => { if (key === "new_password") setHints(true); }} onChange={(event) => changePassword(key, event.target.value)} aria-invalid={Boolean(passwordErrors[key])} aria-describedby={[passwordErrors[key] ? `password-${key}-error` : "", key === "new_password" && hints ? "account-password-rules" : ""].filter(Boolean).join(" ") || undefined} /></FormField></div>)}
          </fieldset>
          {(hints || Boolean(password.new_password)) && <div id="account-password-rules"><PasswordHints password={password.new_password} email={currentUser?.email ?? ""} name={profile.data.full_name ?? ""} /></div>}
          {passwordFailure && <p role="alert" className="text-base text-red-600">{passwordFailure}</p>}<RateLimitAlert seconds={passwordRate.remaining} />
          <div className="flex flex-wrap items-center justify-between gap-4"><div><SaveStatusIndicator status={passwordMutation.isPending ? "saving" : passwordFailure || Object.values(passwordErrors).some(Boolean) ? "error" : passwordDirty ? "dirty" : "saved"} />{passwordReason && <p id="password-save-reason" className="mt-1 text-sm text-text">{passwordReason}</p>}</div><Button type="submit" variant="primary" size="md" disabled={busy || !passwordDirty || passwordRate.remaining > 0} aria-describedby={passwordReason ? "password-save-reason" : undefined} loading={passwordMutation.isPending} loadingLabel={t.common.saving} className="rounded-[8px]">{t.profile.updatePassword}</Button></div>
        </form>
      </SettingsSection>
      <SettingsSection id="membership-heading" title={t.profile.membership} description={t.profile.membershipHelp}>
        {membership.isError || membershipRetry.isPending ? <SettingsLoadError message={t.profile.membershipLoadError} loading={membershipRetry.isPending} onRetry={() => membershipRetry.mutate()} /> : membership.isPending || !membership.data ? <SkeletonBlock className="h-32 w-full" /> : <dl className="grid gap-5 sm:grid-cols-3">
          <div><dt className="text-sm text-text">{t.profile.tier}</dt><dd className="mt-1 text-base font-semibold text-text">{membership.data.tier === "paid" ? t.profile.paidTier : t.profile.freeTier}</dd></div>
          <div><dt className="text-sm text-text">{t.profile.plan}</dt><dd className="mt-1 text-base font-semibold text-text">{membership.data.plan ? t.profile.plans[membership.data.plan] : t.profile.noPlan}</dd></div>
          <div><dt className="text-sm text-text">{t.profile.status}</dt><dd className="mt-1 text-base font-semibold text-text">{membership.data.status ? t.profile.statuses[membership.data.status] : t.profile.noStatus}</dd></div>
          <div className="sm:col-span-3"><dt className="text-sm text-text">{t.profile.renewalDate}</dt><dd className="mt-1 text-base text-text">{membership.data.current_period_end ? <LocalTime value={membership.data.current_period_end} options={{ dateStyle: "long" }} /> : t.profile.noRenewalDate}</dd></div>
        </dl>}
      </SettingsSection>
    </div>
  </div>;
}
