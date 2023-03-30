// Import the functions you need from the SDKs you need
import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from 'firebase/app-check';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: 'AIzaSyBphO--zzEFl5z9BIKmtLpnmoTR-0vXNOo',
  authDomain: 'explain-this-pr.firebaseapp.com',
  projectId: 'explain-this-pr',
  storageBucket: 'explain-this-pr.appspot.com',
  messagingSenderId: '365925585278',
  appId: '1:365925585278:web:19073846dfacc129ec232f',
  measurementId: 'G-FB7XCWHRFH',
};
const captchaClientId = '6Lca10ElAAAAAPcl5hgTBiIb5TdT44UoEX74CaTL';

const { REACT_APP_APPCHECK_DEBUG } = process.env;

// @ts-ignore
// eslint-disable-next-line no-restricted-globals
self.FIREBASE_APPCHECK_DEBUG_TOKEN = REACT_APP_APPCHECK_DEBUG === 'true';

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app);
export const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(captchaClientId),
  isTokenAutoRefreshEnabled: true,
});
