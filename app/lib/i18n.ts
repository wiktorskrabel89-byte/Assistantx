/**
 * Lightweight UI translation dictionary for AssistantX.
 *
 * Add new language codes here and fill in all keys.
 * The hook `useTranslations()` resolves the correct strings
 * from the active `state.uiLanguage` value.
 *
 * Supported codes: "en" | "pl" | "de" | "es" | "fr"
 */

export const UI_LANGUAGES: { code: string; label: string; nativeLabel: string }[] = [
  { code: "en", label: "English",    nativeLabel: "English"   },
  { code: "pl", label: "Polish",     nativeLabel: "Polski"    },
  { code: "de", label: "German",     nativeLabel: "Deutsch"   },
  { code: "es", label: "Spanish",    nativeLabel: "Español"   },
  { code: "fr", label: "French",     nativeLabel: "Français"  },
];

export type UILanguageCode = "en" | "pl" | "de" | "es" | "fr";

export type Translations = {
  // ─── Settings page ───────────────────────────────────────
  settings_chip: string;
  settings_title: string;
  settings_subtitle: string;
  settings_language_chip: string;
  settings_language_title: string;
  settings_language_subtitle: string;
  settings_dark_mode: string;
  settings_dark_mode_desc: string;
  settings_sync: string;
  settings_workspace: string;
  settings_plan: string;
  settings_mode: string;
  settings_profile_chip: string;
  settings_profile_title: string;
  settings_profile_subtitle: string;
  settings_profile_saved: string;
  settings_profile_error: string;
  settings_profile_save_failed: string;
  settings_usage_chip: string;
  settings_usage_title: string;
  settings_usage_subtitle: string;
  settings_usage_loading: string;
  settings_messages: string;
  settings_conversations: string;
  settings_premium_requests: string;
  settings_top_models: string;
  // ─── Notifications tab ───────────────────────────────────
  notif_center: string;
  notif_title: string;
  notif_subtitle: string;
  notif_enable_push: string;
  notif_send_test: string;
  notif_mark_all_read: string;
  notif_recent_events: string;
  notif_none: string;
  notif_limit_reached_title: string;
  notif_limit_reached_pro: string;
  notif_limit_reached_proplus: string;
  notif_approaching_title: string;
  notif_approaching_pro: string;
  notif_approaching_proplus: string;
  notif_free_title: string;
  notif_free_body: string;
  // ─── Push status messages ────────────────────────────────
  push_unsupported: string;
  push_no_permission: string;
  push_sw_failed: string;
  push_test_sent: string;
  push_blocked: string;
  push_no_vapid: string;
  push_error: string;
  push_active_saved: string;
  push_active_local: string;
  push_enabled: string;
  push_test_notif_title: string;
  push_test_notif_body: string;
  // ─── Navigation ──────────────────────────────────────────
  nav_apps_search_placeholder: string;
  nav_apps_empty: string;
  nav_pin: string;
  nav_unpin: string;
  nav_apps_footer: string;
  nav_account_fallback: string;
};

