// jarvis/desktop/phone-commands.js
// Prosty szkielet obsługi poleceń z telefonu (placeholder)

function handlePhoneCommand(command) {
  // Przykład: obsługa polecenia "otwórz roblox"
  if (command === 'otwórz roblox') {
    console.log('Otwieram Roblox...');
    // Tu kod do uruchomienia Roblox
  } else {
    console.log('Nieznane polecenie:', command);
  }
}

module.exports = { handlePhoneCommand };

// Przykład użycia:
// handlePhoneCommand('otwórz roblox');
