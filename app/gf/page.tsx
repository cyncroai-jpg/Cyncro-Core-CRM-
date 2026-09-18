"use client";
import SmartForm from "@/components/growth/SmartForm";

export default function PublicSmartFormPage() {
  const token = typeof window !== "undefined" ? new URLSearchParams(location.search).get("form") || "" : "";
  return <SmartForm token={token} />;
}
