"use client";


import { SettingsHeading, SettingsSection, SettingsLoadError, useSettingsRetry } from "@/components/ui/settings-layout";
import Link from "@/components/ui/pending-link";
import { useProfileQuery } from "@/lib/queries/profile";
import { ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useCopy } from "@/lib/copy/provider";


export default function AdminSettingsPage() {
  const { t } = useCopy();
  const { currentUser } = useAuth();
  const profile = useProfileQuery();
  const retry = useSettingsRetry(() => profile.refetch());

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 py-8 sm:px-8 lg:px-10">
      <SettingsHeading eyebrow={t.admin.label} title={t.admin.settings} description={t.admin.settingsDescription} />
      {(profile.isError || retry.isPending) && <SettingsLoadError message={t.admin.settingsLoadError} loading={retry.isPending} onRetry={() => retry.mutate()} />}

      <SettingsSection id="admin-account-heading" title={t.admin.accountSettings} description={t.profile.subtitle}>
        <div className="flex items-start gap-4">
          <UserRound className="mt-1 h-5 w-5 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            {profile.isLoading ? <div className="mt-3 h-6 w-56 animate-pulse rounded-[8px] bg-surface-alt" /> : <p className="mt-2 text-base text-text">{profile.data?.full_name?.trim() || currentUser?.email}</p>}
            <p className="mt-1 text-sm text-text">{currentUser?.email}</p>
            <Link href="/profile" className="mt-4 inline-flex min-h-11 items-center rounded-[8px] border border-border px-4 text-sm font-semibold text-primary transition-colors duration-200 ease-out hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{t.admin.settingsProfileLink}</Link>
          </div>
        </div>
      </SettingsSection>


      <div className="pt-8"><SettingsSection id="admin-security-heading" title={t.profile.security} description={t.profile.securityHelp}>
        <div className="flex items-start gap-4">
          <ShieldCheck className="mt-1 h-5 w-5 text-primary" aria-hidden="true" />
          <div>
            <Link href="/profile/account" className="mt-4 inline-flex min-h-11 items-center rounded-[8px] px-2 text-sm font-semibold text-primary hover:bg-surface-alt">{t.admin.settingsSecurityLink}</Link>
          </div>
        </div>
      </SettingsSection></div>
    </div>
  );
}
