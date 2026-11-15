"use client";


import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useCopy } from "@/lib/copy/provider";

type ToastVariant = "success" | "error";

type ToastItem = {
  id: number;
  title: string;
  message: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  addToast: (title: string, message: string, variant?: ToastVariant) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { t } = useCopy();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((title: string, message: string, variant: ToastVariant = "success") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, title, message, variant }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4000);
  }, []);


  const value = useMemo(() => ({ addToast }), [addToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex max-w-sm flex-col gap-3">
        <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            role={toast.variant === "error" ? "alert" : "status"}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            data-toast
            className={`pointer-events-auto rounded-[8px] border p-4 shadow-overlay ${toast.variant === "success" ? "border-status-success/30 bg-background text-text" : "border-red-200 bg-white text-text"}`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <p className={`text-sm font-semibold ${toast.variant === "success" ? "text-status-success" : "text-red-600"}`}>
                  {toast.title}
                </p>
                <p className="mt-1 text-sm text-text">{toast.message}</p>
              </div>
              <Button
                type="button"
                aria-label={t.common.dismissNotification}
                onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
                className="h-10 w-10 shrink-0 rounded-[8px] text-text hover:bg-surface-alt"
              >
                <X size={16} />
              </Button>
            </div>
          </motion.div>
        ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
