"use client";

import { useUploadFeedback } from "@/components/ui/use-upload-feedback";
import { RateLimitAlert } from "@/components/auth/rate-limit-alert";

import { saveAttachment } from "@/lib/utils/download";

import { ClipboardCheck, Edit3, FileDown, LoaderCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys, useMembershipQuery, useServiceRequestsQuery } from "@/lib/queries/index";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { createServiceRequest, downloadServiceRequestDocument, getApiErrorMessage, type ServiceRequest } from "@/lib/api/index";
import { useAuth } from "@/components/auth/auth-provider";
import { useCopy, type CopyDictionary } from "@/lib/copy/provider";
import { Button } from "@/components/ui/button";
import { ServicesPageSkeleton } from "@/components/ui/page-skeleton";
import { LocalTime } from "@/components/ui/local-time";
import { useToast } from "@/components/ui/toast-provider";

const serviceOptions = [{ type: "essay_review" as const, titleKey: "essayReview" as const, descriptionKey: "essayDescription" as const, Icon: Edit3 }, { type: "activities_review" as const, titleKey: "activitiesReview" as const, descriptionKey: "activitiesDescription" as const, Icon: ClipboardCheck }];

function statusLabel(status: ServiceRequest["status"], t: CopyDictionary) {
	return status === "in_progress" ? t.services.statusInProgress : status === "returned" ? t.services.statusReturned : t.services.statusSubmitted;
}

function statusClass(status: ServiceRequest["status"]) {
	return status === "in_progress" ? "border border-primary text-primary" : status === "returned" ? "border border-status-success text-status-success" : "bg-surface-alt text-text";
}

