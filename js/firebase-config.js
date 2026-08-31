/**
 * =========================================================================
 * Zap Track - JSW Steel Electrical Engineering Department
 * Cloud Database Backend Configuration (Firebase Firestore)
 * Project: zaptrack-ff847
 * =========================================================================
 */

window.firebaseConfig = {
  apiKey: "AIzaSyApl8l_sGDhvPQx366AwORzfXL6kx1p-2M",
  authDomain: "zaptrack-ff847.firebaseapp.com",
  projectId: "zaptrack-ff847",
  storageBucket: "zaptrack-ff847.firebasestorage.app",
  messagingSenderId: "393317459941",
  appId: "1:393317459941:web:ae358e4bd7361df03df10c"
};

/**
 * Helper to check if valid cloud database keys have been provided
 */
window.isFirebaseConfigured = function() {
  return window.firebaseConfig &&
         typeof window.firebaseConfig.apiKey === 'string' &&
         window.firebaseConfig.apiKey.trim() !== "" &&
         window.firebaseConfig.apiKey !== "YOUR_API_KEY_HERE" &&
         typeof window.firebaseConfig.projectId === 'string' &&
         window.firebaseConfig.projectId.trim() !== "" &&
         window.firebaseConfig.projectId !== "YOUR_PROJECT_ID";
};

// Initialize Firebase App & Firestore instance
(function initFirebase() {
  if (typeof firebase !== 'undefined' && window.isFirebaseConfigured()) {
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(window.firebaseConfig);
      }
      window.db = firebase.firestore();
      
      // Enable multi-tab offline caching persistence
      window.db.enablePersistence({ synchronizeTabs: true }).catch(function(err) {
        if (err.code === 'failed-precondition') {
          console.warn('[Firestore] Multiple tabs open, persistence enabled in first tab only.');
        } else if (err.code === 'unimplemented') {
          console.warn('[Firestore] Browser does not support offline persistence.');
        }
      });
      console.log('✓ [Zap Track] Firebase Firestore Cloud Backend connected successfully to zaptrack-ff847');
    } catch (e) {
      console.error('[Zap Track] Firebase initialization error:', e);
    }
  } else {
    console.log('[Zap Track] Running in Local Storage Mode');
  }
})();