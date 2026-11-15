"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Save } from "lucide-react";
import { useCopy } from "@/lib/copy/provider";
import { getApiErrorMessage, updateProfile, uploadProfileAvatar, type Profile } from "@/lib/api/index";
import { useProfileQuery } from "@/lib/queries/index";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { useUploadFeedback } from "@/components/ui/use-upload-feedback";
import { SaveStatusIndicator } from "@/components/ui/save-status";
import { useUnsavedChanges } from "@/components/ui/use-unsaved-changes";
import { SettingsHeading, SettingsSection, SettingsLoading, SettingsLoadError, useSettingsRetry } from "@/components/ui/settings-layout";
import { ConfirmDialog, FormField } from "@/components/admin/ui/primitives";
import { RateLimitAlert } from "@/components/auth/rate-limit-alert";

type ProfileForm = Pick<Profile, "full_name" | "phone" | "country" | "school" | "city" | "education_level" | "what_brings_you" | "fields_of_study" | "countries_of_interest">;
const reasonValues = ["Undergraduate applications", "Master's applications", "PhD applications", "Scholarships", "SAT", "Internships", "Fellowships", "Research", "Other"];
const scalarFields = ["full_name", "phone", "country", "school", "city"] as const;
const limits = { full_name: 255, phone: 50, country: 255, school: 255, city: 255 };
const labels = { full_name: "fullName", phone: "phone", country: "country", school: "school", city: "city" } as const;
const autocomplete = { full_name: "name", phone: "tel", country: "country-name", school: "organization", city: "address-level2" };
function toForm(p: Profile): ProfileForm {
  return { full_name: p.full_name, phone: p.phone, country: p.country, school: p.school, city: p.city, education_level: p.education_level, what_brings_you: p.what_brings_you ?? [], fields_of_study: p.fields_of_study ?? [], countries_of_interest: p.countries_of_interest ?? [] };
}
function parseList(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }

