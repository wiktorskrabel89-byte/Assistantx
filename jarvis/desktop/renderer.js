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
	const tokenPromise = Promise.resolve(getToken()).catch((error) => {
		console.warn('[renderer] Failed to get device token:', error?.message || error);
		return null;
	});
	const log = document.getElementById('log');
	const input = document.getElementById('input');
	const send = document.getElementById('send');
	const statusNode = document.getElementById('connection-status');
	const appVersionNode = document.getElementById('app-version');
	const updateStatusNode = document.getElementById('update-status');
	const checkUpdatesButton = document.getElementById('check-updates');
	const installUpdateButton = document.getElementById('install-update');
	const updateModalBackdrop = document.getElementById('update-modal-backdrop');
	const updateModalBadge = document.getElementById('update-modal-badge');
	const updateModalTitle = document.getElementById('update-modal-title');
	const updateModalSubtitle = document.getElementById('update-modal-subtitle');
	const updateModalHighlights = document.getElementById('update-modal-highlights');
	const updateModalMarkdown = document.getElementById('update-modal-markdown');
	const updateModalVersion = document.getElementById('update-modal-version');
	const updateModalSource = document.getElementById('update-modal-source');
	const updateModalDetails = document.getElementById('update-modal-details');
	const updateModalProgress = document.getElementById('update-modal-progress');
	const updateProgressLabel = document.getElementById('update-progress-label');
	const updateProgressPercent = document.getElementById('update-progress-percent');
	const updateProgressFill = document.getElementById('update-progress-fill');
	const updateModalError = document.getElementById('update-modal-error');
	const updateTokenForm = document.getElementById('update-token-form');
	const updateTokenInput = document.getElementById('update-token-input');
	const updateModalPrimaryButton = document.getElementById('update-modal-primary');
	const updateModalSecondaryButton = document.getElementById('update-modal-secondary');
	const updateModalClearTokenButton = document.getElementById('update-modal-clear-token');
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
	const localPreferEnabledToggle = document.getElementById('local-prefer-enabled');
	const localServerSaveAssignmentButton = document.getElementById('local-server-save-assignment');
	const sttModelSelect = document.getElementById('stt-model');
	const ttsModelSelect = document.getElementById('tts-model');
	const ttsVoiceProfileSelect = document.getElementById('tts-voice-profile');
	const voiceLanguageSelect = document.getElementById('voice-language');
	const voiceProviderModeSelect = document.getElementById('voice-provider-mode');
	const sttEnabledToggle = document.getElementById('stt-enabled');
	const autoTtsToggle = document.getElementById('auto-tts');
	const voiceVisualizer = document.getElementById('voice-visualizer');
	const voiceInputButton = document.getElementById('voice-input');
	const wakeWordEnabledToggle = document.getElementById('wake-word-enabled');
	const wakeWordPhraseInput = document.getElementById('wake-word-phrase');
	const allowBackgroundWakeToggle = document.getElementById('allow-background-wake');
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
	const AGENT_STATE = {
		IDLE: 'IDLE',
		THINKING: 'THINKING',
		LISTENING: 'LISTENING',
		SPEAKING: 'SPEAKING',
	};
	let currentAgentState = AGENT_STATE.IDLE;
	let visualizerEnergy = 0;
	let inactivityTimer = null;
	let currentViewport = 'welcome';
	let mapWidget = null;
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

	function switchViewport(mode) {
		currentViewport = mode;
		viewportWelcome?.classList.toggle('active', mode === 'welcome');
		viewportMap?.classList.toggle('active', mode === 'map');
		viewportRepo?.classList.toggle('active', mode === 'repo');
		viewportHardware?.classList.toggle('active', mode === 'hardware');
		workspaceApp?.classList.toggle('viewport-active', mode !== 'welcome');
	}

	function ensureMapWidget() {
		if (!viewportMapCanvas) return null;
		if (!mapWidget && window.MapWidget) {
			mapWidget = new window.MapWidget();
			mapWidget.init(viewportMapCanvas);
		}
		return mapWidget;
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
			const widget = ensureMapWidget();
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
		sttModel: sttModelSelect?.value || 'whisper-large-v3-turbo',
		ttsEnabled: true,
		ttsModel: ttsModelSelect?.value || 'orpheus-english',
		ttsVoiceId: ttsVoiceProfileSelect?.value || 'jarvis',
		wakeWordEnabled: true,
		wakeWordPhrase: DEFAULT_JARVIS_WAKE_PHRASE,
		allowBackgroundWake: true,
		voiceLanguage: voiceLanguageSelect?.value || 'en-US',
		autoTts: true,
		providerMode: 'assistantx-server',
		temporalAwareness: true,
		proactiveReminders: true,
		ambientAnnouncements: false,
		dailySummary: false,
		reminderVoiceStyle: 'neutral',
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
	let voiceSettings = readVoiceSettings();
	let desktopLocalServers = [];
	let desktopLocalAssignment = {
		chatModelId: null,
		codeModelId: null,
		externalApiModelId: null,
		serverId: null,
		preferLocalWhenAvailable: false,
	};

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
		if (persist) writeVoiceSettings(voiceSettings);
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
				entries.push(`<option value="${value.replace(/"/g, '&quot;')}"${selected}>${server.label} · ${model}</option>`);
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
						? server.discoveredModels.join(', ')
						: 'no scanned models';
					return `
						<div style="border:1px solid rgba(148,163,184,.25);border-radius:10px;padding:8px;margin-bottom:8px;">
							<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
								<div>
									<div style="font-weight:600;">${server.label}</div>
									<div style="font-size:11px;opacity:.8;">${server.baseUrl} · ${server.apiType}</div>
									<div style="font-size:11px;opacity:.7;">${models}</div>
								</div>
								<div style="display:flex;gap:6px;flex-wrap:wrap;">
									<button type="button" class="secondary sm" data-local-scan="${server.id}">Scan</button>
									<button type="button" class="secondary sm" data-local-toggle="${server.id}">${server.enabled ? 'Disable' : 'Enable'}</button>
									<button type="button" class="danger sm" data-local-remove="${server.id}">Remove</button>
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
				serverId: assignmentRes?.localModelAssignment?.serverId || null,
				preferLocalWhenAvailable: Boolean(assignmentRes?.preferLocalWhenAvailable),
			};
			renderLocalServers();
		} catch (error) {
			appendMessage(log, 'Local servers', `Failed to load local servers: ${error?.message || error}`, 'error');
		}
	}

	applyVoiceSettings(voiceSettings, { persist: false });
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
		const resolvedServerId = chat.serverId || code.serverId || external.serverId || null;
		const result = await localServerApi.setModelAssignment({
			localModelAssignment: {
				serverId: resolvedServerId,
				chatModelId: chat.modelId,
				codeModelId: code.modelId,
				externalApiModelId: external.modelId,
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

	function applyVisualizerEnergy(nextEnergy = 0) {
		if (!voiceVisualizer) return;
		const clamped = Math.max(0, Math.min(1, Number(nextEnergy) || 0));
		visualizerEnergy = (visualizerEnergy * 0.72) + (clamped * 0.28);
		voiceVisualizer.style.setProperty('--voice-energy', visualizerEnergy.toFixed(4));
	}

	function setVoiceVisualizer(state, options = {}) {
		if (!voiceVisualizer) return;
		voiceVisualizer.classList.remove('listening', 'speaking', 'thinking');
		if (state === 'listening') {
			voiceVisualizer.classList.add('listening');
			setAgentState(AGENT_STATE.LISTENING);
			touchAgentActivity();
			return;
		}
		if (state === 'speaking') {
			voiceVisualizer.classList.add('speaking');
			setAgentState(AGENT_STATE.SPEAKING);
			touchAgentActivity();
			return;
		}
		if (state === 'thinking') {
			voiceVisualizer.classList.add('thinking');
			setAgentState(AGENT_STATE.THINKING);
			touchAgentActivity();
			return;
		}
		setAgentState(AGENT_STATE.IDLE);
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
			speechPlaybackActive = true;
			setVoiceVisualizer('speaking');
			utterance.onend = () => {
				speechPlaybackActive = false;
				setVoiceVisualizer('idle');
			};
			utterance.onerror = (errorEvent) => {
				speechPlaybackActive = false;
				setVoiceVisualizer('idle');
				if (isBenignSpeechError(errorEvent)) return;
				appendMessage(log, 'Text-to-speech', 'Speech playback failed.', 'error');
			};
			window.speechSynthesis.speak(utterance);
		} catch {
			speechPlaybackActive = false;
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
		const normalizedStatus = String(payload?.status || 'idle').toLowerCase();
		const reason = String(payload?.reason || '').toLowerCase();
		let detail = payload?.detail ? `${payload.status}: ${payload.detail}` : payload?.status || 'idle';
		if (normalizedStatus === 'error' || normalizedStatus === 'unavailable') {
			if (reason.includes('auth') || reason.includes('permission')) {
				detail = 'Updater: authentication is missing or invalid for private release feed.';
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

		if (payload?.status === 'available') {
			showUpdateModal({
				mode: 'available',
				payload,
			});
		} else if (payload?.status === 'downloading') {
			showUpdateModal({
				mode: 'downloading',
				payload,
			});
		} else if (payload?.status === 'install-ready') {
			showUpdateModal({
				mode: 'install-ready',
				payload,
			});
		} else if (payload?.status === 'error' || payload?.status === 'unavailable') {
			showUpdateModal({
				mode: payload?.requiresTokenSetup ? 'auth-required' : 'error',
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
			updateModalBadge.textContent = mode === 'auth-required' ? 'SECURE' : 'NEW';
		}
		renderUpdateHighlights(payload);
		renderUpdateMarkdown(payload);
		setUpdateModalVersion(payload);
		if (updateModalProgress) updateModalProgress.hidden = true;
		if (updateModalError) {
			updateModalError.hidden = true;
			updateModalError.textContent = '';
		}
		if (updateTokenForm) updateTokenForm.hidden = true;
		if (updateModalClearTokenButton) updateModalClearTokenButton.hidden = true;
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

		if (mode === 'auth-required') {
			updateModalTitle.textContent = 'Integrate Private Updates';
			updateModalSubtitle.textContent = 'Set your GitHub token to securely access private AssistantX releases.';
			updateModalPrimaryButton.textContent = 'Save token';
			updateModalSecondaryButton.textContent = 'Later';
			if (updateTokenForm) updateTokenForm.hidden = false;
			if (updateModalError) {
				updateModalError.hidden = false;
				updateModalError.textContent = payload?.detail || 'Private update token is required.';
			}
			if (updateModalClearTokenButton) updateModalClearTokenButton.hidden = false;
			return;
		}

		updateModalTitle.textContent = 'AssistantX update available';
		updateModalSubtitle.textContent = 'What’s new in this update:';
		updateModalPrimaryButton.textContent = 'Update now';
		updateModalSecondaryButton.textContent = 'Later';
	}

	// ── Prompt submission ────────────────────────────────────────────────────
	async function submitPrompt() {
		const text = input.value.trim();
		if (!text) return;
		voiceGateway?.interrupt?.('new-prompt');
		if (typeof window !== 'undefined' && window.speechSynthesis) {
			window.speechSynthesis.cancel();
		}
		const handled = await handleIntegratedCommands(text);
		if (handled) {
			input.value = '';
			return;
		}
		queuePromptExecution(text, { source: 'local', origin: 'desktop' });
		appendMessage(log, 'Prompt queued', text, 'system');
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
			if (voiceGateway) {
				voiceGateway.setListeningForCommand(false);
			} else {
				sidecar.setListeningForCommand(false);
			}
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
				providerMode: voiceProviderModeSelect?.value || 'assistantx-server',
				temporalAwareness: Boolean(temporalAwarenessToggle?.checked),
				proactiveReminders: Boolean(proactiveRemindersToggle?.checked),
				ambientAnnouncements: Boolean(ambientAnnouncementsToggle?.checked),
				dailySummary: Boolean(dailySummaryToggle?.checked),
				reminderVoiceStyle: reminderVoiceStyleSelect?.value || 'neutral',
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
			const configuration = {
				wakeWordPhrase: voiceSettings.wakeWordPhrase || DEFAULT_JARVIS_WAKE_PHRASE,
				language: (voiceSettings.voiceLanguage || 'en-US').split('-')[0],
				wakeWordEnabled: Boolean(voiceSettings.wakeWordEnabled),
				sttEnabled: false,
				ttsEnabled: false,
				nlpEnabled: false,
				vadEnabled: true,
				sampleRate: 16000,
			};
			sidecar.configure(configuration);
			voiceGateway?.configure({
				...configuration,
				providerMode: voiceSettings.providerMode || 'assistantx-server',
				sttModel: voiceSettings.sttModel,
				persona: voiceSettings.ttsVoiceId,
				fallbackToBrowserSpeech: true,
			});
			// Start microphone capture immediately if wake word is enabled
			if (voiceSettings.wakeWordEnabled) {
				(voiceGateway || sidecar).startAudioCapture().catch(() => null);
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
			(voiceGateway || sidecar).setListeningForCommand(true);
		});

		sidecar.on('rms_level', ({ source, rms }) => {
			const scaled = Math.min(1, Math.max(0, Number(rms || 0) * 5.25));
			applyVisualizerEnergy(scaled);
			if (source === 'mic' && currentAgentState === AGENT_STATE.IDLE && scaled > 0.02) {
				setVoiceVisualizer('listening');
				return;
			}
			if (source === 'tts' && currentAgentState !== AGENT_STATE.SPEAKING && scaled > 0.02) {
				setVoiceVisualizer('speaking');
			}
			if (scaled > 0.01) touchAgentActivity();
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
				if (!voiceGateway) {
					sidecar.requestIntentParse(text, requestId);
				}
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
					speechPlaybackActive = true;
					setVoiceVisualizer('speaking');
					source.onended = () => {
						speechPlaybackActive = false;
						setVoiceVisualizer('idle');
						actx.close().catch(() => null);
					};
					source.start(0);
				}, () => {
					speechPlaybackActive = false;
					actx.close().catch(() => null);
				});
			} catch {
				speechPlaybackActive = false;
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
			ttsEnabled: false,
			nlpEnabled: false,
			vadEnabled: true,
		});
		voiceGateway?.configure({
			providerMode: voiceSettings.providerMode || 'assistantx-server',
			wakeWordPhrase: voiceSettings.wakeWordPhrase || DEFAULT_JARVIS_WAKE_PHRASE,
			language: (voiceSettings.voiceLanguage || 'en-US').split('-')[0],
			wakeWordEnabled: Boolean(voiceSettings.wakeWordEnabled),
			sttModel: voiceSettings.sttModel,
			persona: voiceSettings.ttsVoiceId,
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
		if (sidecarConnected && voiceSettings.autoTts && voiceGateway) {
			const tts = await voiceGateway.synthesize(enhanced, {
				persona: voiceSettings.ttsVoiceId,
				language: getVoiceLanguage(),
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
							setVoiceVisualizer('speaking');
							source.onended = () => {
								speechPlaybackActive = false;
								setVoiceVisualizer('idle');
								actx.close().catch(() => null);
							};
							source.start(0);
						}, () => {
							actx.close().catch(() => null);
						});
						return;
					}
				} catch {
					// Continue to fallback.
				}
			}
		}
		if (sidecarConnected && sidecar && voiceSettings.autoTts) {
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

		ipcRenderer.invoke('updater:get-auth-status').then((authState) => {
			if (authState?.required && !authState?.available) {
				showUpdateModal({
					mode: 'auth-required',
					payload: {
						status: 'error',
						detail: 'Private update token is required before checking for updates.',
						releaseNotes: {},
						requiresTokenSetup: true,
					},
				});
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
			const result = await ipcRenderer.invoke('check-for-updates');
			if (result?.ok === false && result.reason === 'not-packaged') {
				appendMessage(log, 'Updater', 'Running in dev mode — download and install the EXE to get automatic updates.', 'system');
				return;
			}
			if (result?.ok === false && (result.reason === 'updater-token-missing' || result.reason === 'updater-token-error')) {
				showUpdateModal({
					mode: 'auth-required',
					payload: {
						status: 'error',
						detail: 'Configure your private update token to continue.',
						releaseNotes: {},
						requiresTokenSetup: true,
					},
				});
			}
		});
	}

	if (ipcRenderer) {
		ipcRenderer.invoke('get-desktop-diagnostics').then((snapshot) => {
			if (!snapshot) return;
			appendMessage(log, 'Desktop diagnostics', `Startup status: ${snapshot.overall || 'unknown'}`, snapshot.overall === 'unavailable' ? 'error' : 'system');
		}).catch(() => null);

		if (typeof window.jarvisApi?.checkLocalAiSetup === 'function') {
			window.jarvisApi.checkLocalAiSetup().then((state) => {
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

			if (mode === 'auth-required') {
				const token = String(updateTokenInput?.value || '').trim();
				if (!token) {
					appendMessage(log, 'Updater', 'Token is required to access private updates.', 'error');
					return;
				}
				updateModalPrimaryButton.disabled = true;
				const result = await ipcRenderer.invoke('updater:set-token', token);
				updateModalPrimaryButton.disabled = false;
				if (!result?.ok) {
					appendMessage(log, 'Updater', `Token save failed: ${result?.reason || 'unknown error'}`, 'error');
					return;
				}
				if (updateTokenInput) updateTokenInput.value = '';
				appendMessage(log, 'Updater', 'Private update token saved securely.', 'system');
				closeUpdateModal();
				await ipcRenderer.invoke('check-for-updates');
				return;
			}

			if (mode === 'error') {
				await ipcRenderer.invoke('check-for-updates');
				return;
			}

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

	if (updateModalClearTokenButton && ipcRenderer) {
		updateModalClearTokenButton.addEventListener('click', async () => {
			const result = await ipcRenderer.invoke('updater:clear-token');
			if (!result?.ok) {
				appendMessage(log, 'Updater', `Token clear failed: ${result?.reason || 'unknown error'}`, 'error');
				return;
			}
			if (updateTokenInput) updateTokenInput.value = '';
			appendMessage(log, 'Updater', 'Private update token removed.', 'system');
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
			const badges = [];
			if (parsed.provider) badges.push(`provider:${parsed.provider}`);
			if (parsed.routeProfile) badges.push(`profile:${parsed.routeProfile}`);
			if (parsed.routeReason) badges.push(`route:${parsed.routeReason}`);
			if (parsed.model) badges.push(`model:${parsed.model}`);
			appendMessage(log, title, body, parsed.level === 'error' ? 'error' : 'system', badges);
			if (parsed.type === 'command_result' && parsed.level !== 'error') {
				void speakWithSidecar(getComfortableSpokenText(parsed, body));
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
			`<span>✅ ${a.provider}</span>`,
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

	async function refreshRuntimeUiFromConfig() {
		if (!serverApi) return;
		try {
			const config = await serverApi.getConfig();
			if (runtimeModeSelect) runtimeModeSelect.value = config.runtimeMode || 'local-desktop';
			if (remoteRuntimeApiUrlInput) remoteRuntimeApiUrlInput.value = config.remoteRuntimeApiUrl || '';
			if (remoteRuntimeWsUrlInput) remoteRuntimeWsUrlInput.value = config.remoteRuntimeWsUrl || '';
			const auth = await serverApi.getAuthStatus();
			if (runtimePermissionLevelSelect) runtimePermissionLevelSelect.value = auth.permissionLevel || 'default';
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

	if (runtimeApplyPermissionButton && serverApi) {
		runtimeApplyPermissionButton.addEventListener('click', async () => {
			const level = runtimePermissionLevelSelect?.value || 'default';
			const fullControlConsent = level === 'full';
			const result = await serverApi.setPermissionLevel(level, fullControlConsent);
			if (!result?.ok) {
				appendMessage(log, 'System Core', `Failed to set permission: ${result?.error || 'unknown'}`, 'error');
				return;
			}
			appendMessage(log, 'System Core', `Permission level set to ${level}.`);
			await refreshRuntimeStatus();
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
			const next = s.nextRunAt ? new Date(s.nextRunAt).toLocaleString() : 'n/a';
			return `<span>${s.enabled ? '🟢' : '⏸'} <strong>${s.label || s.command}</strong> · ${s.cronExpr} · next: ${next}</span>`;
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
			const when = item.triggerAt ? new Date(item.triggerAt).toLocaleString() : 'n/a';
			const done = item.completed ? '✅' : '🕒';
			const priority = Number(item.priority || 1);
			return `<span>${done} <strong>${item.label || item.text || 'Reminder'}</strong> · ${when} · p${priority}</span>`;
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
