import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { UserProfile, TodoItem, SymptomLog, NoteItem, SessionLog, MedicationItem } from '../types';

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const db =
  firebaseConfig.firestoreDatabaseId &&
  firebaseConfig.firestoreDatabaseId !== '(default)' &&
  !firebaseConfig.firestoreDatabaseId.startsWith('(')
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);

export const auth = getAuth(app);

export interface AppSnapshot {
  userProfile: UserProfile;
  todos: TodoItem[];
  symptomLogs: SymptomLog[];
  notes: NoteItem[];
  sessionLogs: SessionLog[];
  medications?: MedicationItem[];
  battery: number;
  lastUpdated: number;
}

/**
 * Deeply sanitizes an object before writing to Firestore by removing `undefined`
 * values and normalizing data so Firestore setDoc never rejects the payload.
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === undefined) {
    return null as unknown as T;
  }
  if (data === null || typeof data !== 'object') {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  const cleanObj: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      cleanObj[key] = sanitizeForFirestore(value);
    }
  }
  return cleanObj as T;
}

/**
 * Persists an application snapshot into Firestore under `/users/{userId}/snapshot/main`.
 * Guarantees sanitization and returns explicit status.
 */
export async function saveAppSnapshot(
  userId: string,
  snapshot: Omit<AppSnapshot, 'lastUpdated'>
): Promise<{ success: boolean; lastUpdated: number; error?: string }> {
  if (!userId) {
    return { success: false, lastUpdated: Date.now(), error: 'No user ID provided' };
  }

  const lastUpdated = Date.now();
  const rawPayload: AppSnapshot = {
    userProfile: snapshot.userProfile,
    todos: snapshot.todos || [],
    symptomLogs: snapshot.symptomLogs || [],
    notes: snapshot.notes || [],
    sessionLogs: snapshot.sessionLogs || [],
    medications: snapshot.medications || [],
    battery: typeof snapshot.battery === 'number' ? snapshot.battery : 100,
    lastUpdated,
  };

  const cleanPayload = sanitizeForFirestore(rawPayload);

  try {
    const docRef = doc(db, 'users', userId, 'snapshot', 'main');

    // Race the Firestore write against a 10-second timeout so we never hang forever
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Firestore write timed out after 10s')), 10000);
    });

    try {
      await Promise.race([setDoc(docRef, cleanPayload, { merge: true }), timeoutPromise]);
    } finally {
      clearTimeout(timeoutId);
    }
    return { success: true, lastUpdated };
  } catch (err: any) {
    console.error('Firebase saveAppSnapshot error:', err?.code, err?.message, err);
    return {
      success: false,
      lastUpdated,
      error: err?.message || 'Failed to save snapshot to Firestore',
    };
  }
}


/**
 * Explicitly fetches the cloud snapshot from Firestore for a given user.
 */
export async function fetchAppSnapshot(userId: string): Promise<AppSnapshot | null> {
  if (!userId) return null;
  try {
    const docRef = doc(db, 'users', userId, 'snapshot', 'main');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as AppSnapshot;
    }
    return null;
  } catch (err) {
    console.error('Firebase fetchAppSnapshot error:', err);
    throw err;
  }
}

/**
 * Subscribes to real-time updates for a user's cloud snapshot.
 */
export function subscribeAppSnapshot(
  userId: string,
  onUpdate: (snapshot: AppSnapshot | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  if (!userId) {
    onUpdate(null);
    return () => {};
  }

  const docRef = doc(db, 'users', userId, 'snapshot', 'main');
  return onSnapshot(
    docRef,
    (docSnap) => {
      // Local (latency-compensated) echoes of our own writes are not remote updates;
      // re-applying them would clobber edits made while the write was in flight.
      const { hasPendingWrites, fromCache } = docSnap.metadata;
      if (hasPendingWrites) return;
      if (docSnap.exists()) {
        onUpdate(docSnap.data() as AppSnapshot);
      } else if (!fromCache) {
        // Only trust "no snapshot" when the server confirmed it. A cache miss while
        // offline would otherwise look like a brand-new account and overwrite cloud data.
        onUpdate(null);
      }
    },
    (err) => {
      console.error('Firebase subscribeAppSnapshot error:', err);
      if (onError) {
        onError(err);
      }
    }
  );
}
