jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  return {
    getItem: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    setItem: jest.fn(async (key, value) => {
      store.set(key, value);
    }),
    __reset: () => store.clear(),
  };
}, { virtual: true });

jest.mock('react-native', () => ({
  Linking: {
    canOpenURL: jest.fn(async () => true),
    openURL: jest.fn(async () => true),
  },
}), { virtual: true });

const AsyncStorage = require('@react-native-async-storage/async-storage');
const { checkForUpdate, dismissUpdate } = require('../../jarvis/android/updater');

describe('jarvis android updater', () => {
  const mockFetch = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
    AsyncStorage.__reset();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns update when manifest has newer android version', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        channels: {
          stable: {
            android: {
              latestVersion: '9.9.9',
              url: 'https://updates.assistantx.pl/android/Jarvis-android.apk',
              releaseNotes: 'New manifest build',
              publishedAt: '2026-05-23T21:00:00.000Z',
            },
          },
        },
      }),
    });

    const result = await checkForUpdate('');
    expect(result?.hasUpdate).toBe(true);
    expect(result?.version).toBe('9.9.9');
    expect(result?.downloadUrl).toContain('Jarvis-android.apk');
  });

  it('respects dismissed build id for manifest updates', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        channels: {
          stable: {
            android: {
              latestVersion: '9.9.8',
              url: 'https://updates.assistantx.pl/android/Jarvis-android.apk',
              publishedAt: '2026-05-23T20:00:00.000Z',
            },
          },
        },
      }),
    });

    const first = await checkForUpdate('');
    expect(first?.updatedAt).toBeTruthy();
    await dismissUpdate(first.updatedAt);
    const second = await checkForUpdate('');
    expect(second).toBeNull();
  });
});
