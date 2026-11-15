"use client";

import { createContext, useContext } from "react";
import { copy } from "@/lib/copy/dictionary";
export { APP_LOCALE } from "@/lib/copy/dictionary";
export type { CopyDictionary } from "@/lib/copy/dictionary";

const value = { t: copy };
const CopyContext = createContext<typeof value | null>(null);
export function CopyProvider({ children }: { children: React.ReactNode }) {
  return <CopyContext.Provider value={value}>{children}</CopyContext.Provider>;
}
export function useCopy() {
  const context = useContext(CopyContext);
  if (!context) throw new Error("useCopy must be used within CopyProvider");
  return context;
}