const EN: Translations = {
  settings_chip: "App settings",
  settings_title: "Personalisation",
  settings_subtitle: "Key appearance options and workspace status in one place.",
  settings_language_chip: "Language",
  settings_language_title: "Interface language",
  settings_language_subtitle: "Choose the display language for the AssistantX interface.",
  settings_dark_mode: "Dark mode",
  settings_dark_mode_desc: "Enable dark theme for the whole application.",
  settings_sync: "Sync",
  settings_workspace: "Workspace",
  settings_plan: "Plan",
  settings_mode: "Mode",
  settings_profile_chip: "Profile settings",
  settings_profile_title: "Edit profile",
  settings_profile_subtitle: "Manage your profile and information visible in the AssistantX workspace.",
  settings_profile_saved: "Profile saved successfully.",
  settings_profile_error: "Error",
  settings_profile_save_failed: "Failed to save profile.",
  settings_usage_chip: "Usage",
  settings_usage_title: "Usage statistics",
  settings_usage_subtitle: "Overview of activity and plan limits.",
  settings_usage_loading: "Loading statistics…",
  settings_messages: "Messages",
  settings_conversations: "Conversations",
  settings_premium_requests: "Premium requests",
  settings_top_models: "Top models",
  notif_center: "Notification Center",
  notif_title: "Notifications & activity",
  notif_subtitle: "Review system events and test push notifications in one place.",
  notif_enable_push: "Enable push notifications",
  notif_send_test: "Send test push notification",
  notif_mark_all_read: "Mark all as read",
  notif_recent_events: "Recent events",
  notif_none: "No notifications.",
  notif_limit_reached_title: "Request limit reached",
  notif_limit_reached_pro: "You have used all {limit} Pro plan requests. Your limit resets at the start of next month, or upgrade to Pro+.",
  notif_limit_reached_proplus: "You have used all {limit} Pro+ plan requests. Your limit resets at the start of next month.",
  notif_approaching_title: "Approaching request limit",
  notif_approaching_pro: "You have used {used} of {limit} Pro plan requests ({pct}%).",
  notif_approaching_proplus: "You have used {used} of {limit} Pro+ plan requests ({pct}%).",
  notif_free_title: "You are on the Free plan",
  notif_free_body: "Upgrade to Pro or Pro+ to access advanced AI models and higher request limits.",
  push_unsupported: "Push notifications are not supported in this browser.",
  push_no_permission: "Notification permission not granted.",
  push_sw_failed: "Failed to register the service worker.",
  push_test_sent: "Test push notification sent.",
  push_blocked: "Notifications are blocked in browser settings.",
  push_no_vapid: "Permission granted. Add NEXT_PUBLIC_VAPID_PUBLIC_KEY to complete push subscription.",
  push_error: "An error occurred during push setup.",
  push_active_saved: "Push notifications are active and subscription saved.",
  push_active_local: "Notifications active locally, but failed to save subscription to server.",
  push_enabled: "Push notifications have been enabled.",
  push_test_notif_title: "Test notification",
  push_test_notif_body: "This is a sample push notification.",
  nav_apps_search_placeholder: "Search applications...",
  nav_apps_empty: "No applications",
  nav_pin: "Add to tabs",
  nav_unpin: "Remove from tabs",
  nav_apps_footer: " to pin an application to the sidebar.",
  nav_account_fallback: "Account",
};

