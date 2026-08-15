"use client";

import { ShieldAlert, Wrench } from "lucide-react";

/**
 * Full-screen maintenance / lockdown view shown to non-admin visitors when
 * `security_settings.lockdown_level >= 1`.
 */
export default function MaintenanceView({ level }: { level: number }) {
  const isLockdown = level >= 2;
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background p-6 text-center text-foreground">
      <div className="mb-8 rounded-full border border-border bg-card p-6">
        {isLockdown ? (
          <ShieldAlert className="size-12 text-destructive" aria-hidden />
        ) : (
          <Wrench className="size-12 text-primary" aria-hidden />
        )}
      </div>
      <p className="t-micro mb-s3">
        <span aria-hidden className="text-primary">
          ●{" "}
        </span>
        {isLockdown ? "status: locked" : "status: maintenance"}
      </p>
      <h1 className="mb-4 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
        {isLockdown ? "System lockdown" : "Scheduled maintenance"}
      </h1>
      <p className="max-w-md leading-relaxed text-muted-foreground">
        {isLockdown
          ? "This site has been temporarily locked for security reasons. Access is restricted."
          : "Upgrades are in progress. The site will return shortly."}
      </p>
    </div>
  );
}
