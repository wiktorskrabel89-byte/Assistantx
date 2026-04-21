"use client";

import { Bell } from "lucide-react";
import { TabPlaceholder } from "./TabPlaceholder";

export function NotificationsTab({ dark }: { dark: boolean }) {
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
    </div>
  );
}
