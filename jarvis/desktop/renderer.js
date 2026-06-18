// All Node-module APIs are provided by preload.js via window.jarvisApi.
// IPC with the main process is via window.jarvisIpc.
// Neither require() nor ipcRenderer are available in this renderer context
// (nodeIntegration: false / contextIsolation: true).
const {
	getToken,
	connectToBackend,
	executeStructuredCommand,
	getLocalStateSnapshot,
	onMessage,
	onStatus,
	queuePromptExecution,
	addSchedule,
	getSchedules,
	saveReminder,
	getReminders,
	markReminderCompleted,
	syncToCloud,
	loadFromCloud,
	startScheduler,
	startReminderScheduler,
	getLinkedAccounts,
	getJarvisApiUrl,
	getJarvisWebUrl,
	setJarvisWebUrl,
} = window.jarvisApi;

const authApi = window.jarvisApi.auth || {};
const githubApi = window.jarvisApi.github || {};
const googleApi = window.jarvisApi.google || {};
const toolsApi = window.jarvisApi.tools || {};
const localServerApi = window.jarvisApi.localServer || window.jarvisApiV2?.localServer || null;
const {
	getSession: getAccountSession,
	refresh: refreshSessionIfNeeded,
	signOut: signOutAccount,
	onSessionChanged,
	onSignedOut,
} = authApi;

const ipcRenderer = window.jarvisIpc || null;
const temporalApi = window.jarvisApi.temporal || null;

// ── Python AI-Agent sidecar bridge ──────────────────────────────────────────
// The SidecarBridge instance is created in preload.js (which runs with Node
// access) and exposed via window.jarvisApi.sidecar.
const sidecar = window.jarvisApi.sidecar || null;
const voiceGateway = window.jarvisApi.voiceGateway || null;
let sidecarConnected = false;

const DEFAULT_JARVIS_WAKE_PHRASE = 'Hey Jarvis';
const STT_MODEL_ALIASES = {
	'whisper-tiny': 'tiny',
	'whisper-base': 'base',
	'whisper-small': 'small',
	'whisper-medium': 'medium',
	'whisper-large-v3': 'large',
	'whisper-large-v3-turbo': 'large',
};

function normalizeEngineMode(value) {
	return String(value || '').trim().toLowerCase() === 'byok-cloud' ? 'cloud' : 'local';
}

function normalizeSttModel(value) {
	const raw = String(value || '').trim().toLowerCase();
	return STT_MODEL_ALIASES[raw] || raw || 'base';
}

function isLocalTtsBackend(backend) {
	const value = String(backend || '').toLowerCase();
	return value === 'kokoro-local' || value === 'piper-local' || value === 'auto-local';
}

function normalizeTtsModel(value, backend = '') {
	const raw = String(value || '').trim().toLowerCase();
	if (raw === 'kokoro-local') return 'kokoro';
	if (raw === 'piper-local') return 'piper';
	if (raw === 'auto-local') return 'auto';
	if (isLocalTtsBackend(backend)) {
		if (raw === 'piper') return 'piper';
		if (raw === 'auto') return 'auto';
		return 'kokoro';
	}
	return raw || DEFAULT_CLOUD_TTS_MODEL;
}

function resolveVoiceLanguage(language) {
	const normalized = String(language || '').trim().toLowerCase();
	if (!normalized) return voiceLanguageSelect?.value || (typeof navigator !== 'undefined' ? navigator.language : 'en-US') || 'en-US';
	const match = Array.from(voiceLanguageSelect?.options || []).find((option) => (
		String(option.value || '').toLowerCase().startsWith(normalized)
	));
	return match?.value || normalized;
}

function ensureSelectOption(select, value, label) {
	if (!select || !value) return;
	const existing = Array.from(select.options).find((option) => option.value === value);
	if (existing) {
		if (label) existing.textContent = label;
		return;
	}
	const option = document.createElement('option');
	option.value = value;
	option.textContent = label || value;
	select.insertBefore(option, select.firstChild || null);
}
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

