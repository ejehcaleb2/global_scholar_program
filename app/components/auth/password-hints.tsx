"use client";

import { useCopy } from "@/lib/copy/provider";
import { passwordChecks } from "@/lib/utils/password-policy";

export function PasswordHints({ password, email, name }: { password: string; email: string; name: string }) {
  const { t } = useCopy();
  const checks = passwordChecks(password, email, name);
  return <ul className="space-y-1 text-sm text-text" aria-live="polite">{(["bytes", "identity", "common"] as const).map((key) => <li key={key}>{checks[key] ? t.common.passwordMet : t.common.passwordNeeded} {t.common.passwordRules[key]}</li>)}</ul>;
}
