"use client";
import SmartForm from "@/components/growth/SmartForm";
import { GrowthErrorBoundary } from "@/components/growth/ErrorBoundary";

export default function PublicSmartFormPage() {
  const token = typeof window !== "undefined" ? new URLSearchParams(location.search).get("form") || "" : "";
  return (
    <GrowthErrorBoundary>
      <SmartForm token={token} />
    </GrowthErrorBoundary>
  );
}