function escapeHtml(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function toFiniteNumber(value, fallback = 0) {
	const num = Number(value);
	return Number.isFinite(num) ? num : fallback;
}

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

	function appendMessage(log, title, body, tone = 'system', badges = []) {
		const item = document.createElement('div');
		item.className = `message ${tone}`;

	const heading = document.createElement('small');
	heading.textContent = `${new Date().toLocaleTimeString()} — ${title}`;

		const text = document.createElement('div');
		text.textContent = body;

		item.append(heading, text);
		if (Array.isArray(badges) && badges.length > 0) {
			const badgeWrap = document.createElement('div');
			badgeWrap.className = 'context-badges';
			for (const badge of badges.slice(0, 4)) {
				const value = String(badge || '').trim();
				if (!value) continue;
				const el = document.createElement('span');
				el.className = 'context-badge';
				el.textContent = value;
				badgeWrap.appendChild(el);
			}
			if (badgeWrap.childElementCount > 0) item.appendChild(badgeWrap);
		}
		log.prepend(item);
		return item;
	}

	// Devin-style task list — streams the agent's "inner monologue" as discrete
	// steps. Each pushTaskStep() call appends a row; status can be 'active',
	// 'done', or 'error'. The panel collapses via #task-list-toggle (Ctrl+J).
	const MAX_TASK_STEPS = 80;
	function pushTaskStep(category, message, status = 'active') {
		try {
			const body = document.getElementById('task-list-body');
			if (!body) return null;
			const empty = document.getElementById('task-list-empty');
			if (empty) empty.remove();
			const step = document.createElement('div');
			step.className = `task-step ${status}`;
			const meta = document.createElement('div');
			meta.className = 'step-meta';
			const time = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
			meta.textContent = `${time} · ${category}`;
			const bodyText = document.createElement('div');
			bodyText.className = 'step-body';
			bodyText.textContent = String(message ?? '');
			step.append(meta, bodyText);
			body.appendChild(step);
			body.scrollTop = body.scrollHeight;
			// Trim oldest entries to bound memory.
			while (body.children.length > MAX_TASK_STEPS) body.removeChild(body.firstChild);
			return step;
		} catch (err) {
			console.warn('[task-list] pushTaskStep failed:', err?.message || err);
			return null;
		}
	}
	function updateTaskStep(stepEl, status, message) {
		if (!stepEl) return;
		stepEl.classList.remove('active', 'done', 'error');
		stepEl.classList.add(status);
		if (typeof message === 'string') {
			const bodyEl = stepEl.querySelector('.step-body');
			if (bodyEl) bodyEl.textContent = message;
		}
	}
	// Expose for other modules to call (e.g. task-classifier.js).
	window.jarvisTaskList = { push: pushTaskStep, update: updateTaskStep };

function setStatusDot(status) {
	const dot = document.getElementById('status-dot');
	const headerDot = document.getElementById('header-connection-dot');
	if (!dot) return;
	dot.className = 'dot';
	const normalized = String(status ?? '').toLowerCase();
	const healthyStates = new Set(['connected', 'ready', 'online', 'busy', 'running', 'starting']);
	const errorStates = new Set(['error', 'disconnected', 'unavailable']);
	if (healthyStates.has(normalized)) dot.classList.add('connected');
	if (errorStates.has(normalized)) dot.classList.add('error');
	if (headerDot) {
		headerDot.style.background = healthyStates.has(normalized) ? '#22c55e'
			: errorStates.has(normalized) ? '#ef4444' : '#94a3b8';
		headerDot.style.boxShadow = healthyStates.has(normalized) ? '0 0 6px #22c55e'
			: errorStates.has(normalized) ? '0 0 6px #ef4444' : 'none';
	}
}

function showProviderWarning(message) {
	const banner = document.getElementById('provider-warning-banner');
	const text = document.getElementById('provider-warning-text');
	if (!banner) return;
	if (text) text.textContent = message;
	banner.style.display = 'flex';
}

function hideProviderWarning() {
	const banner = document.getElementById('provider-warning-banner');
	if (banner) banner.style.display = 'none';
	const input = document.getElementById('input');
	const sendBtn = document.getElementById('send');
	if (input) { input.disabled = false; input.placeholder = 'Type a Jarvis prompt or command…'; }
	if (sendBtn) sendBtn.disabled = false;
}

function disableComposer(reason) {
	const input = document.getElementById('input');
	const sendBtn = document.getElementById('send');
	if (input) { input.disabled = true; input.placeholder = reason || 'Sign in required'; }
	if (sendBtn) sendBtn.disabled = true;
}

// V2.0 — clean up VoiceGateway sidecar subscriptions on renderer teardown so
// hot-reloads / refreshes don't accumulate dangling listeners (audit finding).
window.addEventListener('beforeunload', () => {
	try { voiceGateway?.dispose?.(); } catch { /* gateway never bound */ }
});

// Surface uncaught errors in the connection panel so the UI never appears
// silently frozen on the initial "Starting…" string. Without this, any
// exception during the 3000-line init sequence would leave the user looking
// at a hung "Starting…" with no signal of what went wrong.
function renderInitError(scope, error) {
	const message = error?.message || String(error) || 'unknown error';
	console.error(`[renderer] Init error (${scope}):`, error);
	const node = document.getElementById('connection-status');
	if (node) {
		node.textContent = `error: ${message.slice(0, 160)}`;
	}
	const dot = document.getElementById('status-dot');
	if (dot) {
		dot.className = 'dot';
		dot.classList.add('error');
	}
}
window.addEventListener('error', (event) => renderInitError('window.error', event.error || event.message));
window.addEventListener('unhandledrejection', (event) => renderInitError('unhandledrejection', event.reason));

window.addEventListener('DOMContentLoaded', () => {
	const statusNode = document.getElementById('connection-status');
	if (statusNode) statusNode.textContent = 'initializing…';
	const tokenPromise = Promise.resolve(getToken()).catch((error) => {
		console.warn('[renderer] Failed to get device token:', error?.message || error);
		return null;
	});
	const log = document.getElementById('log');
	const input = document.getElementById('input');
	const send = document.getElementById('send');
	const appVersionNode = document.getElementById('app-version');
	const updateStatusNode = document.getElementById('update-status');
	const checkUpdatesButton = document.getElementById('check-updates');
	const installUpdateButton = document.getElementById('install-update');
	const updateModalBackdrop = document.getElementById('update-modal-backdrop');
	const updateModalBadge = document.getElementById('update-modal-badge');
	const updateModalTitle = document.getElementById('update-modal-title');
	const updateModalSubtitle = document.getElementById('update-modal-subtitle');
	const updateModalHighlights = document.getElementById('update-modal-highlights');
	const updateModalSegments = document.getElementById('update-modal-segments');
	const updateModalMarkdown = document.getElementById('update-modal-markdown');
	const updateModalVersion = document.getElementById('update-modal-version');
	const updateModalSource = document.getElementById('update-modal-source');
	const updateModalDetails = document.getElementById('update-modal-details');
	const updateModalProgress = document.getElementById('update-modal-progress');
	const updateProgressLabel = document.getElementById('update-progress-label');
	const updateProgressPercent = document.getElementById('update-progress-percent');
	const updateProgressFill = document.getElementById('update-progress-fill');
	const updateModalError = document.getElementById('update-modal-error');
	const updateModalPrimaryButton = document.getElementById('update-modal-primary');
	const updateModalSecondaryButton = document.getElementById('update-modal-secondary');
	let updateModalManualFlow = false;
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
	const localServerLabelInput = document.getElementById('local-server-label');
	const localServerBaseUrlInput = document.getElementById('local-server-base-url');
	const localServerApiTypeSelect = document.getElementById('local-server-api-type');
	const localServerAddButton = document.getElementById('local-server-add');
	const localServerListNode = document.getElementById('local-server-list');
	const localChatModelSelect = document.getElementById('local-chat-model');
	const localCodeModelSelect = document.getElementById('local-code-model');
	const localExternalModelSelect = document.getElementById('local-external-model');
	const localVisionModelSelect = document.getElementById('local-vision-model');
	const localPreferEnabledToggle = document.getElementById('local-prefer-enabled');
	const localServerSaveAssignmentButton = document.getElementById('local-server-save-assignment');
	const sttModelSelect = document.getElementById('stt-model');
	const ttsBackendSelect = document.getElementById('tts-backend');
	const ttsModelSelect = document.getElementById('tts-model');
	const chatModelField = document.getElementById('chat-model-field');
	const sttModelField = document.getElementById('stt-model-field');
	const ttsBackendField = document.getElementById('tts-backend-field');
	const ttsModelField = document.getElementById('tts-model-field');
	const voiceProviderModeField = document.getElementById('voice-provider-mode-field');
	const engineProfileSummaryNode = document.getElementById('engine-profile-summary');
	const modelSettingsNoteNode = document.getElementById('model-settings-note');
	const ttsVoiceProfileSelect = document.getElementById('tts-voice-profile');
	const voiceLanguageSelect = document.getElementById('voice-language');
	const voiceProviderModeSelect = document.getElementById('voice-provider-mode');
	const sttEnabledToggle = document.getElementById('stt-enabled');
	const autoTtsToggle = document.getElementById('auto-tts');
	const voiceVisualizer = document.getElementById('voice-visualizer');
	// V2.0 — replaced the 🎙 Talk button with a passive wake-listening chip.
	// Some legacy code paths still reference this element; we look it up
	// (it'll be null) and gate every interaction behind a null-check.
	const voiceInputButton = document.getElementById('voice-input');
	const wakeChipEl = document.getElementById('wake-listening-chip');
	const wakeChipTextEl = document.getElementById('wake-chip-text');
	function setWakeChipState(state, label) {
		if (!wakeChipEl) return;
		wakeChipEl.classList.remove('listening', 'disabled', 'error');
		if (state === 'listening' || state === 'disabled' || state === 'error') {
			wakeChipEl.classList.add(state);
		}
		if (label && wakeChipTextEl) wakeChipTextEl.textContent = label;
	}
	const wakeWordEnabledToggle = document.getElementById('wake-word-enabled');
	const wakeWordPhraseInput = document.getElementById('wake-word-phrase');
	const allowBackgroundWakeToggle = document.getElementById('allow-background-wake');
	// Settings → Audio (consolidated mic controls)
	const micDeviceSelect = document.getElementById('mic-device-select');
	const noiseSuppressionToggle = document.getElementById('noise-suppression-enabled');
	const wakeSensitivitySlider = document.getElementById('wake-word-sensitivity');
	const wakeSensitivityValueNode = document.getElementById('wake-word-sensitivity-value');
	const micTestButton = document.getElementById('mic-test-button');
	const micTestMeterFill = document.getElementById('mic-test-meter-fill');
	const micTestStatusNode = document.getElementById('mic-test-status');
	const saveVoiceSettingsButton = document.getElementById('save-voice-settings');
	const temporalAwarenessToggle = document.getElementById('temporal-awareness');
	const proactiveRemindersToggle = document.getElementById('proactive-reminders');
	const ambientAnnouncementsToggle = document.getElementById('ambient-announcements');
	const dailySummaryToggle = document.getElementById('daily-summary');
	const reminderVoiceStyleSelect = document.getElementById('reminder-voice-style');
	const reminderInput = document.getElementById('reminder-input');
	const reminderAddButton = document.getElementById('reminder-add');
	const remindersList = document.getElementById('reminders-list');
	const serverUrlInput = document.getElementById('jarvis-server-url');
	const saveServerUrlButton = document.getElementById('save-server-url');
	const runtimeModeSelect = document.getElementById('runtime-mode');
	const runtimePermissionLevelSelect = document.getElementById('runtime-permission-level');
	const remoteRuntimeApiUrlInput = document.getElementById('remote-runtime-api-url');
	const remoteRuntimeWsUrlInput = document.getElementById('remote-runtime-ws-url');
	const saveRuntimeConfigButton = document.getElementById('save-runtime-config');
	const runtimeSyncKeyInput = document.getElementById('runtime-sync-key');
	const runtimePairButton = document.getElementById('runtime-pair');
	const runtimeRefreshStatusButton = document.getElementById('runtime-refresh-status');
	const runtimeApplyPermissionButton = document.getElementById('runtime-apply-permission');
	const runtimeKillSwitchButton = document.getElementById('runtime-kill-switch');
	const runtimeStatusNode = document.getElementById('runtime-status');
	const permissionQuickButtons = Array.from(document.querySelectorAll('[data-permission-level]'));
	const openSetupWizardButton = document.getElementById('open-setup-wizard');
	const workspaceApp = document.querySelector('.app');
	const viewportWelcome = document.getElementById('welcome-screen');
	const viewportMap = document.getElementById('viewport-map');
	const viewportRepo = document.getElementById('viewport-repo');
	const viewportHardware = document.getElementById('viewport-hardware');
	const viewportMapCanvas = document.getElementById('viewport-map-canvas');
	const repoListNode = document.getElementById('repo-list');
	const repoTreeNode = document.getElementById('repo-tree');
	const repoPreviewNode = document.getElementById('repo-preview');
	const hardwareCpuNode = document.getElementById('hardware-cpu');
	const hardwareRamNode = document.getElementById('hardware-ram');
	const hardwareTempNode = document.getElementById('hardware-temp');
	const openSettingsModalButton = document.getElementById('open-settings-modal');
	const settingsModal = document.getElementById('settings-modal');
	const closeSettingsModalButton = document.getElementById('close-settings-modal');
	const githubStatusNode = document.getElementById('github-status');
	const githubTokenInput = document.getElementById('github-token-input');
	const githubSaveTokenButton = document.getElementById('github-save-token');
	const githubClearTokenButton = document.getElementById('github-clear-token');
	const googleStatusNode = document.getElementById('google-status');
	const googleLoginButton = document.getElementById('google-login');
	const googleLogoutButton = document.getElementById('google-logout');
	const googleDeviceHintNode = document.getElementById('google-device-hint');
	let apiBaseUrl = getJarvisApiUrl();
	let cachedSpeechVoices = [];
	let speechVoicePromise = null;

	const JARVIS_SETTINGS_KEY = 'jarvis-desktop-voice-settings-v1';
	const DEFAULT_LOCAL_TTS_MODEL = 'kokoro';
	const DEFAULT_CLOUD_TTS_MODEL = 'playai-tts';
	const AGENT_STATE = {
		IDLE: 'IDLE',
		THINKING: 'THINKING',
		LISTENING: 'LISTENING',
		SPEAKING: 'SPEAKING',
	};
	let currentAgentState = AGENT_STATE.IDLE;
	let visualizerEnergy = 0;
	let inactivityTimer = null;
	let mapWidget = null;
	let mapWidgetInitPromise = null;
	let currentRepoContext = null;
	let googleDevicePollTimer = null;

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

	// Left tab rail — Claude-style toggle. Persist the collapsed preference so
	// the rail stays in the user's preferred state across launches.
	const tabRailToggle = document.getElementById('tab-rail-toggle');
	const TAB_RAIL_PREF_KEY = 'jarvis.tabRail.collapsed';
	function applyTabRailState(collapsed) {
		document.body.classList.toggle('tabs-collapsed', !!collapsed);
		if (tabRailToggle) {
			tabRailToggle.setAttribute('aria-pressed', collapsed ? 'false' : 'true');
			tabRailToggle.title = collapsed ? 'Show tabs (Ctrl+B)' : 'Hide tabs (Ctrl+B)';
		}
	}
	try {
		applyTabRailState(localStorage.getItem(TAB_RAIL_PREF_KEY) === '1');
	} catch { applyTabRailState(false); }
	tabRailToggle?.addEventListener('click', () => {
		const nowCollapsed = !document.body.classList.contains('tabs-collapsed');
		applyTabRailState(nowCollapsed);
		try { localStorage.setItem(TAB_RAIL_PREF_KEY, nowCollapsed ? '1' : '0'); } catch { /* storage unavailable */ }
	});
	// Ctrl+B shortcut matches Claude / VS Code muscle memory.
	window.addEventListener('keydown', (e) => {
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b' && !e.shiftKey && !e.altKey) {
			e.preventDefault();
			tabRailToggle?.click();
		}
	});

	// Task list panel — Devin-style real-time agent activity.
	const taskListToggle = document.getElementById('task-list-toggle');
	const taskListClear = document.getElementById('task-list-clear');
	const TASK_LIST_PREF_KEY = 'jarvis.taskList.collapsed';
	function applyTaskListState(collapsed) {
		document.body.classList.toggle('task-list-collapsed', !!collapsed);
		if (taskListToggle) {
			taskListToggle.setAttribute('aria-pressed', collapsed ? 'false' : 'true');
			taskListToggle.title = collapsed ? 'Show task list (Ctrl+J)' : 'Hide task list (Ctrl+J)';
		}
	}
	try {
		// Default to COLLAPSED so it doesn't surprise first-time users.
		applyTaskListState(localStorage.getItem(TASK_LIST_PREF_KEY) !== '0');
	} catch { applyTaskListState(true); }
	taskListToggle?.addEventListener('click', () => {
		const nowCollapsed = !document.body.classList.contains('task-list-collapsed');
		applyTaskListState(nowCollapsed);
		try { localStorage.setItem(TASK_LIST_PREF_KEY, nowCollapsed ? '1' : '0'); } catch { /* storage unavailable */ }
	});
	taskListClear?.addEventListener('click', () => {
		const body = document.getElementById('task-list-body');
		if (!body) return;
		body.innerHTML = '<div id="task-list-empty">Awaiting first command…</div>';
	});
	// Ctrl+J shortcut to toggle the task list (J for "Jarvis activity").
	window.addEventListener('keydown', (e) => {
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j' && !e.shiftKey && !e.altKey) {
			e.preventDefault();
			taskListToggle?.click();
		}
	});

	// ─── Idea #2 — Orb quick-action chips (New / Copy / Vision) ─────────────────
	const actionNewConv = document.getElementById('action-new-conv');
	const actionCopyLast = document.getElementById('action-copy-last');
	const actionCaptureScreen = document.getElementById('action-capture-screen');
	let lastAssistantResponse = '';

	// ─── Idea #5 — Conversation memory persistence ──────────────────────────
	// Every appendMessage call also forwards the entry to main's memory:save
	// IPC. The log persists across launches in userData/jarvis-conversation.json
	// so the assistant can recall what was just discussed.
	function persistMemoryEntry(role, text) {
		if (!text || typeof text !== 'string') return;
		try {
			window.jarvisIpc?.invoke?.('memory:save', { role, text }).catch(() => null);
		} catch { /* IPC unavailable */ }
	}

	// Track every system/assistant message that appendMessage produces so the
	// "Copy" button has something to paste, AND forward to persistent memory.
	// Patched non-invasively at the end of this DOMContentLoaded callback.
	const originalAppendMessage = appendMessage;
	appendMessage = function patchedAppend(...args) {
		try {
			// args: log, title, body, tone, badges
			const [, , body, tone] = args;
			if (typeof body === 'string' && body.trim()) {
				if (tone !== 'user') lastAssistantResponse = body;
				// Persist user messages and assistant responses (skip noisy
				// 'system' chatter like "Prompt queued" by checking the title).
				const title = String(args[1] || '');
				const isUserMessage = tone === 'user';
				const isAssistantReply = !!title && /jarvis|assistant|reply|response|answer/i.test(title);
				if (isUserMessage || isAssistantReply) {
					persistMemoryEntry(isUserMessage ? 'user' : 'assistant', body);
				}
			}
		} catch { /* harmless tracking failure */ }
		return originalAppendMessage.apply(this, args);
	};

	actionNewConv?.addEventListener('click', () => {
		const logEl = document.getElementById('log');
		if (!logEl) return;
		logEl.innerHTML = '<div class="log-empty" id="log-empty"><span class="log-empty-icon">🤖</span><span>New conversation started</span></div>';
		lastAssistantResponse = '';
		pushTaskStep('SESSION', 'New conversation started', 'done');
	});

	// Idea #5 — hydrate the last ~10 messages from persistent memory on launch.
	(async function hydrateMemory() {
		try {
			const result = await window.jarvisIpc?.invoke?.('memory:list-recent', { limit: 10 });
			if (!result?.ok || !Array.isArray(result.entries) || result.entries.length === 0) return;
			const logEl = document.getElementById('log');
			if (!logEl) return;
			const empty = document.getElementById('log-empty');
			if (empty) empty.remove();
			const banner = document.createElement('div');
			banner.className = 'message system';
			banner.innerHTML = `<small>${new Date().toLocaleTimeString()} — Memory</small><div>Continuing from ${result.entries.length} previous message${result.entries.length === 1 ? '' : 's'}.</div>`;
			logEl.prepend(banner);
			// Replay messages in chronological order at the bottom of the log
			// (log is column-reverse so prepending shows newest at top).
			for (const entry of result.entries) {
				const isUser = entry.role === 'user';
				const item = document.createElement('div');
				item.className = `message ${isUser ? 'user' : 'system'} memory-replay`;
				const time = new Date(entry.ts || Date.now()).toLocaleTimeString();
				item.innerHTML = `<small>${time} — ${isUser ? 'You' : 'Jarvis'} (memory)</small><div></div>`;
				item.querySelector('div').textContent = entry.text;
				logEl.appendChild(item);
				if (!isUser) lastAssistantResponse = entry.text;
			}
		} catch { /* silent — memory is optional */ }
	})();

	actionCopyLast?.addEventListener('click', async () => {
		if (!lastAssistantResponse) {
			pushTaskStep('CLIPBOARD', 'Nothing to copy yet', 'error');
			return;
		}
		try {
			await navigator.clipboard.writeText(lastAssistantResponse);
			pushTaskStep('CLIPBOARD', `Copied ${lastAssistantResponse.length} chars to clipboard`, 'done');
			actionCopyLast.textContent = '✓ Copied';
			setTimeout(() => { actionCopyLast.textContent = '📋 Copy'; }, 1400);
		} catch (err) {
			pushTaskStep('CLIPBOARD', `Copy failed: ${err?.message || err}`, 'error');
		}
	});

	// ─── Idea #3 — Screen capture → vision model ───────────────────────────────
	// Hands the active screen to the vision dispatch slot (llava-phi / moondream2
	// on Pro tier). Falls back to a friendly error if vision isn't configured.
	function isScreenVisionPrompt(text) {
		return /(?:what(?:'s| is)? on (?:my |the )?screen|what can you see|look at (?:my |the )?screen|describe (?:my |the )?screen|co (?:jest|mam) na ekranie|poka[zż].*(?:ekran|widzisz)|sprawd[zź].*(?:ekran|widzisz))/i.test(String(text || ''));
	}

	async function captureScreenForVision({ prompt = 'Describe what is on my screen right now', autoSubmit = false } = {}) {
		try {
			pushTaskStep('VISION', 'Capturing screen…', 'active');
			const result = await window.jarvisIpc?.invoke?.('vision:capture-screen');
			if (!result?.ok) {
				pushTaskStep('VISION', `Capture failed: ${result?.error || 'unknown'}`, 'error');
				return;
			}
			pushTaskStep('VISION', `Captured ${result.width}×${result.height} — sending to vision model…`, 'active');
			// Forward the data URL to the AI router; the semantic policy routes
			// to the 'vision' dispatch slot when intent is 'vision'.
			const input = document.getElementById('input');
			if (input) {
				input.value = prompt;
				input.focus();
			}
			if (autoSubmit) {
				pushTaskStep('VISION', 'Screen captured — asking vision model', 'done');
				queuePromptExecution(prompt, { source: 'local', origin: 'desktop', routeHint: 'vision' });
				appendMessage(log, 'Vision queued', prompt, 'system');
			} else {
				pushTaskStep('VISION', 'Screen captured — type a question or press Enter', 'done');
			}
		} catch (err) {
			pushTaskStep('VISION', `Capture error: ${err?.message || err}`, 'error');
		}
	}
	actionCaptureScreen?.addEventListener('click', captureScreenForVision);
	// Ctrl+Shift+V keyboard shortcut to trigger the same flow.
	window.addEventListener('keydown', (e) => {
		if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
			e.preventDefault();
			captureScreenForVision();
		}
	});

	// BYOK API key inputs — auto-save to OS keychain via secure:set-api-key.
	// Keys are write-only from the UI; we never read them back into the form.
	function bindByokInputs() {
		const inputs = document.querySelectorAll('[data-byok-provider]');
		const status = document.getElementById('byok-status');
		const setStatus = (text, ok = true) => {
			if (!status) return;
			status.textContent = text;
			status.style.color = ok ? 'rgba(125, 211, 252, 0.85)' : 'rgba(239, 68, 68, 0.85)';
		};
		inputs.forEach((input) => {
			input.addEventListener('blur', async () => {
				const provider = input.dataset.byokProvider;
				const value = String(input.value || '').trim();
				if (!value) return; // empty blur = ignore (don't wipe existing keys)
				try {
					const result = await window.jarvisIpc?.invoke?.('secure:set-api-key', { provider, value });
					if (result?.ok) {
						setStatus(`${provider} key saved to ${result.backend || 'secure store'}`, true);
						input.value = ''; // clear the visible value; the key now lives in keychain
						input.placeholder = '••••• saved';
					} else {
						setStatus(`${provider}: ${result?.error || 'failed to save'}`, false);
					}
				} catch (err) {
					setStatus(`${provider}: ${err?.message || err}`, false);
				}
			});
		});
	}
	try { bindByokInputs(); } catch (err) { console.warn('[byok] bind failed:', err?.message || err); }

	// HUD window controls — minimize / maximize / close on the borderless frame.
	const winMinimize = document.getElementById('win-minimize');
	const winMaximize = document.getElementById('win-maximize');
	const winClose = document.getElementById('win-close');
	const invokeWindow = (channel) => {
		try {
			ipcRenderer?.invoke?.(channel).catch(() => null);
		} catch { /* ipc unavailable in non-electron context */ }
	};
	winMinimize?.addEventListener('click', () => invokeWindow('window:minimize'));
	winMaximize?.addEventListener('click', () => invokeWindow('window:toggle-maximize'));
	winClose?.addEventListener('click', () => invokeWindow('window:close'));

	function switchViewport(mode) {
		viewportWelcome?.classList.toggle('active', mode === 'welcome');
		viewportMap?.classList.toggle('active', mode === 'map');
		viewportRepo?.classList.toggle('active', mode === 'repo');
		viewportHardware?.classList.toggle('active', mode === 'hardware');
		workspaceApp?.classList.toggle('viewport-active', mode !== 'welcome');
	}

	async function ensureMapWidget() {
		if (!viewportMapCanvas) return null;
		if (mapWidget) return mapWidget;
		if (mapWidgetInitPromise) return mapWidgetInitPromise;
		mapWidgetInitPromise = (async () => {
			let mapConfig = {};
			try {
				mapConfig = await window.jarvisApi?.map?.getConfig?.();
			} catch (error) {
				console.warn('[renderer] Failed to load map config:', error?.message || error);
			}
			if (!mapWidget && window.MapWidget) {
				mapWidget = new window.MapWidget({
					accessToken: mapConfig?.accessToken || '',
				});
				if (mapConfig?.accessToken) {
					window.__JARVIS_MAPBOX_ACCESS_TOKEN__ = mapConfig.accessToken;
				}
				mapWidget.init(viewportMapCanvas);
			}
			return mapWidget;
		})();
		try {
			return await mapWidgetInitPromise;
		} finally {
			mapWidgetInitPromise = null;
		}
	}

	function extractMapPlace(text) {
		const normalized = String(text || '').trim();
		const explicit = normalized.match(/(?:poka[zż]\s+(?:mi\s+)?)?map[ęe]\s+(.+)/i);
		if (explicit?.[1]) return explicit[1].trim();
		const find = normalized.match(/znajd[źz]\s+(.+?)\s+na mapie/i);
		return find?.[1]?.trim() || '';
	}

	function parseRepoTarget(text) {
		const match = String(text || '').match(/(?:poka[zż]|otw[oó]rz)\s+repo(?:zytorium)?\s+([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/i);
		if (!match?.[1]) return null;
		const [owner, repo] = match[1].split('/');
		return { owner, repo };
	}

	async function refreshHardwareSnapshot() {
		if (!ipcRenderer) return;
		try {
			const telemetry = await ipcRenderer.invoke('get-local-telemetry');
			const cpu = Number(telemetry?.cpu?.percent || telemetry?.cpu || 0);
			const ram = Number(telemetry?.memory?.percent || telemetry?.ram?.percent || 0);
			const temp = Number(telemetry?.temperature?.celsius || telemetry?.temperature || 0);
			if (hardwareCpuNode) hardwareCpuNode.textContent = `CPU: ${cpu.toFixed(1)}%`;
			if (hardwareRamNode) hardwareRamNode.textContent = `RAM: ${ram.toFixed(1)}%`;
			if (hardwareTempNode) hardwareTempNode.textContent = `TEMP: ${temp.toFixed(1)}°C`;
		} catch (error) {
			appendMessage(log, 'Hardware', String(error?.message || error || 'hardware-read-failed'), 'error');
		}
	}

	function renderRepoList(repos = []) {
		if (!repoListNode) return;
		if (!Array.isArray(repos) || repos.length === 0) {
			repoListNode.textContent = 'Brak repozytoriów lub brak autoryzacji.';
			return;
		}
		repoListNode.innerHTML = '';
		repos.slice(0, 100).forEach((repo) => {
			const row = document.createElement('button');
			row.type = 'button';
			row.className = 'secondary sm';
			row.style.width = '100%';
			row.style.marginBottom = '6px';
			row.textContent = repo.full_name || repo.name;
			row.addEventListener('click', async () => {
				currentRepoContext = {
					owner: repo.owner?.login || currentRepoContext?.owner,
					repo: repo.name,
				};
				await loadRepoTree(currentRepoContext);
			});
			repoListNode.appendChild(row);
		});
	}

	async function loadRepoTree(target) {
		if (!target?.owner || !target?.repo || !githubApi.getTree) return;
		switchViewport('repo');
		const tree = await githubApi.getTree(target);
		if (repoTreeNode) {
			repoTreeNode.innerHTML = '';
			(tree || []).filter((entry) => entry.type === 'blob').slice(0, 200).forEach((entry) => {
				const item = document.createElement('button');
				item.type = 'button';
				item.className = 'secondary sm';
				item.style.display = 'block';
				item.style.width = '100%';
				item.style.marginBottom = '6px';
				item.textContent = entry.path;
				item.addEventListener('click', async () => {
					const file = await githubApi.readFile({
						owner: target.owner,
						repo: target.repo,
						path: entry.path,
					});
					if (repoPreviewNode) repoPreviewNode.textContent = file?.content || '';
				});
				repoTreeNode.appendChild(item);
			});
		}
	}

	async function refreshGitHubStatus() {
		if (!githubApi.getStatus || !githubStatusNode) return;
		const status = await githubApi.getStatus();
		if (status?.connected) {
			githubStatusNode.textContent = `GitHub: connected as ${status.login || 'user'}`;
			const repos = await githubApi.listRepos({ perPage: 30 });
			renderRepoList(repos);
			return;
		}
		githubStatusNode.textContent = status?.hasToken
			? `GitHub: token invalid (${status?.error || 'unknown'})`
			: 'GitHub: not configured';
	}

	async function refreshGoogleStatus() {
		if (!googleApi.getStatus || !googleStatusNode) return;
		const status = await googleApi.getStatus();
		googleStatusNode.textContent = status?.connected
			? 'Google: connected'
			: `Google: not connected${status?.error ? ` (${status.error})` : ''}`;
	}

	async function handleIntegratedCommands(text) {
		const normalized = String(text || '').trim();
		if (!normalized) return false;

		if (/status systemu|jak dzia[łl]a m[oó]j komputer/i.test(normalized)) {
			switchViewport('hardware');
			await refreshHardwareSnapshot();
			appendMessage(log, 'Hardware', 'Showing system telemetry snapshot.', 'system');
			return true;
		}

		if (/map[ęe]|na mapie/i.test(normalized)) {
			const place = extractMapPlace(normalized);
			if (!place) return false;
			const widget = await ensureMapWidget();
			switchViewport('map');
			try {
				const loc = await widget?.goTo(place);
				appendMessage(log, 'Map', `Centered map on ${loc?.label || place}.`, 'system');
			} catch (error) {
				appendMessage(log, 'Map', String(error?.message || error || 'map-search-failed'), 'error');
			}
			return true;
		}

		const repoTarget = parseRepoTarget(normalized);
		if (repoTarget) {
			currentRepoContext = repoTarget;
			try {
				await loadRepoTree(repoTarget);
				appendMessage(log, 'GitHub', `Opened ${repoTarget.owner}/${repoTarget.repo}.`, 'system');
			} catch (error) {
				appendMessage(log, 'GitHub', String(error?.message || error || 'repo-open-failed'), 'error');
			}
			return true;
		}

		const fileMatch = normalized.match(/przeczytaj plik\s+(.+)/i);
		if (fileMatch?.[1] && currentRepoContext && githubApi.readFile) {
			switchViewport('repo');
			try {
				const file = await githubApi.readFile({
					owner: currentRepoContext.owner,
					repo: currentRepoContext.repo,
					path: fileMatch[1].trim(),
				});
				if (repoPreviewNode) repoPreviewNode.textContent = file?.content || '';
				appendMessage(log, 'GitHub', `Loaded file ${fileMatch[1].trim()}.`, 'system');
			} catch (error) {
				appendMessage(log, 'GitHub', String(error?.message || error || 'file-read-failed'), 'error');
			}
			return true;
		}

		const commitsMatch = normalized.match(/sprawd[źz]\s+ostatnie\s+commity(?:\s+([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+))?/i);
		if (commitsMatch && githubApi.listCommits) {
			const target = commitsMatch[1] ? parseRepoTarget(`pokaż repo ${commitsMatch[1]}`) : currentRepoContext;
			if (!target) return false;
			switchViewport('repo');
			try {
				const commits = await githubApi.listCommits(target);
				if (repoPreviewNode) {
					repoPreviewNode.textContent = (commits || []).slice(0, 10).map((item) => {
						const sha = String(item?.sha || '').slice(0, 7);
						const msg = item?.commit?.message || '';
						const author = item?.commit?.author?.name || '';
						return `${sha} ${author}: ${msg}`;
					}).join('\n');
				}
			} catch (error) {
				appendMessage(log, 'GitHub', String(error?.message || error || 'commit-read-failed'), 'error');
			}
			return true;
		}

		const launchMatch = normalized.match(/uruchom\s+(.+)/i);
		if (launchMatch?.[1]) {
			const name = launchMatch[1].trim().toLowerCase();
			const gameHints = {
				steam: { platform: 'steam', id: 'cs2' },
				roblox: { platform: 'roblox', id: 'default' },
				epic: { platform: 'epic', id: 'fortnite' },
				battle: { platform: 'battlenet', id: 'wow' },
			};
			try {
				const known = Object.entries(gameHints).find(([key]) => name.includes(key))?.[1];
				if (known && toolsApi.launchGame) {
					await toolsApi.launchGame(known);
					appendMessage(log, 'Launcher', `Launched ${name} through game protocol.`, 'system');
					return true;
				}
				if (toolsApi.launchApp) {
					const result = await toolsApi.launchApp({ appName: name });
					if (result?.ok) {
						appendMessage(log, 'Launcher', `Launched ${result.appName}.`, 'system');
						return true;
					}
					appendMessage(log, 'Launcher', `App not found: ${name}`, 'error');
					return true;
				}
			} catch (error) {
				appendMessage(log, 'Launcher', String(error?.message || error || 'app-launch-failed'), 'error');
				return true;
			}
		}

		if (/jaki mam plan na dzi[sś]/i.test(normalized) && googleApi.getCalendarToday) {
			try {
				const events = await googleApi.getCalendarToday();
				const summary = (events || []).slice(0, 10).map((item) => {
					const start = item?.start?.dateTime || item?.start?.date || '';
					return `• ${start} ${item?.summary || '(untitled)'}`;
				}).join('\n');
				appendMessage(log, 'Google Calendar', summary || 'No events for today.', 'system');
			} catch (error) {
				appendMessage(log, 'Google Calendar', String(error?.message || error || 'calendar-read-failed'), 'error');
			}
			return true;
		}

		return false;
	}

	openSettingsModalButton?.addEventListener('click', () => {
		if (settingsModal) settingsModal.hidden = false;
	});

	closeSettingsModalButton?.addEventListener('click', () => {
		if (settingsModal) settingsModal.hidden = true;
	});

	settingsModal?.addEventListener('click', (event) => {
		if (event.target === settingsModal) settingsModal.hidden = true;
	});

	openSetupWizardButton?.addEventListener('click', () => {
		window.location.replace('setup-wizard.html');
	});

	githubSaveTokenButton?.addEventListener('click', async () => {
		try {
			const token = githubTokenInput?.value?.trim();
			await githubApi.setToken?.(token);
			if (githubTokenInput) githubTokenInput.value = '';
			await refreshGitHubStatus();
			appendMessage(log, 'GitHub', 'Token saved securely.', 'system');
		} catch (error) {
			appendMessage(log, 'GitHub', String(error?.message || error || 'github-token-save-failed'), 'error');
		}
	});

	githubClearTokenButton?.addEventListener('click', async () => {
		try {
			await githubApi.clearToken?.();
			await refreshGitHubStatus();
			appendMessage(log, 'GitHub', 'Token removed.', 'system');
		} catch (error) {
			appendMessage(log, 'GitHub', String(error?.message || error || 'github-token-clear-failed'), 'error');
		}
	});

	googleLoginButton?.addEventListener('click', async () => {
		try {
			const flow = await googleApi.loginStart?.();
			if (googleDeviceHintNode) {
				googleDeviceHintNode.textContent = `Wejdź na ${flow?.verification_url || flow?.verification_uri || ''} i wpisz kod ${flow?.user_code || ''}`;
			}
			if (googleDevicePollTimer) clearInterval(googleDevicePollTimer);
			googleDevicePollTimer = setInterval(async () => {
				try {
					await googleApi.loginPoll?.({ deviceCode: flow?.device_code });
					if (googleDeviceHintNode) googleDeviceHintNode.textContent = 'Google login completed.';
					if (googleDevicePollTimer) clearInterval(googleDevicePollTimer);
					googleDevicePollTimer = null;
					await refreshGoogleStatus();
				} catch (error) {
					const message = String(error?.message || error || '');
					if (!/authorization_pending|slow_down/.test(message)) {
						if (googleDeviceHintNode) googleDeviceHintNode.textContent = message;
						if (googleDevicePollTimer) clearInterval(googleDevicePollTimer);
						googleDevicePollTimer = null;
					}
				}
			}, Math.max(2, Number(flow?.interval || 5)) * 1000);
		} catch (error) {
			appendMessage(log, 'Google', String(error?.message || error || 'google-login-start-failed'), 'error');
		}
	});

	googleLogoutButton?.addEventListener('click', async () => {
		try {
			await googleApi.logout?.();
			if (googleDeviceHintNode) googleDeviceHintNode.textContent = '';
			await refreshGoogleStatus();
		} catch (error) {
			appendMessage(log, 'Google', String(error?.message || error || 'google-logout-failed'), 'error');
		}
	});

	const defaultVoiceSettings = {
		chatModel: chatModelSelect?.value || 'auto-smart',
		sttEnabled: true,
		sttModel: normalizeSttModel(sttModelSelect?.value || 'base'),
		ttsEnabled: true,
		ttsBackend: ttsBackendSelect?.value || 'kokoro-local',
		ttsModel: normalizeTtsModel(ttsModelSelect?.value || DEFAULT_LOCAL_TTS_MODEL, ttsBackendSelect?.value || 'kokoro-local'),
		ttsVoiceId: ttsVoiceProfileSelect?.value || 'jarvis',
		wakeWordEnabled: true,
		wakeWordPhrase: DEFAULT_JARVIS_WAKE_PHRASE,
		allowBackgroundWake: true,
		voiceLanguage: voiceLanguageSelect?.value || (typeof navigator !== 'undefined' ? navigator.language : 'en-US') || 'en-US',
		autoTts: true,
		providerMode: 'assistantx-server',
		temporalAwareness: true,
		proactiveReminders: true,
		ambientAnnouncements: false,
		dailySummary: false,
		reminderVoiceStyle: 'neutral',
		noiseSuppressionEnabled: true,
		wakeWordSensitivity: 0.5,
		micInputDeviceId: '',
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
	let speechPlaybackActive = false;
	let sidecarCapabilities = {
		ttsStreamingSupported: false,
		ttsBackend: 'unknown',
	};
	let activeAiStream = {
		id: '',
		segmentsSent: 0,
		streamingEnabled: false,
	};
	const ttsAudioChunkQueue = [];
	const MAX_TTS_AUDIO_QUEUE = 24;
	let ttsAudioChunkPlaying = false;
	let ttsAudioActiveStreamId = '';
	let voiceSettings = readVoiceSettings();
	let desktopLocalServers = [];
	let desktopLocalAssignment = {
		chatModelId: null,
		codeModelId: null,
		externalApiModelId: null,
		visionModelId: null,
		serverId: null,
		preferLocalWhenAvailable: false,
	};
	let runtimeModelConfig = {
		engine_mode: 'local',
		hardware_profile: 'standard',
		llm_model: defaultVoiceSettings.chatModel,
		stt_model: defaultVoiceSettings.sttModel,
		tts_model: defaultVoiceSettings.ttsModel,
		language: 'en',
	};

	function applyVoiceSettings(nextSettings, { persist = true } = {}) {
		const merged = { ...defaultVoiceSettings, ...nextSettings };
		merged.sttModel = normalizeSttModel(merged.sttModel);
		merged.ttsModel = normalizeTtsModel(merged.ttsModel, merged.ttsBackend);
		voiceSettings = merged;
		if (chatModelSelect && voiceSettings.chatModel) chatModelSelect.value = voiceSettings.chatModel;
		if (sttModelSelect && voiceSettings.sttModel) sttModelSelect.value = voiceSettings.sttModel;
		if (ttsBackendSelect && voiceSettings.ttsBackend) ttsBackendSelect.value = voiceSettings.ttsBackend;
		if (ttsModelSelect && voiceSettings.ttsModel) ttsModelSelect.value = voiceSettings.ttsModel;
		if (ttsVoiceProfileSelect && voiceSettings.ttsVoiceId) ttsVoiceProfileSelect.value = voiceSettings.ttsVoiceId;
		if (sttEnabledToggle) sttEnabledToggle.checked = Boolean(voiceSettings.sttEnabled);
		if (wakeWordEnabledToggle) wakeWordEnabledToggle.checked = !!voiceSettings.wakeWordEnabled;
		if (wakeWordPhraseInput) wakeWordPhraseInput.value = voiceSettings.wakeWordPhrase || DEFAULT_JARVIS_WAKE_PHRASE;
		if (allowBackgroundWakeToggle) allowBackgroundWakeToggle.checked = !!voiceSettings.allowBackgroundWake;
		if (noiseSuppressionToggle) noiseSuppressionToggle.checked = voiceSettings.noiseSuppressionEnabled !== false;
		if (wakeSensitivitySlider) {
			const sensitivity = Number.isFinite(Number(voiceSettings.wakeWordSensitivity))
				? Number(voiceSettings.wakeWordSensitivity)
				: 0.5;
			wakeSensitivitySlider.value = String(Math.round(sensitivity * 100));
			if (wakeSensitivityValueNode) wakeSensitivityValueNode.textContent = `${Math.round(sensitivity * 100)}%`;
		}
		if (micDeviceSelect && voiceSettings.micInputDeviceId !== undefined) {
			micDeviceSelect.value = voiceSettings.micInputDeviceId || '';
		}
		if (voiceLanguageSelect && voiceSettings.voiceLanguage) voiceLanguageSelect.value = voiceSettings.voiceLanguage;
		// 'desktop-direct' is not implemented in voice-gateway.js — silently migrate to the working default.
		if (voiceSettings.providerMode === 'desktop-direct') voiceSettings.providerMode = 'assistantx-server';
		if (voiceProviderModeSelect && voiceSettings.providerMode) voiceProviderModeSelect.value = voiceSettings.providerMode;
		if (autoTtsToggle) autoTtsToggle.checked = Boolean(voiceSettings.autoTts);
		if (temporalAwarenessToggle) temporalAwarenessToggle.checked = Boolean(voiceSettings.temporalAwareness);
		if (proactiveRemindersToggle) proactiveRemindersToggle.checked = Boolean(voiceSettings.proactiveReminders);
		if (ambientAnnouncementsToggle) ambientAnnouncementsToggle.checked = Boolean(voiceSettings.ambientAnnouncements);
		if (dailySummaryToggle) dailySummaryToggle.checked = Boolean(voiceSettings.dailySummary);
		if (reminderVoiceStyleSelect && voiceSettings.reminderVoiceStyle) reminderVoiceStyleSelect.value = voiceSettings.reminderVoiceStyle;
		if (voiceInputButton) {
			voiceInputButton.disabled = !voiceSettings.sttEnabled;
			if (!speechToTextActive) {
				voiceInputButton.textContent = voiceSettings.sttEnabled ? '🎙 Talk' : '🎙 STT off';
			}
		}
		// Wake chip mirrors STT state — "Say Hey Jarvis" when armed, dimmed
		// + "Voice off" label when the user disables STT in settings.
		if (wakeChipEl) {
			if (!voiceSettings.sttEnabled) {
				setWakeChipState('disabled', 'Voice off');
			} else if (!voiceSettings.wakeWordEnabled) {
				setWakeChipState('disabled', 'Wake word off');
			} else if (!speechToTextActive) {
				setWakeChipState(null, `Say "${voiceSettings.wakeWordPhrase || 'Hey Jarvis'}"`);
			}
		}
		updateModelSettingsUi();
		if (persist) writeVoiceSettings(voiceSettings);
	}

	function resolveLocalTtsBackend(backend) {
		const value = String(backend || '').toLowerCase();
		if (value === 'piper-local') return 'piper';
		if (value === 'kokoro-local') return 'kokoro';
		return 'auto';
	}

	function updateModelSettingsUi() {
		const engineMode = normalizeEngineMode(runtimeModelConfig.engine_mode);
		const usingLocalVoice = isLocalTtsBackend(voiceSettings.ttsBackend);
		const profile = String(runtimeModelConfig.hardware_profile || 'standard').trim() || 'standard';
		const llmModel = String(runtimeModelConfig.llm_model || voiceSettings.chatModel || 'auto-smart').trim();
		const sttModel = normalizeSttModel(runtimeModelConfig.stt_model || voiceSettings.sttModel || 'base');
		const ttsModel = normalizeTtsModel(runtimeModelConfig.tts_model || voiceSettings.ttsModel || DEFAULT_LOCAL_TTS_MODEL, voiceSettings.ttsBackend);

		// Update header model chip
		const modelBadge = document.getElementById('active-model-badge');
		if (modelBadge) {
			const modeLabel = engineMode === 'cloud' || engineMode === 'byok-cloud' ? 'Cloud' : 'Local';
			const shortModel = llmModel.length > 24 ? llmModel.slice(0, 22) + '…' : llmModel;
			modelBadge.textContent = `${modeLabel} · ${shortModel}`;
		}
		if (engineProfileSummaryNode) {
			engineProfileSummaryNode.textContent = engineMode === 'local'
				? `Local engine active • ${profile} profile • Ollama ${llmModel} • Whisper ${sttModel} • ${ttsModel === 'piper' ? 'Piper' : 'Kokoro'} voice`
				: `Cloud engine active • Jarvis keeps the wizard-selected profile in sync and only shows controls that still apply.`;
		}
		if (modelSettingsNoteNode) {
			modelSettingsNoteNode.textContent = usingLocalVoice
				? 'Local voice playback uses Whisper + Kokoro/Piper assets from your Jarvis install. Cloud-only TTS model selection is hidden until you switch to a cloud voice backend.'
				: 'Cloud voice playback is enabled. Choose the provider backend and the matching cloud TTS model below.';
		}
		if (chatModelField) chatModelField.hidden = false;
		if (sttModelField) sttModelField.hidden = false;
		if (ttsBackendField) ttsBackendField.hidden = false;
		if (ttsModelField) ttsModelField.hidden = usingLocalVoice;
		if (voiceProviderModeField) voiceProviderModeField.hidden = engineMode === 'local' && usingLocalVoice;
		if (ttsModelSelect) ttsModelSelect.disabled = usingLocalVoice;
	}

	async function loadRuntimeModelConfig() {
		try {
			const response = await (window.jarvisApi?.config?.getModelConfig?.() || window.jarvisSetup?.getRecommendedConfig?.());
			const config = response?.config || null;
			if (!config) {
				updateModelSettingsUi();
				return;
			}
			runtimeModelConfig = {
				...runtimeModelConfig,
				...config,
				engine_mode: normalizeEngineMode(config.engine_mode),
				stt_model: normalizeSttModel(config.stt_model || runtimeModelConfig.stt_model),
				tts_model: normalizeTtsModel(config.tts_model || runtimeModelConfig.tts_model, voiceSettings.ttsBackend),
			};
			ensureSelectOption(chatModelSelect, runtimeModelConfig.llm_model, `${runtimeModelConfig.llm_model} (wizard default)`);
			ensureSelectOption(sttModelSelect, runtimeModelConfig.stt_model, `whisper-${runtimeModelConfig.stt_model}`);
			ensureSelectOption(ttsModelSelect, 'kokoro', 'kokoro-82m (local voice runtime)');
			ensureSelectOption(ttsModelSelect, 'piper', 'piper local voice pack');
			const nextBackend = normalizeEngineMode(runtimeModelConfig.engine_mode) === 'local'
				? (isLocalTtsBackend(voiceSettings.ttsBackend) ? voiceSettings.ttsBackend : 'kokoro-local')
				: (String(voiceSettings.ttsBackend || '').trim() || 'groq-cloud');
			applyVoiceSettings({
				...voiceSettings,
				chatModel: runtimeModelConfig.llm_model || voiceSettings.chatModel,
				sttModel: runtimeModelConfig.stt_model || voiceSettings.sttModel,
				ttsBackend: nextBackend,
				ttsModel: normalizeEngineMode(runtimeModelConfig.engine_mode) === 'local'
					? normalizeTtsModel(runtimeModelConfig.tts_model || DEFAULT_LOCAL_TTS_MODEL, nextBackend)
					: voiceSettings.ttsModel,
				voiceLanguage: resolveVoiceLanguage(runtimeModelConfig.language || voiceSettings.voiceLanguage),
			});
			syncSidecarVoiceSettings();
		} catch {
			updateModelSettingsUi();
		}
	}

	function resolveCloudTtsProvider(backend) {
		const value = String(backend || '').toLowerCase();
		if (value === 'openai-cloud') return 'openai';
		if (value === 'elevenlabs-cloud') return 'elevenlabs';
		return 'groq';
	}

	// Half-duplex voice loop: while any TTS audio is audible, the mic is
	// hard-muted (track.enabled=false) and the sidecar drops residual chunks,
	// so Jarvis can never wake on / transcribe its own speech. AEC from the
	// getUserMedia constraints remains the first line of defence; this gate
	// is the guarantee.
	function setTtsPlaybackGate(active) {
		try {
			(voiceGateway || sidecar)?.setPlaybackActive?.(Boolean(active));
		} catch {
			// bridge unavailable — browser-only mode has no sidecar mic to gate
		}
	}

	function clearTtsAudioQueue() {
		ttsAudioChunkQueue.length = 0;
		ttsAudioChunkPlaying = false;
		setTtsPlaybackGate(false);
	}

	function playNextTtsChunk() {
		if (ttsAudioChunkPlaying) return;
		const next = ttsAudioChunkQueue.shift();
		if (!next) return;
		ttsAudioChunkPlaying = true;
		try {
			const AudioContext = window.AudioContext || window.webkitAudioContext;
			if (!AudioContext) {
				ttsAudioChunkPlaying = false;
				return;
			}
			const actx = new AudioContext();
			const binary = atob(next.data);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
			actx.decodeAudioData(bytes.buffer, (decoded) => {
				const source = actx.createBufferSource();
				source.buffer = decoded;
				source.connect(actx.destination);
				speechPlaybackActive = true;
				setTtsPlaybackGate(true);
				setVoiceVisualizer('speaking');
				source.onended = () => {
					ttsAudioChunkPlaying = false;
					speechPlaybackActive = false;
					if (ttsAudioChunkQueue.length === 0) {
						setVoiceVisualizer('idle');
						setTtsPlaybackGate(false);
					}
					actx.close().catch(() => null);
					playNextTtsChunk();
				};
				source.start(0);
			}, () => {
				ttsAudioChunkPlaying = false;
				speechPlaybackActive = false;
				if (ttsAudioChunkQueue.length === 0) setTtsPlaybackGate(false);
				actx.close().catch(() => null);
				playNextTtsChunk();
			});
		} catch {
			ttsAudioChunkPlaying = false;
			speechPlaybackActive = false;
			if (ttsAudioChunkQueue.length === 0) setTtsPlaybackGate(false);
			playNextTtsChunk();
		}
	}

	function enqueueTtsAudioChunk({ streamId, chunkIndex, data, format }) {
		if (!data) return;
		const normalizedStreamId = String(streamId || '');
		if (normalizedStreamId && ttsAudioActiveStreamId && normalizedStreamId !== ttsAudioActiveStreamId) {
			clearTtsAudioQueue();
		}
		if (normalizedStreamId) ttsAudioActiveStreamId = normalizedStreamId;
		if (ttsAudioChunkQueue.length >= MAX_TTS_AUDIO_QUEUE) {
			ttsAudioChunkQueue.shift();
		}
		ttsAudioChunkQueue.push({
			streamId: normalizedStreamId,
			chunkIndex: Number(chunkIndex || 0),
			data,
			format: format || 'wav',
		});
		ttsAudioChunkQueue.sort((a, b) => a.chunkIndex - b.chunkIndex);
		playNextTtsChunk();
	}

	function resetActiveAiStream() {
		if (activeAiStream.id && sidecar?.requestTtsStreamCancel) {
			sidecar.requestTtsStreamCancel(activeAiStream.id);
		}
		activeAiStream = {
			id: '',
			segmentsSent: 0,
			streamingEnabled: false,
		};
		ttsAudioActiveStreamId = '';
		clearTtsAudioQueue();
	}

	function localAssignmentValue(role) {
		if (!desktopLocalAssignment.serverId) return '';
		const modelId = desktopLocalAssignment[role];
		if (!modelId) return '';
		return `${desktopLocalAssignment.serverId}::${modelId}`;
	}

	function fillLocalModelSelect(selectNode, selectedValue) {
		if (!selectNode) return;
		const entries = ['<option value="">Use cloud auto-router</option>'];
		for (const server of desktopLocalServers) {
			if (!server?.enabled) continue;
			const models = Array.isArray(server.discoveredModels) ? server.discoveredModels : [];
			for (const model of models) {
				const value = `${server.id}::${model}`;
				const selected = value === selectedValue ? ' selected' : '';
				entries.push(
					`<option value="${escapeHtml(value)}"${selected}>${escapeHtml(server.label)} · ${escapeHtml(model)}</option>`,
				);
			}
		}
		selectNode.innerHTML = entries.join('');
	}

	function renderLocalServers() {
		if (localServerListNode) {
			if (!desktopLocalServers.length) {
				localServerListNode.textContent = 'No local servers configured.';
			} else {
				localServerListNode.innerHTML = desktopLocalServers.map((server) => {
					const models = Array.isArray(server.discoveredModels) && server.discoveredModels.length
						? server.discoveredModels.map((model) => escapeHtml(model)).join(', ')
						: 'no scanned models';
					const serverId = escapeHtml(server.id);
					return `
						<div style="border:1px solid rgba(148,163,184,.25);border-radius:10px;padding:8px;margin-bottom:8px;">
							<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
								<div>
									<div style="font-weight:600;">${escapeHtml(server.label)}</div>
									<div style="font-size:11px;opacity:.8;">${escapeHtml(server.baseUrl)} · ${escapeHtml(server.apiType)}</div>
									<div style="font-size:11px;opacity:.7;">${models}</div>
								</div>
								<div style="display:flex;gap:6px;flex-wrap:wrap;">
									<button type="button" class="secondary sm" data-local-scan="${serverId}">Scan</button>
									<button type="button" class="secondary sm" data-local-toggle="${serverId}">${server.enabled ? 'Disable' : 'Enable'}</button>
									<button type="button" class="danger sm" data-local-remove="${serverId}">Remove</button>
								</div>
							</div>
						</div>
					`;
				}).join('');
			}
		}

		fillLocalModelSelect(localChatModelSelect, localAssignmentValue('chatModelId'));
		fillLocalModelSelect(localCodeModelSelect, localAssignmentValue('codeModelId'));
		fillLocalModelSelect(localExternalModelSelect, localAssignmentValue('externalApiModelId'));
		fillLocalModelSelect(localVisionModelSelect, localAssignmentValue('visionModelId'));
		if (localPreferEnabledToggle) {
			localPreferEnabledToggle.checked = Boolean(desktopLocalAssignment.preferLocalWhenAvailable);
		}
	}

	async function loadLocalServersState() {
		if (!localServerApi) return;
		try {
			const [listRes, assignmentRes] = await Promise.all([
				localServerApi.list(),
				localServerApi.getModelAssignment(),
			]);
			desktopLocalServers = Array.isArray(listRes?.servers) ? listRes.servers : [];
			desktopLocalAssignment = {
				chatModelId: assignmentRes?.localModelAssignment?.chatModelId || null,
				codeModelId: assignmentRes?.localModelAssignment?.codeModelId || null,
				externalApiModelId: assignmentRes?.localModelAssignment?.externalApiModelId || null,
				visionModelId: assignmentRes?.localModelAssignment?.visionModelId || null,
				serverId: assignmentRes?.localModelAssignment?.serverId || null,
				preferLocalWhenAvailable: Boolean(assignmentRes?.preferLocalWhenAvailable),
			};
			renderLocalServers();
		} catch (error) {
			appendMessage(log, 'Local servers', `Failed to load local servers: ${error?.message || error}`, 'error');
		}
	}

	applyVoiceSettings(voiceSettings, { persist: false });
	void loadRuntimeModelConfig();
	void loadLocalServersState();
	localServerAddButton?.addEventListener('click', async () => {
		if (!localServerApi) return;
		const label = String(localServerLabelInput?.value || '').trim() || 'Local server';
		const baseUrl = String(localServerBaseUrlInput?.value || '').trim();
		const apiType = String(localServerApiTypeSelect?.value || 'ollama');
		if (!baseUrl) {
			appendMessage(log, 'Local servers', 'Base URL is required.', 'error');
			return;
		}
		const result = await localServerApi.add({ label, baseUrl, apiType, enabled: true });
		if (!result?.ok) {
			appendMessage(log, 'Local servers', `Failed to add server: ${result?.reason || result?.error || 'unknown error'}`, 'error');
			return;
		}
		if (localServerLabelInput) localServerLabelInput.value = '';
		await loadLocalServersState();
	});

	localServerListNode?.addEventListener('click', async (event) => {
		if (!localServerApi) return;
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;
		const scanId = target.getAttribute('data-local-scan');
		if (scanId) {
			const scanResult = await localServerApi.scan(scanId);
			if (!scanResult?.ok) {
				appendMessage(log, 'Local servers', `Scan failed: ${scanResult?.error || scanResult?.reason || 'unknown error'}`, 'error');
			}
			await loadLocalServersState();
			return;
		}
		const toggleId = target.getAttribute('data-local-toggle');
		if (toggleId) {
			const server = desktopLocalServers.find((entry) => entry.id === toggleId);
			if (!server) return;
			await localServerApi.update({ id: toggleId, patch: { enabled: !server.enabled } });
			await loadLocalServersState();
			return;
		}
		const removeId = target.getAttribute('data-local-remove');
		if (removeId) {
			await localServerApi.remove(removeId);
			await loadLocalServersState();
		}
	});

	localServerSaveAssignmentButton?.addEventListener('click', async () => {
		if (!localServerApi) return;
		const parseSelection = (value) => {
			const raw = String(value || '');
			if (!raw.includes('::')) return { serverId: null, modelId: null };
			const [serverId, modelId] = raw.split('::');
			return { serverId: serverId || null, modelId: modelId || null };
		};
		const chat = parseSelection(localChatModelSelect?.value);
		const code = parseSelection(localCodeModelSelect?.value);
		const external = parseSelection(localExternalModelSelect?.value);
		const vision = parseSelection(localVisionModelSelect?.value);
		const resolvedServerId = chat.serverId || code.serverId || external.serverId || vision.serverId || null;
		const result = await localServerApi.setModelAssignment({
			localModelAssignment: {
				serverId: resolvedServerId,
				chatModelId: chat.modelId,
				codeModelId: code.modelId,
				externalApiModelId: external.modelId,
				visionModelId: vision.modelId,
			},
			preferLocalWhenAvailable: Boolean(localPreferEnabledToggle?.checked),
		});
		if (!result?.ok) {
			appendMessage(log, 'Local servers', `Failed to save local routing: ${result?.reason || result?.error || 'unknown error'}`, 'error');
			return;
		}
		appendMessage(log, 'Local servers', 'Local model assignment saved.', 'system');
		await loadLocalServersState();
	});
	setVoiceVisualizer('idle');
	['mousemove', 'keydown', 'click', 'focus'].forEach((eventName) => {
		window.addEventListener(eventName, () => touchAgentActivity(), { passive: true });
	});

	function setAgentState(nextState) {
		const normalized = String(nextState || '').toUpperCase();
		const target = AGENT_STATE[normalized] || AGENT_STATE.IDLE;
		currentAgentState = target;
		if (typeof document !== 'undefined' && document.body) {
			document.body.dataset.agentState = target.toLowerCase();
		}
	}

	function touchAgentActivity() {
		if (voiceVisualizer) voiceVisualizer.classList.remove('dimmed');
		if (inactivityTimer) clearTimeout(inactivityTimer);
		inactivityTimer = setTimeout(() => {
			if (voiceVisualizer && currentAgentState === AGENT_STATE.IDLE) {
				voiceVisualizer.classList.add('dimmed');
			}
		}, 10_000);
	}

	// Idea #1 — Live waveform bars. Twelve <span>s under the orb that scale
	// from the rms_level stream. We keep a small ring buffer of recent
	// energies so the bars dance rather than all jumping together.
	const waveformBars = Array.from(document.querySelectorAll('#voice-waveform span'));
	const waveformHistory = new Array(waveformBars.length).fill(0);
	function updateWaveform(energy) {
		if (waveformBars.length === 0) return;
		waveformHistory.shift();
		waveformHistory.push(energy);
		const peak = Math.max(0.05, ...waveformHistory);
		for (let i = 0; i < waveformBars.length; i++) {
			const value = waveformHistory[i];
			const normalized = value / peak;
			const px = 4 + Math.round(normalized * 22); // 4–26 px
			waveformBars[i].style.height = `${px}px`;
		}
	}

	function applyVisualizerEnergy(nextEnergy = 0) {
		if (!voiceVisualizer) return;
		const clamped = Math.max(0, Math.min(1, Number(nextEnergy) || 0));
		visualizerEnergy = (visualizerEnergy * 0.72) + (clamped * 0.28);
		voiceVisualizer.style.setProperty('--voice-energy', visualizerEnergy.toFixed(4));
		updateWaveform(visualizerEnergy);
	}

	function setVoiceVisualizer(state, options = {}) {
		if (!voiceVisualizer) return;
		voiceVisualizer.classList.remove('listening', 'speaking', 'thinking');
		const statusEl = document.getElementById('voice-orb-status');
		const setStatus = (text) => { if (statusEl) statusEl.textContent = text; };
		// Mirror state into the palette context signals so predictive
		// suggestions reflect what's happening right now.
		try { (window.jarvisContext = window.jarvisContext || {}).voiceState = state || 'idle'; } catch { /* noop */ }
		// V2.0 voice-first priority: when the orb is listening or speaking,
		// dim peripherals (tab rail, sidebar, task list) so user focus locks
		// onto the conversation. Toggled via body.voice-priority class.
		try {
			const shouldPrioritize = state === 'listening' || state === 'speaking';
			document.body.classList.toggle('voice-priority', shouldPrioritize);
		} catch { /* DOM unavailable */ }
		// Mirror orb state into the task list so the agent's "inner monologue"
		// stays in sync with what users hear/see.
		if (state === 'listening') {
			voiceVisualizer.classList.add('listening');
			setAgentState(AGENT_STATE.LISTENING);
			setStatus('Listening…');
			setWakeChipState('listening', 'Listening — speak now');
			pushTaskStep('VOICE', 'Listening to microphone…', 'active');
			touchAgentActivity();
			return;
		}
		if (state === 'speaking') {
			voiceVisualizer.classList.add('speaking');
			setAgentState(AGENT_STATE.SPEAKING);
			setStatus('Speaking…');
			pushTaskStep('TTS', 'Synthesizing audio…', 'active');
			touchAgentActivity();
			return;
		}
		if (state === 'thinking') {
			voiceVisualizer.classList.add('thinking');
			setAgentState(AGENT_STATE.THINKING);
			setStatus('Thinking…');
			pushTaskStep('REASON', 'Reasoning over context…', 'active');
			touchAgentActivity();
			return;
		}
		setAgentState(AGENT_STATE.IDLE);
		setStatus('');
		// Restore wake-listening label when the orb returns to idle.
		if (voiceSettings?.sttEnabled && voiceSettings?.wakeWordEnabled) {
			setWakeChipState(null, `Say "${voiceSettings.wakeWordPhrase || 'Hey Jarvis'}"`);
		}
		if (options.resetEnergy !== false) applyVisualizerEnergy(0);
		touchAgentActivity();
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
			voiceInputButton.textContent = active ? '⏹ Stop' : (voiceSettings.sttEnabled ? '🎙 Mic' : '🎙 STT off');
			voiceInputButton.classList.toggle('active', Boolean(active));
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
			speechPlaybackActive = true;
			setTtsPlaybackGate(true);
			setVoiceVisualizer('speaking');
			utterance.onend = () => {
				speechPlaybackActive = false;
				setTtsPlaybackGate(false);
				setVoiceVisualizer('idle');
			};
			utterance.onerror = (errorEvent) => {
				speechPlaybackActive = false;
				setTtsPlaybackGate(false);
				setVoiceVisualizer('idle');
				if (isBenignSpeechError(errorEvent)) return;
				appendMessage(log, 'Text-to-speech', 'Speech playback failed.', 'error');
			};
			window.speechSynthesis.speak(utterance);
		} catch {
			speechPlaybackActive = false;
			setTtsPlaybackGate(false);
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
		if (statusNode) {
			statusNode.textContent = detail ? `${status}: ${detail}` : status;
		}
		try {
			setStatusDot(status);
		} catch (err) {
			console.warn('[renderer] setStatusDot failed:', err?.message || err);
		}
	}

	function updateAutoUpdateStatus(payload) {
		if (!updateStatusNode) return;
		const normalizedStatus = String(payload?.status || 'idle').toLowerCase();
		const reason = String(payload?.reason || '').toLowerCase();
		let detail = payload?.detail ? `${payload.status}: ${payload.detail}` : payload?.status || 'idle';
		if (normalizedStatus === 'error' || normalizedStatus === 'unavailable') {
			if (reason.includes('auth') || reason.includes('permission')) {
				detail = 'Updater: release feed configuration is invalid.';
			} else if (reason.includes('metadata')) {
				detail = 'Updater: release metadata is missing or invalid.';
			} else if (reason.includes('network') || reason.includes('offline')) {
				detail = 'Updater: feed unavailable due to network reachability.';
			}
		}
		const reasonLine = payload?.reason ? `\nreason: ${payload.reason}` : '';
		updateStatusNode.textContent = `${detail}${reasonLine}`;

		if (installUpdateButton) {
			installUpdateButton.hidden = !payload?.downloaded;
		}

		// Show "Download update" button if update is available but not yet
		// downloaded (secondary fallback path in settings panel).
		const downloadUpdateButton = document.getElementById('download-update');
		if (downloadUpdateButton) {
			const showDownload = (
				payload?.status === 'available' ||
				payload?.status === 'deferred'
			);
			downloadUpdateButton.hidden = !showDownload;
		}

		if (checkUpdatesButton) {
			checkUpdatesButton.disabled = payload?.status === 'checking' || payload?.status === 'downloading';
		}

		if (payload?.status === 'available' && updateModalManualFlow) {
			showUpdateModal({
				mode: 'available',
				payload,
			});
		} else if (payload?.status === 'downloading' && updateModalManualFlow) {
			showUpdateModal({
				mode: 'downloading',
				payload,
			});
		} else if (payload?.status === 'install-ready' && updateModalManualFlow) {
			showUpdateModal({
				mode: 'install-ready',
				payload,
			});
		} else if ((payload?.status === 'error' || payload?.status === 'unavailable') && updateModalManualFlow) {
			showUpdateModal({
				mode: 'error',
				payload,
			});
		}
	}

	function renderUpdateHighlights(payload) {
		if (!updateModalHighlights) return;
		updateModalHighlights.innerHTML = '';
		const highlights = Array.isArray(payload?.releaseNotes?.highlights)
			? payload.releaseNotes.highlights
			: [];
		const normalized = highlights
			.map((item) => String(item || '').trim())
			.filter(Boolean)
			.slice(0, 6);

		if (normalized.length === 0) {
			const fallback = document.createElement('li');
			fallback.textContent = 'Performance and stability improvements.';
			updateModalHighlights.appendChild(fallback);
			return;
		}

		normalized.forEach((item) => {
			const li = document.createElement('li');
			li.textContent = item;
			updateModalHighlights.appendChild(li);
		});
	}

	function parseReleaseNoteSegments(payload) {
		const fromMetadata = Array.isArray(payload?.releaseNotes?.metadata?.segments)
			? payload.releaseNotes.metadata.segments
			: [];
		const normalized = fromMetadata
			.map((segment) => {
				const title = String(segment?.title || '').trim();
				const items = Array.isArray(segment?.items)
					? segment.items.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8)
					: [];
				if (!title || items.length === 0) return null;
				return { title, items };
			})
			.filter(Boolean);
		if (normalized.length > 0) return normalized;

		const markdown = String(payload?.releaseNotes?.markdown || '').trim();
		if (!markdown) return [];
		return markdown
			.split(/\n(?=###\s+)/g)
			.map((chunk) => chunk.trim())
			.filter(Boolean)
			.map((chunk) => {
				const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean);
				const first = lines[0] || '';
				const title = first.replace(/^###\s*/, '').trim();
				const items = lines
					.filter((line) => /^[-*]\s+/.test(line))
					.map((line) => line.replace(/^[-*]\s+/, '').trim())
					.filter(Boolean)
					.slice(0, 8);
				if (!title || items.length === 0) return null;
				return { title, items };
			})
			.filter(Boolean);
	}

	function renderUpdateSegments(payload) {
		if (!updateModalSegments) return;
		updateModalSegments.innerHTML = '';
		const segments = parseReleaseNoteSegments(payload);
		if (segments.length === 0) {
			updateModalSegments.hidden = true;
			return;
		}
		updateModalSegments.hidden = false;
		segments.slice(0, 5).forEach((segment) => {
			const card = document.createElement('section');
			card.className = 'update-segment';
			const title = document.createElement('h4');
			title.className = 'update-segment-title';
			title.textContent = segment.title;
			card.appendChild(title);
			const list = document.createElement('ul');
			list.className = 'update-segment-items';
			segment.items.forEach((item) => {
				const li = document.createElement('li');
				li.textContent = item;
				list.appendChild(li);
			});
			card.appendChild(list);
			updateModalSegments.appendChild(card);
		});
	}

	function setUpdateModalVersion(payload) {
		if (!updateModalVersion) return;
		const version = String(payload?.version || '').trim();
		if (version) {
			updateModalVersion.textContent = `Version ${version}`;
			if (updateModalSource) {
				const source = String(payload?.releaseNotes?.source || 'unknown');
				updateModalSource.textContent = `Release notes source: ${source}`;
			}
			if (updateModalDetails) updateModalDetails.hidden = false;
			return;
		}
		updateModalVersion.textContent = 'Version details unavailable';
		if (updateModalSource) updateModalSource.textContent = '';
		if (updateModalDetails) updateModalDetails.hidden = true;
	}

	function renderUpdateMarkdown(payload) {
		if (!updateModalMarkdown) return;
		const markdown = String(payload?.releaseNotes?.markdown || '').trim();
		if (!markdown) {
			updateModalMarkdown.hidden = true;
			updateModalMarkdown.textContent = '';
			return;
		}
		updateModalMarkdown.hidden = false;
		updateModalMarkdown.textContent = markdown;
	}

	function closeUpdateModal() {
		if (!updateModalBackdrop) return;
		updateModalBackdrop.hidden = true;
		updateModalBackdrop.dataset.mode = '';
	}

	function showUpdateModal({ mode, payload }) {
		if (!updateModalBackdrop || !updateModalTitle || !updateModalSubtitle || !updateModalPrimaryButton || !updateModalSecondaryButton) return;

		updateModalBackdrop.hidden = false;
		updateModalBackdrop.dataset.mode = mode;
		if (updateModalBadge) {
			updateModalBadge.textContent = 'NEW';
		}
		renderUpdateHighlights(payload);
		renderUpdateSegments(payload);
		renderUpdateMarkdown(payload);
		setUpdateModalVersion(payload);
		if (updateModalProgress) updateModalProgress.hidden = true;
		if (updateModalError) {
			updateModalError.hidden = true;
			updateModalError.textContent = '';
		}
		updateModalSecondaryButton.hidden = false;
		updateModalPrimaryButton.disabled = false;

		if (mode === 'install-ready') {
			updateModalTitle.textContent = 'Restart AssistantX to update';
			updateModalSubtitle.textContent = 'The update has been downloaded and is ready to install.';
			updateModalPrimaryButton.textContent = 'Restart now';
			updateModalSecondaryButton.textContent = 'Later';
			return;
		}

		if (mode === 'downloading') {
			const progress = Math.max(0, Math.min(100, Number(payload?.downloadProgress || 0)));
			updateModalTitle.textContent = 'Downloading AssistantX update';
			updateModalSubtitle.textContent = 'Please keep AssistantX open while the update downloads.';
			updateModalPrimaryButton.textContent = 'Downloading…';
			updateModalPrimaryButton.disabled = true;
			updateModalSecondaryButton.textContent = 'Hide';
			if (updateModalProgress) updateModalProgress.hidden = false;
			if (updateProgressLabel) updateProgressLabel.textContent = 'Downloading…';
			if (updateProgressPercent) updateProgressPercent.textContent = `${Math.round(progress)}%`;
			if (updateProgressFill) updateProgressFill.style.width = `${Math.round(progress)}%`;
			return;
		}

		if (mode === 'error') {
			updateModalTitle.textContent = 'AssistantX update error';
			updateModalSubtitle.textContent = 'The updater could not complete this action.';
			updateModalPrimaryButton.textContent = 'Try again';
			updateModalSecondaryButton.textContent = 'Later';
			if (updateModalError) {
				updateModalError.hidden = false;
				updateModalError.textContent = payload?.detail || 'Unknown update error.';
			}
			return;
		}

		updateModalTitle.textContent = 'AssistantX update available';
		updateModalSubtitle.textContent = 'What’s new in this update:';
		updateModalPrimaryButton.textContent = 'Update now';
		updateModalSecondaryButton.textContent = 'Later';
	}

	// ── Prompt submission ────────────────────────────────────────────────────
	// Task Classifier integration
	function updateTaskClassificationDisplay(classification) {
		if (!classification) return;

		const displayEl = document.getElementById('task-classification-display');
		const badgeEl = document.getElementById('task-classification-badge');
		const pathLabelEl = document.getElementById('path-label');
		const pathConfEl = document.getElementById('path-confidence');
		const iconEl = badgeEl.querySelector('.badge-icon');

		// Remove all path classes and add the correct one
		badgeEl.classList.remove('path-a', 'path-b', 'path-c');

		const pathMap = {
			'vision_only': { class: 'path-a', label: '👁️ Vision Only (Fast)', icon: '👁️' },
			'vision_to_coder': { class: 'path-b', label: '🔄 Vision → Code (Relay)', icon: '🔄' },
			'text_only': { class: 'path-c', label: '💬 Text Only', icon: '💬' },
		};

		const pathInfo = pathMap[classification.path] || pathMap['text_only'];
		badgeEl.classList.add(pathInfo.class);
		iconEl.textContent = pathInfo.icon;
		pathLabelEl.textContent = pathInfo.label;
		pathConfEl.textContent = `(${Math.round(classification.confidence * 100)}%)`;

		displayEl.style.display = 'block';

		// Update model activity indicators
		updateModelActivityIndicators(classification);
	}

	function updateModelActivityIndicators(classification) {
		const visionInd = document.getElementById('vision-indicator');
		const coderInd = document.getElementById('coder-indicator');
		const displayEl = document.getElementById('model-activity-display');

		if (!visionInd || !coderInd) return;

		// Update vision indicator
		if (classification.needsVision) {
			visionInd.classList.remove('inactive');
			visionInd.classList.add('active');
		} else {
			visionInd.classList.remove('active');
			visionInd.classList.add('inactive');
		}

		// Update coder indicator
		if (classification.needsCoder) {
			coderInd.classList.remove('inactive');
			coderInd.classList.add('active');
		} else {
			coderInd.classList.remove('active');
			coderInd.classList.add('inactive');
		}

		// Show display if any model is needed
		if (classification.needsVision || classification.needsCoder) {
			displayEl.style.display = 'flex';
		} else {
			displayEl.style.display = 'none';
		}
	}

	function hideTaskClassificationDisplay() {
		const displayEl = document.getElementById('task-classification-display');
		const modelDisplayEl = document.getElementById('model-activity-display');
		if (displayEl) displayEl.style.display = 'none';
		if (modelDisplayEl) modelDisplayEl.style.display = 'none';
	}

	async function submitPrompt() {
		const text = input.value.trim();
		if (!text) return;
		voiceGateway?.interrupt?.('new-prompt');
		if (typeof window !== 'undefined' && window.speechSynthesis) {
			window.speechSynthesis.cancel();
		}

		// Classify the task using the imported task classifier
		if (typeof classify === 'function') {
			const hasImage = false; // TODO: detect if user attached image
			const classification = classify(text, hasImage);
			updateTaskClassificationDisplay(classification);
		}

		if (isScreenVisionPrompt(text)) {
			await captureScreenForVision({ prompt: text, autoSubmit: true });
			input.value = '';
			return;
		}

		const handled = await handleIntegratedCommands(text);
		if (handled) {
			input.value = '';
			hideTaskClassificationDisplay();
			return;
		}
		queuePromptExecution(text, { source: 'local', origin: 'desktop' });
		appendMessage(log, 'Prompt queued', text, 'system');
		// Surface in the Devin-style task list + persist to palette recents.
		pushTaskStep('PROMPT', text.length > 100 ? text.slice(0, 100) + '…' : text, 'done');
		pushTaskStep('ROUTER', 'Classifying intent and selecting model…', 'active');
		try { window.jarvisPaletteRecent?.push?.(text); } catch { /* palette not loaded */ }
		input.value = '';
	}

	function fallbackVoicePrompt(text) {
		if (!text) return;
		input.value = text;
		submitPrompt();
	}

	send.addEventListener('click', () => { void submitPrompt(); });
	input.addEventListener('keydown', (e) => { if (e.key === 'Enter') void submitPrompt(); });

	function startSpeechToText({ autoSubmit = false } = {}) {
		if (speechToTextActive) return;
		if (!voiceSettings.sttEnabled) {
			appendMessage(log, 'Speech-to-text', 'Speech-to-text is turned off in Jarvis app settings.', 'error');
			return;
		}

		const startBrowserSpeechToText = ({ announceFallback = false } = {}) => {
			const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
			if (!SpeechRecognitionCtor) {
				appendMessage(log, 'Speech-to-text', 'Speech recognition is not available in this Jarvis build.', 'error');
				return;
			}
			if (announceFallback) {
				appendMessage(log, 'Speech-to-text', 'Switching to browser speech recognition fallback.', 'system');
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
		};

		if (sidecarConnected && sidecar) {
			setVoiceToTextUiActive(true);
			const bridge = voiceGateway || sidecar;
			bridge.setListeningForCommand(true);
			bridge.startAudioCapture()
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
					bridge.setListeningForCommand(false);
					setVoiceToTextUiActive(false);
					startBrowserSpeechToText({ announceFallback: true });
				});
			return;
		}
		startBrowserSpeechToText();
	}

	function stopSpeechToText() {
		if (sidecarConnected && sidecar) {
			sidecarManualListening = false;
			if (voiceGateway) {
				voiceGateway.setListeningForCommand(false);
			} else {
				sidecar.setListeningForCommand(false);
			}
			setVoiceToTextUiActive(false);
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
			const nextBackend = ttsBackendSelect?.value || 'kokoro-local';
			applyVoiceSettings({
				...voiceSettings,
				chatModel: chatModelSelect?.value || 'auto-smart',
				sttEnabled: Boolean(sttEnabledToggle?.checked),
				sttModel: normalizeSttModel(sttModelSelect?.value || 'base'),
				ttsEnabled: Boolean(autoTtsToggle?.checked),
				ttsBackend: nextBackend,
				ttsModel: normalizeTtsModel(ttsModelSelect?.value || DEFAULT_LOCAL_TTS_MODEL, nextBackend),
				ttsVoiceId: ttsVoiceProfileSelect?.value || 'jarvis',
				wakeWordEnabled: Boolean(wakeWordEnabledToggle?.checked),
				wakeWordPhrase: wakeWordPhraseInput?.value?.trim() || DEFAULT_JARVIS_WAKE_PHRASE,
				allowBackgroundWake: Boolean(allowBackgroundWakeToggle?.checked),
				noiseSuppressionEnabled: noiseSuppressionToggle ? Boolean(noiseSuppressionToggle.checked) : voiceSettings.noiseSuppressionEnabled !== false,
				wakeWordSensitivity: wakeSensitivitySlider
					? Math.min(1, Math.max(0, Number(wakeSensitivitySlider.value) / 100))
					: (Number.isFinite(Number(voiceSettings.wakeWordSensitivity)) ? Number(voiceSettings.wakeWordSensitivity) : 0.5),
				micInputDeviceId: micDeviceSelect ? String(micDeviceSelect.value || '') : (voiceSettings.micInputDeviceId || ''),
				voiceLanguage: getVoiceLanguage(),
				autoTts: Boolean(autoTtsToggle?.checked),
				providerMode: voiceProviderModeSelect?.value || 'assistantx-server',
				temporalAwareness: Boolean(temporalAwarenessToggle?.checked),
				proactiveReminders: Boolean(proactiveRemindersToggle?.checked),
				ambientAnnouncements: Boolean(ambientAnnouncementsToggle?.checked),
				dailySummary: Boolean(dailySummaryToggle?.checked),
				reminderVoiceStyle: reminderVoiceStyleSelect?.value || 'neutral',
			});
			// Push the saved values to the live pipeline immediately — saving
			// previously only persisted to localStorage, so nothing changed
			// until an app restart (part of the "settings do nothing" bug).
			syncSidecarVoiceSettings();
			appendMessage(log, 'Settings', 'Voice settings saved.');
		});
	}

	// ── Settings → Audio: mic device picker + wake sensitivity + mic test ────
	async function populateMicDeviceSelect() {
		if (!micDeviceSelect) return;
		const bridge = voiceGateway || sidecar;
		const devices = bridge?.listAudioInputDevices ? await bridge.listAudioInputDevices() : [];
		const current = voiceSettings.micInputDeviceId || '';
		const options = ['<option value="">System default microphone</option>'];
		for (const device of devices) {
			const value = escapeHtml(device.deviceId);
			const label = escapeHtml(device.label);
			options.push(`<option value="${value}"${device.deviceId === current ? ' selected' : ''}>${label}</option>`);
		}
		micDeviceSelect.innerHTML = options.join('');
	}

	if (micDeviceSelect) {
		populateMicDeviceSelect().catch(() => null);
		if (navigator?.mediaDevices?.addEventListener) {
			navigator.mediaDevices.addEventListener('devicechange', () => {
				populateMicDeviceSelect().catch(() => null);
			});
		}
		micDeviceSelect.addEventListener('change', () => {
			const deviceId = String(micDeviceSelect.value || '');
			applyVoiceSettings({ ...voiceSettings, micInputDeviceId: deviceId });
			(voiceGateway || sidecar)?.setInputDevice?.(deviceId);
		});
	}

	if (wakeSensitivitySlider) {
		wakeSensitivitySlider.addEventListener('input', () => {
			if (wakeSensitivityValueNode) {
				wakeSensitivityValueNode.textContent = `${Math.round(Number(wakeSensitivitySlider.value) || 0)}%`;
			}
		});
		wakeSensitivitySlider.addEventListener('change', () => {
			const sensitivity = Math.min(1, Math.max(0, Number(wakeSensitivitySlider.value) / 100));
			applyVoiceSettings({ ...voiceSettings, wakeWordSensitivity: sensitivity });
			syncSidecarVoiceSettings();
		});
	}

	if (noiseSuppressionToggle) {
		noiseSuppressionToggle.addEventListener('change', () => {
			applyVoiceSettings({ ...voiceSettings, noiseSuppressionEnabled: Boolean(noiseSuppressionToggle.checked) });
			syncSidecarVoiceSettings();
		});
	}

	// Mic test: 5-second live level meter fed by local capture RMS — works
	// even when the sidecar is down because levels are computed renderer-side.
	let micTestActive = false;
	let micTestStopTimer = null;
	let micTestUnsubscribe = null;
	let micTestStartedCapture = false;
	function stopMicTest(message) {
		micTestActive = false;
		clearTimeout(micTestStopTimer);
		micTestStopTimer = null;
		if (micTestUnsubscribe) {
			try { micTestUnsubscribe(); } catch { /* listener already gone */ }
			micTestUnsubscribe = null;
		}
		if (micTestStartedCapture) {
			micTestStartedCapture = false;
			try { sidecar?.stopAudioCapture?.(); } catch { /* already stopped */ }
		}
		if (micTestButton) micTestButton.textContent = '🎙 Test microphone';
		if (micTestMeterFill) micTestMeterFill.style.width = '0%';
		if (micTestStatusNode && message) micTestStatusNode.textContent = message;
	}
	if (micTestButton) {
		micTestButton.addEventListener('click', async () => {
			if (micTestActive) {
				stopMicTest('Mic test stopped.');
				return;
			}
			const bridge = sidecar;
			if (!bridge?.on || !bridge?.startAudioCapture) {
				if (micTestStatusNode) micTestStatusNode.textContent = 'Mic test requires the local voice runtime.';
				return;
			}
			micTestActive = true;
			micTestButton.textContent = '⏹ Stop test';
			if (micTestStatusNode) micTestStatusNode.textContent = 'Listening… speak into the microphone.';
			let peak = 0;
			micTestUnsubscribe = bridge.on('mic_level', ({ rms }) => {
				const level = Math.min(1, Math.max(0, Number(rms || 0) * 6));
				if (level > peak) peak = level;
				if (micTestMeterFill) micTestMeterFill.style.width = `${Math.round(level * 100)}%`;
			});
			try {
				const wasCapturing = Boolean(bridge.isCapturing?.());
				await bridge.startAudioCapture();
				micTestStartedCapture = !wasCapturing;
			} catch (error) {
				stopMicTest(formatVoiceCaptureError(error));
				return;
			}
			micTestStopTimer = setTimeout(() => {
				const verdict = peak > 0.04
					? `Microphone works — peak level ${Math.round(peak * 100)}%.`
					: 'No signal detected — check the selected device and system permissions.';
				stopMicTest(verdict);
			}, 5000);
		});
	}

	if (chatModelSelect) {
		chatModelSelect.addEventListener('change', () => {
			applyVoiceSettings({ ...voiceSettings, chatModel: chatModelSelect.value });
		});
	}

	if (sttModelSelect) {
		sttModelSelect.addEventListener('change', () => {
			applyVoiceSettings({ ...voiceSettings, sttModel: normalizeSttModel(sttModelSelect.value) });
		});
	}

	if (ttsModelSelect) {
		ttsModelSelect.addEventListener('change', () => {
			applyVoiceSettings({ ...voiceSettings, ttsModel: normalizeTtsModel(ttsModelSelect.value, voiceSettings.ttsBackend) });
		});
	}

	if (ttsBackendSelect) {
		ttsBackendSelect.addEventListener('change', () => {
			const nextBackend = ttsBackendSelect.value || 'kokoro-local';
			applyVoiceSettings({
				...voiceSettings,
				ttsBackend: nextBackend,
				ttsModel: normalizeTtsModel(voiceSettings.ttsModel, nextBackend),
			});
			resetActiveAiStream();
			syncSidecarVoiceSettings();
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

	if (voiceProviderModeSelect) {
		voiceProviderModeSelect.addEventListener('change', () => {
			applyVoiceSettings({ ...voiceSettings, providerMode: voiceProviderModeSelect.value || 'assistantx-server' });
			syncSidecarVoiceSettings();
		});
	}

	[temporalAwarenessToggle, proactiveRemindersToggle, ambientAnnouncementsToggle, dailySummaryToggle].forEach((toggle) => {
		toggle?.addEventListener('change', () => {
			applyVoiceSettings({
				...voiceSettings,
				temporalAwareness: Boolean(temporalAwarenessToggle?.checked),
				proactiveReminders: Boolean(proactiveRemindersToggle?.checked),
				ambientAnnouncements: Boolean(ambientAnnouncementsToggle?.checked),
				dailySummary: Boolean(dailySummaryToggle?.checked),
			});
		});
	});

	if (reminderVoiceStyleSelect) {
		reminderVoiceStyleSelect.addEventListener('change', () => {
			applyVoiceSettings({ ...voiceSettings, reminderVoiceStyle: reminderVoiceStyleSelect.value || 'neutral' });
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

	// ── Browser wake-word FALLBACK ────────────────────────────────────────────
	// Previously this SpeechRecognition listener started unconditionally at
	// boot and restarted itself forever in onend — even while the Python
	// sidecar ran its own wake-word capture. That meant two competing mic
	// consumers, and (since Electron has no Google speech backend) an
	// error→restart hot loop that kept the OS mic indicator permanently on.
	// It is now started only when the sidecar pipeline is unavailable, and
	// backs off permanently after repeated errors.
	let wakeRecognition = null;
	let browserWakeWanted = false;
	let browserWakeErrorCount = 0;
	const BROWSER_WAKE_MAX_ERRORS = 3;

	function stopBrowserWakeFallback() {
		browserWakeWanted = false;
		if (wakeRecognition) {
			const recognitionToStop = wakeRecognition;
			wakeRecognition = null;
			try { recognitionToStop.stop(); } catch { /* already stopped */ }
		}
	}

	function startBrowserWakeFallback() {
		if (browserWakeWanted || !voiceSettings.wakeWordEnabled) return;
		if (!supportsSpeechRecognition()) return;
		const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
		if (!SpeechRecognitionCtor) return;
		browserWakeWanted = true;
		browserWakeErrorCount = 0;
		wakeRecognition = new SpeechRecognitionCtor();
		wakeRecognition.lang = getVoiceLanguage();
		wakeRecognition.continuous = true;
		wakeRecognition.interimResults = true;
		wakeRecognition.onresult = (event) => {
			browserWakeErrorCount = 0;
			if (!voiceSettings.wakeWordEnabled) return;
			if (!voiceSettings.allowBackgroundWake && !document.hasFocus()) return;
			if (speechPlaybackActive) return; // don't wake on our own TTS audio
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
		wakeRecognition.onerror = () => {
			browserWakeErrorCount += 1;
			if (browserWakeErrorCount >= BROWSER_WAKE_MAX_ERRORS) {
				appendMessage(log, 'Wake word', 'Browser wake listener unavailable — giving up after repeated errors.', 'system');
				stopBrowserWakeFallback();
			}
		};
		wakeRecognition.onend = () => {
			if (!browserWakeWanted || !wakeRecognition) return;
			if (browserWakeErrorCount >= BROWSER_WAKE_MAX_ERRORS) return;
			// Restart with a delay instead of the old synchronous hot loop.
			setTimeout(() => {
				if (!browserWakeWanted || !wakeRecognition) return;
				try { wakeRecognition.start(); } catch { /* retried on next onend */ }
			}, 1000);
		};
		try {
			wakeRecognition.start();
		} catch (error) {
			appendMessage(log, 'Wake word', `Wake listener failed to start: ${error?.message || 'unknown error'}`, 'error');
			stopBrowserWakeFallback();
		}
	}
	// Started from sidecar 'unavailable'/'disconnected' handlers below — the
	// sidecar's OpenWakeWord path owns wake detection whenever it is alive.
	if (!sidecar) startBrowserWakeFallback();

	// ── Python sidecar voice pipeline ─────────────────────────────────────────
	// Connects to the local AI-Agent WebSocket sidecar (ws://127.0.0.1:8765).
	// When connected, the sidecar handles wake word, STT, TTS, and NLP.
	// The browser Speech APIs above remain as automatic fallback.
	function setupSidecar() {
		if (!sidecar) return;

		sidecar.on('connected', () => {
			pushTaskStep('SIDECAR', 'Connected to AI runtime', 'done');
			try { (window.jarvisContext = window.jarvisContext || {}).sidecarStatus = 'connected'; } catch { /* noop */ }
			// Sidecar owns wake-word detection — shut down the browser fallback
			// so only one pipeline consumes the microphone.
			stopBrowserWakeFallback();
			sidecarConnected = true;
			sidecarCapabilities = sidecar.getCapabilities ? sidecar.getCapabilities() || sidecarCapabilities : sidecarCapabilities;
			appendMessage(log, 'AI Sidecar', '🤖 Python voice sidecar connected (offline mode active).', 'system');
			const configuration = {
				wakeWordPhrase: voiceSettings.wakeWordPhrase || DEFAULT_JARVIS_WAKE_PHRASE,
				language: (voiceSettings.voiceLanguage || 'en-US').split('-')[0],
				wakeWordEnabled: Boolean(voiceSettings.wakeWordEnabled),
				sttEnabled: false,
				ttsEnabled: Boolean(voiceSettings.autoTts && isLocalTtsBackend(voiceSettings.ttsBackend)),
				ttsBackend: resolveLocalTtsBackend(voiceSettings.ttsBackend),
				nlpEnabled: false,
				vadEnabled: true,
				noiseSuppressionEnabled: voiceSettings.noiseSuppressionEnabled !== false,
				wakeWordSensitivity: Number.isFinite(Number(voiceSettings.wakeWordSensitivity))
					? Number(voiceSettings.wakeWordSensitivity)
					: 0.5,
				sampleRate: 16000,
			};
			sidecar.configure(configuration);
			if (voiceSettings.micInputDeviceId) {
				sidecar.setInputDevice?.(voiceSettings.micInputDeviceId);
			}
			voiceGateway?.configure({
				...configuration,
				providerMode: voiceSettings.providerMode || 'assistantx-server',
				sttModel: voiceSettings.sttModel,
				persona: voiceSettings.ttsVoiceId,
				ttsBackend: voiceSettings.ttsBackend || 'kokoro-local',
				ttsModel: voiceSettings.ttsModel || (isLocalTtsBackend(voiceSettings.ttsBackend) ? DEFAULT_LOCAL_TTS_MODEL : DEFAULT_CLOUD_TTS_MODEL),
				fallbackToBrowserSpeech: true,
			});
			// V2.0 — always-on wake-word listening replaces the legacy click-
			// to-talk button. If STT is enabled (default), spin the mic up
			// immediately so the user can just say "Hey Jarvis" without
			// touching the UI. Catch permission errors so the chip can
			// surface them instead of silently dying.
			if (voiceSettings.sttEnabled && voiceSettings.wakeWordEnabled) {
				pushTaskStep('MIC', 'Starting always-on wake-word listening…', 'active');
				(voiceGateway || sidecar).startAudioCapture()
					.then(() => {
						setWakeChipState(null, `Say "${voiceSettings.wakeWordPhrase || 'Hey Jarvis'}"`);
						pushTaskStep('MIC', 'Always-on listening active', 'done');
						document.body.classList.add('mic-active');
					})
					.catch((err) => {
						const msg = String(err?.message || err || 'unknown');
						setWakeChipState('error', /permission|notallowed/i.test(msg) ? 'Mic permission denied' : 'Mic unavailable');
						pushTaskStep('MIC', `Always-on listening failed: ${msg}`, 'error');
						document.body.classList.remove('mic-active');
					});
			} else {
				setWakeChipState('disabled', voiceSettings.sttEnabled ? 'Wake word off' : 'Voice off');
				document.body.classList.remove('mic-active');
			}
		});

		sidecar.on('disconnected', () => {
			pushTaskStep('SIDECAR', 'Disconnected from AI runtime — self-heal pending', 'error');
			try { (window.jarvisContext = window.jarvisContext || {}).sidecarStatus = 'disconnected'; } catch { /* noop */ }
			setWakeChipState('error', 'Reconnecting…');
			sidecarConnected = false;
			sidecarManualListening = false;
			resetActiveAiStream();
			setVoiceToTextUiActive(false);
			appendMessage(log, 'AI Sidecar', 'Python voice sidecar disconnected — using browser fallback.', 'system');
			startBrowserWakeFallback();
		});

		sidecar.on('unavailable', () => {
			// Emitted once after all reconnect attempts are exhausted without ever
			// connecting — sidecar is not installed or Python is not available.
			sidecarConnected = false;
			resetActiveAiStream();
			appendMessage(log, 'AI Sidecar', 'Python voice sidecar is not available — voice will use browser speech APIs, and text AI chat will still work.', 'system');
			startBrowserWakeFallback();
		});

		sidecar.on('vad_event', ({ phase }) => {
			if (phase === 'listen_timeout') {
				// Wake word armed the mic but no speech arrived — return to idle
				// instead of hanging in "Listening — speak now" forever.
				setVoiceVisualizer('idle');
				if (sidecarManualListening) {
					sidecarManualListening = false;
					setVoiceToTextUiActive(false);
				}
				pushTaskStep('VOICE', 'No speech detected — listening ended', 'done');
				return;
			}
			if (phase === 'speech_end') {
				setVoiceVisualizer('thinking');
			}
		});

		sidecar.on('error', (error) => {
			appendMessage(log, 'AI Sidecar', formatVoiceCaptureError(error), 'error');
			if (sidecarManualListening) {
				sidecarManualListening = false;
				setVoiceToTextUiActive(false);
			}
		});

		sidecar.on('status', (payload) => {
			if (payload?.capabilities && typeof payload.capabilities === 'object') {
				sidecarCapabilities = {
					...sidecarCapabilities,
					...payload.capabilities,
				};
			}
			if (payload?.phase && payload.phase !== 'connected' && payload.phase !== 'configured') {
				appendMessage(log, 'AI Sidecar', payload.message || payload.phase, 'system');
			}
		});

		sidecar.on('capabilities', (payload) => {
			sidecarCapabilities = {
				...sidecarCapabilities,
				...(payload || {}),
			};
		});

		sidecar.on('wake_word', () => {
			if (!voiceSettings.allowBackgroundWake && !document.hasFocus()) return;
			appendMessage(log, 'AI Sidecar', `Wake word detected — listening…`);
			pushTaskStep('WAKE', 'Wake word "Hey Jarvis" detected', 'done');
			setVoiceVisualizer('listening');
			setWakeChipState('listening', 'Listening — speak now');
			(voiceGateway || sidecar).setListeningForCommand(true);
		});

		// V2.0 — Python sidecar streams reasoning steps via 'task_step' events.
		// We maintain a Map of stepId → DOM element so the same row can flip
		// from active → done/error when the sidecar emits a second message
		// with the same stepId (matches the Devin pattern of replacing rows
		// in place rather than appending duplicates).
		const sidecarTaskStepIndex = new Map();
		sidecar.on('task_step', ({ category, message, status, stepId }) => {
			const existing = stepId ? sidecarTaskStepIndex.get(stepId) : null;
			if (existing && existing.isConnected) {
				try { updateTaskStep(existing, status, message); }
				catch { /* updater rejected DOM node */ }
				if (status === 'done' || status === 'error') sidecarTaskStepIndex.delete(stepId);
				return;
			}
			const el = pushTaskStep(category, message, status);
			if (el && stepId) {
				sidecarTaskStepIndex.set(stepId, el);
				if (status === 'done' || status === 'error') {
					// One-shot terminal step — drop the entry immediately.
					setTimeout(() => sidecarTaskStepIndex.delete(stepId), 0);
				}
			}
		});

		sidecar.on('rms_level', ({ rms }) => {
			// Energy only. The old handler flipped the whole agent state to
			// LISTENING whenever ambient mic RMS crossed ~0.004 (and to
			// SPEAKING on TTS RMS), which spammed "Listening to microphone…"
			// into the activity feed on any background noise and made the app
			// look permanently hot-mic'd. State transitions are owned by the
			// wake-word/VAD/TTS events, not by raw level telemetry.
			const scaled = Math.min(1, Math.max(0, Number(rms || 0) * 5.25));
			applyVisualizerEnergy(scaled);
			if (scaled > 0.01) touchAgentActivity();
		});

		sidecar.on('stt_result', ({ text, isFinal }) => {
			if (!text) return;
			input.value = text;
			if (isFinal) {
				pushTaskStep('STT', `Transcribed: "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`, 'done');
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
				if (!voiceGateway) {
					sidecar.requestIntentParse(text, requestId);
				}
			} else {
				setVoiceVisualizer('listening');
			}
		});

		sidecar.on('tts_audio', ({ data, format, requestId }) => {
			if (!data || !voiceSettings.autoTts) return;
			enqueueTtsAudioChunk({
				streamId: requestId || '',
				chunkIndex: 0,
				data,
				format,
			});
		});

		sidecar.on('tts_audio_chunk', ({ requestId, chunkIndex, data, format }) => {
			if (!data || !voiceSettings.autoTts) return;
			enqueueTtsAudioChunk({
				streamId: requestId || '',
				chunkIndex: Number(chunkIndex || 0),
				data,
				format,
			});
		});

		sidecar.on('tts_stream_done', ({ requestId }) => {
			if (requestId && activeAiStream.id === requestId) {
				activeAiStream = {
					...activeAiStream,
					id: '',
				};
			}
		});

		sidecar.on('intent_parsed', ({ requestId, intent, entities, confidence }) => {
			if (requestId && pendingVoiceIntentRequestId === requestId) {
				pendingVoiceIntentRequestId = null;
				clearTimeout(pendingVoiceIntentFallbackTimer);
				pendingVoiceIntentFallbackTimer = null;
			}
			pushTaskStep('INTENT', `Parsed "${intent || 'unknown'}" (confidence ${Math.round((confidence || 0) * 100)}%)`, confidence >= 0.6 ? 'done' : 'error');
			try { (window.jarvisContext = window.jarvisContext || {}).lastIntent = intent || 'unknown'; } catch { /* noop */ }
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
				add_reminder: 'addReminder',
			};
			const command = INTENT_TO_COMMAND[intent];
			if (!command) {
				if (entities?.transcript) fallbackVoicePrompt(entities.transcript);
				return;
			}
			let payload = { command, ...entities, admin: Boolean(entities?.admin || entities?.qualifiers?.admin) };
			if (command === 'addReminder') {
				const phrase = String(entities?.time_phrase || entities?.reminder_text || entities?.transcript || '').trim();
				const parsed = temporalApi?.parseRelativeTime ? temporalApi.parseRelativeTime(phrase) : null;
				if (!parsed?.triggerAt) {
					appendMessage(log, 'Reminder', 'I heard a reminder, but could not parse the time.', 'error');
					if (entities?.transcript) fallbackVoicePrompt(entities.transcript);
					return;
				}
				payload = {
					...payload,
					text: String(entities?.reminder_text || phrase || 'Reminder'),
					temporal: parsed,
				};
			}
			input.value = '';
			void executeStructuredCommand(
				payload,
				{ source: 'local', origin: 'sidecar' },
			);
		});

		sidecar.on('memory_search_result', ({ results }) => {
			const hitCount = Array.isArray(results) ? results.length : 0;
			if (hitCount > 0) {
				appendMessage(log, 'Context', `Memory retrieval found ${hitCount} relevant items.`, 'system', ['context:memory']);
			}
		});

		sidecar.on('tool_result', ({ tool, ok, results }) => {
			pushTaskStep('TOOL', `${tool || 'unknown tool'} ${ok ? 'completed' : 'failed'}`, ok ? 'done' : 'error');
			if (tool !== 'web_search') return;
			const count = Array.isArray(results) ? results.length : 0;
			const tone = ok ? 'system' : 'error';
			appendMessage(
				log,
				'Context',
				ok ? `Web context retrieved (${count} results).` : 'Web context retrieval failed.',
				tone,
				['context:web'],
			);
		});

		function syncSidecarConnection(status) {
			const normalizedStatus = String(status || 'unknown').toLowerCase();
			if (normalizedStatus === 'running') {
				sidecar.connect();
				voiceGateway?.connect();
				return;
			}
			sidecar.disconnect?.();
			sidecarConnected = false;
		}

		voiceGateway?.on('stt_result', ({ text, isFinal }) => {
			if (!text) return;
			input.value = text;
			if (isFinal) {
				setVoiceVisualizer('idle');
				if (sidecarManualListening) {
					sidecarManualListening = false;
					setVoiceToTextUiActive(false);
				}
			} else {
				setVoiceVisualizer('listening');
			}
		});
		voiceGateway?.on('route', ({ mode }) => {
			if (mode) appendMessage(log, 'Voice route', `Routing via ${mode}`, 'system');
		});
		voiceGateway?.on('rms_level', ({ rms }) => {
			const scaled = Math.min(1, Math.max(0, Number(rms || 0) * 5.25));
			applyVisualizerEnergy(scaled);
			if (scaled > 0.01) touchAgentActivity();
		});
		voiceGateway?.on('fallback_required', () => {
			appendMessage(log, 'Voice gateway', 'Falling back to browser speech APIs.', 'system');
		});
		if (ipcRenderer?.invoke) {
			ipcRenderer.invoke('get-sidecar-status')
				.then((payload) => {
					syncSidecarConnection(payload?.status);
				})
				.catch(() => null);
		}
		if (ipcRenderer?.on) {
			ipcRenderer.on('sidecar-status', (payload) => {
				syncSidecarConnection(payload?.status);
			});
		}
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
			sttEnabled: false,
			ttsEnabled: Boolean(voiceSettings.autoTts && isLocalTtsBackend(voiceSettings.ttsBackend)),
			ttsBackend: resolveLocalTtsBackend(voiceSettings.ttsBackend),
			nlpEnabled: false,
			vadEnabled: true,
			noiseSuppressionEnabled: voiceSettings.noiseSuppressionEnabled !== false,
			wakeWordSensitivity: Number.isFinite(Number(voiceSettings.wakeWordSensitivity))
				? Number(voiceSettings.wakeWordSensitivity)
				: 0.5,
		});
		if (voiceSettings.micInputDeviceId) {
			sidecar.setInputDevice?.(voiceSettings.micInputDeviceId);
		}
		voiceGateway?.configure({
			providerMode: voiceSettings.providerMode || 'assistantx-server',
			wakeWordPhrase: voiceSettings.wakeWordPhrase || DEFAULT_JARVIS_WAKE_PHRASE,
			language: (voiceSettings.voiceLanguage || 'en-US').split('-')[0],
			wakeWordEnabled: Boolean(voiceSettings.wakeWordEnabled),
			sttModel: voiceSettings.sttModel,
			persona: voiceSettings.ttsVoiceId,
			ttsBackend: voiceSettings.ttsBackend || 'kokoro-local',
			ttsModel: voiceSettings.ttsModel || (isLocalTtsBackend(voiceSettings.ttsBackend) ? DEFAULT_LOCAL_TTS_MODEL : DEFAULT_CLOUD_TTS_MODEL),
			fallbackToBrowserSpeech: true,
		});
		if (voiceSettings.wakeWordEnabled && !sidecar.isCapturing()) {
			(voiceGateway || sidecar).startAudioCapture().catch(() => null);
		} else if (!voiceSettings.wakeWordEnabled && sidecar.isCapturing()) {
			(voiceGateway || sidecar).stopAudioCapture();
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
	async function speakWithSidecar(text) {
		const enhanced = temporalApi?.enhanceSpeechText
			? temporalApi.enhanceSpeechText(text, {
				temporalAwareness: Boolean(voiceSettings.temporalAwareness),
			})
			: text;
		const ttsBackend = voiceSettings.ttsBackend || 'kokoro-local';
		const localBackend = isLocalTtsBackend(ttsBackend);
		if (!localBackend && sidecarConnected && voiceSettings.autoTts && voiceGateway) {
			const tts = await voiceGateway.synthesize(enhanced, {
				persona: voiceSettings.ttsVoiceId,
				language: getVoiceLanguage(),
				model: voiceSettings.ttsModel || DEFAULT_CLOUD_TTS_MODEL,
				provider: resolveCloudTtsProvider(ttsBackend),
			});
			if (tts?.ok && tts.audioBase64) {
				try {
					const AudioContext = window.AudioContext || window.webkitAudioContext;
					if (AudioContext) {
						const actx = new AudioContext();
						const binary = atob(tts.audioBase64);
						const bytes = new Uint8Array(binary.length);
						for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
						actx.decodeAudioData(bytes.buffer, (decoded) => {
							const source = actx.createBufferSource();
							source.buffer = decoded;
							source.connect(actx.destination);
							speechPlaybackActive = true;
							setTtsPlaybackGate(true);
							setVoiceVisualizer('speaking');
							source.onended = () => {
								speechPlaybackActive = false;
								setTtsPlaybackGate(false);
								setVoiceVisualizer('idle');
								actx.close().catch(() => null);
							};
							source.start(0);
						}, () => {
							setTtsPlaybackGate(false);
							actx.close().catch(() => null);
						});
						return;
					}
				} catch {
					// Continue to fallback.
				}
			}
		}
		if (localBackend && sidecarConnected && sidecar && voiceSettings.autoTts) {
			const requestId = `tts-${Date.now()}`;
			sidecar.requestTts(enhanced, requestId);
			return;
		}
		await speakResponse(enhanced);
	}

	if (ipcRenderer) {
		ipcRenderer.on('sidecar-status', (payload) => {
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

		ipcRenderer.on('app-meta', (meta) => {
			appVersionNode.textContent = meta.packaged
				? `v${meta.version}`
				: `v${meta.version} (dev mode, updater off)`;
		});

		ipcRenderer.on('auto-update-status', (payload) => {
			updateAutoUpdateStatus(payload);

			if (['error', 'unavailable', 'install-ready'].includes(payload?.status)) {
				appendMessage(log, 'Updater', payload.detail || payload.status, payload?.status === 'error' ? 'error' : 'system');
			}
		});

		ipcRenderer.invoke('get-update-state').then((payload) => {
			if (payload && typeof payload === 'object') {
				updateAutoUpdateStatus(payload);
			}
		}).catch(() => null);

		ipcRenderer.on('desktop-health', (payload) => {
			const overall = String(payload?.overall || 'unknown');
			const componentList = Object.entries(payload?.components || {})
				.map(([name, component]) => {
					const status = component?.status || 'unknown';
					const detail = component?.detail ? ` — ${component.detail}` : '';
					return `${name}:${status}${detail}`;
				})
				.join(', ');
			appendMessage(log, 'Desktop health', `${overall} (${componentList || 'no component data'})`, overall === 'unavailable' ? 'error' : 'system');
		});
	}

	if (checkUpdatesButton && ipcRenderer) {
		checkUpdatesButton.addEventListener('click', async () => {
			updateModalManualFlow = true;
			const result = await ipcRenderer.invoke('check-for-updates');
			if (result?.ok === false && result.reason === 'not-packaged') {
				appendMessage(log, 'Updater', 'Running in dev mode — download and install the EXE to get automatic updates.', 'system');
				return;
			}
		});
	}

	// Auth feedback from main process
	if (ipcRenderer) {
		ipcRenderer.on('auth:login-timeout', (payload) => {
			appendMessage(log, 'Sign-in', payload?.message || 'Sign-in timed out. Please try again from Settings → Account.', 'error');
			showProviderWarning(payload?.message || 'Sign-in timed out. Retry from Settings → Account.');
		});
		ipcRenderer.on('auth:login-failed', (payload) => {
			appendMessage(log, 'Sign-in', payload?.message || 'Sign-in failed. Please try again.', 'error');
		});
		ipcRenderer.on('auth:login-success', () => {
			hideProviderWarning();
		});
		// V2.0 Health Observer pulses — surface subsystem state into the task
		// list, repaint the header connection dot, AND label the health chip
		// so the user has a glanceable summary of what's degraded.
		const healthState = { sidecar: 'unknown', ollama: 'unknown' };
		ipcRenderer.on('health:pulse', (payload) => {
			if (!payload?.subsystem) return;
			healthState[payload.subsystem] = payload.status;
			const dot = document.getElementById('header-connection-dot');
			const chip = document.getElementById('health-chip');
			const label = document.getElementById('health-chip-label');
			const worst = Object.values(healthState);
			const dotCls = worst.includes('unavailable') ? 'connection-bad'
				: worst.includes('degraded') ? 'connection-warn'
				: 'connection-ok';
			const chipCls = worst.includes('unavailable') ? 'bad'
				: worst.includes('degraded') ? 'warn'
				: '';
			if (dot) {
				dot.classList.remove('connection-bad', 'connection-warn', 'connection-ok');
				dot.classList.add(dotCls);
			}
			if (chip) {
				chip.classList.remove('warn', 'bad');
				if (chipCls) chip.classList.add(chipCls);
			}
			if (label) {
				const degraded = Object.entries(healthState)
					.filter(([, status]) => status === 'degraded' || status === 'unavailable')
					.map(([sub]) => sub);
				label.textContent = degraded.length === 0
					? 'All systems nominal'
					: `${degraded.join(' + ')} ${degraded.length === 1 ? 'degraded' : 'degraded'}`;
			}
		});
		ipcRenderer.on('health:heal-attempted', (payload) => {
			pushTaskStep('HEAL', `Auto-heal: ${payload?.subsystem} (was ${payload?.status})`, 'active');
		});
		ipcRenderer.on('health:heal-outcome', (payload) => {
			const status = payload?.ok ? 'done' : 'error';
			const msg = payload?.ok
				? `Auto-heal: ${payload.subsystem} recovered`
				: `Auto-heal: ${payload.subsystem} failed — ${payload.error || 'unknown'}`;
			pushTaskStep('HEAL', msg, status);
		});
	}

	if (ipcRenderer) {
		ipcRenderer.invoke('get-desktop-diagnostics').then((snapshot) => {
			if (!snapshot) return;
			appendMessage(log, 'Desktop diagnostics', `Startup status: ${snapshot.overall || 'unknown'}`, snapshot.overall === 'unavailable' ? 'error' : 'system');
		}).catch(() => null);

		if (typeof window.jarvisApi?.checkLocalAiSetup === 'function') {
			window.jarvisApi.checkLocalAiSetup().then(async (state) => {
				// Check if cloud mode is active without a session
				try {
					const modeResult = await ipcRenderer.invoke('config:get-engine-mode').catch(() => null);
					const rawMode = modeResult?.engine_mode || null;
					if (rawMode === 'byok-cloud' || rawMode === 'server-free') {
						const session = typeof getAccountSession === 'function' ? await getAccountSession() : null;
						if (!session?.userId) {
							const msg = 'Cloud mode requires sign-in. Go to Settings → Account to log in.';
							showProviderWarning(msg);
							disableComposer(msg);
						}
					}
				} catch { /* non-critical */ }

				if (state?.ollama_available) {
					appendMessage(log, 'Local AI', 'Ollama is ready. GPU-local routing enabled.', 'system');
					return;
				}
				const missingModels = Array.isArray(state?.missing_models) ? state.missing_models : [];
				const readyProviders = Object.entries(state?.cloud?.providers || {})
					.filter(([, provider]) => Boolean(provider?.ready))
					.map(([name]) => name);
				if (state?.ollama_healthy && missingModels.length > 0) {
					appendMessage(
						log,
						'Local AI',
						`Ollama is reachable but missing required models: ${missingModels.join(', ')}. Running cloud fallback (${readyProviders.join(', ') || 'no cloud provider keys detected'}).`,
						'system',
					);
					return;
				}
				appendMessage(
					log,
					'Local AI',
					`Ollama not detected. Cloud fallback is active (${readyProviders.join(', ') || 'no cloud provider keys detected'}). Run "npm run setup:local-ai" in jarvis/desktop or use setup:install-local IPC.`,
					'system',
				);
			}).catch(() => null);
		}

		ipcRenderer.invoke('get-local-telemetry').then((telemetry) => {
			if (!telemetry?.sidecar) return;
			const summary = [
				`started ${telemetry.sidecar.started || 0}`,
				`running ${telemetry.sidecar.running || 0}`,
				`errors ${telemetry.sidecar.errors || 0}`,
				`restarts ${telemetry.sidecar.restarts || 0}`,
				telemetry.updater
					? `updates offered ${telemetry.updater.offered || 0} / installed ${telemetry.updater.installSucceeded || 0}`
					: null,
			].filter(Boolean).join(' · ');
			appendMessage(log, 'Local telemetry', summary, 'system');
		}).catch(() => null);
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
			updateModalManualFlow = true;
			appendMessage(log, 'Updater', 'Starting download…', 'system');
			downloadUpdateButton.disabled = true;
			const result = await ipcRenderer.invoke('download-update');
			if (!result?.ok) {
				appendMessage(log, 'Updater', `Download failed: ${result?.reason || 'unknown error'}`, 'error');
				downloadUpdateButton.disabled = false;
			}
		});
	}

	if (updateModalPrimaryButton && updateModalSecondaryButton && ipcRenderer) {
		updateModalPrimaryButton.addEventListener('click', async () => {
			const mode = updateModalBackdrop?.dataset?.mode;
			if (mode === 'install-ready') {
				const result = await ipcRenderer.invoke('install-update');
				if (!result?.ok) {
					appendMessage(log, 'Updater', 'No downloaded update is ready yet.', 'error');
				}
				return;
			}

			if (mode === 'error') {
				updateModalManualFlow = true;
				await ipcRenderer.invoke('check-for-updates');
				return;
			}

			updateModalManualFlow = true;
			updateModalPrimaryButton.disabled = true;
			const result = await ipcRenderer.invoke('download-update');
			updateModalPrimaryButton.disabled = false;
			if (!result?.ok) {
				appendMessage(log, 'Updater', `Download failed: ${result?.reason || 'unknown error'}`, 'error');
				return;
			}
			closeUpdateModal();
		});

		updateModalSecondaryButton.addEventListener('click', async () => {
			const mode = updateModalBackdrop?.dataset?.mode || 'available';
			if (mode === 'available' || mode === 'install-ready' || mode === 'deferred') {
				const reason = mode === 'install-ready' ? 'restart-later' : 'later';
				await ipcRenderer.invoke('defer-update', {
					reason,
					source: 'renderer-modal',
				});
			}
			closeUpdateModal();
		});
	}

	if (updateModalBackdrop) {
		updateModalBackdrop.addEventListener('click', (event) => {
			if (event.target === updateModalBackdrop) {
				closeUpdateModal();
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
				if (payload === 'roblox' || payload === 'steam') {
					const game = payload === 'roblox'
						? { platform: 'roblox', id: 'default' }
						: { platform: 'steam', id: 'cs2' };
					void toolsApi.launchGame?.(game);
				} else {
					void executeStructuredCommand({ command: 'openApp', app: payload }, { source: 'local', origin: 'desktop' });
				}
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

	let thinkingLogEntry = null;

	onMessage((rawMessage) => {
		try {
			const parsed = JSON.parse(rawMessage);
			if (parsed.type === 'ai_thinking') {
				if (parsed.inFlight) {
					thinkingLogEntry = appendMessage(log, '🤔 Jarvis AI', 'Thinking…', 'system');
					setVoiceVisualizer('thinking');
				} else if (thinkingLogEntry) {
					thinkingLogEntry.remove();
					thinkingLogEntry = null;
					if (!speechPlaybackActive && !speechToTextActive && !sidecarManualListening) {
						setVoiceVisualizer('idle');
					}
				}
				return;
			}
			// Remove any pending thinking indicator when the real response arrives.
			if (thinkingLogEntry) {
				thinkingLogEntry.remove();
				thinkingLogEntry = null;
			}
			if (!speechPlaybackActive && !speechToTextActive && !sidecarManualListening) {
				setVoiceVisualizer('idle', { resetEnergy: false });
			}
			if (parsed.type === 'presence_snapshot') {
				appendMessage(log, 'Presence', `Connected clients: ${parsed?.active_connections ?? 0}`, 'system');
				return;
			}
			if (parsed.type === 'auth_required') {
				// Flash the Sign In button so the user can recover without
				// hunting through the sidebar. Auto-trigger the same IPC the
				// button uses so they don't have to click twice.
				if (accountLoginButton) {
					accountLoginButton.style.animation = 'pulse 1.2s ease-in-out 3';
					accountLoginButton.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.45)';
					setTimeout(() => {
						accountLoginButton.style.animation = '';
						accountLoginButton.style.boxShadow = '';
					}, 6000);
				}
				appendMessage(log, 'Sign in needed', parsed?.message || 'Sign in to chat with Jarvis.', 'error');
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
			if (parsed.type === 'ai_stream_started') {
				const streamId = String(parsed.streamId || '').trim();
				if (!streamId) return;
				if (activeAiStream.id && activeAiStream.id !== streamId) {
					resetActiveAiStream();
				}
				activeAiStream = {
					id: streamId,
					segmentsSent: 0,
					streamingEnabled: Boolean(
						sidecarConnected
						&& isLocalTtsBackend(voiceSettings.ttsBackend)
						&& voiceSettings.autoTts
						&& sidecar?.requestTtsStreamStart
						&& sidecarCapabilities?.ttsStreamingSupported,
					),
				};
				if (activeAiStream.streamingEnabled) {
					clearTtsAudioQueue();
					ttsAudioActiveStreamId = streamId;
					sidecar.requestTtsStreamStart(streamId);
				}
				return;
			}
			if (parsed.type === 'ai_stream_segment') {
				const streamId = String(parsed.streamId || '').trim();
				const segment = String(parsed.segment || '').trim();
				if (!streamId || !segment || activeAiStream.id !== streamId) return;
				activeAiStream.segmentsSent += 1;
				if (activeAiStream.streamingEnabled && sidecar?.requestTtsStreamChunk) {
					sidecar.requestTtsStreamChunk(
						segment,
						streamId,
						Number(parsed.segmentIndex || activeAiStream.segmentsSent - 1),
						false,
					);
				}
				return;
			}
			if (parsed.type === 'ai_stream_done') {
				const streamId = String(parsed.streamId || '').trim();
				if (streamId && activeAiStream.id === streamId && activeAiStream.streamingEnabled && sidecar?.requestTtsStreamEnd) {
					sidecar.requestTtsStreamEnd(streamId);
				}
				return;
			}
			const body = typeof parsed.summary === 'string'
				? parsed.summary
				: typeof parsed.text === 'string'
					? parsed.text
					: JSON.stringify(parsed);
			const title = parsed.type === 'command_result' ? (parsed.title || '✅ Jarvis') : `Backend (${parsed.type || '?'})`;
			const badges = [];
			if (parsed.provider) badges.push(`provider:${parsed.provider}`);
			if (parsed.routeProfile) badges.push(`profile:${parsed.routeProfile}`);
			if (parsed.routeReason) badges.push(`route:${parsed.routeReason}`);
			if (parsed.model) badges.push(`model:${parsed.model}`);
			appendMessage(log, title, body, parsed.level === 'error' ? 'error' : 'system', badges);
			if (parsed.type === 'command_result' && parsed.level !== 'error') {
				const streamId = String(parsed.streamId || '').trim();
				const streamedAlready = Boolean(
					parsed.ttsStreaming
					&& streamId
					&& activeAiStream.id === streamId
					&& activeAiStream.segmentsSent > 0,
				);
				if (streamedAlready) {
					activeAiStream = { id: '', segmentsSent: 0, streamingEnabled: false };
				} else {
					void speakWithSidecar(getComfortableSpokenText(parsed, body));
				}
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
	let currentSession = null;

	function refreshAccountUI(session = currentSession) {
		if (session?.userId || session?.email) {
			const displayName = session.email || 'your account';
			if (accountStatusNode) accountStatusNode.textContent = `Signed in as ${displayName}`;
			if (accountBadge) accountBadge.textContent = `AssistantX · ${displayName}`;
			if (accountLoginButton) accountLoginButton.textContent = '🔓 Sign out';
			if (accountSyncButton) accountSyncButton.disabled = false;
		} else {
			if (accountStatusNode) accountStatusNode.textContent = 'Not signed in';
			if (accountBadge) accountBadge.textContent = 'AssistantX AI Agent';
			if (accountLoginButton) accountLoginButton.textContent = '🔑 Sign in';
			if (accountSyncButton) accountSyncButton.disabled = true;
		}
	}

	async function refreshCurrentSession() {
		if (typeof getAccountSession !== 'function') {
			currentSession = null;
			return currentSession;
		}
		currentSession = await getAccountSession();
		return currentSession;
	}

	function refreshLinkedAccounts() {
		if (!linkedAccountsList) return;
		const accounts = getLinkedAccounts();
		if (!accounts.length) {
			linkedAccountsList.textContent = 'None linked';
			return;
		}
		linkedAccountsList.innerHTML = accounts.map((a) =>
			`<span>✅ ${escapeHtml(a.provider)}</span>`,
		).join('<br>');
	}

	async function syncCloudAfterSignIn(session, { announce = false } = {}) {
		if (!(session?.userId || session?.email)) return;
		if (announce) {
			appendMessage(log, 'Account', `Signed in as ${session.email || 'your account'}. Syncing memory…`);
		}
		if (!apiBaseUrl) return;
		try {
			const syncResult = await loadFromCloud(apiBaseUrl);
			if (syncResult?.voiceSettings) applyVoiceSettings({ ...voiceSettings, ...syncResult.voiceSettings });
		} catch {
			// ignore transient sync failures after sign-in
		}
	}

	refreshAccountUI();
	refreshLinkedAccounts();

	if (typeof onSessionChanged === 'function') {
		onSessionChanged(({ session, reason }) => {
			currentSession = session || null;
			refreshAccountUI(currentSession);
			refreshLinkedAccounts();
			if ((session?.userId || session?.email) && String(reason || '').startsWith('login-')) {
				void syncCloudAfterSignIn(session, { announce: true });
			}
		});
	}

	if (typeof onSignedOut === 'function') {
		onSignedOut(() => {
			currentSession = null;
			refreshAccountUI(currentSession);
			refreshLinkedAccounts();
		});
	}

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

	const serverApi = window.jarvisApi?.server || window.jarvisApiV2?.server || null;
	function setRuntimeStatusText(text) {
		if (runtimeStatusNode) runtimeStatusNode.textContent = text;
	}

	function updatePermissionQuickButtons(level = 'default') {
		const normalized = ['default', 'auto', 'full'].includes(String(level)) ? String(level) : 'default';
		for (const button of permissionQuickButtons) {
			button.classList.toggle('active', button.dataset.permissionLevel === normalized);
		}
		if (runtimePermissionLevelSelect) runtimePermissionLevelSelect.value = normalized;
	}

	async function applyRuntimePermissionLevel(level, { source = 'settings' } = {}) {
		const normalized = ['default', 'auto', 'full'].includes(String(level)) ? String(level) : 'default';
		if (!serverApi) {
			appendMessage(log, 'System Core', 'Runtime bridge unavailable in this environment.', 'error');
			updatePermissionQuickButtons(normalized);
			return null;
		}
		updatePermissionQuickButtons(normalized);
		const result = await serverApi.setPermissionLevel(normalized, normalized === 'full');
		if (!result?.ok) {
			appendMessage(log, 'System Core', `Failed to set permission: ${result?.error || 'unknown'}`, 'error');
			return result;
		}
		appendMessage(log, 'System Core', `Permission level set to ${normalized}${source === 'chat' ? ' from chat controls' : ''}.`);
		await refreshRuntimeStatus();
		return result;
	}

	async function refreshRuntimeUiFromConfig() {
		if (!serverApi) return;
		try {
			const config = await serverApi.getConfig();
			if (runtimeModeSelect) runtimeModeSelect.value = config.runtimeMode || 'local-desktop';
			if (remoteRuntimeApiUrlInput) remoteRuntimeApiUrlInput.value = config.remoteRuntimeApiUrl || '';
			if (remoteRuntimeWsUrlInput) remoteRuntimeWsUrlInput.value = config.remoteRuntimeWsUrl || '';
			const auth = await serverApi.getAuthStatus();
			updatePermissionQuickButtons(auth.permissionLevel || 'default');
			setRuntimeStatusText(auth.paired
				? `Synchronized (${auth.permissionLevel || 'default'})`
				: 'Runtime not connected.');
		} catch (error) {
			setRuntimeStatusText(`Runtime config error: ${error?.message || error}`);
		}
	}

	async function refreshRuntimeStatus() {
		if (!serverApi) {
			setRuntimeStatusText('Runtime bridge unavailable in this environment.');
			return;
		}
		const status = await serverApi.getRuntimeStatus();
		if (!status?.ok) {
			setRuntimeStatusText(`Runtime status error: ${status?.error || 'request failed'}`);
			return;
		}
		const metrics = status.metrics || {};
		const services = metrics.services || {};
		setRuntimeStatusText(
			[
				`State: ${status.state || 'unknown'}`,
				`Permission: ${status.permissionLevel || 'default'}`,
				`CPU: ${Number(metrics.cpuPercent || 0).toFixed(1)}%`,
				`RAM: ${Number(metrics.ramPercent || 0).toFixed(1)}%`,
				`Services: ollama=${services.ollama || 'n/a'}, searxng=${services.searxng || 'n/a'}, netdata=${services.netdata || 'n/a'}`,
			].join(' · '),
		);
	}

	if (saveRuntimeConfigButton && serverApi) {
		saveRuntimeConfigButton.addEventListener('click', async () => {
			const payload = {
				runtimeMode: runtimeModeSelect?.value || 'local-desktop',
				remoteRuntimeApiUrl: remoteRuntimeApiUrlInput?.value?.trim() || '',
				remoteRuntimeWsUrl: remoteRuntimeWsUrlInput?.value?.trim() || '',
			};
			const result = await serverApi.setConfig(payload);
			if (!result?.ok) {
				appendMessage(log, 'System Core', `Failed to save runtime config: ${result?.error || 'unknown'}`, 'error');
				return;
			}
			if (payload.runtimeMode === 'remote-linux-runtime' && sidecar?.setConnection) {
				sidecar.setConnection({ url: result.remoteRuntimeWsUrl || payload.remoteRuntimeWsUrl });
			}
			appendMessage(log, 'System Core', `Runtime config saved (${result.runtimeMode}).`);
			await refreshRuntimeUiFromConfig();
		});
	}

	if (runtimePairButton && serverApi) {
		runtimePairButton.addEventListener('click', async () => {
			const syncKey = runtimeSyncKeyInput?.value?.trim();
			if (!syncKey) {
				appendMessage(log, 'System Core', 'Sync key is required for pairing.', 'error');
				return;
			}
			const result = await serverApi.verifyPairing(syncKey);
			if (!result?.ok) {
				appendMessage(log, 'System Core', `Pairing failed: ${result?.error || 'unauthorized'}`, 'error');
				return;
			}
			if (sidecar?.setConnection && (remoteRuntimeWsUrlInput?.value || '').trim()) {
				sidecar.setConnection({ url: remoteRuntimeWsUrlInput.value.trim(), token: result.sessionToken || '' });
				sidecar.connect?.();
			}
			appendMessage(log, 'System Core', 'Linux runtime pairing successful.');
			await refreshRuntimeUiFromConfig();
			await refreshRuntimeStatus();
		});
	}

	if (runtimeRefreshStatusButton && serverApi) {
		runtimeRefreshStatusButton.addEventListener('click', () => {
			void refreshRuntimeStatus();
		});
	}

	for (const button of permissionQuickButtons) {
		button.addEventListener('click', () => {
			void applyRuntimePermissionLevel(button.dataset.permissionLevel || 'default', { source: 'chat' });
		});
	}

	if (runtimeApplyPermissionButton && serverApi) {
		runtimeApplyPermissionButton.addEventListener('click', async () => {
			const level = runtimePermissionLevelSelect?.value || 'default';
			await applyRuntimePermissionLevel(level, { source: 'settings' });
		});
	}

	if (runtimeKillSwitchButton && serverApi) {
		runtimeKillSwitchButton.addEventListener('click', async () => {
			const result = await serverApi.killSwitch();
			if (!result?.ok) {
				appendMessage(log, 'System Core', `Kill switch failed: ${result?.error || 'unknown'}`, 'error');
				return;
			}
			appendMessage(log, 'System Core', 'Emergency disconnect completed.');
			setRuntimeStatusText('Runtime disconnected.');
		});
	}

	void refreshRuntimeUiFromConfig();

	// Cloud sync on startup if signed in
	void refreshCurrentSession().then((initialSession) => {
		refreshAccountUI(initialSession);
		if (initialSession?.userId && apiBaseUrl) {
			return loadFromCloud(apiBaseUrl).then((res) => {
				if (res.ok) {
					if (res.voiceSettings) applyVoiceSettings({ ...voiceSettings, ...res.voiceSettings });
					appendMessage(log, 'Cloud sync', 'Memory and Jarvis voice settings loaded from your account.', 'system');
				}
				return null;
			});
		}
		return null;
	});

	if (accountLoginButton) {
		accountLoginButton.addEventListener('click', async () => {
			if (currentSession?.userId || currentSession?.email) {
				await signOutAccount();
				currentSession = null;
				refreshAccountUI();
				refreshLinkedAccounts();
				appendMessage(log, 'Account', 'Signed out of AssistantX account.');
				return;
			}
			if (ipcRenderer) {
				try {
					const result = await ipcRenderer.invoke('open-account-login');
					if (result?.userId || result?.email) {
						currentSession = result;
						refreshAccountUI(currentSession);
						refreshLinkedAccounts();
						await syncCloudAfterSignIn(result);
					} else {
						appendMessage(
							log,
							'Account',
							[
								'Sign-in was not completed. If you saw an error in the login window, check:',
								'(1) Supabase Auth providers (Email/Google/GitHub) are enabled in your Supabase dashboard.',
								'(2) Supabase → Auth → URL Configuration → Redirect URLs includes assistantx://auth/callback.',
								'(3) Your OAuth app allows assistantx://auth/callback and the Supabase project callback URL.',
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
			if (!(currentSession?.userId || currentSession?.email) || !apiBaseUrl) {
				appendMessage(log, 'Cloud sync', 'Sign in first to sync.', 'error');
				return;
			}
			accountSyncButton.disabled = true;
			const res = await syncToCloud(apiBaseUrl, { voiceSettings, syncReminders: false });
			accountSyncButton.disabled = false;
			appendMessage(log, 'Cloud sync', res.ok ? '✅ Memory and Jarvis voice settings synced to cloud.' : `Sync failed: ${res.reason || res.status}`, res.ok ? 'system' : 'error');
		});
	}

	if (openLinkedAccountsButton && ipcRenderer) {
		openLinkedAccountsButton.addEventListener('click', () => {
			if (!currentSession?.email) {
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
			const next = escapeHtml(s.nextRunAt ? new Date(s.nextRunAt).toLocaleString() : 'n/a');
			return `<span>${s.enabled ? '🟢' : '⏸'} <strong>${escapeHtml(s.label || s.command)}</strong> · ${escapeHtml(s.cronExpr)} · next: ${next}</span>`;
		}).join('<br>');
	}
	refreshSchedulesUI();

	function refreshRemindersUI() {
		if (!remindersList) return;
		const reminders = getReminders()
			.slice()
			.sort((a, b) => new Date(a.triggerAt).getTime() - new Date(b.triggerAt).getTime());
		if (!reminders.length) {
			remindersList.textContent = 'No reminders yet';
			return;
		}
		remindersList.innerHTML = reminders.map((item) => {
			const when = escapeHtml(item.triggerAt ? new Date(item.triggerAt).toLocaleString() : 'n/a');
			const done = item.completed ? '✅' : '🕒';
			const priority = toFiniteNumber(item.priority || 1, 1);
			return `<span>${done} <strong>${escapeHtml(item.label || item.text || 'Reminder')}</strong> · ${when} · p${priority}</span>`;
		}).join('<br>');
	}
	refreshRemindersUI();

	reminderAddButton?.addEventListener('click', () => {
		const text = reminderInput?.value?.trim();
		if (!text) return;
		const parsed = temporalApi?.parseRelativeTime
			? temporalApi.parseRelativeTime(text)
			: null;
		if (!parsed?.triggerAt) {
			appendMessage(log, 'Reminder', 'Could not parse reminder time. Try e.g. "tomorrow morning at 8".', 'error');
			return;
		}
		try {
			saveReminder({
				label: text,
				text,
				triggerAt: parsed.triggerAt,
				priority: 1,
				voiceEnabled: true,
				source: 'manual',
			});
			refreshRemindersUI();
			appendMessage(log, 'Reminder', `Added reminder for ${new Date(parsed.triggerAt).toLocaleString()}`);
			if (reminderInput) reminderInput.value = '';
		} catch (error) {
			appendMessage(log, 'Reminder', error?.message || 'Failed to save reminder.', 'error');
		}
	});

	const reminderAnnouncements = [];
	function toPriorityTier(value) {
		const numeric = Number(value);
		if (numeric >= 3) return 'CRITICAL';
		if (numeric >= 2) return 'IMPORTANT';
		if (numeric <= 0) return 'LOW';
		return 'NORMAL';
	}

	function canSpeakReminder(entry) {
		if (!voiceSettings.proactiveReminders) return false;
		const busy = speechToTextActive || sidecarManualListening || speechPlaybackActive;
		if (!busy) return true;
		return entry.priorityTier === 'CRITICAL';
	}

	function showReminderToast(entry) {
		if (typeof Notification === 'undefined') return;
		if (Notification.permission === 'granted') {
			new Notification('AssistantX reminder', {
				body: entry.text,
			});
			return;
		}
		if (Notification.permission !== 'denied') {
			void Notification.requestPermission();
		}
	}

	async function processReminderAnnouncements() {
		if (!reminderAnnouncements.length) return;
		const next = reminderAnnouncements[0];
		const focused = document.hasFocus();
		const fullscreen = Boolean(document.fullscreenElement);
		const shouldDefer = (!focused || fullscreen) && next.priorityTier !== 'CRITICAL';
		if (shouldDefer || !canSpeakReminder(next)) {
			next.deferCount = (next.deferCount || 0) + 1;
			if (next.deferCount > 20) reminderAnnouncements.shift();
			return;
		}
		reminderAnnouncements.shift();
		showReminderToast(next);
		if (next.voiceEnabled && (next.priorityTier === 'CRITICAL' || voiceSettings.proactiveReminders)) {
			const spoken = temporalApi?.formatReminderSpeech
				? temporalApi.formatReminderSpeech(
					{ label: next.label, text: next.text, triggerAt: next.triggerAt },
					{ persona: voiceSettings.reminderVoiceStyle || 'neutral' },
				)
				: `Reminder: ${next.text}`;
			await speakWithSidecar(spoken);
		}
	}

	setInterval(() => {
		void processReminderAnnouncements();
	}, 5000);

	setInterval(() => {
		if (!voiceSettings.ambientAnnouncements) return;
		const hour = new Date().getHours();
		if (hour === 0 && !speechPlaybackActive && !speechToTextActive) {
			appendMessage(log, 'Ambient', 'It is midnight.', 'system');
		}
	}, 60_000);

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

	startReminderScheduler((reminder) => {
		const priorityTier = toPriorityTier(reminder.priority);
		const body = reminder.label || reminder.text || 'Reminder due';
		appendMessage(log, 'Reminder', `⏰ ${body} (${priorityTier})`, priorityTier === 'CRITICAL' ? 'error' : 'system');
		reminderAnnouncements.push({
			id: reminder.id,
			text: body,
			label: reminder.label || body,
			triggerAt: reminder.triggerAt,
			voiceEnabled: reminder.voiceEnabled !== false,
			priorityTier,
			deferCount: 0,
		});
		markReminderCompleted(reminder.id, false);
		refreshRemindersUI();
	});

	// Periodic cloud sync (every 5 minutes) if signed in
	setInterval(async () => {
		if ((currentSession?.userId || currentSession?.email) && apiBaseUrl) {
			await syncToCloud(apiBaseUrl, { voiceSettings, syncReminders: false }).catch(() => null);
		}
	}, 5 * 60_000);

	switchViewport('welcome');
	void refreshGitHubStatus();
	void refreshGoogleStatus();

	void tokenPromise.then((token) => {
		connectToBackend({ token });
		updateStatus('ready');
		appendMessage(log, 'Jarvis Desktop', 'Shell initialized. Connecting to backend…');
		if (voiceSettings.temporalAwareness && temporalApi?.getGreeting) {
			appendMessage(log, 'JARVIS', temporalApi.getGreeting({ persona: voiceSettings.reminderVoiceStyle || 'neutral' }), 'system');
		}
		if (voiceSettings.dailySummary && temporalApi?.buildDailySummary) {
			const summary = temporalApi.buildDailySummary({
				reminders: getReminders(),
				tasks: getLocalStateSnapshot()?.tasks || [],
				schedules: getSchedules(),
			});
			appendMessage(log, 'Daily summary', summary, 'system');
		}
	});

	// Silently refresh the session if the stored access token is near expiry.
	void refreshSessionIfNeeded().then((newSession) => {
		currentSession = newSession;
		refreshAccountUI(currentSession);
		if (newSession === null) {
			refreshLinkedAccounts();
		}
	}).catch((err) => {
		console.warn('[renderer] Session refresh on startup failed:', err?.message || err);
	});
});

// ── Clipboard Monitoring UI ────────────────────────────────────────────────────

(function initClipboardUI() {
	const jarvis = window.jarvisApi;
	if (!jarvis?.clipboard) return;

	const consentBackdrop = document.getElementById('clipboard-consent-backdrop');
	const consentAllow    = document.getElementById('clipboard-consent-allow');
	const consentDeny     = document.getElementById('clipboard-consent-deny');
	const toast           = document.getElementById('clipboard-toast');
	const toastIcon       = document.getElementById('clipboard-toast-icon');
	const toastLabel      = document.getElementById('clipboard-toast-label');
	const toastPreview    = document.getElementById('clipboard-toast-preview');
	const toastActions    = document.getElementById('clipboard-toast-actions');
	const toastClose      = document.getElementById('clipboard-toast-close');

	let toastTimer = null;

	// Check current status; show consent dialog if not yet decided
	jarvis.clipboard.getStatus().then((status) => {
		if (!status.consentGiven && consentBackdrop) {
			consentBackdrop.hidden = false;
		}
	}).catch(() => {});

	// Consent dialog handlers
	if (consentAllow) {
		consentAllow.addEventListener('click', () => {
			if (consentBackdrop) consentBackdrop.hidden = true;
			jarvis.clipboard.enable().catch(() => {});
		});
	}
	if (consentDeny) {
		consentDeny.addEventListener('click', () => {
			if (consentBackdrop) consentBackdrop.hidden = true;
			jarvis.clipboard.disable().catch(() => {});
		});
	}

	// Listen for clipboard changes and show toast
	jarvis.clipboard.onChange((entry) => {
		if (!toast || !entry) return;
		const suggestion = entry.suggestions?.[0];
		if (!suggestion) return;

		if (toastTimer) clearTimeout(toastTimer);

		if (toastIcon)    toastIcon.textContent = suggestion.icon ?? '📋';
		if (toastLabel)   toastLabel.textContent = suggestion.label ?? 'Clipboard';
		if (toastPreview) toastPreview.textContent = entry.preview ?? '';

		// Render action buttons
		if (toastActions) {
			toastActions.innerHTML = '';
			(suggestion.actions ?? []).slice(0, 3).forEach((action) => {
				const btn = document.createElement('button');
				btn.type = 'button';
				btn.textContent = action.charAt(0).toUpperCase() + action.slice(1);
				btn.style.cssText = 'padding:4px 10px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#94a3b8;cursor:pointer;font-size:11px';
				btn.addEventListener('click', () => {
					const prompt = `${action}: ${entry.text}`;
					// Route to chat input if available
					const chatInput = document.getElementById('message-input') || document.querySelector('textarea[name="message"]');
					if (chatInput) {
						chatInput.value = prompt;
						chatInput.dispatchEvent(new Event('input', { bubbles: true }));
						chatInput.focus();
					}
					toast.hidden = true;
					toast.style.display = 'none';
				});
				toastActions.appendChild(btn);
			});
		}

		toast.hidden = false;
		toast.style.display = 'flex';
		toastTimer = setTimeout(() => {
			toast.hidden = true;
			toast.style.display = 'none';
		}, 8000);
	});

	if (toastClose) {
		toastClose.addEventListener('click', () => {
			if (toastTimer) clearTimeout(toastTimer);
			if (toast) { toast.hidden = true; toast.style.display = 'none'; }
		});
	}
})();

// ── Drag-and-Drop File Indexing UI ────────────────────────────────────────────

(function initDropIndexUI() {
	const jarvis = window.jarvisApi;
	if (!jarvis?.fileIndex) return;

	const overlay    = document.getElementById('drop-overlay');
	const indexPanel = document.getElementById('index-panel');
	const jobsList   = document.getElementById('index-jobs-list');
	const panelClose = document.getElementById('index-panel-close');

	let dragCounter = 0;

	// Show overlay on drag-enter (only for files)
	document.addEventListener('dragenter', (e) => {
		if (!e.dataTransfer?.types?.includes('Files')) return;
		dragCounter++;
		if (overlay) { overlay.hidden = false; overlay.style.display = 'flex'; }
	});

	document.addEventListener('dragleave', () => {
		dragCounter = Math.max(0, dragCounter - 1);
		if (dragCounter === 0 && overlay) {
			overlay.hidden = true;
			overlay.style.display = 'none';
		}
	});

	document.addEventListener('dragover', (e) => {
		if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
	});

	document.addEventListener('drop', async (e) => {
		e.preventDefault();
		dragCounter = 0;
		if (overlay) { overlay.hidden = true; overlay.style.display = 'none'; }

		const files = e.dataTransfer?.files;
		if (!files || files.length === 0) return;

		// Collect absolute paths (Electron exposes file.path)
		const paths = Array.from(files)
			.map((f) => f.path)
			.filter(Boolean);

		if (paths.length === 0) return;

		try {
			const result = await jarvis.fileIndex.dropFiles(paths);
			if (result.ok && result.fileCount > 0) {
				showIndexPanel();
			}
		} catch (err) {
			console.error('[renderer] file-drop failed:', err);
		}
	});

	// Job update listener
	jarvis.fileIndex.onJobUpdate((job) => {
		updateJobInPanel(job);
		if (job.status === 'completed' || job.status === 'error') {
			showIndexPanel();
		}
	});

	if (panelClose) {
		panelClose.addEventListener('click', () => {
			if (indexPanel) { indexPanel.hidden = true; indexPanel.style.display = 'none'; }
		});
	}

	function showIndexPanel() {
		if (!indexPanel) return;
		indexPanel.hidden = false;
		indexPanel.style.display = 'flex';
		// Refresh all jobs
		jarvis.fileIndex.getJobs().then(({ jobs }) => {
			if (!jobsList) return;
			jobsList.innerHTML = '';
			(jobs ?? []).slice(0, 10).forEach((job) => {
				renderJob(job);
			});
		}).catch(() => {});
	}

	function renderJob(job) {
		if (!jobsList) return;
		// Remove existing entry for this job
		const existing = Array.from(jobsList.children).find((node) => node.dataset?.jobId === String(job.id));
		if (existing) existing.remove();

		const el = document.createElement('div');
		el.dataset.jobId = job.id;
		el.style.cssText = 'background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:10px';

		const statusColor = job.status === 'completed' ? '#22c55e'
			: job.status === 'error' ? '#ef4444'
			: job.status === 'cancelled' ? '#94a3b8'
			: '#38bdf8';
		const processedFiles = toFiniteNumber(job.processedFiles);
		const totalFiles = toFiniteNumber(job.totalFiles);
		const progressPercent = Math.max(0, Math.min(100, toFiniteNumber(job.progressPercent)));
		const chunks = toFiniteNumber(job.chunks, 0);
		const jobId = escapeHtml(job.id);
		const jobStatus = escapeHtml(job.status);

		el.innerHTML = `
			<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
				<span style="color:${statusColor};font-weight:600;text-transform:capitalize">${jobStatus}</span>
				<span style="color:#64748b">${processedFiles}/${totalFiles} files</span>
			</div>
			<div style="height:4px;background:#1e293b;border-radius:4px;overflow:hidden">
				<div style="height:100%;background:${statusColor};width:${progressPercent}%;border-radius:4px;transition:width .3s"></div>
			</div>
			${chunks ? `<div style="color:#64748b;font-size:11px;margin-top:4px">${chunks} chunks indexed</div>` : ''}
			${job.status === 'running' || job.status === 'pending'
				? `<button data-cancel="${jobId}" type="button"
					style="margin-top:6px;padding:3px 8px;border-radius:6px;border:1px solid #334155;
					       background:none;color:#64748b;cursor:pointer;font-size:11px">Cancel</button>`
				: ''}
		`;

		el.querySelector('[data-cancel]')?.addEventListener('click', () => {
			jarvis.fileIndex.cancelJob(job.id).catch(() => {});
		});

		// Prepend so newest is first
		jobsList.insertBefore(el, jobsList.firstChild);
	}

	function updateJobInPanel(job) {
		if (!jobsList) return;
		const existing = Array.from(jobsList.children).find((node) => node.dataset?.jobId === String(job.id));
		if (existing) {
			renderJob(job);
		} else {
			renderJob(job);
		}
	}
})();
