import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';

// Firebase configuration - replace with your project values
// Get these from: Firebase Console > Project Settings > Your Apps > SDK setup and configuration
const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

let app: FirebaseApp;
let messaging: Messaging | undefined;

// Initialize Firebase only once
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
  
  // Only set up messaging in client code (not SSR)
  if (typeof window !== 'undefined') {
    messaging = getMessaging(app);
  }
}

export { app, messaging, getToken, onMessage };