const PL: Translations = {
  settings_chip: "Ustawienia aplikacji",
  settings_title: "Personalizacja",
  settings_subtitle: "Najważniejsze opcje wyglądu i statusu workspace w jednym miejscu.",
  settings_language_chip: "Język",
  settings_language_title: "Język interfejsu",
  settings_language_subtitle: "Wybierz język wyświetlania interfejsu AssistantX.",
  settings_dark_mode: "Tryb ciemny",
  settings_dark_mode_desc: "Włącz ciemny motyw całej aplikacji.",
  settings_sync: "Synchronizacja",
  settings_workspace: "Workspace",
  settings_plan: "Plan",
  settings_mode: "Tryb",
  settings_profile_chip: "Ustawienia profilu",
  settings_profile_title: "Edytuj profil",
  settings_profile_subtitle: "Zarządzaj profilem i informacjami widocznymi w przestrzeni AssistantX.",
  settings_profile_saved: "Profil zapisany pomyślnie.",
  settings_profile_error: "Błąd",
  settings_profile_save_failed: "Nie udało się zapisać profilu.",
  settings_usage_chip: "Użycie",
  settings_usage_title: "Statystyki użycia",
  settings_usage_subtitle: "Przegląd aktywności i limitu planu.",
  settings_usage_loading: "Ładowanie statystyk…",
  settings_messages: "Wiadomości",
  settings_conversations: "Rozmowy",
  settings_premium_requests: "Zapytania premium",
  settings_top_models: "Najpopularniejsze modele",
  notif_center: "Center powiadomień",
  notif_title: "Powiadomienia i aktywność",
  notif_subtitle: "Przeglądaj zdarzenia systemowe i testuj powiadomienia push w jednym miejscu.",
  notif_enable_push: "Włącz powiadomienia push",
  notif_send_test: "Wyślij testowe powiadomienie push",
  notif_mark_all_read: "Oznacz wszystkie jako przeczytane",
  notif_recent_events: "Ostatnie zdarzenia",
  notif_none: "Brak powiadomień.",
  notif_limit_reached_title: "Limit zapytań osiągnięty",
  notif_limit_reached_pro: "Wykorzystałeś wszystkie {limit} zapytań w planie Pro. Limit odnowi się na początku następnego miesiąca lub przejdź na plan Pro+.",
  notif_limit_reached_proplus: "Wykorzystałeś wszystkie {limit} zapytań w planie Pro+. Limit odnowi się na początku następnego miesiąca.",
  notif_approaching_title: "Zbliżasz się do limitu zapytań",
  notif_approaching_pro: "Wykorzystałeś {used} z {limit} zapytań w planie Pro ({pct}%).",
  notif_approaching_proplus: "Wykorzystałeś {used} z {limit} zapytań w planie Pro+ ({pct}%).",
  notif_free_title: "Korzystasz z planu Free",
  notif_free_body: "Przejdź na plan Pro lub Pro+, aby uzyskać dostęp do zaawansowanych modeli AI i wyższych limitów zapytań.",
  push_unsupported: "Powiadomienia push nie są obsługiwane w tej przeglądarce.",
  push_no_permission: "Brak zgody na wyświetlanie powiadomień.",
  push_sw_failed: "Nie udało się zarejestrować service workera.",
  push_test_sent: "Wysłano testowe powiadomienie push.",
  push_blocked: "Powiadomienia są zablokowane w ustawieniach przeglądarki.",
  push_no_vapid: "Zgoda została nadana. Dodaj NEXT_PUBLIC_VAPID_PUBLIC_KEY, aby dokończyć subskrypcję push.",
  push_error: "Wystąpił błąd podczas konfiguracji push.",
  push_active_saved: "Powiadomienia push są aktywne i subskrypcja została zapisana.",
  push_active_local: "Powiadomienia aktywne lokalnie, ale nie udało się zapisać subskrypcji na serwerze.",
  push_enabled: "Powiadomienia push zostały włączone.",
  push_test_notif_title: "Testowa notyfikacja",
  push_test_notif_body: "To jest przykładowe powiadomienie push.",
  nav_apps_search_placeholder: "Szukaj aplikacji...",
  nav_apps_empty: "Brak aplikacji",
  nav_pin: "Dodaj do zakładek",
  nav_unpin: "Usuń z zakładek",
  nav_apps_footer: " aby przypiąć aplikację do paska bocznego.",
  nav_account_fallback: "Konto",
};

