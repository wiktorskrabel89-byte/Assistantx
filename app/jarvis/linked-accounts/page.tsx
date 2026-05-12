"use client";

// app/jarvis/linked-accounts/page.tsx
// Page that handles OAuth callbacks from GitHub/Google and shows the
// current state of linked accounts. Also used by Jarvis Desktop to
// deep-link into the linking flow.

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GitBranch, Mail, Link2, Trash2, Loader2 } from "lucide-react";

type Account = {
  id: string;
  provider: string;
  label: string;
  scope?: string;
  updated_at: string;
  metadata?: Record<string, string | null>;
};

const PROVIDERS = [
  { id: "github", label: "GitHub", icon: GitBranch, description: "Push commits, create PRs, read repos" },
  { id: "google", label: "Gmail & Google Drive", icon: Mail, description: "Read/send emails, access Drive files" },
];

export default function LinkedAccountsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-500">Loading…</div>}>
      <LinkedAccountsContent />
    </Suspense>
  );
}

function LinkedAccountsContent() {
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  async function fetchAccounts() {
    setLoading(true);
    try {
      const res = await fetch("/api/jarvis/linked-accounts");
      const data = await res.json() as { accounts?: Account[] };
      setAccounts(data.accounts ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  // Handle OAuth callback code in URL
  useEffect(() => {
    const provider = searchParams.get("provider");
    const code = searchParams.get("code");
    if (!provider || !code) return;

    setStatus(`Completing ${provider} login…`);
    fetch(`/api/jarvis/linked-accounts/${provider}?action=callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then((r) => r.json())
      .then((d: { ok?: boolean; error?: string }) => {
        if (d.ok) {
          setStatus(`✅ ${provider} linked successfully!`);
          fetchAccounts();
        } else {
          setStatus(`❌ Failed: ${d.error ?? "unknown error"}`);
        }
      })
      .catch(() => setStatus("❌ Network error during linking"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchAccounts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function linkProvider(provider: string) {
    const res = await fetch(`/api/jarvis/linked-accounts/${provider}?action=initiate`, { method: "POST" });
    const data = await res.json() as { authUrl?: string; error?: string };
    if (data.authUrl) {
      window.location.href = data.authUrl;
    } else {
      setStatus(`❌ ${data.error ?? "Failed to start linking"}`);
    }
  }

  async function unlinkProvider(provider: string) {
    await fetch(`/api/jarvis/linked-accounts/${provider}`, { method: "DELETE" });
    setAccounts((prev) => prev.filter((a) => a.provider !== provider));
    setStatus(`✅ ${provider} unlinked.`);
  }

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-sky-600" />
          <h1 className="text-2xl font-bold text-slate-900">Linked accounts</h1>
        </div>
        <p className="text-sm text-slate-600">
          Grant Jarvis access to your accounts so it can push to GitHub, send emails, and more — all on your behalf.
        </p>
      </div>

      {status && (
        <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${status.startsWith("✅") ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          {status}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="space-y-4">
          {PROVIDERS.map(({ id, label, icon: Icon, description }) => {
            const linked = accounts.find((a) => a.provider === id);
            return (
              <Card key={id} className={linked ? "border-green-200 bg-green-50/50" : "border-slate-200"}>
                <CardHeader className="flex-row items-start gap-4 space-y-0">
                  <Icon className="mt-0.5 h-6 w-6 shrink-0 text-slate-700" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <CardTitle className="text-base">{label}</CardTitle>
                      {linked && <Badge className="text-xs bg-green-100 text-green-800 hover:bg-green-100">Linked</Badge>}
                    </div>
                    <CardDescription>{description}</CardDescription>
                    {linked && (
                      <p className="mt-1 text-xs text-slate-500">
                        Linked as <strong>{linked.label}</strong> · Updated {new Date(linked.updated_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  {linked ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 shrink-0"
                      onClick={() => unlinkProvider(id)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Unlink
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="shrink-0" onClick={() => linkProvider(id)}>
                      Link
                    </Button>
                  )}
                </CardHeader>
                {linked?.scope && (
                  <CardContent className="pt-0">
                    <p className="text-xs text-slate-500">Scopes: {linked.scope}</p>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
