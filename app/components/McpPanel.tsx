"use client";
import { useEffect, useState } from "react";

type Key = { id: string; name: string; last_used_at: string | null; created_at: string };
type Conn = { id: string; name: string; url: string; has_token: number; active: number; created_at: string };

/**
 * Team Access → "Cyncro AI everywhere": a teammate's personal keys for using
 * Cyncro from Claude / ChatGPT / Cursor (Cyncro as an MCP server), and the
 * outside apps Cyncro AI itself may call (connected MCP servers).
 */
export function McpPanel({ onFlash }: { onFlash: (m: string) => void }) {
  const [keys, setKeys] = useState<Key[]>([]);
  const [url, setUrl] = useState("");
  const [fresh, setFresh] = useState<{ key: string; name: string } | null>(null);
  const [keyName, setKeyName] = useState("Claude");
  const [conns, setConns] = useState<Conn[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [conn, setConn] = useState({ name: "", url: "", token: "" });
  const [busy, setBusy] = useState("");
  const load = async () => {
    const [k, c] = await Promise.all([fetch("/api/mcp/keys").then((r) => (r.ok ? r.json() : null)), fetch("/api/ai/connections").then((r) => (r.ok ? r.json() : null))]);
    if (k) { setKeys(k.keys || []); setUrl(k.url || ""); }
    if (c) { setConns(c.connections || []); setCanEdit(Boolean(c.canEdit)); }
  };
  useEffect(() => { void load(); }, []);
  const mint = async () => {
    setBusy("mint");
    const r = await fetch("/api/mcp/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: keyName }) });
    const d = await r.json().catch(() => ({})); setBusy("");
    if (!r.ok) { onFlash(d.error || "Could not create the key"); return; }
    setFresh({ key: d.key, name: d.name }); await load();
  };
  const revoke = async (k: Key) => { if (!window.confirm(`Revoke "${k.name}"? Anything using it stops working.`)) return; await fetch(`/api/mcp/keys?id=${k.id}`, { method: "DELETE" }); if (fresh) setFresh(null); await load(); onFlash("Key revoked"); };
  const addConn = async () => {
    setBusy("conn");
    const r = await fetch("/api/ai/connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(conn) });
    const d = await r.json().catch(() => ({})); setBusy("");
    if (!r.ok) { onFlash(d.error || "Could not connect the app"); return; }
    setConn({ name: "", url: "", token: "" }); await load(); onFlash(`${d.name} connected`);
  };
  const removeConn = async (c: Conn) => { if (!window.confirm(`Disconnect ${c.name}?`)) return; await fetch(`/api/ai/connections?id=${c.id}`, { method: "DELETE" }); await load(); onFlash("Disconnected"); };
  const config = fresh ? JSON.stringify({ mcpServers: { cyncro: { type: "http", url, headers: { Authorization: `Bearer ${fresh.key}` } } } }, null, 2) : "";
  return (
    <section className="crmPanel mcpPanel">
      <div className="crmPanelHead"><div><small>CYNCRO AI EVERYWHERE</small><h2>Use Cyncro from Claude, ChatGPT or Cursor</h2><p>Cyncro speaks MCP (Model Context Protocol). A personal key lets an outside assistant read and act on this company exactly as you can, under your name.</p></div></div>
      <div className="mcpGrid">
        <div className="mcpBlock">
          <small>YOUR PERSONAL KEYS</small>
          <div className="mcpRow"><input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="Where you'll use it (e.g. Claude)" /><button className="coSave" disabled={busy === "mint"} onClick={() => void mint()}>{busy === "mint" ? "Creating…" : "Create key"}</button></div>
          {fresh && (
            <div className="mcpFresh">
              <b>Copy this now. It won't be shown again.</b>
              <code>{fresh.key}</code>
              <small>Server URL</small><code>{url}</code>
              <small>Claude Desktop / Claude Code config</small><pre>{config}</pre>
              <small>In Claude.ai: Settings → Connectors → Add custom connector → URL above, then paste the key as the bearer token.</small>
            </div>
          )}
          <ul className="mcpList">
            {keys.map((k) => <li key={k.id}><b>{k.name}</b><span>{k.last_used_at ? `last used ${new Date(k.last_used_at).toLocaleString()}` : "never used"} · created {new Date(k.created_at).toLocaleDateString()}</span><button className="dangerText" onClick={() => void revoke(k)}>Revoke</button></li>)}
            {!keys.length && <li className="dim">No keys yet. Create one and paste it into your assistant.</li>}
          </ul>
        </div>
        <div className="mcpBlock">
          <small>CONNECTED APPS · what Cyncro AI can reach</small>
          <p>Add any MCP server (QuickBooks, Google Drive, Slack, Zapier, a client's system). Cyncro AI can then use it while answering you. Needs the AI key on the server and, for most apps, a token from that app.</p>
          {canEdit && <div className="mcpConnForm"><input value={conn.name} onChange={(e) => setConn({ ...conn, name: e.target.value })} placeholder="Name (e.g. QuickBooks)" /><input value={conn.url} onChange={(e) => setConn({ ...conn, url: e.target.value })} placeholder="https://…/mcp" /><input value={conn.token} onChange={(e) => setConn({ ...conn, token: e.target.value })} placeholder="Bearer token (optional)" /><button className="coSave" disabled={busy === "conn" || !conn.name || !conn.url} onClick={() => void addConn()}>{busy === "conn" ? "Connecting…" : "Connect"}</button></div>}
          <ul className="mcpList">
            {conns.map((c) => <li key={c.id}><b>{c.name}</b><span>{c.url}{c.has_token ? " · token set" : ""}</span>{canEdit && <button className="dangerText" onClick={() => void removeConn(c)}>Disconnect</button>}</li>)}
            {!conns.length && <li className="dim">Nothing connected yet.</li>}
          </ul>
        </div>
      </div>
    </section>
  );
}
