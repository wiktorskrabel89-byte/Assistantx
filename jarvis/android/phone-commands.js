// jarvis/android/phone-commands.js
// Prosty szkielet obsługi poleceń z aplikacji (placeholder)

export function handleAppCommand(command) {
  // Przykład: obsługa polecenia "włącz komputer"
  if (command === 'włącz komputer') {
    console.log('Wysyłam polecenie: włącz komputer');
    // Tu kod do wysłania polecenia do backendu
  } else {
    console.log('Nieznane polecenie:', command);
  }
}

// Przykład użycia:
// handleAppCommand('włącz komputer');
