"use client";

import { Bell } from "lucide-react";
import { TabPlaceholder } from "./TabPlaceholder";

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
    <div className="p-8">
      <TabPlaceholder
        dark={dark}
        icon={Bell}
        title="Powiadomienia"
        description="Przeglad powiadomien i aktywnosci."
      />
      <button
        className="mt-6 rounded bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-700"
        onClick={sendTestNotification}
      >
        Wyślij testowe powiadomienie push
      </button>
      <div className="mt-8">
        <h3 className="text-lg font-bold mb-2">Ostatnie powiadomienia</h3>
        {notifications.length === 0 ? (
          <div className="text-slate-500">Brak powiadomień.</div>
        ) : (
          <ul className="space-y-3">
            {notifications.map((n) => (
              <li key={n.id} className={`rounded border p-3 ${dark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}>
                <div className="font-semibold">{n.title}</div>
                <div className="text-sm text-slate-500">{n.body}</div>
                <div className="text-xs text-slate-400 mt-1">{n.date}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
