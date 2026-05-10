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
	const appVersionNode = document.getElementById('app-version');
	const updateStatusNode = document.getElementById('update-status');
	const checkUpdatesButton = document.getElementById('check-updates');
	const installUpdateButton = document.getElementById('install-update');
	const quickActionButtons = document.querySelectorAll('[data-command]');
	const urlInput = document.getElementById('url-input');
	const urlGo = document.getElementById('url-go');
	const urlSearch = document.getElementById('url-search');
	const chatModelSelect = document.getElementById('chat-model');
	const sttModelSelect = document.getElementById('stt-model');
	const ttsModelSelect = document.getElementById('tts-model');
	const voiceLanguageSelect = document.getElementById('voice-language');
	const speechToTextButton = document.getElementById('speech-to-text');
	const autoTtsToggle = document.getElementById('auto-tts');

	tokenNode.textContent = token;
	backendUrlNode.textContent = getBackendUrl();

	const getModelSettings = () => ({
		chatModel: chatModelSelect?.value || 'auto-smart',
		sttModel: sttModelSelect?.value || 'whisper-large-v3-turbo',
		ttsModel: ttsModelSelect?.value || 'orpheus-english',
	});

	const isHardTaskPrompt = (text) => {
		const normalized = String(text || '').toLowerCase();
		return /\b(debug|bug|fix|refactor|architecture|design|optimi[sz]e|complex|hard|analy[sz]e|root cause|performance|scalability)\b/.test(normalized);
	};

	const resolveChatModel = (text, selectedModel) => {
		if (selectedModel !== 'auto-smart') return selectedModel;
		return isHardTaskPrompt(text) ? 'openai/gpt-oss-120b:free' : 'qwen/qwen3-32b';
	};

	const getVoiceLanguage = () => (
		voiceLanguageSelect?.value
		|| (typeof navigator !== 'undefined' ? navigator.language : null)
		|| 'en-US'
	);

	const supportsSpeechRecognition = () => (
		typeof window !== 'undefined'
		&& !!(window.SpeechRecognition || window.webkitSpeechRecognition)
	);

	let recognition = null;
	let speechToTextActive = false;

	function setSpeechToTextActive(active) {
		speechToTextActive = active;
		if (!speechToTextButton) return;
		const label = active ? 'Stop speech-to-text' : 'Start speech-to-text';
		speechToTextButton.textContent = active ? '⏹️ Stop speech-to-text' : '🎙️ Start speech-to-text';
		speechToTextButton.setAttribute('aria-label', label);
		speechToTextButton.setAttribute('title', label);
	}

	function speakResponse(text) {
		if (!autoTtsToggle?.checked) return;
		if (typeof window === 'undefined' || !window.speechSynthesis) return;
		const spokenText = String(text || '').trim();
		if (!spokenText) return;
		// Local playback uses native browser speech synthesis.
		// The selected TTS model is still forwarded to backend payloads for remote TTS-capable flows.
		try {
			window.speechSynthesis.cancel();
			const utterance = new SpeechSynthesisUtterance(spokenText);
			utterance.lang = getVoiceLanguage();
			utterance.rate = 1;
			utterance.onerror = () => {
				appendMessage(log, 'Text-to-speech', 'Speech playback failed.', 'error');
			};
			window.speechSynthesis.speak(utterance);
		} catch {
			appendMessage(log, 'Text-to-speech', 'Speech playback failed.', 'error');
		}
	}

	// ── Status ──────────────────────────────────────────────────────────────
	function updateStatus(status, detail) {
		statusNode.textContent = detail ? `${status}: ${detail}` : status;
		setStatusDot(status);
	}

	function updateAutoUpdateStatus(payload) {
		if (!updateStatusNode) return;

		const detail = payload?.detail ? `${payload.status}: ${payload.detail}` : payload?.status || 'idle';
		updateStatusNode.textContent = detail;

		if (installUpdateButton) {
			installUpdateButton.hidden = !payload?.downloaded;
		}

		if (checkUpdatesButton) {
			checkUpdatesButton.disabled = payload?.status === 'checking';
		}
	}

	// ── Prompt submission ────────────────────────────────────────────────────
	function submitPrompt() {
		const text = input.value.trim();
		if (!text) return;

		const models = getModelSettings();
		const resolvedChatModel = resolveChatModel(text, models.chatModel);
		const routedModels = { ...models, chatModel: resolvedChatModel };
		const sent = sendDesktopPrompt(text, routedModels);
		const routeNote = models.chatModel === 'auto-smart'
			? `\n(model auto-route: ${resolvedChatModel})`
			: '';
		appendMessage(log, sent ? 'Prompt sent' : 'Queued (offline)', `${text}${routeNote}`, sent ? 'system' : 'error');
		input.value = '';
	}

	send.addEventListener('click', submitPrompt);
	input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitPrompt(); });

	if (speechToTextButton) {
		if (!supportsSpeechRecognition()) {
			speechToTextButton.disabled = true;
			speechToTextButton.title = 'Speech-to-text is not supported in this runtime';
		} else {
			speechToTextButton.addEventListener('click', () => {
				const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
				if (!SpeechRecognitionCtor) return;

				if (speechToTextActive) {
					recognition?.stop();
					return;
				}

				recognition = new SpeechRecognitionCtor();
				recognition.lang = getVoiceLanguage();
				recognition.continuous = true;
				recognition.interimResults = true;

				recognition.onstart = () => setSpeechToTextActive(true);
				recognition.onend = () => setSpeechToTextActive(false);
				recognition.onerror = () => {
					setSpeechToTextActive(false);
					appendMessage(log, 'Speech-to-text', 'Speech capture failed. Try again.', 'error');
				};
				recognition.onresult = (event) => {
					const transcriptParts = [];
					for (let i = event.resultIndex; i < event.results.length; i += 1) {
						transcriptParts.push(event.results[i][0].transcript);
					}
					input.value = transcriptParts.join(' ').replace(/\s+/g, ' ').trim();
				};

				recognition.start();
			});
		}
	}

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

	if (ipcRenderer && appVersionNode) {
		ipcRenderer.invoke('get-app-meta').then((meta) => {
			appVersionNode.textContent = meta.packaged
				? `v${meta.version}`
				: `v${meta.version} (dev mode, updater off)`;
		}).catch(() => {
			appVersionNode.textContent = 'Unknown';
		});

		ipcRenderer.on('app-meta', (_event, meta) => {
			appVersionNode.textContent = meta.packaged
				? `v${meta.version}`
				: `v${meta.version} (dev mode, updater off)`;
		});

		ipcRenderer.on('auto-update-status', (_event, payload) => {
			updateAutoUpdateStatus(payload);

			if (['checking', 'up-to-date', 'ready-to-install', 'error'].includes(payload?.status)) {
				appendMessage(log, 'Updater', payload.detail || payload.status, payload?.status === 'error' ? 'error' : 'system');
			}
		});
	}

	if (checkUpdatesButton && ipcRenderer) {
		checkUpdatesButton.addEventListener('click', async () => {
			const result = await ipcRenderer.invoke('check-for-updates');
			if (result?.ok === false && result.reason === 'not-packaged') {
				appendMessage(log, 'Updater', 'Running in dev mode — download and install the EXE to get automatic updates.', 'system');
			}
		});
	}

	if (installUpdateButton && ipcRenderer) {
		installUpdateButton.addEventListener('click', async () => {
			const result = await ipcRenderer.invoke('install-update');
			if (!result?.ok) {
				appendMessage(log, 'Updater', 'No downloaded update is ready yet.', 'error');
			}
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
			// parsed.text is the human-readable content; fall back to stringifying the whole object
			const body = typeof parsed.text === 'string' ? parsed.text : JSON.stringify(parsed);
			const title = parsed.type === 'response' ? '✅ Jarvis' : `Backend (${parsed.type || '?'})`;
			appendMessage(log, title, body, 'system');
			if (parsed.type === 'response') {
				speakResponse(body);
			}
		} catch {
			// rawMessage is not JSON — display as plain text
			appendMessage(log, 'Backend event', rawMessage, 'system');
		}
	});

	connectToBackend({ token });
	updateStatus('ready');
	appendMessage(log, 'Jarvis Desktop', 'Shell initialized. Connecting to backend…');
});
