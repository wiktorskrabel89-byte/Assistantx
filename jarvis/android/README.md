# Jarvis Android

Minimalny szkielet aplikacji mobilnej (React Native)

## Pliki:
- App.js — główny plik aplikacji
- package.json — zależności
- backend.js — połączenie WebSocket z backendem Jarvis
- auth.js — token urządzenia w AsyncStorage

## Obecny stan

- Aplikacja rejestruje się do backendu jako `android` przez `ws://10.0.2.2:8000/ws`.
- Używa tego samego protokołu wiadomości co desktop: `register`, `desktop_prompt`, `command`, `response`.
- `10.0.2.2` jest poprawnym adresem hosta z emulatora Android do lokalnego backendu uruchomionego na komputerze.

## Uruchomienie

```bash
npm install
npm start
```

Jeśli nie używasz emulatora Android, tylko fizycznego telefonu, zmień adres backendu w `backend.js` na IP komputera w sieci lokalnej.

---

Kolejne kroki:
1. Dodaj plik App.js z kodem startowym React Native
2. Dodaj package.json z zależnościami
