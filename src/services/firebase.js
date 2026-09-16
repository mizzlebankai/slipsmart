const admin = require('firebase-admin');

let app = null;
let firestore = null;
const USERS_COLLECTION = process.env.FIRESTORE_USERS_COLLECTION || 'slipsmart_users';

function initialize() {
  if (app || !process.env.FIREBASE_PROJECT_ID) return;

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credential = serviceAccount
    ? admin.credential.cert(JSON.parse(serviceAccount))
    : admin.credential.applicationDefault();

  app = admin.initializeApp({
    credential,
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
  firestore = admin.firestore(app);
}

function isConfigured() {
  return Boolean(process.env.FIREBASE_PROJECT_ID);
}

function clientConfig() {
  return {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || '',
  };
}

async function verifyIdToken(idToken) {
  initialize();
  if (!app) throw new Error('Firebase authentication is not configured.');
  return admin.auth(app).verifyIdToken(idToken);
}

async function getUserProfile(uid) {
  initialize();
  if (!firestore) return null;
  const snapshot = await firestore.collection(USERS_COLLECTION).doc(uid).get();
  return snapshot.exists ? snapshot.data() : null;
}

async function createUserProfile(uid, data) {
  initialize();
  if (!firestore) return;
  await firestore.collection(USERS_COLLECTION).doc(uid).set(data, { merge: true });
}

module.exports = { isConfigured, clientConfig, verifyIdToken, getUserProfile, createUserProfile };