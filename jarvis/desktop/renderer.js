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

// ipcRenderer for URL opening via main process
let ipcRenderer;
try {
	ipcRenderer = require('electron').ipcRenderer;
} catch {
	ipcRenderer = null;
}

function appendMessage(log, title, body, tone = 'system') {
	const item = document.createElement('div');
	item.className = `message ${tone}`;

	const heading = document.createElement('small');
	heading.textContent = `${new Date().toLocaleTimeString()} — ${title}`;

	const text = document.createElement('div');
	text.textContent = body;

	item.append(heading, text);
	log.prepend(item);
}

function setStatusDot(status) {
	const dot = document.getElementById('status-dot');
	if (!dot) return;
	dot.className = 'dot';
	if (status === 'connected') dot.classList.add('connected');
	if (status === 'error') dot.classList.add('error');
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
	const urlInput = document.getElementById('url-input');
	const urlGo = document.getElementById('url-go');
	const urlSearch = document.getElementById('url-search');

	tokenNode.textContent = token;
	backendUrlNode.textContent = getBackendUrl();

	// ── Status ──────────────────────────────────────────────────────────────
	function updateStatus(status, detail) {
		statusNode.textContent = detail ? `${status}: ${detail}` : status;
		setStatusDot(status);
	}

	// ── Prompt submission ────────────────────────────────────────────────────
	function submitPrompt() {
		const text = input.value.trim();
		if (!text) return;

		const sent = sendDesktopPrompt(text);
		appendMessage(log, sent ? 'Prompt sent' : 'Queued (offline)', text, sent ? 'system' : 'error');
		input.value = '';
	}

	send.addEventListener('click', submitPrompt);
	input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitPrompt(); });

	// ── URL bar ──────────────────────────────────────────────────────────────
	function doOpenUrl(rawUrl) {
		let url = rawUrl.trim();
		if (!url) return;
		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			url = 'https://' + url;
		}
		if (ipcRenderer) {
			ipcRenderer.invoke('open-url', url)
				.then(() => appendMessage(log, 'URL opened', url))
				.catch((err) => appendMessage(log, 'URL error', err.message, 'error'));
		} else {
			sendMessageToBackend({ type: 'command', command: 'openUrl', url, token });
			appendMessage(log, 'openUrl sent', url);
		}
		urlInput.value = '';
	}

	function doSearch() {
		const query = urlInput.value.trim();
		if (!query) return;
		sendMessageToBackend({ type: 'command', command: 'searchWeb', query, token });
		appendMessage(log, 'Web search', query);
		urlInput.value = '';
	}

	if (urlGo) urlGo.addEventListener('click', () => doOpenUrl(urlInput.value));
	if (urlSearch) urlSearch.addEventListener('click', doSearch);
	if (urlInput) {
		urlInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') doOpenUrl(urlInput.value);
		});
	}

	// ── Quick-action buttons ─────────────────────────────────────────────────
	quickActionButtons.forEach((button) => {
		button.addEventListener('click', () => {
			const value = button.getAttribute('data-command');
			if (!value) return;

			const [kind, payload] = value.split(':', 2);

			if (kind === 'open') {
				sendMessageToBackend({ type: 'command', command: 'openApp', app: payload, token });
				appendMessage(log, 'Quick action', `Launch: ${payload}`);
				return;
			}

			if (kind === 'command') {
				sendMessageToBackend({ type: 'command', command: payload, token });
				appendMessage(log, 'Quick action', payload);
				return;
			}

			if (kind === 'local') {
				handlePhoneCommand(payload.replace(/-/g, ' '));
				appendMessage(log, 'Local command', payload);
			}
		});
	});

	// ── Backend events ────────────────────────────────────────────────────────
	onStatus(({ status, detail, url }) => {
		updateStatus(status, detail);
		const msg = detail ? `${status} (${detail})` : `${status} — ${url}`;
		const tone = status === 'error' ? 'error' : 'system';
		appendMessage(log, 'Connection', msg, tone);
	});

	onMessage((rawMessage) => {
		try {
			const parsed = JSON.parse(rawMessage);
			const body = parsed.text || rawMessage;
			const title = parsed.type === 'response' ? '✅ Jarvis' : `Backend (${parsed.type || '?'})`;
			appendMessage(log, title, body, 'system');
		} catch {
			appendMessage(log, 'Backend event', rawMessage, 'system');
		}
	});

	connectToBackend({ token });
	updateStatus('ready');
	appendMessage(log, 'Jarvis Desktop', 'Shell initialized. Connecting to backend…');
});

