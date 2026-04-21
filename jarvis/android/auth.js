// jarvis/android/auth.js
// Prosty szkielet autoryzacji telefonu (token)

import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getToken() {
  let token = await AsyncStorage.getItem('token');
  if (!token) {
    token = generateToken();
    await AsyncStorage.setItem('token', token);
  }
  return token;
}

function generateToken() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Przykład użycia:
// const token = await getToken();
// console.log('Token telefonu:', token);