const DE: Translations = {
  settings_chip: "App-Einstellungen",
  settings_title: "Personalisierung",
  settings_subtitle: "Wichtigste Erscheinungs- und Workspace-Optionen an einem Ort.",
  settings_language_chip: "Sprache",
  settings_language_title: "Oberflächensprache",
  settings_language_subtitle: "Wählen Sie die Anzeigesprache für die AssistantX-Oberfläche.",
  settings_dark_mode: "Dunkelmodus",
  settings_dark_mode_desc: "Dunkles Design für die gesamte Anwendung aktivieren.",
  settings_sync: "Synchronisierung",
  settings_workspace: "Workspace",
  settings_plan: "Plan",
  settings_mode: "Modus",
  settings_profile_chip: "Profileinstellungen",
  settings_profile_title: "Profil bearbeiten",
  settings_profile_subtitle: "Verwalten Sie Ihr Profil und Ihre Informationen im AssistantX-Arbeitsbereich.",
  settings_profile_saved: "Profil erfolgreich gespeichert.",
  settings_profile_error: "Fehler",
  settings_profile_save_failed: "Profil konnte nicht gespeichert werden.",
  settings_usage_chip: "Nutzung",
  settings_usage_title: "Nutzungsstatistiken",
  settings_usage_subtitle: "Überblick über Aktivität und Planlimits.",
  settings_usage_loading: "Statistiken werden geladen…",
  settings_messages: "Nachrichten",
  settings_conversations: "Gespräche",
  settings_premium_requests: "Premium-Anfragen",
  settings_top_models: "Top-Modelle",
  notif_center: "Benachrichtigungszentrum",
  notif_title: "Benachrichtigungen & Aktivität",
  notif_subtitle: "Systemereignisse prüfen und Push-Benachrichtigungen testen.",
  notif_enable_push: "Push-Benachrichtigungen aktivieren",
  notif_send_test: "Test-Push-Benachrichtigung senden",
  notif_mark_all_read: "Alle als gelesen markieren",
  notif_recent_events: "Letzte Ereignisse",
  notif_none: "Keine Benachrichtigungen.",
  notif_limit_reached_title: "Anfragelimit erreicht",
  notif_limit_reached_pro: "Sie haben alle {limit} Pro-Anfragen verbraucht. Das Limit wird Anfang nächsten Monats zurückgesetzt oder wechseln Sie zu Pro+.",
  notif_limit_reached_proplus: "Sie haben alle {limit} Pro+-Anfragen verbraucht. Das Limit wird Anfang nächsten Monats zurückgesetzt.",
  notif_approaching_title: "Anfragelimit wird bald erreicht",
  notif_approaching_pro: "Sie haben {used} von {limit} Pro-Anfragen genutzt ({pct}%).",
  notif_approaching_proplus: "Sie haben {used} von {limit} Pro+-Anfragen genutzt ({pct}%).",
  notif_free_title: "Sie nutzen den kostenlosen Plan",
  notif_free_body: "Wechseln Sie zu Pro oder Pro+, um auf erweiterte KI-Modelle und höhere Anfragelimits zuzugreifen.",
  push_unsupported: "Push-Benachrichtigungen werden in diesem Browser nicht unterstützt.",
  push_no_permission: "Benachrichtigungsberechtigung nicht erteilt.",
  push_sw_failed: "Service Worker konnte nicht registriert werden.",
  push_test_sent: "Test-Push-Benachrichtigung gesendet.",
  push_blocked: "Benachrichtigungen sind in den Browsereinstellungen blockiert.",
  push_no_vapid: "Berechtigung erteilt. Fügen Sie NEXT_PUBLIC_VAPID_PUBLIC_KEY hinzu, um das Push-Abonnement abzuschließen.",
  push_error: "Fehler bei der Push-Einrichtung.",
  push_active_saved: "Push-Benachrichtigungen sind aktiv und das Abonnement wurde gespeichert.",
  push_active_local: "Benachrichtigungen lokal aktiv, aber Abonnement konnte nicht auf dem Server gespeichert werden.",
  push_enabled: "Push-Benachrichtigungen wurden aktiviert.",
  push_test_notif_title: "Testbenachrichtigung",
  push_test_notif_body: "Dies ist eine Beispiel-Push-Benachrichtigung.",
  nav_apps_search_placeholder: "Anwendungen suchen...",
  nav_apps_empty: "Keine Anwendungen",
  nav_pin: "Zu Tabs hinzufügen",
  nav_unpin: "Aus Tabs entfernen",
  nav_apps_footer: " um eine Anwendung in der Seitenleiste anzupinnen.",
  nav_account_fallback: "Konto",
};

