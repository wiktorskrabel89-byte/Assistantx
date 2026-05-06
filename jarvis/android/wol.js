// jarvis/android/wol.js
// Wake-on-LAN client for the Jarvis Android app.
//
// This module sends a WoL request to the Next.js API (/api/jarvis/wol),
// which in turn broadcasts the magic packet on the local network.
// The Next.js server must be accessible from the Android device (same
// network, or a cloud-deployed instance with network access to the PC).

import AsyncStorage from '@react-native-async-storage/async-storage';

const MAC_STORAGE_KEY = 'jarvis-wol-mac';
const SERVER_STORAGE_KEY = 'jarvis-wol-server';

/** Save MAC address to persistent storage. */
export async function saveMac(mac) {
  await AsyncStorage.setItem(MAC_STORAGE_KEY, mac.trim());
}

/** Load the saved MAC address. */
export async function loadMac() {
  return (await AsyncStorage.getItem(MAC_STORAGE_KEY)) || '';
}

/** Save the server base URL to persistent storage. */
export async function saveServerUrl(url) {
  await AsyncStorage.setItem(SERVER_STORAGE_KEY, url.trim().replace(/\/$/, ''));
}

/** Load the saved server base URL. */
export async function loadServerUrl() {
  return (await AsyncStorage.getItem(SERVER_STORAGE_KEY)) || 'http://192.168.1.100:3000';
}

/**
 * Send a Wake-on-LAN magic packet via the Jarvis API.
 *
 * @param {string} mac - MAC address e.g. "AA:BB:CC:DD:EE:FF"
 * @param {string} serverUrl - Base URL of the Next.js server e.g. "http://192.168.1.100:3000"
 * @param {string} [broadcast] - Broadcast address, default "255.255.255.255"
 * @returns {Promise<{ ok: boolean; message: string }>}
 */
export async function sendWakeOnLan(mac, serverUrl, broadcast = '255.255.255.255') {
  if (!mac || !serverUrl) {
    throw new Error('MAC address and server URL are required.');
  }

  const endpoint = `${serverUrl}/api/jarvis/wol`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mac, broadcast }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Server returned ${response.status}`);
  }

  return data;
}