export function ProfileSettingsSection() {
  const { t } = useCopy();
  const { addToast } = useToast();
  const client = useQueryClient();
  const query = useProfileQuery();
  const retry = useSettingsRetry(() => query.refetch());
  const [draft, setDraft] = useState<ProfileForm | null>(null);
  const [lists, setLists] = useState<{ fields_of_study: string; countries_of_interest: string } | null>(null);
  const [error, setError] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const [discard, setDiscard] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const base = query.data ? toForm(query.data) : null;
  const form = draft ?? base;
  const listValues = lists ?? { fields_of_study: (form?.fields_of_study ?? []).join(", "), countries_of_interest: (form?.countries_of_interest ?? []).join(", ") };
  const payload = form ? { ...form, fields_of_study: parseList(listValues.fields_of_study), countries_of_interest: parseList(listValues.countries_of_interest) } : null;
  const dirty = Boolean(form && base && (JSON.stringify(payload) !== JSON.stringify(base) || lists && (lists.fields_of_study !== (base.fields_of_study ?? []).join(", ") || lists.countries_of_interest !== (base.countries_of_interest ?? []).join(", "))));
  useUnsavedChanges(dirty, t.profile.leavePrompt);
  const save = useMutation({
    mutationFn: (input: ProfileForm) => updateProfile(input),
    onSuccess: (profile) => {
      client.setQueryData(["student", "profile"], profile);
      void client.invalidateQueries({ queryKey: ["admin", "students"] });
      void client.invalidateQueries({ queryKey: ["admin", "audit-logs"] });
      setDraft(null); setLists(null); setError(""); addToast(t.profile.profileSavedTitle, t.profile.profileSavedMessage, "success");
    },
    onError: (failure) => { const message = getApiErrorMessage(failure, t.profile.profileSaveError); setError(message); addToast(t.profile.profileSaveError, message, "error"); },
  });
  const feedback = useUploadFeedback(t.profile.avatarErrorTitle, t.profile.avatarErrorMessage);
  const avatar = useMutation({
    mutationFn: uploadProfileAvatar,
    onSuccess: (result) => {
      client.setQueryData<Profile>(["student", "profile"], (current) => current ? { ...current, avatar_url: result.avatar_url, updated_at: result.updated_at } : current);
      void client.invalidateQueries({ queryKey: ["admin", "students"] });
      void client.invalidateQueries({ queryKey: ["admin", "audit-logs"] });
      setAvatarError(""); addToast(t.profile.avatarSavedTitle, t.profile.avatarSavedMessage, "success");
    },
    onError: (failure) => setAvatarError(feedback.error(failure)),
  });
  const writing = save.isPending || avatar.isPending;
  async function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || writing || feedback.remaining > 0) return;
    setAvatarError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setAvatarError(t.profile.photoHelp); addToast(t.profile.avatarErrorTitle, t.profile.photoHelp, "error"); event.target.value = ""; return;
    }
    await avatar.mutateAsync(file).catch(() => undefined); event.target.value = "";
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!dirty || writing || !payload) return;
    setError(""); save.mutate(payload);
  }
  if (query.isError || retry.isPending) return <SettingsLoadError message={t.profile.profileLoadError} loading={retry.isPending} onRetry={() => retry.mutate()} />;
  if (query.isPending || !form || !query.data) return <SettingsLoading />;
  const profile = query.data;
  const reason = writing ? avatar.isPending ? t.profile.waitForUpload : t.profile.waitForSave : !dirty ? t.profile.noChanges : undefined;
  return <div className="mx-auto max-w-4xl px-5 py-8 lg:px-10 lg:py-10">
    <SettingsHeading eyebrow={t.profile.settingsTitle} title={t.profile.title} description={t.profile.subtitle} />
    <div className="space-y-8">
      <SettingsSection id="profile-photo-heading" title={t.profile.avatar} description={t.profile.avatarPrivate}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center"><Avatar userId={profile.user_id} name={form.full_name} avatarKey={profile.avatar_url} updatedAt={profile.updated_at} large />
          <div className="flex-1 space-y-3"><p id="profile-photo-help" className="text-sm text-text">{t.profile.photoHelp}</p>
            <input ref={fileInput} disabled={writing || feedback.remaining > 0} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} onChange={chooseAvatar} aria-label={t.profile.changePhoto} aria-describedby="profile-photo-help" />
            <Button variant="secondary" size="md" disabled={writing || feedback.remaining > 0} title={save.isPending ? t.profile.waitForSave : undefined} loading={avatar.isPending} loadingLabel={t.common.uploading} onClick={() => fileInput.current?.click()} className="gap-2 rounded-[8px]"><Camera size={20} aria-hidden="true" />{t.profile.changePhoto}</Button>
            {avatar.isPending && <p role="status" className="text-sm text-text">{t.common.uploading}</p>}{avatar.isSuccess && !avatarError && <p role="status" className="text-sm text-status-success">{t.profile.avatarSavedMessage}</p>}{avatarError && <p role="alert" className="text-sm text-red-600">{avatarError}</p>}<RateLimitAlert seconds={feedback.remaining} />
          </div></div>
      </SettingsSection>
      <form onSubmit={submit} className="space-y-8">
        <fieldset disabled={writing} className="min-w-0 space-y-8">
          <SettingsSection id="personal-heading" title={t.profile.personal} description={t.profile.personalHelp}><div className="grid gap-5 sm:grid-cols-2">
            {scalarFields.map((field) => <FormField key={field} label={t.profile[labels[field]]} htmlFor={`profile-${field}`}><input id={`profile-${field}`} type={field === "phone" ? "tel" : "text"} autoComplete={autocomplete[field]} maxLength={limits[field]} value={form[field] ?? ""} onChange={(event) => { setDraft({ ...form, [field]: event.target.value }); setError(""); }} className="field-input" /></FormField>)}
            <FormField htmlFor="profile-education" label={t.profile.educationLevel}><select id="profile-education" value={form.education_level ?? ""} onChange={(event) => { setDraft({ ...form, education_level: (event.target.value || null) as ProfileForm["education_level"] }); setError(""); }} className="field-input"><option value="">{t.common.optionalField}</option>{(["high_school", "undergraduate", "graduate", "other"] as const).map((value) => <option key={value} value={value}>{t.profile.educationOptions[value]}</option>)}</select></FormField>
          </div></SettingsSection>
          <SettingsSection id="profile-reasons" title={t.profile.whatBringsYou} description={t.profile.interestsHelp}><div className="flex flex-wrap gap-2">{t.profile.reasons.map((label, index) => { const value = reasonValues[index]; const selected = form.what_brings_you?.includes(value) ?? false; return <Button key={value} aria-pressed={selected} onClick={() => { const chosen = form.what_brings_you ?? []; setDraft({ ...form, what_brings_you: selected ? chosen.filter((item) => item !== value) : [...chosen, value] }); setError(""); }} className={`min-h-11 rounded-[8px] border px-3 text-sm ${selected ? "border-primary bg-primary text-white" : "border-border text-text hover:bg-surface-alt"}`}>{label}</Button>; })}</div></SettingsSection>
          <SettingsSection id="profile-study" title={t.profile.learningPreferences}><div className="grid gap-5 sm:grid-cols-2">{(["fields_of_study", "countries_of_interest"] as const).map((field) => <FormField key={field} htmlFor={`profile-${field}`} label={field === "fields_of_study" ? t.profile.fieldsOfStudy : t.profile.countriesOfInterest} hint={field === "fields_of_study" ? t.profile.studyHelp : t.profile.countriesHelp}><input id={`profile-${field}`} value={listValues[field]} onChange={(event) => { setLists({ ...listValues, [field]: event.target.value }); setError(""); }} aria-describedby={`profile-${field}-hint`} className="field-input" /></FormField>)}</div></SettingsSection>
        </fieldset>
        {error && <p role="alert" className="text-base text-red-600">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-4"><div><SaveStatusIndicator status={save.isPending ? "saving" : error ? "error" : dirty ? "dirty" : "saved"} />{reason && <p id="profile-save-reason" className="mt-1 text-sm text-text">{reason}</p>}</div><div className="flex flex-wrap gap-3"><Button variant="secondary" size="md" disabled={!dirty || writing} title={reason} onClick={() => setDiscard(true)} className="rounded-[8px]">{t.profile.discard}</Button><Button type="submit" variant="primary" size="md" disabled={!dirty || writing} aria-describedby={reason ? "profile-save-reason" : undefined} loading={save.isPending} loadingLabel={t.common.saving} className="gap-2 rounded-[8px]"><Save size={20} aria-hidden="true" />{t.profile.save}</Button></div></div>
      </form>
    </div>
    <ConfirmDialog open={discard} title={t.profile.discardTitle} description={t.profile.discardHelp} confirmLabel={t.profile.discard} cancelLabel={t.profile.keepEditing} onClose={() => setDiscard(false)} onConfirm={() => { setDraft(null); setLists(null); setError(""); save.reset(); setDiscard(false); }} />
  </div>;
}
