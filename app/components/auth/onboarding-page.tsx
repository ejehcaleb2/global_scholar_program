"use client";


import { Button } from "@/components/ui/button";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Check, ImagePlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { KeyboardEvent, useEffect, useId, useRef, useState, useSyncExternalStore, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast-provider";
import { useRateLimit } from "@/components/auth/use-rate-limit";
import { RateLimitAlert } from "@/components/auth/rate-limit-alert";
import { FormAlert } from "@/components/layout/auth-shell";
import { getApiErrorMessage, updateProfile, uploadProfileAvatar } from "@/lib/api/index";
import { useAuth } from "@/components/auth/auth-provider";
import { useCopy } from "@/lib/copy/provider";
import { BrandLogo } from "@/components/ui/brand-logo";

const reasonValues = [
  "Undergraduate applications",
  "Master's applications",
  "PhD applications",
  "Scholarships",
  "SAT",
  "Internships",
  "Fellowships",
  "Research",
  "Other",
];

type EducationLevel = "high_school" | "undergraduate" | "graduate" | "other";

type WizardState = {
  education_level: EducationLevel;
  school: string;
  city: string;
  what_brings_you: string[];
  fields_of_study: string[];
  countries_of_interest: string[];
};

function StepIndicator({ step }: { step: number }) {
  const { t } = useCopy();
  return (
    <div className="flex flex-col items-center">
      <div className="flex w-full max-w-[280px] items-center">
        {[1, 2, 3, 4].map((item, index) => (
          <div key={item} className="flex flex-1 items-center last:flex-none">
            <div className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-xs font-semibold ${item <= step ? "bg-primary text-white" : "border border-border bg-background text-text"}`} aria-label={item < step ? t.onboarding.stepCompleted.replace("{step}", String(item)) : item === step ? t.onboarding.stepActive.replace("{step}", String(item)) : t.onboarding.step.replace("{current}", String(item)).replace("{total}", "4")}>
              {item < step ? <Check size={15} strokeWidth={3} /> : item}
            </div>
            {index < 3 && <div className={`h-0.5 flex-1 ${item < step ? "bg-primary" : "bg-border"}`} />}
          </div>
        ))}
      </div>
      <span className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-text">{t.onboarding.step.replace("{current}", String(step)).replace("{total}", "4")}</span>
    </div>
  );
}

function TagInput({ label, placeholder, tags, onChange }: { label: string; placeholder: string; tags: string[]; onChange: (tags: string[]) => void }) {
  const { t } = useCopy();
  const [value, setValue] = useState("");
  const inputId = useId();

  function addTag() {
    const next = value.trim();
    if (!next || tags.includes(next)) return setValue("");
    onChange([...tags, next]);
    setValue("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag();
    } else if (event.key === "Backspace" && !value && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div>
      <label htmlFor={inputId} className="field-label">{label}</label>
      <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-[8px] border border-border bg-background p-2 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
        {tags.map((tag) => <span key={tag} className="inline-flex items-center gap-1 rounded-[8px] bg-primary pl-2.5 text-sm font-semibold text-white"><span>{tag}</span><Button type="button" aria-label={t.onboarding.removeTag.replace("{tag}", tag)} onClick={() => onChange(tags.filter((item) => item !== tag))} className="h-10 w-10 rounded-[8px] hover:opacity-80"><X size={16} /></Button></span>)}
        <input id={inputId} value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={handleKeyDown} onBlur={addTag} placeholder={placeholder} className="min-h-10 min-w-[140px] flex-1 border-0 bg-transparent p-0 text-base text-text outline-none placeholder:text-text placeholder:opacity-55" />
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { t } = useCopy();
  const { accessToken, isInitializing } = useAuth();
  const reducedMotion = useReducedMotion();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const rate = useRateLimit();
  const hydrated = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [state, setState] = useState<WizardState>({ education_level: "high_school", school: "", city: "", what_brings_you: [], fields_of_study: [], countries_of_interest: [] });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const avatarInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isInitializing && !accessToken) router.replace("/login");
  }, [accessToken, isInitializing, router]);

  if (!hydrated || isInitializing || !accessToken) return null;

  function update<K extends keyof WizardState>(field: K, value: WizardState[K]) {
    setState((current) => ({ ...current, [field]: value }));
  }

  function continueStep() {
    setError(null);
    if (step === 1 && (!state.school.trim() || !state.city.trim())) return setError(t.onboarding.schoolCityRequired);
    if (step === 2 && state.what_brings_you.length === 0) return setError(t.onboarding.reasonRequired);
    setDirection(1);
    setStep((current) => Math.min(current + 1, 4));
  }

  function goBack() {
    setError(null);
    setDirection(-1);
    setStep((current) => Math.max(current - 1, 1));
  }

  function handleAvatarSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!new Set(["image/jpeg", "image/png"]).has(file.type)) {
      setError(t.onboarding.invalidPhoto);
      event.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(t.onboarding.photoTooLarge);
      event.target.value = "";
      return;
    }
    setError(null);
    setAvatarFile(file);
  }

  async function finish(skipAvatar = false) {
    if (saving || rate.remaining > 0) return;
    setError(null);
    setSaving(true);
    try {
      if (avatarFile && !skipAvatar) await uploadProfileAvatar(avatarFile);
      const saved = await updateProfile(state);
      queryClient.setQueryData(["student", "profile"], saved);
      addToast(t.profile.profileSavedTitle, t.profile.profileSavedMessage, "success");
      router.push("/dashboard");
    } catch (requestError) {
      if (rate.accept(requestError)) { addToast(t.onboarding.saveFailed, t.apiErrors.rateLimit, "error"); return; }
      const message = getApiErrorMessage(requestError, t.onboarding.saveFailed);
      setError(message); addToast(t.onboarding.saveFailed, message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-surface-alt px-5 py-8 text-text sm:py-10">
      <header className="flex flex-col items-center gap-2">
        <BrandLogo size="auth" priority />
        <span className="font-heading text-xl text-primary">{t.onboarding.brand}</span>
      </header>
      <section className="my-10 w-full max-w-[600px] rounded-[8px] border border-border bg-background p-6 sm:p-10">
        <StepIndicator step={step} />
        <div className="min-h-80">
          <FormAlert message={error} />
          <RateLimitAlert seconds={rate.remaining} />
          <AnimatePresence initial={false} mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={{
                enter: (movement: number) => ({ opacity: 0, x: movement * 14 }),
                center: { opacity: 1, x: 0 },
                exit: (movement: number) => ({ opacity: 0, x: movement * -14 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: reducedMotion ? 0 : 0.22, ease: "easeOut" }}
              className="flex min-h-80 flex-col"
            >
              <div className="flex-1">
                {step === 1 && <div className="mt-8"><h1 className="font-heading text-3xl text-text">{t.onboarding.tellAboutYou}</h1><p className="mt-2 text-sm text-text">{t.onboarding.tailorDescription}</p><div className="mt-7"><span className="field-label">{t.onboarding.educationLevel}</span><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{(["high_school", "undergraduate", "graduate", "other"] as const).map((value) => <Button type="button" key={value} onClick={() => update("education_level", value)} className={`rounded-[8px] px-3 py-2.5 text-sm font-semibold ${state.education_level === value ? "bg-primary text-white" : "border border-border bg-background text-text hover:border-primary"}`}>{t.profile.educationOptions[value]}</Button>)}</div></div><div className="mt-6"><label htmlFor="school" className="field-label">{t.onboarding.school}</label><input id="school" value={state.school} onChange={(event) => update("school", event.target.value)} placeholder={t.onboarding.schoolPlaceholder} className="field-input" /></div><div className="mt-6"><label htmlFor="city" className="field-label">{t.onboarding.city}</label><input id="city" value={state.city} onChange={(event) => update("city", event.target.value)} placeholder={t.onboarding.cityPlaceholder} className="field-input" /></div></div>}
                {step === 2 && <div className="mt-8"><h1 className="font-heading text-3xl text-text">{t.onboarding.reasonsTitle}</h1><p className="mt-2 text-sm text-text">{t.onboarding.selectAll}</p><div className="mt-7 flex flex-wrap gap-3">{reasonValues.map((reason, index) => { const selected = state.what_brings_you.includes(reason); return <Button type="button" key={reason} aria-pressed={selected} onClick={() => update("what_brings_you", selected ? state.what_brings_you.filter((item) => item !== reason) : [...state.what_brings_you, reason])} className={`rounded-[8px] px-4 py-2.5 text-sm ${selected ? "bg-primary font-semibold text-white" : "border border-border bg-background text-text hover:border-primary"}`}>{t.onboarding.reasons[index]}</Button>; })}</div></div>}
                {step === 3 && <div className="mt-8"><h1 className="font-heading text-3xl text-text">{t.onboarding.interestsTitle}</h1><p className="mt-2 text-sm text-text">{t.onboarding.interestsDescription}</p><div className="mt-7 space-y-6"><TagInput label={t.onboarding.fieldsOfStudy} placeholder={t.onboarding.fieldsPlaceholder} tags={state.fields_of_study} onChange={(tags) => update("fields_of_study", tags)} /><TagInput label={t.onboarding.countriesOfInterest} placeholder={t.onboarding.regionsPlaceholder} tags={state.countries_of_interest} onChange={(tags) => update("countries_of_interest", tags)} /></div></div>}
                {step === 4 && <div className="mt-8"><h1 className="font-heading text-3xl text-text">{t.onboarding.photoTitle}</h1><p className="mt-2 text-sm text-text">{t.onboarding.photoDescription}</p><div className="mt-7 rounded-[8px] border border-border bg-background p-5"><input ref={avatarInput} type="file" accept="image/jpeg,image/png" onChange={handleAvatarSelection} className="sr-only" aria-label={t.onboarding.choosePhoto} /><div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center"><span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-border bg-surface-alt text-primary"><ImagePlus size={24} aria-hidden="true" /></span><div className="min-w-0"><p className="text-base font-semibold text-text">{avatarFile?.name ?? t.onboarding.noPhotoSelected}</p><p className="mt-1 text-sm text-text">{t.profile.photoHelp}</p><Button type="button" onClick={() => avatarInput.current?.click()} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-primary px-4 text-sm font-semibold text-primary hover:bg-surface-alt"><ImagePlus size={17} aria-hidden="true" />{t.onboarding.choosePhoto}</Button></div></div></div><Button type="button" onClick={() => finish(true)} disabled={saving} className="mt-5 min-h-11 text-sm font-semibold text-primary underline underline-offset-4 disabled:opacity-60">{t.onboarding.skip}</Button></div>}
              </div>
              <div className="mt-10 flex items-center justify-between border-t border-border pt-6"><Button type="button" onClick={goBack} disabled={step === 1 || saving} className="inline-flex items-center gap-2 rounded-[8px] px-5 py-2.5 text-sm font-semibold text-primary disabled:invisible"><ArrowLeft size={16} />{t.onboarding.back}</Button>{step < 4 ? <Button type="button" onClick={continueStep} className="rounded-[8px] bg-primary px-6 py-3 text-sm font-semibold text-white">{t.onboarding.continue}</Button> : <Button type="button" onClick={() => finish()} loading={saving} loadingLabel={t.onboarding.saving} className="inline-flex items-center gap-2 rounded-[8px] bg-primary px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">{t.onboarding.finish}</Button>}</div>
            </motion.div>
          </AnimatePresence>
        </div>
      </section>
      <footer className="mt-auto pt-4 text-center text-xs text-text">© {new Date().getUTCFullYear()} Global Scholars Program · {t.auth.division}</footer>
    </main>
  );
}
