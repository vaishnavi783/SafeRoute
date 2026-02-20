const firebaseConfig = {
  apiKey: "AIzaSyAIpUgCaAe0megpkj7SbLxKkrQT0m9JEjs",
  authDomain: "safe-route-8a84f.firebaseapp.com",
  projectId: "safe-route-8a84f",
  storageBucket: "safe-route-8a84f.firebasestorage.app",
  messagingSenderId: "133623430465",
  appId: "1:133623430465:web:97746e5ce9de790989b5c0"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firestore
const db = firebase.firestore();