const ES: Translations = {
  settings_chip: "Configuración de la app",
  settings_title: "Personalización",
  settings_subtitle: "Las opciones más importantes de apariencia y estado del workspace en un solo lugar.",
  settings_language_chip: "Idioma",
  settings_language_title: "Idioma de la interfaz",
  settings_language_subtitle: "Elige el idioma de visualización para la interfaz de AssistantX.",
  settings_dark_mode: "Modo oscuro",
  settings_dark_mode_desc: "Activar el tema oscuro para toda la aplicación.",
  settings_sync: "Sincronización",
  settings_workspace: "Workspace",
  settings_plan: "Plan",
  settings_mode: "Modo",
  settings_profile_chip: "Configuración de perfil",
  settings_profile_title: "Editar perfil",
  settings_profile_subtitle: "Gestiona tu perfil e información visible en el espacio de trabajo de AssistantX.",
  settings_profile_saved: "Perfil guardado correctamente.",
  settings_profile_error: "Error",
  settings_profile_save_failed: "No se pudo guardar el perfil.",
  settings_usage_chip: "Uso",
  settings_usage_title: "Estadísticas de uso",
  settings_usage_subtitle: "Resumen de actividad y límites del plan.",
  settings_usage_loading: "Cargando estadísticas…",
  settings_messages: "Mensajes",
  settings_conversations: "Conversaciones",
  settings_premium_requests: "Solicitudes premium",
  settings_top_models: "Modelos más usados",
  notif_center: "Centro de notificaciones",
  notif_title: "Notificaciones y actividad",
  notif_subtitle: "Revisa eventos del sistema y prueba las notificaciones push en un solo lugar.",
  notif_enable_push: "Activar notificaciones push",
  notif_send_test: "Enviar notificación push de prueba",
  notif_mark_all_read: "Marcar todo como leído",
  notif_recent_events: "Eventos recientes",
  notif_none: "Sin notificaciones.",
  notif_limit_reached_title: "Límite de solicitudes alcanzado",
  notif_limit_reached_pro: "Has utilizado todas las {limit} solicitudes del plan Pro. El límite se restablecerá a principios del próximo mes o actualiza a Pro+.",
  notif_limit_reached_proplus: "Has utilizado todas las {limit} solicitudes del plan Pro+. El límite se restablecerá a principios del próximo mes.",
  notif_approaching_title: "Acercándote al límite de solicitudes",
  notif_approaching_pro: "Has utilizado {used} de {limit} solicitudes del plan Pro ({pct}%).",
  notif_approaching_proplus: "Has utilizado {used} de {limit} solicitudes del plan Pro+ ({pct}%).",
  notif_free_title: "Estás en el plan gratuito",
  notif_free_body: "Actualiza a Pro o Pro+ para acceder a modelos de IA avanzados y límites de solicitudes más altos.",
  push_unsupported: "Las notificaciones push no son compatibles con este navegador.",
  push_no_permission: "Permiso de notificación no otorgado.",
  push_sw_failed: "No se pudo registrar el service worker.",
  push_test_sent: "Notificación push de prueba enviada.",
  push_blocked: "Las notificaciones están bloqueadas en la configuración del navegador.",
  push_no_vapid: "Permiso otorgado. Agrega NEXT_PUBLIC_VAPID_PUBLIC_KEY para completar la suscripción push.",
  push_error: "Se produjo un error durante la configuración push.",
  push_active_saved: "Las notificaciones push están activas y la suscripción se guardó.",
  push_active_local: "Notificaciones activas localmente, pero no se pudo guardar la suscripción en el servidor.",
  push_enabled: "Las notificaciones push han sido activadas.",
  push_test_notif_title: "Notificación de prueba",
  push_test_notif_body: "Esta es una notificación push de ejemplo.",
  nav_apps_search_placeholder: "Buscar aplicaciones...",
  nav_apps_empty: "Sin aplicaciones",
  nav_pin: "Añadir a pestañas",
  nav_unpin: "Quitar de pestañas",
  nav_apps_footer: " para fijar una aplicación a la barra lateral.",
  nav_account_fallback: "Cuenta",
};

