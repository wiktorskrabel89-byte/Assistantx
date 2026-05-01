import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getToken() {
  let token = await AsyncStorage.getItem('jarvis-device-token');
  if (!token) {
    token = generateToken();
    await AsyncStorage.setItem('jarvis-device-token', token);
  }
  return token;
}

function generateToken() {
  return `android-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
