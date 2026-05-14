const { getToken } = require('./auth');
const {
	connectToBackend,
	executeStructuredCommand,
	getLocalStateSnapshot,
	onMessage,
	onStatus,
	queuePromptExecution,
} = require('./backend');
const {
	addSchedule,
	getSchedules,
	syncToCloud,
	loadFromCloud,
} = require('./local-state');
const { startScheduler } = require('./scheduler');
const { getAccountSession, setAccountSession, clearAccountSession, getLinkedAccounts } = require('./accounts');
const { getJarvisApiUrl, getJarvisWebUrl, setJarvisWebUrl } = require('./runtime-config');

// ipcRenderer for URL opening via main process
let ipcRenderer;
try {
	ipcRenderer = require('electron').ipcRenderer;
} catch {
	ipcRenderer = null;
}

// ── Python AI-Agent sidecar bridge ──────────────────────────────────────────
let sidecar = null;
let sidecarConnected = false;
try {
	const { SidecarBridge } = require('./sidecar-bridge');
	sidecar = new SidecarBridge();
} catch {
	// sidecar-bridge not available — browser voice APIs will be used
}

const DEFAULT_JARVIS_WAKE_PHRASE = 'Hey Jarvis';
const MAX_SPOKEN_TEXT_LENGTH = 220;
const VOICE_PROFILES = {
	default: {
		preferredVoiceName: ['Google US English', 'Samantha', 'Microsoft Aria', 'en-US'],
		rate: 1,
		pitch: 1,
	},
	jarvis: {
		preferredVoiceName: ['Google UK English Male', 'Daniel', 'Microsoft David', 'en-GB'],
		rate: 0.92,
		pitch: 0.9,
	},
	nova: {
		preferredVoiceName: ['Google UK English Female', 'Serena', 'Victoria', 'en-GB'],
		rate: 1.02,
		pitch: 1.08,
	},
	echo: {
		preferredVoiceName: ['Alex', 'Microsoft Mark', 'Google US English', 'en-US'],
		rate: 1.04,
		pitch: 0.98,
	},
	aria: {
		preferredVoiceName: ['Aria', 'Microsoft Aria', 'Samantha', 'en-US'],
		rate: 0.98,
		pitch: 1.05,
	},
};

function getVoiceProfile(voiceId) {
	return VOICE_PROFILES[voiceId] || VOICE_PROFILES.default;
}

function resolveSpeechVoice(voices, voiceId, language) {
	if (!Array.isArray(voices) || voices.length === 0) return null;
	const profile = getVoiceProfile(voiceId);
	for (const preferred of profile.preferredVoiceName) {
		const match = voices.find((voice) => voice.name.toLowerCase().includes(preferred.toLowerCase()));
		if (match) return match;
	}

	const exactLanguage = voices.find((voice) => voice.lang.toLowerCase() === String(language || '').toLowerCase());
	if (exactLanguage) return exactLanguage;

	const baseLanguage = String(language || '').trim().split('-')[0]?.toLowerCase();
	if (baseLanguage) {
		const sameLanguageFamily = voices.find((voice) => voice.lang.toLowerCase().startsWith(baseLanguage));
		if (sameLanguageFamily) return sameLanguageFamily;
	}

	return voices[0] || null;
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
	const normalized = String(status ?? '').toLowerCase();
	const healthyStates = new Set(['connected', 'ready', 'online', 'busy', 'running', 'starting']);
	const errorStates = new Set(['error', 'disconnected', 'unavailable']);
	if (healthyStates.has(normalized)) dot.classList.add('connected');
	if (errorStates.has(normalized)) dot.classList.add('error');
}

