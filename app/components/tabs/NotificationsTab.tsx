"use client";

import { Bell } from "lucide-react";

import { useState } from "react";

type Notification = {
  id: number;
  title: string;
  body: string;
  date: string;
};

export function NotificationsTab({ dark }: { dark: boolean }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const sendTestNotification = async () => {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
      if (reg) {
        reg.showNotification("Testowa notyfikacja", {
          body: "To jest przykładowe powiadomienie push.",
          icon: "/icon-192.png",
        });
      } else {
        alert("Brak zarejestrowanego service workera push.");
      }
    }
    // Add to local notification list
    setNotifications((prev) => [
      {
        id: Date.now(),
        title: "Testowa notyfikacja",
        body: "To jest przykładowe powiadomienie push.",
        date: new Date().toLocaleString(),
      },
      ...prev,
    ]);
  };
  return (
    <section
      className={`h-full min-h-0 overflow-auto p-4 sm:p-6 lg:p-8 ${
        dark
          ? "bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.18),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(135deg,#020617,#0f172a_46%,#082f49)]"
          : "bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)]"
      }`}
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div
          className={`rounded-3xl border p-6 shadow-[0_24px_80px_-28px_rgba(14,116,144,0.25)] backdrop-blur sm:p-8 ${
            dark ? "border-sky-900/60 bg-slate-950/65" : "border-sky-200/60 bg-white/90"
          }`}
        >
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
              dark
                ? "border-sky-600/40 bg-sky-500/10 text-sky-200"
                : "border-sky-300/70 bg-white/70 text-sky-800"
            }`}
          >
            <Bell className="h-3.5 w-3.5" />
            Center powiadomien
          </div>

          <h2 className={`mt-5 text-2xl font-semibold tracking-tight ${dark ? "text-slate-100" : "text-slate-900"}`}>
            Powiadomienia i aktywnosc
          </h2>
          <p className={`mt-2 max-w-2xl text-sm leading-7 ${dark ? "text-slate-300" : "text-slate-600"}`}>
            Testuj push notyfikacje i przegladaj ostatnie zdarzenia w jednym miejscu.
          </p>

          <button
            className="mt-6 inline-flex items-center rounded-xl bg-gradient-to-r from-sky-700 to-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-sky-800 hover:to-cyan-700"
            onClick={sendTestNotification}
          >
            Wyślij testowe powiadomienie push
          </button>
        </div>

        <div
          className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${
            dark ? "border-slate-800 bg-slate-950/65" : "border-slate-200/80 bg-white/85"
          }`}
        >
          <h3 className={`mb-3 text-base font-semibold ${dark ? "text-slate-100" : "text-slate-900"}`}>
            Ostatnie powiadomienia
          </h3>
          {notifications.length === 0 ? (
            <div className={`${dark ? "text-slate-400" : "text-slate-500"}`}>Brak powiadomien.</div>
          ) : (
            <ul className="space-y-3">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={`rounded-xl border p-3 ${
                    dark ? "border-slate-800 bg-slate-900/70" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className={`font-semibold ${dark ? "text-slate-100" : "text-slate-900"}`}>{n.title}</div>
                  <div className={`text-sm ${dark ? "text-slate-300" : "text-slate-600"}`}>{n.body}</div>
                  <div className={`mt-1 text-xs ${dark ? "text-slate-500" : "text-slate-400"}`}>{n.date}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
