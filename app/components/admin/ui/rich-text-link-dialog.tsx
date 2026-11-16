"use client";

import { useState } from "react";
import { ConfirmDialog, FormField } from "@/components/admin/ui/primitives";
import { useCopy } from "@/lib/copy/provider";
import { isHttpUrl } from "@/lib/utils/urls";

export function RichTextLinkDialog({ open, onClose, onSave, description }: { description?: string; open: boolean; onClose: () => void; onSave: (url: string) => void }) {
  const { t } = useCopy();
  const [url, setUrl] = useState("");
  return <ConfirmDialog open={open} title={t.admin.toolbarLink} description={description ?? t.admin.linkInvalid} confirmLabel={t.admin.toolbarLink} cancelLabel={t.admin.cancel} confirmDisabled={!isHttpUrl(url)} onClose={onClose} onConfirm={() => { onSave(url.trim()); setUrl(""); onClose(); }}>
    <FormField label={t.admin.linkUrl} htmlFor="rich-text-link-url" error={url && !isHttpUrl(url) ? t.admin.linkInvalid : undefined}><input id="rich-text-link-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} className="field-input" /></FormField>
  </ConfirmDialog>;
}
