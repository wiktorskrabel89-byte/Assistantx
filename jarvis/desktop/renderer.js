const { getToken } = require('./auth');
const { handlePhoneCommand } = require('./phone-commands');
const {
	connectToBackend,
	sendDesktopPrompt,
	sendMessageToBackend,
	onMessage,
	onStatus,
	getBackendUrl,
} = require('./backend');

function appendMessage(log, title, body, tone = 'system') {
	const item = document.createElement('div');
	item.className = `message ${tone}`;

	const heading = document.createElement('small');
	heading.textContent = title;

	const text = document.createElement('div');
	text.textContent = body;

	item.append(heading, text);
	log.prepend(item);
}

window.addEventListener('DOMContentLoaded', () => {
	const token = getToken();
	const log = document.getElementById('log');
	const input = document.getElementById('input');
	const send = document.getElementById('send');
	const tokenNode = document.getElementById('device-token');
	const statusNode = document.getElementById('connection-status');
	const backendUrlNode = document.getElementById('backend-url');
	const quickActionButtons = document.querySelectorAll('[data-command]');

	tokenNode.textContent = token;
	backendUrlNode.textContent = getBackendUrl();

	function updateStatus(status, detail) {
		statusNode.textContent = detail ? `${status}: ${detail}` : status;
	}

	function submitPrompt() {
		const text = input.value.trim();
		if (!text) {
			return;
		}

		const sent = sendDesktopPrompt(text);
		appendMessage(log, sent ? 'Outgoing prompt' : 'Queued locally', text, sent ? 'system' : 'error');
		input.value = '';
	}

	send.addEventListener('click', submitPrompt);
	input.addEventListener('keydown', (event) => {
		if (event.key === 'Enter') {
			submitPrompt();
		}
	});

	quickActionButtons.forEach((button) => {
		button.addEventListener('click', () => {
			const value = button.getAttribute('data-command');
			if (!value) {
				return;
			}

			const [kind, payload] = value.split(':', 2);
			if (kind === 'open') {
				sendMessageToBackend({ type: 'command', command: 'openApp', app: payload, token });
				appendMessage(log, 'Quick action', `Requested app launch: ${payload}`);
				return;
			}

			if (kind === 'command') {
				sendMessageToBackend({ type: 'command', command: payload, token });
				appendMessage(log, 'Quick action', `Requested command: ${payload}`);
				return;
			}

			if (kind === 'local' && payload === 'otworz-roblox') {
				handlePhoneCommand('otwórz roblox');
				appendMessage(log, 'Local phone command', 'Executed placeholder phone command: otwórz roblox');
			}
		});
	});

	onStatus(({ status, detail, url }) => {
		updateStatus(status, detail);
		appendMessage(log, 'Connection state', detail ? `${status} (${detail})` : `${status} (${url})`, status === 'error' ? 'error' : 'system');
	});

	onMessage((rawMessage) => {
		appendMessage(log, 'Backend event', rawMessage, 'system');
	});

	connectToBackend({ token });
	updateStatus('ready');
	appendMessage(log, 'Jarvis Desktop', 'Desktop shell initialized.');
});
