"use client";

import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/copy/provider";

export function PasswordInput(props: Omit<ComponentProps<"input">, "type"> & { id: string }) {
  const [visible, setVisible] = useState(false);
  const { t } = useCopy();
  const Icon = visible ? EyeOff : Eye;
  return <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"><input {...props} type={visible ? "text" : "password"} autoCapitalize="none" autoCorrect="off" spellCheck={false} className={`field-input min-w-0 ${props.className ?? ""}`} /><Button type="button" disabled={props.disabled} aria-label={visible ? t.auth.hidePassword : t.auth.showPassword} aria-controls={props.id} aria-pressed={visible} onClick={() => setVisible((current) => !current)} className="h-11 w-11 shrink-0 rounded-[8px] border border-border text-primary hover:bg-surface-alt"><Icon size={20} aria-hidden="true" /></Button></div>;
}
