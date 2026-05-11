"use client";

import { AlertTriangle, Bell, CheckCircle, Info } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { PRO_PLAN, PRO_PLUS_PLAN } from "@/lib/ai-config";
import { ensurePushSubscription, registerPushServiceWorker, syncPushSubscription } from "@/app/lib/push-notifications";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import type { AppNotification, UseNotificationsReturn } from "../../hooks/useNotifications";

type NotificationKind = "info" | "warning" | "success";

type SystemNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  date: string;
};

const KIND_ICON: Record<NotificationKind, React.ReactNode> = {
  info: <Info className="h-4 w-4 text-sky-500" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  success: <CheckCircle className="h-4 w-4 text-emerald-500" />,
};

const KIND_BORDER: Record<NotificationKind, { dark: string; light: string }> = {
  info: { dark: "border-sky-900/50 bg-sky-950/30", light: "border-sky-200 bg-sky-50" },
  warning: { dark: "border-amber-900/50 bg-amber-950/30", light: "border-amber-200 bg-amber-50" },
  success: { dark: "border-emerald-900/50 bg-emerald-950/30", light: "border-emerald-200 bg-emerald-50" },
};
const NOTIFICATION_PERMISSION_EVENT = "assistantx:notification-permission-change";

function toNotificationKind(kind: string): NotificationKind {
  if (kind === "info" || kind === "warning" || kind === "success") return kind;
  return "info";
}

