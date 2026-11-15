"use client";

import { Button } from "@/components/ui/button";
import "./globals.css";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-text">
        <main className="flex min-h-screen flex-col items-center justify-center px-5 py-12 text-center">
          <h1 className="max-w-3xl font-heading text-3xl font-semibold text-text">
            This page could not be loaded / Cette page n’a pas pu être chargée
          </h1>
          <p className="mt-3 max-w-xl text-base leading-6 text-text">
            Retry to reload the application / Réessayez pour recharger l’application.
          </p>
          <Button
            type="button"
            onClick={reset}
            className="mt-6 min-h-11 rounded-[8px] bg-primary px-5 text-base font-semibold text-white"
          >
            Try again / Réessayer
          </Button>
        </main>
      </body>
    </html>
  );
}