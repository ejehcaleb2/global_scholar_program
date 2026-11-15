import { apiFetch } from "@/lib/api/client";


type LegalSummary = { type: "tos" | "privacy"; slug: "terms" | "privacy"; version: string; effective_date: string; review_pending: boolean };

export type LegalDocument = LegalSummary & { html: string };

export function getLegalDocument(type: "terms" | "privacy") {
  return apiFetch<LegalDocument>(`/legal/${type}`);
}


export type ConsentStatus = { documents: (LegalSummary & { accepted: boolean })[]; complete: boolean };

export function getConsentStatus() { return apiFetch<ConsentStatus>("/consents/status"); }

export function acceptConsents(versions: Record<string, string>) { return apiFetch<ConsentStatus>("/consents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ versions }) }); }
