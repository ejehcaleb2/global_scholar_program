"use client";

import Link from "next/link";
import { ageFromDate, signupSchema } from "@/lib/utils/signup-validation";
import { ApiError } from "@/lib/api/index";
import { passwordChecks } from "@/lib/utils/password-policy";
import { PasswordHints } from "@/components/auth/password-hints";
import { useRateLimit } from "@/components/auth/use-rate-limit";
import { RateLimitAlert } from "@/components/auth/rate-limit-alert";
import { PasswordInput } from "@/components/auth/password-input";
import { useToast } from "@/components/ui/toast-provider";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell, FormAlert } from "@/components/layout/auth-shell";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage, isDuplicateEmailError, signup } from "@/lib/api/index";
import { useAuth } from "@/components/auth/auth-provider";
import { APP_LOCALE, useCopy } from "@/lib/copy/provider";
import countryData from "country-list/data.json";
import { useHydrated } from "@/components/ui/use-hydrated";

const countries = [...countryData].sort((a, b) =>
  a.name === "Cameroon"
    ? -1
    : b.name === "Cameroon"
      ? 1
      : a.name.localeCompare(b.name),
);

export default function SignupPage() {
  const router = useRouter();
  const { t } = useCopy();
  const { login: saveSession } = useAuth();
  const countryNames = new Intl.DisplayNames([APP_LOCALE], { type: "region" });
  // Intl.DisplayNames output differs between the Node server and the browser, so localized names render only after hydration.
  const hydrated = useHydrated();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    date_of_birth: "",
    country: "Cameroon",
    password: "",
  });
  const [consent, setConsent] = useState({ terms: false, privacy: false });
  const [showHints, setShowHints] = useState(false);
  const { addToast } = useToast();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const rateLimit = useRateLimit();

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hydrated || submitting || rateLimit.remaining > 0) return;
    setError(null);
    setFieldErrors({});
    const parsed = signupSchema.safeParse(form);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const code = issue.message as keyof typeof t.common.signupErrors;
        errors[String(issue.path[0])] = t.common.signupErrors[code] ?? t.common.signupErrors.required;
      }
      setFieldErrors(errors);
      const field = Object.keys(errors)[0];
      event.currentTarget.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
      return;
    }
    if (!Object.values(passwordChecks(form.password, form.email, form.full_name)).every(Boolean))
      { setShowHints(true); setFieldErrors({password: t.common.passwordPolicy}); return; }
    if (!consent.terms || !consent.privacy) { setFieldErrors({ consent: t.common.signupErrors.consent_required }); return; }
    setSubmitting(true);
    try {
      const response = await signup({ ...form, ...parsed.data, accept_terms: consent.terms, accept_privacy: consent.privacy });
      saveSession(response.tokens.access_token, response.user, response.tokens.refresh_token);
      addToast(t.auth.signupTitle, t.auth.signupSuccess, "success");
      router.push("/onboarding");
    } catch (requestError) {
      if (rateLimit.accept(requestError)) { addToast(t.auth.signupTitle, t.apiErrors.rateLimit, "error"); return; }
      if (requestError instanceof ApiError && requestError.status === 422) {
        try {
          const errors: Record<string, string> = {};
          const body = JSON.parse(requestError.message) as { detail: { loc: string[]; type: string; msg: string }[] };
          for (const issue of body.detail) {
            const field = String(issue.loc.at(-1));
            const code = (issue.type.startsWith("date_") ? "birth_date_invalid" : issue.msg) as keyof typeof t.common.signupErrors;
            errors[field] = t.common.signupErrors[code] ?? t.common.signupErrors.required;
          }
          setFieldErrors(errors);
          return;
        } catch { /* Fall back to the localized form error for an unexpected response shape. */ }
      }
      const message = isDuplicateEmailError(requestError)
          ? t.auth.emailAlreadyExists
          : getApiErrorMessage(requestError, t.auth.signupFailed);
      setError(message); addToast(t.auth.signupTitle, message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <div className="mb-6">
        <h1 className="font-heading text-4xl text-text">{t.auth.signupTitle}</h1>
        <p className="mt-2 text-base text-text">{t.auth.signupSubtitle}</p>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <FormAlert message={error} />
        <RateLimitAlert seconds={rateLimit.remaining} />
        <p className="text-sm text-text">{t.auth.requiredHelp}</p>
        {!hydrated && <p role="status" className="text-sm text-text">{t.auth.readyHelp}</p>}
        <fieldset disabled={!hydrated || submitting} className="min-w-0 space-y-4">
        <legend className="mb-4 font-heading text-xl text-text">{t.auth.identityGroup}</legend>
        <div>
          <label htmlFor="full_name" className="field-label">
            {t.auth.fullName} *
          </label>
          <input
            id="full_name"
            name="full_name" required
            aria-invalid={Boolean(fieldErrors.full_name)}
            aria-describedby="full_name-error"
            autoComplete="name"
            value={form.full_name}
            onChange={(event) => updateField("full_name", event.target.value)}
            placeholder={t.auth.fullName}
            className="field-input"
          />
          <p id="full_name-error" role="alert" className="text-sm text-red-600">{fieldErrors.full_name}</p>
        </div>
        <div>
          <label htmlFor="signup-email" className="field-label">
            {t.auth.email} *
          </label>
          <input
            id="signup-email"
            name="email" required
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby="email-error"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) => updateField("email", event.target.value)}
            placeholder={t.auth.emailExample} autoCapitalize="none" spellCheck={false}
            className="field-input"
          />
          <p id="email-error" role="alert" className="text-sm text-red-600">{fieldErrors.email}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="phone" className="field-label">
              {t.auth.phone} {t.common.optionalField}
            </label>
            <input
              id="phone"
              name="phone"
            aria-invalid={Boolean(fieldErrors.phone)}
            aria-describedby="phone-error"
              type="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={(event) => updateField("phone", event.target.value)}
              placeholder={t.auth.phoneExample}
              className="field-input"
            />
          <p id="phone-error" role="alert" className="text-sm text-red-600">{fieldErrors.phone}</p>
          </div>
          <div>
            <label htmlFor="date_of_birth" className="field-label">
              {t.auth.dateOfBirth} *
            </label>
            <input
              id="date_of_birth"
              name="date_of_birth" required
            aria-invalid={Boolean(fieldErrors.date_of_birth)}
            aria-describedby="date_of_birth-error"
              type="date"
              autoComplete="bday"
              value={form.date_of_birth}
              onChange={(event) =>
                updateField("date_of_birth", event.target.value)
              }
              className="field-input"
            />
          <p id="date_of_birth-error" role="alert" className="text-sm text-red-600">{fieldErrors.date_of_birth}</p>
          </div>
        </div>
        <div>
          <label htmlFor="country" className="field-label">
            {t.auth.country} *
          </label>
          <select
            id="country"
            name="country" required
            aria-invalid={Boolean(fieldErrors.country)}
            aria-describedby="country-error"
            value={form.country}
            onChange={(event) => updateField("country", event.target.value)}
            className="field-input"
          >
            {countries.map((country) => (
              <option key={country.code} value={country.name}>
                {hydrated ? countryNames.of(country.code) ?? country.name : country.name}
              </option>
            ))}
          </select>
          <p id="country-error" role="alert" className="text-sm text-red-600">{fieldErrors.country}</p>
        </div>
        </fieldset>
        <fieldset disabled={!hydrated || submitting} className="min-w-0 space-y-4 border-t border-border pt-5">
          <legend className="font-heading text-xl text-text">{t.auth.securityGroup}</legend>
          <div><label htmlFor="signup-password" className="field-label">{t.auth.password} *</label>
            <PasswordInput id="signup-password" name="password" autoComplete="new-password" required value={form.password} onFocus={() => setShowHints(true)} onChange={(event) => { updateField("password", event.target.value); setFieldErrors((errors) => ({ ...errors, password: "" })); }} aria-invalid={Boolean(fieldErrors.password)} aria-describedby="password-error signup-password-rules" />
            <p id="password-error" role="alert" className="text-sm text-red-600">{fieldErrors.password}</p>
            <div id="signup-password-rules" className="mt-3">{(showHints || form.password || fieldErrors.password) && <PasswordHints password={form.password} email={form.email} name={form.full_name} />}</div>
          </div>
        </fieldset>
        <fieldset disabled={!hydrated || submitting} className="space-y-3 rounded-[8px] border border-border p-4">
          <legend className="text-base font-semibold text-text">{t.common.consentTitle} *</legend>
          <label className="flex items-start gap-3 text-base text-text"><input name="accept_terms" required type="checkbox" checked={consent.terms} onChange={(event) => setConsent({ ...consent, terms: event.target.checked })} aria-describedby="consent-error" /><span>{t.common.acceptDocument} <Link href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{t.public.terms}</Link></span></label>
          <label className="flex items-start gap-3 text-base text-text"><input name="accept_privacy" required type="checkbox" checked={consent.privacy} onChange={(event) => setConsent({ ...consent, privacy: event.target.checked })} aria-describedby="consent-error" /><span>{t.common.acceptDocument} <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{t.public.privacy}</Link></span></label>
          <p id="consent-error" role="alert" className="text-sm text-red-600">{fieldErrors.consent ?? fieldErrors.accept_terms ?? fieldErrors.accept_privacy}</p>
          {hydrated && ageFromDate(form.date_of_birth) !== null && ageFromDate(form.date_of_birth)! < 18 && ageFromDate(form.date_of_birth)! >= 10 && <p className="text-sm text-text">{t.common.minorLegalNotice}</p>}
        </fieldset>
        <Button
          disabled={!hydrated || rateLimit.remaining > 0}
          type="submit"
          loading={submitting || !hydrated}
          loadingLabel={!hydrated ? t.auth.readyPending : t.auth.creatingAccount}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-primary px-4 text-sm font-semibold text-white"
        >
          {t.auth.createAccount}
        </Button>
        <p className="text-center text-base text-text">
          {t.auth.haveAccount}{" "}
          <Link
            href="/login"
            className="font-semibold text-primary hover:underline"
          >
            {t.auth.loginLink}
          </Link>
        </p>

      </form>
    </AuthShell>
  );
}
