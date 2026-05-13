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

// ipcRenderer for URL opening via main process
let ipcRenderer;
try {
	ipcRenderer = require('electron').ipcRenderer;
} catch {
	ipcRenderer = null;
}

const DEFAULT_JARVIS_WAKE_PHRASE = 'Hey Jarvis';

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
	const voiceLanguageSelect = document.getElementById('voice-language');
	const autoTtsToggle = document.getElementById('auto-tts');
	const voiceVisualizer = document.getElementById('voice-visualizer');
	const wakeWordEnabledToggle = document.getElementById('wake-word-enabled');
	const wakeWordPhraseInput = document.getElementById('wake-word-phrase');
	const allowBackgroundWakeToggle = document.getElementById('allow-background-wake');
	const saveVoiceSettingsButton = document.getElementById('save-voice-settings');

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

	let voiceSettings = readVoiceSettings();
	if (wakeWordEnabledToggle) wakeWordEnabledToggle.checked = !!voiceSettings.wakeWordEnabled;
	if (wakeWordPhraseInput) wakeWordPhraseInput.value = voiceSettings.wakeWordPhrase || DEFAULT_JARVIS_WAKE_PHRASE;
	if (allowBackgroundWakeToggle) allowBackgroundWakeToggle.checked = !!voiceSettings.allowBackgroundWake;
	if (voiceLanguageSelect && voiceSettings.voiceLanguage) voiceLanguageSelect.value = voiceSettings.voiceLanguage;
	if (autoTtsToggle) autoTtsToggle.checked = Boolean(voiceSettings.autoTts);

	function setVoiceVisualizer(state) {
		if (!voiceVisualizer) return;
		voiceVisualizer.classList.remove('listening', 'speaking');
		if (state === 'listening') voiceVisualizer.classList.add('listening');
		if (state === 'speaking') voiceVisualizer.classList.add('speaking');
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
	let speechToTextActive = false;

	function setSpeechToTextActive(active) {
		speechToTextActive = active;
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
			setVoiceVisualizer('speaking');
			utterance.onend = () => setVoiceVisualizer('idle');
			utterance.onerror = () => {
				setVoiceVisualizer('idle');
				appendMessage(log, 'Text-to-speech', 'Speech playback failed.', 'error');
			};
			window.speechSynthesis.speak(utterance);
		} catch {
			setVoiceVisualizer('idle');
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

	send.addEventListener('click', submitPrompt);
	input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitPrompt(); });

	function startSpeechToText({ autoSubmit = false } = {}) {
		const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
		if (!SpeechRecognitionCtor) return;
		if (speechToTextActive) return;
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

	if (saveVoiceSettingsButton) {
		saveVoiceSettingsButton.addEventListener('click', () => {
			voiceSettings = {
				...voiceSettings,
				wakeWordEnabled: Boolean(wakeWordEnabledToggle?.checked),
				wakeWordPhrase: wakeWordPhraseInput?.value?.trim() || DEFAULT_JARVIS_WAKE_PHRASE,
				allowBackgroundWake: Boolean(allowBackgroundWakeToggle?.checked),
				voiceLanguage: voiceLanguageSelect?.value || 'en-US',
				autoTts: Boolean(autoTtsToggle?.checked),
			};
			writeVoiceSettings(voiceSettings);
			appendMessage(log, 'Settings', 'Voice settings saved.');
		});
	}

	if (voiceLanguageSelect) {
		voiceLanguageSelect.addEventListener('change', () => {
			voiceSettings.voiceLanguage = voiceLanguageSelect.value;
			writeVoiceSettings(voiceSettings);
		});
	}

	if (autoTtsToggle) {
		autoTtsToggle.addEventListener('change', () => {
			voiceSettings.autoTts = Boolean(autoTtsToggle.checked);
			writeVoiceSettings(voiceSettings);
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
				speakResponse(body);
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

	// Cloud sync on startup if signed in
	const initialSession = getAccountSession();
	if (initialSession?.accessToken && process.env.JARVIS_API_URL) {
		void loadFromCloud(process.env.JARVIS_API_URL, initialSession.accessToken).then((res) => {
			if (res.ok) appendMessage(log, 'Cloud sync', 'Memory loaded from account cloud.', 'system');
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
					if (result?.email) {
						setAccountSession(result);
						refreshAccountUI();
						refreshLinkedAccounts();
						appendMessage(log, 'Account', `Signed in as ${result.email}. Syncing memory…`);
						if (process.env.JARVIS_API_URL) {
							await loadFromCloud(process.env.JARVIS_API_URL, result.accessToken);
						}
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
			if (!session?.accessToken || !process.env.JARVIS_API_URL) {
				appendMessage(log, 'Cloud sync', 'Sign in first to sync.', 'error');
				return;
			}
			accountSyncButton.disabled = true;
			const res = await syncToCloud(process.env.JARVIS_API_URL, session.accessToken);
			accountSyncButton.disabled = false;
			appendMessage(log, 'Cloud sync', res.ok ? '✅ Memory synced to cloud.' : `Sync failed: ${res.reason || res.status}`, res.ok ? 'system' : 'error');
		});
	}

	if (openLinkedAccountsButton && ipcRenderer) {
		openLinkedAccountsButton.addEventListener('click', () => {
			const session = getAccountSession();
			if (!session?.email) {
				appendMessage(log, 'Linked accounts', 'Sign into your AssistantX account first.', 'error');
				return;
			}
			const webUrl = `${process.env.JARVIS_WEB_URL || 'http://localhost:3000'}/jarvis/linked-accounts`;
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
		if (session?.accessToken && process.env.JARVIS_API_URL) {
			await syncToCloud(process.env.JARVIS_API_URL, session.accessToken).catch(() => null);
		}
	}, 5 * 60_000);

	connectToBackend({ token });
	updateStatus('ready');
	appendMessage(log, 'Jarvis Desktop', 'Shell initialized. Connecting to backend…');
});