const FR: Translations = {
  settings_chip: "Paramètres de l'app",
  settings_title: "Personnalisation",
  settings_subtitle: "Les principales options d'apparence et l'état du workspace en un seul endroit.",
  settings_language_chip: "Langue",
  settings_language_title: "Langue de l'interface",
  settings_language_subtitle: "Choisissez la langue d'affichage de l'interface AssistantX.",
  settings_dark_mode: "Mode sombre",
  settings_dark_mode_desc: "Activer le thème sombre pour toute l'application.",
  settings_sync: "Synchronisation",
  settings_workspace: "Workspace",
  settings_plan: "Plan",
  settings_mode: "Mode",
  settings_profile_chip: "Paramètres du profil",
  settings_profile_title: "Modifier le profil",
  settings_profile_subtitle: "Gérez votre profil et les informations visibles dans l'espace de travail AssistantX.",
  settings_profile_saved: "Profil enregistré avec succès.",
  settings_profile_error: "Erreur",
  settings_profile_save_failed: "Impossible d'enregistrer le profil.",
  settings_usage_chip: "Utilisation",
  settings_usage_title: "Statistiques d'utilisation",
  settings_usage_subtitle: "Aperçu de l'activité et des limites du plan.",
  settings_usage_loading: "Chargement des statistiques…",
  settings_messages: "Messages",
  settings_conversations: "Conversations",
  settings_premium_requests: "Requêtes premium",
  settings_top_models: "Meilleurs modèles",
  notif_center: "Centre de notifications",
  notif_title: "Notifications et activité",
  notif_subtitle: "Consultez les événements système et testez les notifications push en un seul endroit.",
  notif_enable_push: "Activer les notifications push",
  notif_send_test: "Envoyer une notification push de test",
  notif_mark_all_read: "Tout marquer comme lu",
  notif_recent_events: "Événements récents",
  notif_none: "Aucune notification.",
  notif_limit_reached_title: "Limite de requêtes atteinte",
  notif_limit_reached_pro: "Vous avez utilisé toutes vos {limit} requêtes du plan Pro. La limite sera réinitialisée début du mois prochain ou passez à Pro+.",
  notif_limit_reached_proplus: "Vous avez utilisé toutes vos {limit} requêtes du plan Pro+. La limite sera réinitialisée début du mois prochain.",
  notif_approaching_title: "Approche de la limite de requêtes",
  notif_approaching_pro: "Vous avez utilisé {used} sur {limit} requêtes du plan Pro ({pct}%).",
  notif_approaching_proplus: "Vous avez utilisé {used} sur {limit} requêtes du plan Pro+ ({pct}%).",
  notif_free_title: "Vous utilisez le plan gratuit",
  notif_free_body: "Passez à Pro ou Pro+ pour accéder aux modèles d'IA avancés et aux limites de requêtes plus élevées.",
  push_unsupported: "Les notifications push ne sont pas prises en charge par ce navigateur.",
  push_no_permission: "Permission de notification non accordée.",
  push_sw_failed: "Impossible d'enregistrer le service worker.",
  push_test_sent: "Notification push de test envoyée.",
  push_blocked: "Les notifications sont bloquées dans les paramètres du navigateur.",
  push_no_vapid: "Permission accordée. Ajoutez NEXT_PUBLIC_VAPID_PUBLIC_KEY pour finaliser l'abonnement push.",
  push_error: "Une erreur s'est produite lors de la configuration push.",
  push_active_saved: "Les notifications push sont actives et l'abonnement a été enregistré.",
  push_active_local: "Notifications actives localement, mais l'abonnement n'a pas pu être enregistré sur le serveur.",
  push_enabled: "Les notifications push ont été activées.",
  push_test_notif_title: "Notification de test",
  push_test_notif_body: "Ceci est un exemple de notification push.",
  nav_apps_search_placeholder: "Rechercher des applications...",
  nav_apps_empty: "Aucune application",
  nav_pin: "Ajouter aux onglets",
  nav_unpin: "Retirer des onglets",
  nav_apps_footer: " pour épingler une application dans la barre latérale.",
  nav_account_fallback: "Compte",
};

const TRANSLATIONS: Record<UILanguageCode, Translations> = { en: EN, pl: PL, de: DE, es: ES, fr: FR };

/** Resolve a translations object for the given language code.
 *  Falls back to English for unknown codes. */
export function getTranslations(lang: string): Translations {
  return TRANSLATIONS[(lang as UILanguageCode)] ?? EN;
}

/** Interpolate `{key}` placeholders in a translation string. */
export function t(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
}
