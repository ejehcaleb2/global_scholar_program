"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { useCopy } from "@/lib/copy/provider";
import { ApiError, acceptConsents } from "@/lib/api/index";
import { queryKeys, useConsentStatusQuery } from "@/lib/queries/index";
import { Button } from "@/components/ui/button";
import { SkeletonBlock } from "@/components/ui/page-skeleton";
import { useToast } from "@/components/ui/toast-provider";
import { LogoutButton } from "@/components/auth/logout-button";

export default function ConsentPage() {
  const { accessToken, currentUser, isInitializing } = useAuth();
  const { t } = useCopy();
  const router = useRouter();
  const query = useConsentStatusQuery();
  const cache = useQueryClient();
  const { addToast } = useToast();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!isInitializing && !accessToken) router.replace("/login"); }, [isInitializing, accessToken, router]);
  const mutation = useMutation({
    mutationFn: acceptConsents,
    onSuccess: (status) => {
      cache.setQueryData(queryKeys.consents(currentUser?.id ?? "user"), status);
      void cache.invalidateQueries({ queryKey: ["auth", "consents"] });
      addToast(t.common.consentTitle, t.common.consentSaved, "success");
      router.replace(currentUser?.role === "admin" ? "/admin" : "/dashboard");
    },
    onError: (failure) => {
      setChecked({});
      const message = failure instanceof ApiError && failure.status === 409 ? t.common.consentChanged : t.common.consentFailed;
      setError(message);
      if (failure instanceof ApiError && failure.status === 409) void query.refetch();
      addToast(t.common.consentTitle, message, "error");
    },
  });
  if (isInitializing || !accessToken || (query.isPending && !query.data)) return <main className="mx-auto max-w-xl px-5 py-10" role="status" aria-label={t.nav.loadingApp}><SkeletonBlock className="h-40 w-full" /></main>;
  return <main className="mx-auto max-w-xl px-5 py-10 text-text">
    <h1 className="font-heading text-3xl">{t.common.consentTitle}</h1>
    <p className="my-5 text-base">{t.common.consentSummary}</p>
    {query.isError ? <div role="alert"><p>{t.common.consentLoadError}</p><Button type="button" onClick={() => query.refetch()} className="mt-4 min-h-11 rounded-[8px] border border-border px-4 text-primary">{t.common.retry}</Button></div> : <form className="space-y-5" onSubmit={(event) => {
      event.preventDefault();
      setError(null);
      const documents = query.data?.documents ?? [];
      if (documents.length !== 2 || documents.some((item) => !checked[item.type])) { setError(t.common.consentRequired); return; }
      mutation.mutate(Object.fromEntries(documents.map((item) => [item.type, item.version])));
    }}>
      {query.data?.documents.some((item) => item.review_pending) && <p role="status" className="rounded-[8px] border border-border bg-surface-alt p-3">{t.common.legalPending}</p>}
      {query.data?.documents.map((item) => <label key={`${item.type}:${item.version}`} className="flex items-start gap-3 text-base"><input type="checkbox" name={item.type} checked={checked[item.type] ?? false} onChange={(event) => setChecked({ ...checked, [item.type]: event.target.checked })} /><span>{t.common.acceptDocument} <Link href={`/${item.slug}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{item.type === "tos" ? t.public.terms : t.public.privacy}</Link> ({t.common.legalVersion} {item.version})</span></label>)}
      {error && <p role="alert" className="text-sm">{error}</p>}
      <Button type="submit" loading={mutation.isPending} loadingLabel={t.common.saving} className="min-h-11 rounded-[8px] bg-primary px-5 text-white">{t.common.consentAccept}</Button>
    </form>}
    <LogoutButton className="mt-5 inline-flex min-h-11 items-center text-primary hover:underline" />
  </main>;
}
