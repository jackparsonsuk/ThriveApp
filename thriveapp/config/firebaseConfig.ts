import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
// @ts-ignore - TS doesn't always find this export in the firebase types
import { getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: "AIzaSyBJaNNuYUL5-Ih4poJxwpr8mdm0TxMaQEs",
  authDomain: "thrivecollective-88112.firebaseapp.com",
  projectId: "thrivecollective-88112",
  storageBucket: "thrivecollective-88112.firebasestorage.app",
  messagingSenderId: "860901768520",
  appId: "1:860901768520:web:cefe8eecb799cbc2d4877d",
  measurementId: "G-V73N6D81T0"
};

let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

let auth: ReturnType<typeof getAuth>;
try {
  // Use React Native specific initialization with AsyncStorage for persistence
  // Note: Standard web initialization is fine for Expo Web, but we need React Native specific for mobile
  if (Platform.OS === 'web') {
    auth = getAuth(app);
  } else {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });
  }
} catch (error) {
  // Fallback in case initializeAuth throws when auth is already initialized
  auth = getAuth(app);
}

const db = getFirestore(app);

export { app, auth, db };