export default function ServicesPage() {
	const { t } = useCopy();
	const { addToast } = useToast();
	const router = useRouter();
	const { accessToken } = useAuth();
	const queryClient = useQueryClient();
	const membershipQuery = useMembershipQuery();
	const requestsQuery = useServiceRequestsQuery();
	const tier = membershipQuery.data?.tier ?? null;
	const requests = requestsQuery.data ?? [];
	const [selected, setSelected] = useState<typeof serviceOptions[number] | null>(null);
	const [file, setFile] = useState<File | null>(null);
	const loading = membershipQuery.isPending || requestsQuery.isPending;
	const uploadFeedback = useUploadFeedback(t.services.title, t.services.submitError);
	const [uploading, setUploading] = useState(false);
	const [actionError, setError] = useState<string | null>(null);
	const loadFailure = membershipQuery.error ?? requestsQuery.error;
	const error = actionError ?? (loadFailure ? getApiErrorMessage(loadFailure, t.services.loadError) : null);

	useEffect(() => { if (!accessToken) router.replace("/login"); }, [accessToken, router]);

	async function submit() {
		if (!selected || !file || uploading || uploadFeedback.remaining > 0) return;
		setUploading(true); setError(null);
		try { await createServiceRequest(selected.type, file); await queryClient.invalidateQueries({ queryKey: queryKeys.serviceRequests }); setSelected(null); setFile(null); addToast(t.services.title, t.services.submitSuccess, "success"); } catch (requestError: unknown) { setError(uploadFeedback.error(requestError) || null); } finally { setUploading(false); }
	}

	async function viewDocument(requestId: string) {
		try { saveAttachment(await downloadServiceRequestDocument(requestId)); } catch (requestError: unknown) { setError(getApiErrorMessage(requestError, t.services.openDocumentError)); }
	}
	if (loading) return <main className="mx-auto min-h-screen w-full max-w-6xl px-5 py-10 lg:px-8"><ServicesPageSkeleton /></main>;

	return <div className="min-h-screen bg-background"><main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 lg:px-8 lg:py-12"><div className="mb-10"><p className="eyebrow">{t.services.eyebrow}</p><h1 className="mt-3 font-heading text-3xl font-semibold leading-tight text-text sm:text-4xl">{t.services.title}</h1><p className="mt-2 max-w-2xl text-base leading-6 text-text">{t.services.pageDescription}</p></div>{error && <p role="alert" className="mb-6 border border-border bg-surface-alt p-4 text-sm text-text">{error}</p>}{loading ? <div className="flex items-center gap-3 border border-border bg-surface-alt p-5 text-sm text-text"><LoaderCircle size={18} className="animate-spin text-primary" /> {t.services.loading}</div> : <><section className="grid gap-5 md:grid-cols-2">{serviceOptions.map(({ type, titleKey, descriptionKey, Icon }) => <article key={type} className="flex min-h-64 flex-col justify-between rounded-[8px] border border-border bg-background p-6"><div><Icon size={24} className="text-primary" /><h2 className="mt-5 font-heading text-2xl font-semibold text-text">{t.services[titleKey]}</h2><p className="mt-2 text-sm leading-6 text-text">{t.services[descriptionKey]}</p></div><div className="mt-6"><p className="mb-4 text-xs text-text">{t.services.pricingAtCheckout}</p>{tier === "paid" ? <Button type="button" onClick={() => { setSelected(serviceOptions.find((option) => option.type === type) ?? null); setError(null); }} className="w-full rounded-[8px] bg-primary px-4 py-3 text-sm font-semibold text-white hover:opacity-90">{t.services.requestService}</Button> : <p className="text-sm leading-5 text-text">{t.services.upgradeUnavailable}</p>}</div></article>)}</section><section className="mt-12"><h2 className="mb-4 font-heading text-2xl text-text">{t.services.yourRequests}</h2>{requests.length === 0 ? <p className="border border-border bg-surface-alt p-5 text-sm text-text">{t.services.noRequestsYet}</p> : <div className="space-y-4">{requests.map((request) => <article key={request.id} className="flex flex-col justify-between gap-4 rounded-[8px] border border-border bg-background p-5 sm:flex-row sm:items-center"><div><h3 className="font-heading text-lg text-text">{request.service_type === "essay_review" ? t.services.essayReview : t.services.activitiesReview}</h3><p className="mt-1 text-sm text-text">{t.services.submittedOn.split("{date}")[0]}<LocalTime value={request.created_at} options={{ dateStyle: "medium" }} />{t.services.submittedOn.split("{date}")[1]}</p><Button type="button" onClick={() => viewDocument(request.id)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><FileDown size={14} /> {t.services.viewDocument}</Button></div><span className={`inline-flex w-fit rounded-[8px] px-3 py-1 text-xs font-semibold ${statusClass(request.status)}`}>{statusLabel(request.status, t)}</span></article>)}</div>}</section></>}</main><AnimatePresence>{selected && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: "easeOut" }} data-modal-backdrop className="fixed inset-0 z-[60] flex items-center justify-center bg-text/40 px-5" role="dialog" aria-modal="true" aria-labelledby="service-modal-title"><motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }} transition={{ duration: 0.2, ease: "easeOut" }} data-modal-panel className="w-full max-w-lg rounded-[8px] border border-border bg-background p-6"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow">{t.services.newRequest}</p><h2 id="service-modal-title" className="mt-2 font-heading text-2xl text-text">{t.services[selected.titleKey]}</h2></div><Button type="button" onClick={() => { setSelected(null); setFile(null); }} className="rounded-[8px] p-2 text-text hover:bg-surface-alt" aria-label={t.services.closeForm}><X size={19} /></Button></div><p className="mt-4 text-sm leading-6 text-text">{t.services.uploadHint}</p><label htmlFor="service-file" className="field-label mt-5">{t.services.documentLabel}</label><RateLimitAlert seconds={uploadFeedback.remaining} /><input disabled={uploadFeedback.remaining > 0} id="service-file" type="file" accept=".pdf,.doc,.docx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="field-input h-auto py-3" /><Button type="button" onClick={submit} disabled={!file || uploading || uploadFeedback.remaining > 0} className="mt-5 flex w-full items-center justify-center gap-2 rounded-[8px] bg-primary px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">{uploading && <LoaderCircle size={17} className="animate-spin" />} {uploading ? t.services.uploading : t.services.submitRequest}</Button></motion.div></motion.div>}</AnimatePresence></div>;
}
