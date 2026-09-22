"use client";
import { useEffect, useState } from "react";

/** One shared <datalist> of teammates so any "owner / rep / host" field can pick a real person. */
export function TeamDatalist({ id = "cyncro-team" }: { id?: string }) {
  const [members, setMembers] = useState<{ email: string; display_name: string }[]>([]);
  useEffect(() => {
    void fetch("/api/access").then((r) => (r.ok ? r.json() : null)).then((d: { members?: { email: string; display_name: string; active?: number }[] } | null) => setMembers((d?.members || []).filter((m) => m.active !== 0))).catch(() => undefined);
  }, []);
  return <datalist id={id}>{members.map((m) => <option key={m.email} value={m.email}>{m.display_name || m.email}</option>)}</datalist>;
}