window.addEventListener('DOMContentLoaded', () => {
	const token = getToken();
	const log = document.getElementById('log');
	const input = document.getElementById('input');
	const send = document.getElementById('send');
	const statusNode = document.getElementById('connection-status');
	const appVersionNode = document.getElementById('app-version');
	const updateStatusNode = document.getElementById('update-status');
	const checkUpdatesButton = document.getElementById('check-updates');
	const installUpdateButton = document.getElementById('install-update');
	const quickActionButtons = document.querySelectorAll('[data-command]');
	const openBrowserTabButton = document.getElementById('open-browser-tab');
	const commandTabButton = document.getElementById('command-tab-button');
	const settingsTabButton = document.getElementById('settings-tab-button');
	const commandTabPanel = document.getElementById('command-tab-panel');
	const settingsTabPanel = document.getElementById('settings-tab-panel');
	const accountStatusNode = document.getElementById('account-status');
	const accountBadge = document.getElementById('account-badge');
	const accountLoginButton = document.getElementById('account-login');
	const accountSyncButton = document.getElementById('account-sync');
	const openLinkedAccountsButton = document.getElementById('open-linked-accounts');
	const linkedAccountsList = document.getElementById('linked-accounts-list');
	const schedulesList = document.getElementById('schedules-list');
	const scheduleLabel = document.getElementById('schedule-label');
	const scheduleCommand = document.getElementById('schedule-command');
	const scheduleCron = document.getElementById('schedule-cron');
	const scheduleAddButton = document.getElementById('schedule-add');
	const chatModelSelect = document.getElementById('chat-model');
	const sttModelSelect = document.getElementById('stt-model');
	const ttsModelSelect = document.getElementById('tts-model');
	const ttsVoiceProfileSelect = document.getElementById('tts-voice-profile');
	const voiceLanguageSelect = document.getElementById('voice-language');
	const sttEnabledToggle = document.getElementById('stt-enabled');
	const autoTtsToggle = document.getElementById('auto-tts');
	const voiceVisualizer = document.getElementById('voice-visualizer');
	const voiceInputButton = document.getElementById('voice-input');
	const wakeWordEnabledToggle = document.getElementById('wake-word-enabled');
	const wakeWordPhraseInput = document.getElementById('wake-word-phrase');
	const allowBackgroundWakeToggle = document.getElementById('allow-background-wake');
	const saveVoiceSettingsButton = document.getElementById('save-voice-settings');
	const serverUrlInput = document.getElementById('jarvis-server-url');
	const saveServerUrlButton = document.getElementById('save-server-url');
	let apiBaseUrl = getJarvisApiUrl();
	let cachedSpeechVoices = [];
	let speechVoicePromise = null;

	const JARVIS_SETTINGS_KEY = 'jarvis-desktop-voice-settings-v1';

	function setMainPanelTab(tab) {
		const settingsActive = tab === 'settings';
		commandTabButton?.classList.toggle('active', !settingsActive);
		settingsTabButton?.classList.toggle('active', settingsActive);
		commandTabButton?.setAttribute('aria-selected', settingsActive ? 'false' : 'true');
		settingsTabButton?.setAttribute('aria-selected', settingsActive ? 'true' : 'false');
		commandTabPanel?.classList.toggle('active', !settingsActive);
		settingsTabPanel?.classList.toggle('active', settingsActive);
	}

	commandTabButton?.addEventListener('click', () => setMainPanelTab('command'));
	settingsTabButton?.addEventListener('click', () => setMainPanelTab('settings'));
	setMainPanelTab('command');

	const defaultVoiceSettings = {
		chatModel: chatModelSelect?.value || 'auto-smart',
		sttEnabled: true,
		sttModel: sttModelSelect?.value || 'whisper-large-v3-turbo',
		ttsEnabled: true,
		ttsModel: ttsModelSelect?.value || 'orpheus-english',
		ttsVoiceId: ttsVoiceProfileSelect?.value || 'jarvis',
		wakeWordEnabled: true,
		wakeWordPhrase: DEFAULT_JARVIS_WAKE_PHRASE,
		allowBackgroundWake: true,
		voiceLanguage: voiceLanguageSelect?.value || 'en-US',
		autoTts: true,
	};

	function readVoiceSettings() {
		try {
			const raw = localStorage.getItem(JARVIS_SETTINGS_KEY);
			if (!raw) return { ...defaultVoiceSettings };
			return { ...defaultVoiceSettings, ...JSON.parse(raw) };
		} catch {
			return { ...defaultVoiceSettings };
		}
	}

	function writeVoiceSettings(settings) {
		try {
			localStorage.setItem(JARVIS_SETTINGS_KEY, JSON.stringify(settings));
		} catch {
			// ignore storage failures
		}
	}

	let speechToTextActive = false;
	let voiceSettings = readVoiceSettings();

	function applyVoiceSettings(nextSettings, { persist = true } = {}) {
		voiceSettings = { ...defaultVoiceSettings, ...nextSettings };
		if (chatModelSelect && voiceSettings.chatModel) chatModelSelect.value = voiceSettings.chatModel;
		if (sttModelSelect && voiceSettings.sttModel) sttModelSelect.value = voiceSettings.sttModel;
		if (ttsModelSelect && voiceSettings.ttsModel) ttsModelSelect.value = voiceSettings.ttsModel;
		if (ttsVoiceProfileSelect && voiceSettings.ttsVoiceId) ttsVoiceProfileSelect.value = voiceSettings.ttsVoiceId;
		if (sttEnabledToggle) sttEnabledToggle.checked = Boolean(voiceSettings.sttEnabled);
		if (wakeWordEnabledToggle) wakeWordEnabledToggle.checked = !!voiceSettings.wakeWordEnabled;
		if (wakeWordPhraseInput) wakeWordPhraseInput.value = voiceSettings.wakeWordPhrase || DEFAULT_JARVIS_WAKE_PHRASE;
		if (allowBackgroundWakeToggle) allowBackgroundWakeToggle.checked = !!voiceSettings.allowBackgroundWake;
		if (voiceLanguageSelect && voiceSettings.voiceLanguage) voiceLanguageSelect.value = voiceSettings.voiceLanguage;
		if (autoTtsToggle) autoTtsToggle.checked = Boolean(voiceSettings.autoTts);
		if (voiceInputButton) {
			voiceInputButton.disabled = !voiceSettings.sttEnabled;
			if (!speechToTextActive) {
				voiceInputButton.textContent = voiceSettings.sttEnabled ? '🎙 Talk' : '🎙 STT off';
			}
		}
		if (persist) writeVoiceSettings(voiceSettings);
	}

	applyVoiceSettings(voiceSettings, { persist: false });

	function setVoiceVisualizer(state) {
		if (!voiceVisualizer) return;
		voiceVisualizer.classList.remove('listening', 'speaking');
		if (state === 'listening') voiceVisualizer.classList.add('listening');
		if (state === 'speaking') voiceVisualizer.classList.add('speaking');
	}

	function readSpeechVoices() {
		if (typeof window === 'undefined' || !window.speechSynthesis || typeof window.speechSynthesis.getVoices !== 'function') {
			return [];
		}
		const voices = window.speechSynthesis.getVoices();
		if (Array.isArray(voices) && voices.length > 0) {
			cachedSpeechVoices = voices;
			return voices;
		}
		return cachedSpeechVoices;
	}

	function waitForSpeechVoices(timeoutMs = 1500) {
		const voices = readSpeechVoices();
		if (voices.length > 0 || typeof window === 'undefined' || !window.speechSynthesis) {
			return Promise.resolve(voices);
		}
		if (speechVoicePromise) return speechVoicePromise;

		speechVoicePromise = new Promise((resolve) => {
			let timeoutId = null;
			const handleVoicesChanged = () => finish();
			const finish = () => {
				if (timeoutId) clearTimeout(timeoutId);
				if (typeof window.speechSynthesis?.removeEventListener === 'function') {
					window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
				}
				speechVoicePromise = null;
				resolve(readSpeechVoices());
			};

			if (typeof window.speechSynthesis.addEventListener === 'function') {
				window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged, { once: true });
			}
			timeoutId = setTimeout(finish, timeoutMs);
		});

		return speechVoicePromise;
	}

	function isBenignSpeechError(errorEvent) {
		const code = String(errorEvent?.error || '').toLowerCase();
		return code === 'interrupted' || code === 'canceled' || code === 'cancelled';
	}

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
	let sidecarManualListening = false;
	let pendingVoiceIntentRequestId = null;
	let pendingVoiceIntentFallbackTimer = null;
	readSpeechVoices();
	if (typeof window !== 'undefined' && window.speechSynthesis && typeof window.speechSynthesis.addEventListener === 'function') {
		window.speechSynthesis.addEventListener('voiceschanged', () => {
			readSpeechVoices();
		});
	}

	function setSpeechToTextActive(active) {
		speechToTextActive = active;
		if (voiceInputButton) {
			voiceInputButton.textContent = active ? '⏹ Stop' : (voiceSettings.sttEnabled ? '🎙 Talk' : '🎙 STT off');
		}
	}

	async function speakResponse(text) {
		if (!voiceSettings.ttsEnabled || !autoTtsToggle?.checked) return;
		if (voiceSettings.ttsVoiceId === 'silent') return;
		if (typeof window === 'undefined' || !window.speechSynthesis) return;
		const spokenText = String(text || '').trim();
		if (!spokenText) return;
		try {
			window.speechSynthesis.cancel();
			const utterance = new SpeechSynthesisUtterance(spokenText);
			utterance.lang = getVoiceLanguage();
			const profile = getVoiceProfile(voiceSettings.ttsVoiceId);
			utterance.rate = profile.rate;
			utterance.pitch = profile.pitch;
			const availableVoices = await waitForSpeechVoices();
			const matchedVoice = resolveSpeechVoice(availableVoices, voiceSettings.ttsVoiceId, utterance.lang);
			if (matchedVoice) utterance.voice = matchedVoice;
			setVoiceVisualizer('speaking');
			utterance.onend = () => setVoiceVisualizer('idle');
			utterance.onerror = (errorEvent) => {
				setVoiceVisualizer('idle');
				if (isBenignSpeechError(errorEvent)) return;
				appendMessage(log, 'Text-to-speech', 'Speech playback failed.', 'error');
			};
			window.speechSynthesis.speak(utterance);
		} catch {
			setVoiceVisualizer('idle');
			appendMessage(log, 'Text-to-speech', 'Speech playback failed.', 'error');
		}
	}

	function getComfortableSpokenText(parsed, fallbackText) {
		const command = String(parsed?.command || '');

		if (command === 'listProcesses') {
			return 'I listed the top processes. Check the panel for full details.';
		}

		// For URL commands, say the hostname instead of the raw URL.
		if (command === 'openUrl' || command === 'openChromeTab') {
			const rawUrl = String(parsed?.url || '');
			try {
				const hostname = new URL(rawUrl).hostname.replace(/^www\./, '');
				return `Opened ${hostname}`;
			} catch {
				return 'Opened the page.';
			}
		}

		// For web/YouTube searches, keep the query but drop the URL.
		if (command === 'searchWeb') {
			const query = String(fallbackText || '').replace(/^Searching the web for:\s*/i, '').trim();
			return query ? `Searching for ${query}` : 'Searching the web.';
		}
		if (command === 'searchYouTube') {
			const query = String(fallbackText || '').replace(/^Searching YouTube for:\s*/i, '').trim();
			return query ? `Searching YouTube for ${query}` : 'Searching YouTube.';
		}

		const normalized = String(fallbackText || '').replace(/\s+/g, ' ').trim();
		if (normalized.length > MAX_SPOKEN_TEXT_LENGTH) {
			return `${normalized.slice(0, MAX_SPOKEN_TEXT_LENGTH - 3)}...`;
		}
		return normalized;
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

		// Show "Download update" button if update is available but not yet
		// downloaded (user chose "Later" in the native dialog).
		const downloadUpdateButton = document.getElementById('download-update');
		if (downloadUpdateButton) {
			const showDownload = (
				payload?.status === 'update-available' ||
				payload?.status === 'update-skipped'
			);
			downloadUpdateButton.hidden = !showDownload;
		}

		if (checkUpdatesButton) {
			checkUpdatesButton.disabled = payload?.status === 'checking' || payload?.status === 'downloading';
		}
	}

	// ── Prompt submission ────────────────────────────────────────────────────
	function submitPrompt() {
		const text = input.value.trim();
		if (!text) return;
		queuePromptExecution(text, { source: 'local', origin: 'desktop' });
		appendMessage(log, 'Prompt queued', text, 'system');
		input.value = '';
	}

	function fallbackVoicePrompt(text) {
		if (!text) return;
		input.value = text;
		submitPrompt();
	}

	send.addEventListener('click', submitPrompt);
	input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitPrompt(); });

	function startSpeechToText({ autoSubmit = false } = {}) {
		if (sidecarConnected && sidecar) {
			setVoiceToTextUiActive(true);
			sidecar.setListeningForCommand(true);
			sidecar.startAudioCapture()
				.then(() => {
					sidecarManualListening = true;
				})
				.catch((error) => {
					appendMessage(
						log,
						'Speech-to-text',
						formatVoiceCaptureError(error),
						'error',
					);
					sidecar.setListeningForCommand(false);
					setVoiceToTextUiActive(false);
				});
			return;
		}
		const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
		if (!SpeechRecognitionCtor) {
			appendMessage(log, 'Speech-to-text', 'Speech recognition is not available in this Jarvis build.', 'error');
			return;
		}
		if (speechToTextActive) return;
		if (!voiceSettings.sttEnabled) {
			appendMessage(log, 'Speech-to-text', 'Speech-to-text is turned off in Jarvis app settings.', 'error');
			return;
		}
		recognition = new SpeechRecognitionCtor();
		recognition.lang = getVoiceLanguage();
		recognition.continuous = true;
		recognition.interimResults = true;
		recognition.onstart = () => {
			setSpeechToTextActive(true);
			setVoiceVisualizer('listening');
		};
		recognition.onend = () => {
			setSpeechToTextActive(false);
			setVoiceVisualizer('idle');
		};
		recognition.onerror = () => {
			setSpeechToTextActive(false);
			setVoiceVisualizer('idle');
			appendMessage(log, 'Speech-to-text', 'Speech capture failed. Try again.', 'error');
		};
		recognition.onresult = (event) => {
			const transcriptParts = [];
			let hasFinal = false;
			for (let i = event.resultIndex; i < event.results.length; i += 1) {
				transcriptParts.push(event.results[i][0].transcript);
				if (event.results[i].isFinal) hasFinal = true;
			}
			const transcript = transcriptParts.join(' ').replace(/\s+/g, ' ').trim();
			input.value = transcript;
			if (autoSubmit && hasFinal && transcript) {
				submitPrompt();
				recognition?.stop();
			}
		};
		recognition.start();
	}

	function stopSpeechToText() {
		if (sidecarConnected && sidecar) {
			sidecarManualListening = false;
			sidecar.setListeningForCommand(false);
			setVoiceToTextUiActive(false);
			return;
		}
		if (!recognition) return;
		try {
			recognition.stop();
		} catch {
			setSpeechToTextActive(false);
			setVoiceVisualizer('idle');
		}
	}

	voiceInputButton?.addEventListener('click', () => {
		if (speechToTextActive) {
			stopSpeechToText();
			return;
		}
		startSpeechToText();
	});

	if (saveVoiceSettingsButton) {
		saveVoiceSettingsButton.addEventListener('click', () => {
			applyVoiceSettings({
				...voiceSettings,
				chatModel: chatModelSelect?.value || 'auto-smart',
				sttEnabled: Boolean(sttEnabledToggle?.checked),
				sttModel: sttModelSelect?.value || 'whisper-large-v3-turbo',
				ttsEnabled: Boolean(autoTtsToggle?.checked),
				ttsModel: ttsModelSelect?.value || 'orpheus-english',
				ttsVoiceId: ttsVoiceProfileSelect?.value || 'jarvis',
				wakeWordEnabled: Boolean(wakeWordEnabledToggle?.checked),
				wakeWordPhrase: wakeWordPhraseInput?.value?.trim() || DEFAULT_JARVIS_WAKE_PHRASE,
				allowBackgroundWake: Boolean(allowBackgroundWakeToggle?.checked),
				voiceLanguage: voiceLanguageSelect?.value || 'en-US',
				autoTts: Boolean(autoTtsToggle?.checked),
			});
			appendMessage(log, 'Settings', 'Voice settings saved.');
		});
	}

	if (chatModelSelect) {
		chatModelSelect.addEventListener('change', () => {
			applyVoiceSettings({ ...voiceSettings, chatModel: chatModelSelect.value });
		});
	}

	if (sttModelSelect) {
		sttModelSelect.addEventListener('change', () => {
			applyVoiceSettings({ ...voiceSettings, sttModel: sttModelSelect.value });
		});
	}

	if (ttsModelSelect) {
		ttsModelSelect.addEventListener('change', () => {
			applyVoiceSettings({ ...voiceSettings, ttsModel: ttsModelSelect.value });
		});
	}

	if (ttsVoiceProfileSelect) {
		ttsVoiceProfileSelect.addEventListener('change', () => {
			applyVoiceSettings({ ...voiceSettings, ttsVoiceId: ttsVoiceProfileSelect.value });
		});
	}

	if (sttEnabledToggle) {
		sttEnabledToggle.addEventListener('change', () => {
			const nextEnabled = Boolean(sttEnabledToggle.checked);
			if (!nextEnabled && speechToTextActive) stopSpeechToText();
			applyVoiceSettings({ ...voiceSettings, sttEnabled: nextEnabled });
		});
	}

	if (voiceLanguageSelect) {
		voiceLanguageSelect.addEventListener('change', () => {
			applyVoiceSettings({ ...voiceSettings, voiceLanguage: voiceLanguageSelect.value });
		});
	}

	if (autoTtsToggle) {
		autoTtsToggle.addEventListener('change', () => {
			applyVoiceSettings({
				...voiceSettings,
				autoTts: Boolean(autoTtsToggle.checked),
				ttsEnabled: Boolean(autoTtsToggle.checked),
			});
			syncSidecarVoiceSettings();
		});
	}

	let wakeRecognition = null;
	function setupWakeWordListener() {
		if (!supportsSpeechRecognition()) return;
		const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
		if (!SpeechRecognitionCtor) return;
		wakeRecognition = new SpeechRecognitionCtor();
		wakeRecognition.lang = getVoiceLanguage();
		wakeRecognition.continuous = true;
		wakeRecognition.interimResults = true;
		wakeRecognition.onresult = (event) => {
			if (!voiceSettings.wakeWordEnabled) return;
			if (!voiceSettings.allowBackgroundWake && !document.hasFocus()) return;
			const phrase = String(voiceSettings.wakeWordPhrase || DEFAULT_JARVIS_WAKE_PHRASE).toLowerCase();
			let transcript = '';
			for (let i = event.resultIndex; i < event.results.length; i += 1) {
				transcript += event.results[i][0].transcript;
			}
			if (transcript.toLowerCase().includes(phrase)) {
				appendMessage(log, 'Wake word', `Detected "${voiceSettings.wakeWordPhrase}"`);
				startSpeechToText({ autoSubmit: true });
			}
		};
		wakeRecognition.onend = () => {
			try {
				wakeRecognition.start();
			} catch {
				// no-op
			}
		};
		try {
			wakeRecognition.start();
		} catch (error) {
			appendMessage(log, 'Wake word', `Wake listener failed to start: ${error?.message || 'unknown error'}`, 'error');
		}
	}
	setupWakeWordListener();

	// ── Python sidecar voice pipeline ─────────────────────────────────────────
	// Connects to the local AI-Agent WebSocket sidecar (ws://127.0.0.1:8765).
	// When connected, the sidecar handles wake word, STT, TTS, and NLP.
	// The browser Speech APIs above remain as automatic fallback.
	function setupSidecar() {
		if (!sidecar) return;

		sidecar.on('connected', () => {
			sidecarConnected = true;
			appendMessage(log, 'AI Sidecar', '🤖 Python voice sidecar connected (offline mode active).', 'system');
			sidecar.configure({
				wakeWordPhrase: voiceSettings.wakeWordPhrase || DEFAULT_JARVIS_WAKE_PHRASE,
				language: (voiceSettings.voiceLanguage || 'en-US').split('-')[0],
				wakeWordEnabled: Boolean(voiceSettings.wakeWordEnabled),
				sttEnabled: Boolean(voiceSettings.sttEnabled),
				ttsEnabled: Boolean(voiceSettings.ttsEnabled && voiceSettings.autoTts),
				sampleRate: 16000,
			});
			// Start microphone capture immediately if wake word is enabled
			if (voiceSettings.wakeWordEnabled) {
				sidecar.startAudioCapture().catch(() => null);
			}
		});

		sidecar.on('disconnected', () => {
			sidecarConnected = false;
			sidecarManualListening = false;
			setVoiceToTextUiActive(false);
			appendMessage(log, 'AI Sidecar', 'Python voice sidecar disconnected — using browser fallback.', 'system');
		});

		sidecar.on('unavailable', () => {
			// Emitted once after all reconnect attempts are exhausted without ever
			// connecting — sidecar is not installed or Python is not available.
			sidecarConnected = false;
			appendMessage(log, 'AI Sidecar', 'Python voice sidecar is not available — voice will use browser speech APIs, and text AI chat will still work.', 'system');
		});

		sidecar.on('error', (error) => {
			appendMessage(log, 'AI Sidecar', formatVoiceCaptureError(error), 'error');
			if (sidecarManualListening) {
				sidecarManualListening = false;
				setVoiceToTextUiActive(false);
			}
		});

		sidecar.on('status', (payload) => {
			if (payload?.phase && payload.phase !== 'connected' && payload.phase !== 'configured') {
				appendMessage(log, 'AI Sidecar', payload.message || payload.phase, 'system');
			}
		});

		sidecar.on('wake_word', () => {
			if (!voiceSettings.allowBackgroundWake && !document.hasFocus()) return;
			appendMessage(log, 'AI Sidecar', `Wake word detected — listening…`);
			setVoiceVisualizer('listening');
			sidecar.setListeningForCommand(true);
		});

		sidecar.on('stt_result', ({ text, isFinal }) => {
			if (!text) return;
			input.value = text;
			if (isFinal) {
				setVoiceVisualizer('idle');
				sidecar.setListeningForCommand(false);
				if (sidecarManualListening) {
					sidecarManualListening = false;
					setVoiceToTextUiActive(false);
				}
				const requestId = `voice-intent-${Date.now()}`;
				pendingVoiceIntentRequestId = requestId;
				clearTimeout(pendingVoiceIntentFallbackTimer);
				pendingVoiceIntentFallbackTimer = setTimeout(() => {
					if (pendingVoiceIntentRequestId === requestId) {
						pendingVoiceIntentRequestId = null;
						fallbackVoicePrompt(text);
					}
				}, 900);
				sidecar.requestIntentParse(text, requestId);
			} else {
				setVoiceVisualizer('listening');
			}
		});

		sidecar.on('tts_audio', ({ data, format }) => {
			if (!data || !voiceSettings.autoTts) return;
			try {
				const AudioContext = window.AudioContext || window.webkitAudioContext;
				if (!AudioContext) return;
				const actx = new AudioContext();
				const mimeMap = { wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg' };
				const mimeType = mimeMap[format] || 'audio/wav';
				void mimeType; // referenced for future AudioContext decoding type hint
				const binary = atob(data);
				const bytes = new Uint8Array(binary.length);
				for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
				actx.decodeAudioData(bytes.buffer, (decoded) => {
					const source = actx.createBufferSource();
					source.buffer = decoded;
					source.connect(actx.destination);
					setVoiceVisualizer('speaking');
					source.onended = () => {
						setVoiceVisualizer('idle');
						actx.close().catch(() => null);
					};
					source.start(0);
				}, () => {
					actx.close().catch(() => null);
				});
			} catch {
				// fall through to browser TTS
			}
		});

		sidecar.on('intent_parsed', ({ requestId, intent, entities, confidence }) => {
			if (requestId && pendingVoiceIntentRequestId === requestId) {
				pendingVoiceIntentRequestId = null;
				clearTimeout(pendingVoiceIntentFallbackTimer);
				pendingVoiceIntentFallbackTimer = null;
			}
			// Route structured intents from NLP back through the desktop executor
			if (confidence < 0.6 || !intent || intent === 'unknown') {
				if (entities?.transcript) fallbackVoicePrompt(entities.transcript);
				return;
			}
			const INTENT_TO_COMMAND = {
				open_app: 'openApp',
				close_app: 'closeApp',
				search_web: 'searchWeb',
				search_youtube: 'searchYouTube',
				volume_up: 'volumeUp',
				volume_down: 'volumeDown',
				mute: 'mute',
				screenshot: 'screenshot',
				shutdown: 'shutdown',
				restart: 'restart',
				sleep: 'sleep',
				lock_screen: 'lockScreen',
				start_mode: 'startMode',
			};
			const command = INTENT_TO_COMMAND[intent];
			if (!command) {
				if (entities?.transcript) fallbackVoicePrompt(entities.transcript);
				return;
			}
			input.value = '';
			void executeStructuredCommand(
				{ command, ...entities, admin: Boolean(entities?.admin || entities?.qualifiers?.admin) },
				{ source: 'local', origin: 'sidecar' },
			);
		});

		sidecar.connect();
	}
	setupSidecar();

	// Sync sidecar settings when voice settings change.
	// Called by event listeners when voice settings are updated.
	function syncSidecarVoiceSettings() {
		if (!sidecarConnected || !sidecar) return;
		sidecar.configure({
			wakeWordPhrase: voiceSettings.wakeWordPhrase || DEFAULT_JARVIS_WAKE_PHRASE,
			language: (voiceSettings.voiceLanguage || 'en-US').split('-')[0],
			wakeWordEnabled: Boolean(voiceSettings.wakeWordEnabled),
			sttEnabled: Boolean(voiceSettings.sttEnabled),
			ttsEnabled: Boolean(voiceSettings.ttsEnabled && voiceSettings.autoTts),
		});
		if (voiceSettings.wakeWordEnabled && !sidecar._capturing) {
			sidecar.startAudioCapture().catch(() => null);
		} else if (!voiceSettings.wakeWordEnabled && sidecar._capturing) {
			sidecar.stopAudioCapture();
		}
	}

	function setVoiceToTextUiActive(active) {
		setSpeechToTextActive(active);
		if (!active) {
			setVoiceVisualizer('idle');
		} else {
			setVoiceVisualizer('listening');
		}
	}

	function formatVoiceCaptureError(error) {
		const message = String(error?.message || '').toLowerCase();
		if (message.includes('notallowed') || message.includes('permission') || message.includes('denied')) {
			return 'Microphone permission is blocked. Enable microphone access for Jarvis Desktop in system privacy settings.';
		}
		if (message.includes('notfound') || message.includes('device')) {
			return 'No microphone device was found. Connect a microphone and try again.';
		}
		if (message.includes('secure context')) {
			return 'Microphone capture requires a secure context. Use the packaged EXE and allow microphone access.';
		}
		return error?.message
			? `Voice capture failed: ${error.message}`
			: 'Voice capture failed. Check microphone permissions and sidecar status.';
	}

	// Speak via Piper TTS when sidecar is connected, or via browser otherwise.
	// Used by onMessage command_result handler below.
	function speakWithSidecar(text) {
		if (sidecarConnected && sidecar && voiceSettings.autoTts) {
			const requestId = `tts-${Date.now()}`;
			sidecar.requestTts(text, requestId);
			return;
		}
		void speakResponse(text);
	}

	// Expose IPC sidecar-status listener for the main process
	if (ipcRenderer) {
		ipcRenderer.on('sidecar-status', (_event, payload) => {
			appendMessage(log, 'AI Sidecar', `Sidecar status: ${payload?.status || 'unknown'}`, 'system');
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

			if (['checking', 'up-to-date', 'ready-to-install', 'error', 'unavailable'].includes(payload?.status)) {
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

	const downloadUpdateButton = document.getElementById('download-update');
	if (downloadUpdateButton && ipcRenderer) {
		downloadUpdateButton.addEventListener('click', async () => {
			appendMessage(log, 'Updater', 'Starting download…', 'system');
			downloadUpdateButton.disabled = true;
			const result = await ipcRenderer.invoke('download-update');
			if (!result?.ok) {
				appendMessage(log, 'Updater', `Download failed: ${result?.reason || 'unknown error'}`, 'error');
				downloadUpdateButton.disabled = false;
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
				void executeStructuredCommand({ command: 'openApp', app: payload }, { source: 'local', origin: 'desktop' });
				appendMessage(log, 'Quick action', `Launch: ${payload}`);
				return;
			}

			if (kind === 'command') {
				void executeStructuredCommand({ command: payload }, { source: 'local', origin: 'desktop' });
				appendMessage(log, 'Quick action', payload);
				return;
			}
		});
	});

	if (openBrowserTabButton) {
		openBrowserTabButton.addEventListener('click', () => {
			void executeStructuredCommand({ command: 'openChromeTab', url: 'https://www.google.com' }, { source: 'local', origin: 'desktop' });
			appendMessage(log, 'Quick action', 'Open browser tab');
		});
	}

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
			if (parsed.type === 'presence_snapshot') {
				appendMessage(log, 'Presence', `Connected clients: ${parsed?.active_connections ?? 0}`, 'system');
				return;
			}
			if (parsed.type === 'peer_registered') {
				appendMessage(log, 'Presence', `${parsed.role || 'Device'} connected`, 'system');
				return;
			}
			if (parsed.type === 'peer_disconnected') {
				appendMessage(log, 'Presence', `${parsed.role || 'Device'} disconnected`, 'system');
				return;
			}
			if (parsed.type === 'task_update') {
				const body = parsed.currentStep
					? `${parsed.status}: ${parsed.currentStep} (${parsed.progress ?? 0}%)`
					: `${parsed.status}: ${parsed.summary || parsed.prompt || 'Task update'}`;
				appendMessage(log, `Task ${parsed.taskId || ''}`.trim(), body, 'system');
				return;
			}
			const body = typeof parsed.summary === 'string'
				? parsed.summary
				: typeof parsed.text === 'string'
					? parsed.text
					: JSON.stringify(parsed);
			const title = parsed.type === 'command_result' ? (parsed.title || '✅ Jarvis') : `Backend (${parsed.type || '?'})`;
			appendMessage(log, title, body, parsed.level === 'error' ? 'error' : 'system');
			if (parsed.type === 'command_result' && parsed.level !== 'error') {
				speakWithSidecar(getComfortableSpokenText(parsed, body));
			}
		} catch {
			// rawMessage is not JSON — display as plain text
			appendMessage(log, 'Backend event', rawMessage, 'system');
		}
	});

	const stateSnapshot = getLocalStateSnapshot();
	(stateSnapshot.history || []).slice(0, 6).reverse().forEach((entry) => {
		appendMessage(log, entry.title || 'Recent activity', entry.summary || entry.text || 'Completed', entry.level === 'error' ? 'error' : 'system');
	});

	// ── Account / Cloud sync ─────────────────────────────────────────────────
	function refreshAccountUI() {
		const session = getAccountSession();
		if (session?.email) {
			if (accountStatusNode) accountStatusNode.textContent = `Signed in as ${session.email}`;
			if (accountBadge) accountBadge.textContent = `AssistantX · ${session.email}`;
			if (accountLoginButton) accountLoginButton.textContent = '🔓 Sign out';
			if (accountSyncButton) accountSyncButton.disabled = false;
		} else {
			if (accountStatusNode) accountStatusNode.textContent = 'Not signed in';
			if (accountBadge) accountBadge.textContent = 'AssistantX AI Agent';
			if (accountLoginButton) accountLoginButton.textContent = '🔑 Sign in';
			if (accountSyncButton) accountSyncButton.disabled = true;
		}
	}

	function refreshLinkedAccounts() {
		if (!linkedAccountsList) return;
		const accounts = getLinkedAccounts();
		if (!accounts.length) {
			linkedAccountsList.textContent = 'None linked';
			return;
		}
		linkedAccountsList.innerHTML = accounts.map((a) =>
			`<span>✅ ${a.provider}</span>`,
		).join('<br>');
	}

	refreshAccountUI();
	refreshLinkedAccounts();

	// ── Server URL configuration ─────────────────────────────────────────────
	// Populate the Server URL input with the current value and wire up the save
	// button so users can point Jarvis at their own AssistantX deployment.
	if (serverUrlInput) {
		const currentUrl = getJarvisWebUrl();
		// Only pre-fill when it's not the built-in default (so users see a blank
		// field until they actually configure something).
		const builtInDefaults = new Set(['https://assistantx.pl', 'https://www.assistantx.pl', 'http://localhost:3000']);
		if (!builtInDefaults.has(currentUrl)) {
			serverUrlInput.value = currentUrl;
		}
	}

	if (saveServerUrlButton && serverUrlInput) {
		saveServerUrlButton.addEventListener('click', async () => {
			const rawUrl = serverUrlInput.value.trim();
			if (rawUrl && !/^https?:\/\//i.test(rawUrl)) {
				appendMessage(log, 'Server URL', 'URL must start with http:// or https://', 'error');
				return;
			}
			// Update in-process module so backend.js picks up the new URL immediately.
			setJarvisWebUrl(rawUrl || null);
			apiBaseUrl = getJarvisApiUrl();
			// Also notify the main process so the login window and update checks use the new URL.
			if (ipcRenderer) {
				try {
					await ipcRenderer.invoke('set-jarvis-web-url', rawUrl || null);
				} catch {
					// Non-fatal — in-renderer update already applied above.
				}
			}
			appendMessage(
				log,
				'Server URL',
				rawUrl
					? `Server URL saved: ${rawUrl}`
					: 'Server URL cleared — using built-in default.',
			);
		});
	}

	// Cloud sync on startup if signed in
	const initialSession = getAccountSession();
	if (initialSession?.accessToken && apiBaseUrl) {
		void loadFromCloud(apiBaseUrl, initialSession.accessToken).then((res) => {
			if (res.ok) {
				if (res.voiceSettings) applyVoiceSettings({ ...voiceSettings, ...res.voiceSettings });
				appendMessage(log, 'Cloud sync', 'Memory and Jarvis voice settings loaded from your account.', 'system');
			}
		});
	}

	if (accountLoginButton) {
		accountLoginButton.addEventListener('click', async () => {
			const session = getAccountSession();
			if (session?.email) {
				clearAccountSession();
				refreshAccountUI();
				refreshLinkedAccounts();
				appendMessage(log, 'Account', 'Signed out of AssistantX account.');
				return;
			}
			if (ipcRenderer) {
				try {
					const result = await ipcRenderer.invoke('open-account-login');
					if (result?.accessToken) {
						setAccountSession(result);
						refreshAccountUI();
						refreshLinkedAccounts();
						appendMessage(log, 'Account', `Signed in as ${result.email}. Syncing memory…`);
						if (apiBaseUrl) {
							const syncResult = await loadFromCloud(apiBaseUrl, result.accessToken);
							if (syncResult?.voiceSettings) applyVoiceSettings({ ...voiceSettings, ...syncResult.voiceSettings });
						}
					} else {
						appendMessage(
							log,
							'Account',
							[
								'Sign-in was not completed. If you saw an error in the login window, check:',
								'(1) Supabase Auth providers (Email/Google/GitHub) are enabled in your Supabase dashboard.',
								`(2) Supabase → Auth → URL Configuration → Redirect URLs includes ${getJarvisWebUrl()}/auth/callback.`,
								'(3) Your OAuth app allows https://<project>.supabase.co/auth/v1/callback as the callback URL.',
							].join(' '),
							'error',
						);
					}
				} catch (err) {
					appendMessage(log, 'Account', `Sign-in failed: ${err.message}`, 'error');
				}
			} else {
				appendMessage(log, 'Account', 'Account login requires Electron runtime.', 'error');
			}
		});
	}

	if (accountSyncButton) {
		accountSyncButton.addEventListener('click', async () => {
			const session = getAccountSession();
			if (!session?.accessToken || !apiBaseUrl) {
				appendMessage(log, 'Cloud sync', 'Sign in first to sync.', 'error');
				return;
			}
			accountSyncButton.disabled = true;
			const res = await syncToCloud(apiBaseUrl, session.accessToken, { voiceSettings });
			accountSyncButton.disabled = false;
			appendMessage(log, 'Cloud sync', res.ok ? '✅ Memory and Jarvis voice settings synced to cloud.' : `Sync failed: ${res.reason || res.status}`, res.ok ? 'system' : 'error');
		});
	}

	if (openLinkedAccountsButton && ipcRenderer) {
		openLinkedAccountsButton.addEventListener('click', () => {
			const session = getAccountSession();
			if (!session?.email) {
				appendMessage(log, 'Linked accounts', 'Sign into your AssistantX account first.', 'error');
				return;
			}
			const webUrl = `${getJarvisWebUrl()}/jarvis/linked-accounts`;
			void ipcRenderer.invoke('open-url', webUrl);
		});
	}

	// ── Scheduler UI ─────────────────────────────────────────────────────────
	function refreshSchedulesUI() {
		if (!schedulesList) return;
		const schedules = getSchedules();
		if (!schedules.length) {
			schedulesList.textContent = 'No schedules yet';
			return;
		}
		schedulesList.innerHTML = schedules.map((s) => {
			const next = s.nextRunAt ? new Date(s.nextRunAt).toLocaleString() : 'n/a';
			return `<span>${s.enabled ? '🟢' : '⏸'} <strong>${s.label || s.command}</strong> · ${s.cronExpr} · next: ${next}</span>`;
		}).join('<br>');
	}
	refreshSchedulesUI();

	if (scheduleAddButton) {
		scheduleAddButton.addEventListener('click', () => {
			const label = scheduleLabel?.value.trim();
			const command = scheduleCommand?.value.trim();
			const cronExpr = scheduleCron?.value.trim();
			if (!command || !cronExpr) {
				appendMessage(log, 'Scheduler', 'Fill in command and schedule expression.', 'error');
				return;
			}
			addSchedule({ label: label || command, command, cronExpr });
			refreshSchedulesUI();
			appendMessage(log, 'Scheduler', `Added schedule: "${label || command}" — ${cronExpr}`);
			if (scheduleLabel) scheduleLabel.value = '';
			if (scheduleCommand) scheduleCommand.value = '';
			if (scheduleCron) scheduleCron.value = '';
		});
	}

	// Start the scheduler — fires executeStructuredCommand for due schedules
	startScheduler((sched) => {
		appendMessage(log, 'Scheduler', `⏰ Running: ${sched.label || sched.command}`);
		void executeStructuredCommand(
			{ command: sched.command, ...sched.args },
			{ source: 'local', origin: 'scheduler' },
		);
	});

	// Periodic cloud sync (every 5 minutes) if signed in
	setInterval(async () => {
		const session = getAccountSession();
		if (session?.accessToken && apiBaseUrl) {
			await syncToCloud(apiBaseUrl, session.accessToken, { voiceSettings }).catch(() => null);
		}
	}, 5 * 60_000);

	connectToBackend({ token });
	updateStatus('ready');
	appendMessage(log, 'Jarvis Desktop', 'Shell initialized. Connecting to backend…');
});
