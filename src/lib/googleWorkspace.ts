import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  User,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);

// Plain Google sign-in (basic profile/email only; no extra Workspace API scopes)
const provider = new GoogleAuthProvider();

export const signInWithGoogleWorkspace = async (): Promise<{ user: User } | null> => {
  try {
    const result = await signInWithPopup(auth, provider);
    return { user: result.user };
  } catch (err: any) {
    console.warn('Google login issue:', err?.message || err);
    throw err;
  }
};

export const logoutGoogleWorkspace = async () => {
  await signOut(auth);
  // Clean up the access token stored by earlier versions that requested Workspace scopes
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('zawe_google_token');
  }
};

export const signInWithEmail = async (email: string, pass: string) => {
  return await signInWithEmailAndPassword(auth, email, pass);
};

export const signUpWithEmail = async (email: string, pass: string) => {
  return await createUserWithEmailAndPassword(auth, email, pass);
};

export const sendResetPassword = async (email: string) => {
  return await sendPasswordResetEmail(auth, email);
};
