// ==========================================
// Firebase Configuration
// ==========================================

const firebaseConfig = {
  apiKey: "AIzaSyBiggCKjgBHnWw3SxXQG0neeDhAuxUYkxw",
  authDomain: "muton-2802c.firebaseapp.com",
  projectId: "muton-2802c",
  storageBucket: "muton-2802c.firebasestorage.app",
  messagingSenderId: "477294633549",
  appId: "1:477294633549:web:e4a54fd4a3cc8328913204",
  measurementId: "G-1EZYBD9R7Y"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firestore with offline persistence
const db = firebase.firestore();
db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('Firestore persistence failed: multiple tabs open');
  } else if (err.code === 'unimplemented') {
    console.warn('Firestore persistence not available in this browser');
  }
});

// Initialize Auth
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();