export function NotificationsTab({
  dark,
  notificationsHook,
}: {
  dark: boolean;
  notificationsHook?: UseNotificationsReturn;
}) {
  const { state } = useWorkspace();
  const notificationPermission = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") {
        return () => undefined;
      }

      window.addEventListener(NOTIFICATION_PERMISSION_EVENT, onStoreChange);
      return () => window.removeEventListener(NOTIFICATION_PERMISSION_EVENT, onStoreChange);
    },
    () => (typeof Notification !== "undefined" ? Notification.permission : null),
    () => null
  );

  // Derive system event notifications from live workspace state
  const systemNotifications = useMemo<SystemNotification[]>(() => {
    const events: SystemNotification[] = [];
    const plan = state.userPlan;
    const used = state.premiumRequestsUsed;

    if (plan === "pro") {
      const limit = PRO_PLAN.premiumRequestsPerMonth;
      const pct = used / limit;
      if (used >= limit) {
        events.push({
          id: "plan-limit-reached",
          kind: "warning",
          title: "Limit zapytań osiągnięty",
          body: `Wykorzystałeś wszystkie ${limit} zapytań w planie Pro. Limit odnowi się na początku następnego miesiąca lub przejdź na plan Pro+.`,
          date: new Date().toLocaleString(),
        });
      } else if (pct >= 0.8) {
        events.push({
          id: "plan-limit-warning",
          kind: "warning",
          title: "Zbliżasz się do limitu zapytań",
          body: `Wykorzystałeś ${used} z ${limit} zapytań w planie Pro (${Math.round(pct * 100)}%).`,
          date: new Date().toLocaleString(),
        });
      }
    } else if (plan === "pro+") {
      const limit = PRO_PLUS_PLAN.premiumRequestsPerMonth;
      const pct = used / limit;
      if (used >= limit) {
        events.push({
          id: "plan-limit-reached",
          kind: "warning",
          title: "Limit zapytań osiągnięty",
          body: `Wykorzystałeś wszystkie ${limit} zapytań w planie Pro+. Limit odnowi się na początku następnego miesiąca.`,
          date: new Date().toLocaleString(),
        });
      } else if (pct >= 0.8) {
        events.push({
          id: "plan-limit-warning",
          kind: "warning",
          title: "Zbliżasz się do limitu zapytań",
          body: `Wykorzystałeś ${used} z ${limit} zapytań w planie Pro+ (${Math.round(pct * 100)}%).`,
          date: new Date().toLocaleString(),
        });
      }
    } else {
      events.push({
        id: "free-plan-info",
        kind: "info",
        title: "Korzystasz z planu Free",
        body: "Przejdź na plan Pro lub Pro+, aby uzyskać dostęp do zaawansowanych modeli AI i wyższych limitów zapytań.",
        date: new Date().toLocaleString(),
      });
    }

    return events;
  }, [state.userPlan, state.premiumRequestsUsed]);

  // Realtime notifications from Supabase (passed from parent via hook)
  const realtimeNotifications: SystemNotification[] = (notificationsHook?.notifications ?? []).map(
    (n: AppNotification) => ({
      id: n.id,
      kind: toNotificationKind(n.kind),
      title: n.title,
      body: n.body,
      date: new Date(n.createdAt).toLocaleString(),
    })
  );

  const allNotifications = [...realtimeNotifications, ...systemNotifications];
  const hasUnread = (notificationsHook?.unreadCount ?? 0) > 0;
  const [pushStatus, setPushStatus] = useState<string | null>(null);

  const sendTestNotification = async () => {
    if (!("serviceWorker" in navigator) || typeof Notification === "undefined") {
      setPushStatus("Powiadomienia push nie są obsługiwane w tej przeglądarce.");
      return;
    }

    if (Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      window.dispatchEvent(new Event(NOTIFICATION_PERMISSION_EVENT));
      if (permission !== "granted") {
        setPushStatus("Brak zgody na wyświetlanie powiadomień.");
        return;
      }
    }

    if (Notification.permission !== "granted") {
      setPushStatus("Brak zgody na wyświetlanie powiadomień.");
      return;
    }

    const registration = await registerPushServiceWorker();
    if (!registration) {
      setPushStatus("Nie udało się zarejestrować service workera.");
      return;
    }

    await registration.showNotification("Testowa notyfikacja", {
      body: "To jest przykładowe powiadomienie push.",
      icon: "/icon-192.png",
    });
    setPushStatus("Wysłano testowe powiadomienie push.");
  };

  const handleEnablePush = async () => {
    const setup = await ensurePushSubscription(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
    window.dispatchEvent(new Event(NOTIFICATION_PERMISSION_EVENT));

    if (setup.state === "unsupported") {
      setPushStatus("Ta przeglądarka nie obsługuje powiadomień push.");
      return;
    }
    if (setup.state === "permission-default") {
      setPushStatus("Nie udzielono jeszcze zgody na powiadomienia.");
      return;
    }
    if (setup.state === "permission-denied") {
      setPushStatus("Powiadomienia są zablokowane w ustawieniach przeglądarki.");
      return;
    }
    if (setup.state === "registered-no-vapid") {
      setPushStatus("Zgoda została nadana. Dodaj NEXT_PUBLIC_VAPID_PUBLIC_KEY, aby dokończyć subskrypcję push.");
      return;
    }
    if (setup.state === "error") {
      setPushStatus(setup.error ?? "Wystąpił błąd podczas konfiguracji push.");
      return;
    }

    if (setup.subscription) {
      const synced = await syncPushSubscription(setup.subscription).catch(() => false);
      setPushStatus(
        synced
          ? "Powiadomienia push są aktywne i subskrypcja została zapisana."
          : "Powiadomienia aktywne lokalnie, ale nie udało się zapisać subskrypcji na serwerze."
      );
      return;
    }

    setPushStatus("Powiadomienia push zostały włączone.");
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
            Center powiadomień
          </div>

          <h2 className={`mt-5 text-2xl font-semibold tracking-tight ${dark ? "text-slate-100" : "text-slate-900"}`}>
            Powiadomienia i aktywność
          </h2>
          <p className={`mt-2 max-w-2xl text-sm leading-7 ${dark ? "text-slate-300" : "text-slate-600"}`}>
            Przeglądaj zdarzenia systemowe i testuj powiadomienia push w jednym miejscu.
          </p>
          {pushStatus ? (
            <p className={`mt-3 text-sm ${dark ? "text-slate-300" : "text-slate-600"}`}>{pushStatus}</p>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            {notificationPermission && notificationPermission !== "granted" ? (
              <button
                className={`inline-flex items-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                  dark
                    ? "border-sky-800/50 text-sky-200 hover:bg-sky-900/40"
                    : "border-sky-200 text-sky-700 hover:bg-sky-50"
                }`}
                onClick={() => void handleEnablePush()}
              >
                Włącz powiadomienia push
              </button>
            ) : null}
            <button
              className="inline-flex items-center rounded-xl bg-gradient-to-r from-sky-700 to-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-sky-800 hover:to-cyan-700"
              onClick={() => void sendTestNotification()}
            >
              Wyślij testowe powiadomienie push
            </button>
            {hasUnread && notificationsHook && (
              <button
                className={`inline-flex items-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                  dark
                    ? "border-sky-800/50 text-sky-200 hover:bg-sky-900/40"
                    : "border-sky-200 text-sky-700 hover:bg-sky-50"
                }`}
                onClick={() => void notificationsHook.markAllRead()}
              >
                Oznacz wszystkie jako przeczytane
              </button>
            )}
          </div>
        </div>

        <div
          className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${
            dark ? "border-slate-800 bg-slate-950/65" : "border-slate-200/80 bg-white/85"
          }`}
        >
          <h3 className={`mb-3 text-base font-semibold ${dark ? "text-slate-100" : "text-slate-900"}`}>
            Ostatnie zdarzenia
          </h3>
          {allNotifications.length === 0 ? (
            <div className={`text-sm ${dark ? "text-slate-400" : "text-slate-500"}`}>Brak powiadomień.</div>
          ) : (
            <ul className="space-y-3">
              {allNotifications.map((n) => (
                <li
                  key={n.id}
                  className={`flex gap-3 rounded-xl border p-3 ${
                    dark ? KIND_BORDER[n.kind].dark : KIND_BORDER[n.kind].light
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">{KIND_ICON[n.kind]}</div>
                  <div className="min-w-0">
                    <div className={`font-semibold ${dark ? "text-slate-100" : "text-slate-900"}`}>{n.title}</div>
                    <div className={`mt-0.5 text-sm ${dark ? "text-slate-300" : "text-slate-600"}`}>{n.body}</div>
                    <div className={`mt-1 text-xs ${dark ? "text-slate-500" : "text-slate-400"}`}>{n.date}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
