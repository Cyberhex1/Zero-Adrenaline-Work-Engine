import React, { useState, useEffect } from 'react';
import { Maximize, Minimize, ListTodo, Timer, Activity, Sparkles, Wind, Disc, Pause } from 'lucide-react';
import { Header } from './components/Header';
import { TodoFocusBitsTab } from './components/TodoFocusBitsTab';
import { MicroSprintTimer } from './components/MicroSprintTimer';
import { MedicalSymptomsTab } from './components/MedicalSymptomsTab';
import { MeditationTab } from './components/MeditationTab';
import { YogaTab } from './components/YogaTab';
import { PanicOverlay } from './components/PanicOverlay';
import { SessionLogsModal } from './components/SessionLogsModal';
import { UserProfileModal } from './components/UserProfileModal';
import { NotesDrawer } from './components/NotesDrawer';
import { SettingsModal } from './components/SettingsModal';
import { SoundscapeMixerModal } from './components/SoundscapeMixerModal';
import { AnalyticsModal } from './components/AnalyticsModal';
import { TypingSoundEngine } from './components/TypingSoundEngine';
import { CuteUiDecorator } from './components/CuteUiDecorator';
import { GlobalMusicPlayerBar } from './components/GlobalMusicPlayerBar';
import { AccountSyncModal, SyncState } from './components/AccountSyncModal';
import { SessionLog, TodoItem, SymptomLog, UserProfile, NoteItem, ActiveTab, TrackItem, MusicPlaylist, AudioType } from './types';
import { audioSynth } from './lib/audioSynth';
import { DEFAULT_PLAYLISTS, extractYouTubeId } from './lib/musicData';
import { User } from 'firebase/auth';
import {
  auth,
  saveAppSnapshot,
  subscribeAppSnapshot,
  fetchAppSnapshot,
  AppSnapshot,
} from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { logoutGoogleWorkspace } from './lib/googleWorkspace';

const DEFAULT_PROFILE: UserProfile = {
  name: 'Calm Focus Worker',
  roleTitle: 'Zero-Adrenaline Specialist',
  dailyGoalBits: 5,
  preferredNoise: 'brown',
  avatarEmoji: '🌸',
  totalBitsLogged: 12,
  streakDays: 4,
  panicGroundingPhrase: 'I am completely safe. 1 Focus Bit is enough for today.',
  theme: 'light',
  xp: 150,
  cuteSoundEffects: true,
  cuteUiEffects: true,
  tabOrder: ['todo', 'sprint', 'meditation', 'yoga', 'medical'],
  activeSoundscapes: ['brown'],
  mixerVolumes: { brown: 0.5 },
};

const DEFAULT_TODOS: TodoItem[] = [
  {
    id: 't1',
    title: 'Finalize Q3 Performance Summary',
    completed: false,
    priority: 'high',
    eisenhower: 'urgent_important',
    rule135: 'big',
    isFrog: true,
    focusBits: [
      { id: 'b1', title: 'Open document & write heading', completed: true, createdAt: Date.now() - 10000 },
      { id: 'b2', title: 'List 3 core achievements', completed: false, createdAt: Date.now() - 5000 },
      { id: 'b3', title: 'Hit save and send draft', completed: false, createdAt: Date.now() },
    ],
    createdAt: Date.now() - 100000,
  },
  {
    id: 't2',
    title: 'Review weekly team updates',
    completed: false,
    priority: 'medium',
    eisenhower: 'not_urgent_important',
    rule135: 'medium',
    focusBits: [],
    createdAt: Date.now() - 50000,
  },
  {
    id: 't3',
    title: 'Clear 3 unread emails',
    completed: true,
    priority: 'low',
    eisenhower: 'urgent_not_important',
    rule135: 'small',
    focusBits: [],
    createdAt: Date.now() - 20000,
  },
];

const DEFAULT_SYMPTOMS: SymptomLog[] = [
  {
    id: 's1',
    date: 'Today, 9:15 AM',
    timestamp: Date.now() - 3600000,
    symptomName: 'Executive Freeze State',
    severity: 6,
    triggers: 'Incoming urgent email alert',
    copingMethod: '5-4-3-2-1 Grounding',
    notes: 'Grounding helped reduce heart rate within 3 minutes.',
  },
];

const DEFAULT_NOTES: NoteItem[] = [
  {
    id: 'n1',
    title: 'Somatic Micro-Goal',
    content: 'Outputting 30% with a calm heart is infinitely better than 100% with adrenaline dread.',
    category: 'somatic',
    pinned: true,
    date: 'Today',
    timestamp: Date.now(),
  },
  {
    id: 'n2',
    title: 'Unclench & Drop Shoulders 🌸',
    content: 'Take a sip of water, drop your shoulders away from your ears, and release your lower jaw.',
    category: 'gentle_reminders',
    pinned: true,
    date: 'Today',
    timestamp: Date.now() - 1000,
  },
  {
    id: 'n3',
    title: '1 Bit is a Total Victory 🌿',
    content: 'You do not need to finish everything today. Completing even 1 micro bit breaks executive paralysis.',
    category: 'gentle_reminders',
    pinned: false,
    date: 'Today',
    timestamp: Date.now() - 2000,
  },
];

const loadStored = <T,>(key: string, fallback: T): T => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as T) : fallback;
  } catch {
    return fallback;
  }
};

type SyncPayload = Omit<AppSnapshot, 'lastUpdated'>;

export type BackupData = Partial<SyncPayload>;

// Playback state is per-device and per-session: nothing resumes audio on load, and
// another device starting music shouldn't start (or claim to be playing) it here.
const resetPlayback = (profile: UserProfile): UserProfile => ({
  ...profile,
  isPlayingMusic: false,
  activeSoundscape: null,
});

const get2amCycleKey = (d: Date = new Date()): string => {
  const dateCopy = new Date(d);
  if (dateCopy.getHours() < 2) {
    dateCopy.setDate(dateCopy.getDate() - 1);
  }
  const year = dateCopy.getFullYear();
  const month = String(dateCopy.getMonth() + 1).padStart(2, '0');
  const day = String(dateCopy.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}-02:00`;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('todo');

  const [battery, setBattery] = useState<number>(() => {
    const saved = parseInt(localStorage.getItem('zawe_battery') ?? '', 10);
    return Number.isFinite(saved) ? Math.min(100, Math.max(0, saved)) : 100;
  });

  const [userProfile, setUserProfile] = useState<UserProfile>(() =>
    resetPlayback({
      ...DEFAULT_PROFILE,
      ...loadStored<Partial<UserProfile>>('zawe_profile', {}),
    })
  );

  const [todos, setTodos] = useState<TodoItem[]>(() => loadStored('zawe_todos', DEFAULT_TODOS));

  const [symptomLogs, setSymptomLogs] = useState<SymptomLog[]>(() =>
    loadStored('zawe_symptoms', DEFAULT_SYMPTOMS)
  );

  const [notes, setNotes] = useState<NoteItem[]>(() => loadStored('zawe_notes', DEFAULT_NOTES));

  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>(() =>
    loadStored<SessionLog[]>('zawe_session_logs', [])
  );

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isSnapshotLoaded, setIsSnapshotLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncState>('guest');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [syncErrorMsg, setSyncErrorMsg] = useState<string | null>(null);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState<boolean>(false);
  // Serialized form of the state last known to match the cloud copy. Used to skip
  // auto-saves for state that just arrived from the cloud (or was just written).
  const lastSyncedJsonRef = React.useRef<string | null>(null);
  // Always-current view of the syncable state, for async callbacks with stale closures.
  const syncStateRef = React.useRef<SyncPayload>({ userProfile, todos, symptomLogs, notes, sessionLogs, battery });
  syncStateRef.current = { userProfile, todos, symptomLogs, notes, sessionLogs, battery };

  const [activeSprintTaskTitle, setActiveSprintTaskTitle] = useState<string>('');
  const [isPanicOpen, setIsPanicOpen] = useState<boolean>(false);
  const [isLogsOpen, setIsLogsOpen] = useState<boolean>(false);
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);
  const [isNotesOpen, setIsNotesOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isZenMode, setIsZenMode] = useState<boolean>(false);
  const [isMixerOpen, setIsMixerOpen] = useState<boolean>(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isPlayerBarDismissed, setIsPlayerBarDismissed] = useState<boolean>(false);

  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    // Restart the timer so an earlier toast's timeout doesn't hide a newer message early
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 3500);
  };

  // Apply a snapshot received from the cloud and remember it as the synced baseline
  const applyRemoteSnapshot = (snapshot: AppSnapshot) => {
    const current = syncStateRef.current;
    const next: SyncPayload = {
      userProfile: snapshot.userProfile
        ? {
            ...DEFAULT_PROFILE,
            ...snapshot.userProfile,
            currentTrack: current.userProfile.currentTrack,
            isPlayingMusic: current.userProfile.isPlayingMusic,
            activeSoundscape: current.userProfile.activeSoundscape,
          }
        : current.userProfile,
      todos: snapshot.todos || current.todos,
      symptomLogs: snapshot.symptomLogs || current.symptomLogs,
      notes: snapshot.notes || current.notes,
      sessionLogs: snapshot.sessionLogs || current.sessionLogs,
      battery: typeof snapshot.battery === 'number' ? snapshot.battery : current.battery,
    };
    lastSyncedJsonRef.current = JSON.stringify(next);
    setUserProfile(next.userProfile);
    setTodos(next.todos);
    setSymptomLogs(next.symptomLogs);
    setNotes(next.notes);
    setSessionLogs(next.sessionLogs);
    setBattery(next.battery);
    setLastSyncedAt(snapshot.lastUpdated || Date.now());
    setSyncStatus('synced');
    setSyncErrorMsg(null);
  };

  // Write the current state to the cloud and record it as the synced baseline
  const saveCurrentSnapshot = async (uid: string) => {
    const payload = syncStateRef.current;
    const res = await saveAppSnapshot(uid, payload);
    if (res.success) {
      lastSyncedJsonRef.current = JSON.stringify(payload);
    }
    return res;
  };

  // Initialize Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      if (!user) {
        setSyncStatus('guest');
        setIsSnapshotLoaded(false);
        lastSyncedJsonRef.current = null;
      }
    });
    return () => unsubscribe();
  }, []);

  // Global Audio Context Unlocker on User Interaction
  useEffect(() => {
    const unlockAudio = () => {
      audioSynth.initCtx();
    };
    window.addEventListener('click', unlockAudio, { passive: true });
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio, { passive: true });
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  // Force Save / Manual Snapshot to Cloud
  const handleForceSync = async () => {
    if (!authUser) {
      setIsAccountModalOpen(true);
      triggerToast('Please sign in to enable Cloud Sync! ☁️');
      return;
    }
    if (!isSnapshotLoaded) {
      // Writing before the cloud copy has loaded would overwrite it with local data
      triggerToast('Still loading your cloud data — please try again in a moment.');
      throw new Error('Cloud snapshot is still loading');
    }
    setSyncStatus('syncing');
    const res = await saveCurrentSnapshot(authUser.uid);
    if (res.success) {
      setSyncStatus('synced');
      setLastSyncedAt(res.lastUpdated);
      setSyncErrorMsg(null);
      triggerToast('Cloud Snapshot saved successfully! ☁️');
    } else {
      setSyncStatus('error');
      setSyncErrorMsg(res.error || 'Failed to save');
      triggerToast('Sync failed: ' + (res.error || 'Unknown error'));
      throw new Error(res.error);
    }
  };

  // Restore latest cloud snapshot
  const handleRestoreFromCloud = async () => {
    if (!authUser) return;
    setSyncStatus('syncing');
    let snapshot: AppSnapshot | null;
    try {
      snapshot = await fetchAppSnapshot(authUser.uid);
    } catch (err: any) {
      setSyncStatus('error');
      setSyncErrorMsg(err?.message || 'Failed to restore from cloud');
      triggerToast('Restore failed: ' + (err?.message || 'Error'));
      throw err;
    }
    if (!snapshot) {
      setSyncStatus('synced');
      triggerToast('No cloud snapshot found to restore.');
      // Reject so callers don't report a successful restore
      throw new Error('No cloud snapshot found');
    }
    applyRemoteSnapshot(snapshot);
    setIsSnapshotLoaded(true);
    triggerToast('Restored state from Cloud Snapshot! ☁️');
  };

  // Online / Offline network event detection
  useEffect(() => {
    const handleOnline = () => {
      if (authUser) {
        // Failures are already surfaced via sync status + toast
        if (isSnapshotLoaded) handleForceSync().catch(() => {});
      } else {
        setSyncStatus('guest');
      }
    };
    const handleOffline = () => {
      setSyncStatus('offline');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [authUser, isSnapshotLoaded, userProfile, todos, symptomLogs, notes, sessionLogs, battery]);

  // Load and subscribe to cloud snapshot on Auth change
  useEffect(() => {
    if (!authUser) {
      setSyncStatus('guest');
      setIsSnapshotLoaded(false);
      return;
    }

    setSyncStatus('syncing');

    // If the cloud is slow to respond (e.g. slow or no network), tell the user rather than
    // unblocking auto-save: saving before the cloud copy loads would overwrite it with local data.
    const loadedFallback = setTimeout(() => {
      console.warn('Cloud snapshot is taking a long time to load');
      setSyncStatus('offline');
      setSyncErrorMsg('Waiting for cloud data — changes are kept on this device and will sync once connected.');
    }, 6000);

    const unsub = subscribeAppSnapshot(
      authUser.uid,
      async (snapshot) => {
        clearTimeout(loadedFallback);
        if (snapshot) {
          applyRemoteSnapshot(snapshot);
          setIsSnapshotLoaded(true);
        } else {
          // First time sign in for this user: automatically migrate existing local guest data to their cloud account!
          const res = await saveCurrentSnapshot(authUser.uid);
          if (res.success) {
            setSyncStatus('synced');
            setLastSyncedAt(res.lastUpdated);
            setSyncErrorMsg(null);
            setIsSnapshotLoaded(true);
            triggerToast('Welcome! Your tasks were saved to your cloud account 🌸');
          } else {
            setSyncStatus('error');
            setSyncErrorMsg(res.error || 'Failed to initialize cloud snapshot');
            setIsSnapshotLoaded(true);
          }
        }
      },
      (err) => {
        clearTimeout(loadedFallback);
        console.warn('Snapshot subscription issue:', err);
        setSyncStatus('error');
        setSyncErrorMsg(err.message || 'Subscription error');
        setIsSnapshotLoaded(true);
      }
    );
    return () => {
      clearTimeout(loadedFallback);
      unsub();
    };
  }, [authUser]);


  // Save snapshot continuously when state changes, debounced
  useEffect(() => {
    if (!authUser || !isSnapshotLoaded) return;

    if (!navigator.onLine) {
      setSyncStatus('offline');
      return;
    }

    // Only flip to 'syncing' right before the actual write, not on every render
    const timeout = setTimeout(async () => {
      // Skip writes for state that already matches the cloud (e.g. a just-applied remote update)
      if (JSON.stringify(syncStateRef.current) === lastSyncedJsonRef.current) return;
      setSyncStatus('syncing');
      const res = await saveCurrentSnapshot(authUser.uid);
      if (res.success) {
        setSyncStatus('synced');
        setLastSyncedAt(res.lastUpdated);
        setSyncErrorMsg(null);
      } else {
        setSyncStatus('error');
        setSyncErrorMsg(res.error || 'Failed to auto-save');
      }
    }, 800); // 800ms debounce — fast but not spammy

    return () => clearTimeout(timeout);
  }, [authUser, isSnapshotLoaded, userProfile, todos, symptomLogs, notes, sessionLogs, battery]);

  useEffect(() => {
    localStorage.setItem('zawe_battery', battery.toString());
  }, [battery]);

  useEffect(() => {
    localStorage.setItem('zawe_profile', JSON.stringify(userProfile));
    if (userProfile.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [userProfile]);

  useEffect(() => {
    localStorage.setItem('zawe_todos', JSON.stringify(todos));
  }, [todos]);

  useEffect(() => {
    localStorage.setItem('zawe_symptoms', JSON.stringify(symptomLogs));
  }, [symptomLogs]);

  useEffect(() => {
    localStorage.setItem('zawe_notes', JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    localStorage.setItem('zawe_session_logs', JSON.stringify(sessionLogs));
  }, [sessionLogs]);

  const addXp = (amount: number = 25) => {
    setUserProfile((prev) => {
      const nextXp = (prev.xp || 0) + amount;
      return { ...prev, xp: nextXp };
    });
    if (userProfile.cuteSoundEffects !== false) {
      audioSynth.playChime();
    }
  };

  const handleUpdateProfile = (updated: UserProfile) => {
    setUserProfile(updated);
  };

  const handleManualSync = async () => {
    if (!authUser) {
      setIsProfileOpen(false);
      await handleForceSync();
      throw new Error('Sign in to enable Cloud Sync');
    }
    await handleForceSync();
  };

  const handleRechargeBattery = () => {
    setBattery((prev) => Math.min(100, prev + 25));
    triggerToast('Recharged +25% Energy!');
  };

  const handleDrainBattery = (amount: number) => {
    setBattery((prev) => Math.max(0, prev - amount));
  };

  const handleAddTodo = (todo: Omit<TodoItem, 'id' | 'createdAt' | 'focusBits'> & Partial<Pick<TodoItem, 'focusBits'>>) => {
    const newTodo: TodoItem = {
      focusBits: [],
      ...todo,
      id: 't_' + Date.now(),
      createdAt: Date.now(),
    };
    setTodos((prev) => [newTodo, ...prev]);
    triggerToast('New task registered!');
  };

  const handleToggleTodo = (id: string) => {
    const target = todos.find((t) => t.id === id);
    if (!target) return;
    const nextCompleted = !target.completed;
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, completed: nextCompleted } : t)));
    if (nextCompleted) {
      addXp(30);
      setUserProfile((p) => ({
        ...p,
        totalBitsLogged: (p.totalBitsLogged || 0) + 1,
      }));
      triggerToast('+30 XP! Task Completed 🌸');
    }
  };

  const handleDeleteTodo = (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    triggerToast('Task removed.');
  };

  const handleUpdateTodo = (id: string, updatedFields: Partial<TodoItem>) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updatedFields } : t))
    );
    triggerToast('Task details updated ✨');
  };

  const handleShatterIntoFocusBits = (todoId: string, bits: string[]) => {
    setTodos((prev) =>
      prev.map((t) => {
        if (t.id === todoId) {
          const newBits = bits.map((title, i) => ({
            id: `b_${Date.now()}_${i}`,
            title,
            completed: false,
            createdAt: Date.now() + i,
          }));
          return {
            ...t,
            focusBits: [...(t.focusBits || []), ...newBits],
          };
        }
        return t;
      })
    );
    triggerToast(`Shattered into ${bits.length} Micro Focus Bits! 🔨`);
  };

  const handleToggleFocusBit = (todoId: string, bitId: string) => {
    const bit = todos.find((t) => t.id === todoId)?.focusBits?.find((b) => b.id === bitId);
    if (!bit) return;
    const next = !bit.completed;
    setTodos((prev) =>
      prev.map((t) =>
        t.id === todoId
          ? { ...t, focusBits: t.focusBits.map((b) => (b.id === bitId ? { ...b, completed: next } : b)) }
          : t
      )
    );
    if (next) {
      addXp(15);
      setUserProfile((p) => ({
        ...p,
        totalBitsLogged: (p.totalBitsLogged || 0) + 1,
      }));
      triggerToast('+15 XP! 1 Focus Bit Completed 🌱');
    }
  };

  const handleSendToSprint = (taskTitle: string) => {
    setActiveSprintTaskTitle(taskTitle);
    setActiveTab('sprint');
    triggerToast(`Sent "${taskTitle}" to Sprint Timer ⏱️`);
  };

  const handleLogTask = (title: string, durationSec: number = 300) => {
    const newLog: SessionLog = {
      id: 'log_' + Date.now(),
      taskTitle: title,
      date: new Date().toLocaleDateString(),
      durationMinutes: Math.round(durationSec / 60),
      timestamp: Date.now(),
      tasksCompleted: 1,
      completedBits: 1,
      energyEnd: battery,
      effortRating: 'Calm Focus',
      notes: `Completed sprint session: ${title}`,
    };
    setSessionLogs((prev) => [newLog, ...prev]);
    addXp(40);
    setUserProfile((p) => ({
      ...p,
      totalBitsLogged: (p.totalBitsLogged || 0) + 1,
    }));
    triggerToast(`Logged sprint session for "${title}" (+40 XP) 🎉`);
  };

  const handleAddSymptomLog = (log: Omit<SymptomLog, 'id' | 'timestamp' | 'date'> & Partial<Pick<SymptomLog, 'date'>>) => {
    const newLog: SymptomLog = {
      date: new Date().toLocaleString(),
      ...log,
      id: 'sym_' + Date.now(),
      timestamp: Date.now(),
    };
    setSymptomLogs((prev) => [newLog, ...prev]);
    addXp(10);
    triggerToast('Health & symptom log saved gently 🩺');
  };

  const handleDeleteSymptomLog = (id: string) => {
    setSymptomLogs((prev) => prev.filter((s) => s.id !== id));
    triggerToast('Log entry removed.');
  };

  const handleAddNote = (note: Omit<NoteItem, 'id' | 'timestamp' | 'date'> & Partial<Pick<NoteItem, 'date'>>) => {
    const newNote: NoteItem = {
      date: new Date().toLocaleDateString(),
      ...note,
      id: 'note_' + Date.now(),
      timestamp: Date.now(),
    };
    setNotes((prev) => [newNote, ...prev]);
    triggerToast('Note saved! 📝');
  };

  const handleDeleteNote = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    triggerToast('Note deleted.');
  };

  const handleTogglePinNote = (id: string) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n))
    );
  };

  const handleDailyReset = () => {
    setBattery(100);
    setTodos((prev) => prev.filter((t) => !t.completed));
    triggerToast('Daily Reset complete! Energy restored to 100% 🌿');
  };

  const handleClearAllData = async () => {
    // Sign out first, otherwise auto-save would push the fresh defaults over the cloud copy.
    // The cloud data is kept and comes back on the next sign-in.
    if (authUser) await logoutGoogleWorkspace();
    localStorage.removeItem('zawe_battery');
    localStorage.removeItem('zawe_profile');
    localStorage.removeItem('zawe_todos');
    localStorage.removeItem('zawe_symptoms');
    localStorage.removeItem('zawe_notes');
    localStorage.removeItem('zawe_session_logs');
    setBattery(100);
    setUserProfile(DEFAULT_PROFILE);
    setTodos(DEFAULT_TODOS);
    setSymptomLogs(DEFAULT_SYMPTOMS);
    setNotes(DEFAULT_NOTES);
    setSessionLogs([]);
    triggerToast('All data cleared to fresh defaults.');
  };

  // Apply an imported JSON backup directly to state; auto-save then pushes it to the cloud.
  // (Reloading instead let the existing cloud snapshot silently overwrite the import.)
  const handleImportBackup = (data: BackupData) => {
    if (data.userProfile) setUserProfile(resetPlayback({ ...DEFAULT_PROFILE, ...data.userProfile }));
    if (Array.isArray(data.todos)) setTodos(data.todos.map((t) => ({ ...t, focusBits: t.focusBits || [] })));
    if (Array.isArray(data.symptomLogs)) setSymptomLogs(data.symptomLogs);
    if (Array.isArray(data.notes)) setNotes(data.notes);
    if (Array.isArray(data.sessionLogs)) setSessionLogs(data.sessionLogs);
    if (typeof data.battery === 'number') setBattery(Math.min(100, Math.max(0, data.battery)));
    triggerToast('Backup restored! 📦');
  };

  const handleResetLevelXP = () => {
    handleUpdateProfile({
      ...userProfile,
      xp: 0,
      totalBitsLogged: 0,
      streakDays: 0,
    });
    triggerToast('Account Level, Focus Bits & Streaks reset to Level 1!');
  };

  // Single Audio Engine Handlers
  const pausedSoundscapeRef = React.useRef<AudioType | null>(null);
  const musicIframeRef = React.useRef<HTMLIFrameElement | null>(null);

  // Apply the music volume to the hidden YouTube player (enablejsapi=1 accepts postMessage commands)
  const applyMusicVolume = () => {
    musicIframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({
        event: 'command',
        func: 'setVolume',
        args: [Math.round((userProfile.musicVolume ?? 0.7) * 100)],
      }),
      '*'
    );
  };
  useEffect(applyMusicVolume, [userProfile.musicVolume]);

  const handlePlayTrack = (track: TrackItem, playlist?: MusicPlaylist) => {
    pausedSoundscapeRef.current = null;
    audioSynth.stopAllSoundscapes();
    setIsPlayerBarDismissed(false);
    setUserProfile((prev) => ({
      ...prev,
      activeSoundscape: null,
      currentTrack: track,
      isPlayingMusic: true,
    }));
    if (userProfile.cuteSoundEffects !== false) {
      audioSynth.playClickSound();
    }
    triggerToast(`Playing: ${track.title}`);
  };

  const getEmbedUrl = () => {
    if (!userProfile.currentTrack) return '';
    const ytId = userProfile.currentTrack.youtubeId || '';
    const ytUrl = userProfile.currentTrack.youtubeUrl || '';
    const isQueueTrack = ytId.includes('videoseries');

    // A specific video inside a playlist (e.g. a custom playlist's "Starting Track")
    const { videoId: urlVideoId, playlistId: urlPlaylistId } = extractYouTubeId(ytUrl || ytId);
    if (!isQueueTrack && urlVideoId && urlPlaylistId) {
      return `https://www.youtube-nocookie.com/embed/${urlVideoId}?list=${urlPlaylistId}&autoplay=1&playsinline=1&controls=1&enablejsapi=1`;
    }

    // Check if it's a playlist URL or list parameter
    // (11-char IDs are videos, even if they happen to start with PL/RD)
    if (
      isQueueTrack ||
      (ytId.length > 11 && (ytId.startsWith('PL') || ytId.startsWith('RD'))) ||
      (ytUrl && ytUrl.includes('list='))
    ) {
      const { playlistId } = extractYouTubeId(ytUrl || ytId);
      const list = playlistId || ytId.replace('videoseries?list=', '');
      return `https://www.youtube-nocookie.com/embed/videoseries?list=${list}&autoplay=1&playsinline=1&controls=1&enablejsapi=1`;
    }

    const { videoId } = extractYouTubeId(ytUrl || ytId);
    const cleanId =
      videoId ||
      ytId
        .split('?')[0]
        .replace('https://youtu.be/', '')
        .replace('https://www.youtube.com/watch?v=', '');
    return `https://www.youtube-nocookie.com/embed/${cleanId}?autoplay=1&playsinline=1&controls=1&enablejsapi=1`;
  };

  const handleTogglePlayPause = () => {
    if (userProfile.activeSoundscape) {
      pausedSoundscapeRef.current = userProfile.activeSoundscape;
      audioSynth.stopAllSoundscapes();
      setUserProfile((prev) => ({ ...prev, activeSoundscape: null }));
      triggerToast('Audio paused');
    } else if (pausedSoundscapeRef.current) {
      // Resume the soundscape that was paused (previously this started the default playlist)
      handlePlaySoundscape(pausedSoundscapeRef.current);
    } else if (userProfile.currentTrack) {
      const nextPlaying = !userProfile.isPlayingMusic;
      setUserProfile((prev) => ({ ...prev, isPlayingMusic: nextPlaying }));
      triggerToast(nextPlaying ? `Playing: ${userProfile.currentTrack.title}` : 'Music paused');
    } else {
      const first = DEFAULT_PLAYLISTS[0].tracks[0];
      handlePlayTrack(first);
    }
  };

  const handlePlaySoundscape = (type: AudioType) => {
    pausedSoundscapeRef.current = null;
    if (userProfile.activeSoundscape === type) {
      audioSynth.stopSoundscape(type);
      setUserProfile((prev) => ({ ...prev, activeSoundscape: null }));
      triggerToast('Soundscape stopped');
    } else {
      audioSynth.stopAllSoundscapes();
      const vol = userProfile.musicVolume ?? 0.7;
      audioSynth.playSoundscape(type, vol);
      setUserProfile((prev) => ({
        ...prev,
        isPlayingMusic: false,
        activeSoundscape: type,
      }));
      triggerToast(`Playing: ${type === 'brown' ? 'Brown Noise' : 'Hi Popping Synth'}`);
    }
  };

  const handleNextTrack = () => {
    const allPlaylists = [...DEFAULT_PLAYLISTS, ...(userProfile.musicPlaylists || [])];
    const currentTrack = userProfile.currentTrack;
    if (!currentTrack) return;

    const playlist = allPlaylists.find((p) => p.tracks.some((t) => t.id === currentTrack.id)) || allPlaylists[0];
    const currentIndex = playlist.tracks.findIndex((t) => t.id === currentTrack.id);
    // Current track no longer exists in any playlist: start from the top
    if (currentIndex === -1) return handlePlayTrack(playlist.tracks[0], playlist);
    const nextIndex = (currentIndex + 1) % playlist.tracks.length;
    handlePlayTrack(playlist.tracks[nextIndex], playlist);
  };

  const handlePrevTrack = () => {
    const allPlaylists = [...DEFAULT_PLAYLISTS, ...(userProfile.musicPlaylists || [])];
    const currentTrack = userProfile.currentTrack;
    if (!currentTrack) return;

    const playlist = allPlaylists.find((p) => p.tracks.some((t) => t.id === currentTrack.id)) || allPlaylists[0];
    const currentIndex = playlist.tracks.findIndex((t) => t.id === currentTrack.id);
    // Current track no longer exists in any playlist: start from the top
    if (currentIndex === -1) return handlePlayTrack(playlist.tracks[0], playlist);
    const prevIndex = (currentIndex - 1 + playlist.tracks.length) % playlist.tracks.length;
    handlePlayTrack(playlist.tracks[prevIndex], playlist);
  };

  const handleStopAllAudio = () => {
    pausedSoundscapeRef.current = null;
    audioSynth.stopAllSoundscapes();
    setUserProfile((prev) => ({
      ...prev,
      isPlayingMusic: false,
      activeSoundscape: null,
      currentTrack: null,
    }));
    triggerToast('Player closed');
  };

  // Tab Order definitions
  const defaultTabList: ActiveTab[] = ['todo', 'sprint', 'meditation', 'yoga', 'medical'];
  const userSavedOrder = userProfile.tabOrder || defaultTabList;
  const missingTabs = defaultTabList.filter((tab) => !userSavedOrder.includes(tab));
  const customTabOrder = [...userSavedOrder, ...missingTabs];

  const handleSelectTab = (tabKey: ActiveTab) => {
    audioSynth.playTabSound(userProfile.cuteSoundEffects !== false);
    setActiveTab(tabKey);
  };

  const tabDefs: Record<ActiveTab, { label: string; icon: React.ReactNode }> = {
    todo: { label: 'To-Do & Focus Bits', icon: <ListTodo className="w-4 h-4" /> },
    sprint: { label: 'Sprint Engine', icon: <Timer className="w-4 h-4" /> },
    meditation: { label: 'Meditation & Pacer', icon: <Wind className="w-4 h-4" /> },
    yoga: { label: 'Adaptive Yoga', icon: <Sparkles className="w-4 h-4" /> },
    medical: { label: 'Medical Symptoms', icon: <Activity className="w-4 h-4" /> },
  };

  return (
    <div className="min-h-screen bg-pink-50/50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-3 sm:p-5 md:p-8 flex justify-center font-sans antialiased selection:bg-pink-500/20 max-w-full overflow-x-hidden">
      <TypingSoundEngine enabled={userProfile.typingSounds !== false} />
      <CuteUiDecorator enabled={userProfile.cuteUiEffects !== false} />
      <div className="max-w-4xl w-full min-w-0 space-y-5 sm:space-y-6">
        
        {!isZenMode && (
          <>
          {/* Header */}
          <Header
            battery={battery}
            onRechargeBattery={handleRechargeBattery}
            onDrainBattery={handleDrainBattery}
            onSetBattery={(level) => setBattery(level)}
            onTogglePanic={() => setIsPanicOpen(true)}
            onOpenLogs={() => setIsLogsOpen(true)}
            onOpenProfile={() => setIsProfileOpen(true)}
            onOpenNotes={() => setIsNotesOpen(true)}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenAccountSync={() => setIsAccountModalOpen(true)}
            onOpenMixer={() => setIsMixerOpen(true)}
            onTogglePlayPause={handleTogglePlayPause}
            onDailyReset={handleDailyReset}
            userProfile={userProfile}
            onUpdateProfile={handleUpdateProfile}
            authUser={authUser}
            syncStatus={syncStatus}
            lastSyncedAt={lastSyncedAt}
          />

          {/* Primary Tab Navigation Bar with Thin Scrollbar */}
          <div className="relative group max-w-full min-w-0">
            <nav className="flex gap-2 overflow-x-auto pb-2.5 tab-scrollbar max-w-full min-w-0">
              {customTabOrder.map((tabKey) => {
                const def = tabDefs[tabKey];
                if (!def) return null;

                return (
                  <button
                    key={tabKey}
                    onClick={() => handleSelectTab(tabKey)}
                    className={`px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer shrink-0 ${
                      activeTab === tabKey
                        ? 'bg-pink-500 text-white shadow-md shadow-pink-500/20'
                        : 'bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {def.icon}
                    <span>{def.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
          </>
        )}

        {/* View Panels */}
        <main className={
          isZenMode 
            ? "fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950 p-4 sm:p-8 md:p-16 overflow-y-auto flex flex-col"
            : "bg-white/80 dark:bg-slate-900/90 border border-pink-100 dark:border-slate-800 backdrop-blur-xl rounded-3xl p-4 sm:p-6 md:p-8 shadow-xl shadow-pink-500/5 min-w-0 max-w-full overflow-hidden relative"
        }>
          
          <button
            onClick={() => setIsZenMode(!isZenMode)}
            className={`absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer ${isZenMode ? 'fixed top-6 right-6 z-50 bg-white/50 backdrop-blur shadow-sm border border-slate-200' : ''}`}
            title={isZenMode ? "Exit Zen Mode" : "Enter Zen Mode (Focus)"}
          >
            {isZenMode ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5 text-slate-300 hover:text-slate-600" />}
          </button>
          
          <div className={isZenMode ? "max-w-4xl w-full mx-auto flex-1 mt-8" : ""}>
            {activeTab === 'todo' && (
              <TodoFocusBitsTab
                todos={todos}
                onAddTodo={handleAddTodo}
                onUpdateTodo={handleUpdateTodo}
                onToggleTodo={handleToggleTodo}
                onDeleteTodo={handleDeleteTodo}
                onShatterIntoFocusBits={handleShatterIntoFocusBits}
                onToggleFocusBit={handleToggleFocusBit}
                onSendToSprint={handleSendToSprint}
              />
            )}

            {/* Kept mounted so a running sprint survives switching tabs */}
            <div hidden={activeTab !== 'sprint'}>
              <MicroSprintTimer
                onLogTask={handleLogTask}
                onDrainBattery={handleDrainBattery}
                activeTaskTitle={activeSprintTaskTitle}
              />
            </div>

            {activeTab === 'meditation' && <MeditationTab />}

            {activeTab === 'yoga' && <YogaTab />}

            {activeTab === 'medical' && (
              <MedicalSymptomsTab
                symptomLogs={symptomLogs}
                onAddLog={handleAddSymptomLog}
                onDeleteLog={handleDeleteSymptomLog}
              />
            )}
          </div>
        </main>

        {/* Toast Alert */}
        {toastMessage && (
          <div className="fixed bottom-6 right-6 bg-slate-900 border border-slate-700 text-slate-100 text-xs px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 animate-bounce z-40">
            <Sparkles className="w-4 h-4 text-pink-400" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Overlays & Modals */}
        <PanicOverlay
          isOpen={isPanicOpen}
          onClose={() => setIsPanicOpen(false)}
          onLogTask={handleLogTask}
          totalLogged={userProfile.totalBitsLogged}
        />

        <SessionLogsModal
          isOpen={isLogsOpen}
          onClose={() => setIsLogsOpen(false)}
          logs={sessionLogs}
          onClearLogs={() => setSessionLogs([])}
        />

        <UserProfileModal
          isOpen={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
          profile={userProfile}
          onUpdateProfile={(updated) => {
            handleUpdateProfile(updated);
            triggerToast('Updated profile preferences!');
          }}
          totalFocusBitsLogged={userProfile.totalBitsLogged}
          onOpenAnalytics={() => setIsAnalyticsOpen(true)}
          onManualSync={handleManualSync}
          onResetLevelXP={handleResetLevelXP}
          onOpenAccountSync={() => setIsAccountModalOpen(true)}
        />

        <SoundscapeMixerModal
          isOpen={isMixerOpen}
          onClose={() => setIsMixerOpen(false)}
          userProfile={userProfile}
          onUpdateProfile={handleUpdateProfile}
          onPlayTrack={handlePlayTrack}
          onTogglePlayPause={handleTogglePlayPause}
          onPlaySoundscape={handlePlaySoundscape}
          onStopAll={handleStopAllAudio}
        />

        {/* Global Mini Player Bar */}
        {!isPlayerBarDismissed && (
          <GlobalMusicPlayerBar
            userProfile={userProfile}
            onUpdateProfile={handleUpdateProfile}
            onOpenMixer={() => setIsMixerOpen(true)}
            onPlayTrack={handlePlayTrack}
            onTogglePlayPause={handleTogglePlayPause}
            onNextTrack={handleNextTrack}
            onPrevTrack={handlePrevTrack}
            onDismissBar={() => setIsPlayerBarDismissed(true)}
            onStopAll={handleStopAllAudio}
            embedUrl={getEmbedUrl()}
          />
        )}

        {/* Dismissed State Floating Pill (Audio Continues in Background) */}
        {isPlayerBarDismissed && (userProfile.isPlayingMusic || userProfile.activeSoundscape) && (
          <div className="fixed bottom-4 right-4 z-40 bg-slate-900/95 border border-pink-500/40 rounded-2xl p-2.5 shadow-2xl backdrop-blur-xl flex items-center gap-2.5 animate-slideUp text-white">
            <div
              className="w-8 h-8 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white shrink-0 cursor-pointer shadow-md"
              onClick={() => setIsPlayerBarDismissed(false)}
              title="Show Player Bar"
            >
              {userProfile.isPlayingMusic || userProfile.activeSoundscape ? (
                <div className="flex items-end gap-0.5 h-3.5">
                  <span className="w-1 bg-white rounded-full animate-bounce h-2.5"></span>
                  <span className="w-1 bg-white rounded-full animate-bounce h-3 delay-75"></span>
                  <span className="w-1 bg-white rounded-full animate-bounce h-1.5 delay-150"></span>
                </div>
              ) : (
                <Disc className="w-4 h-4 text-white" />
              )}
            </div>

            <div className="max-w-[130px] min-w-0">
              <p className="text-[11px] font-bold text-white truncate">
                {userProfile.currentTrack?.title ||
                  (userProfile.activeSoundscape === 'brown' ? 'Brown Noise' : 'Focus Soundscape')}
              </p>
              <p className="text-[9px] text-pink-400 font-medium truncate">
                Playing in Background
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsPlayerBarDismissed(false)}
              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-pink-300 text-[10px] font-bold cursor-pointer"
            >
              Show
            </button>

            <button
              type="button"
              onClick={handleTogglePlayPause}
              className="p-1.5 rounded-lg bg-pink-500 hover:bg-pink-400 text-white shadow-sm cursor-pointer"
              title="Pause"
            >
              <Pause className="w-3 h-3 fill-white" />
            </button>
          </div>
        )}

        {/* Persistent YouTube Audio Stream (Mounted in DOM with valid dimensions so browsers never mute or throttle) */}
        {userProfile.isPlayingMusic && userProfile.currentTrack && (
          <div
            className="fixed bottom-0 right-0 w-24 h-16 opacity-1 pointer-events-none overflow-hidden z-0 rounded-tl-xl"
            style={{ clipPath: 'inset(100%)' }}
            aria-hidden="true"
          >
            <iframe
              key={userProfile.currentTrack.id + '_' + userProfile.currentTrack.youtubeId}
              width="200"
              height="200"
              ref={musicIframeRef}
              onLoad={applyMusicVolume}
              src={getEmbedUrl()}
              title="Focus Audio Engine"
              allow="autoplay; encrypted-media; picture-in-picture"
            />
          </div>
        )}

        <AnalyticsModal
          isOpen={isAnalyticsOpen}
          onClose={() => setIsAnalyticsOpen(false)}
          userProfile={userProfile}
          symptomLogs={symptomLogs}
          sessionLogs={sessionLogs}
          todos={todos}
        />

        <NotesDrawer
          isOpen={isNotesOpen}
          onClose={() => setIsNotesOpen(false)}
          notes={notes}
          onAddNote={handleAddNote}
          onDeleteNote={handleDeleteNote}
          onTogglePin={handleTogglePinNote}
        />

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          userProfile={userProfile}
          profile={userProfile}
          onUpdateProfile={(updated) => {
            handleUpdateProfile(updated);
            triggerToast('Saved settings preferences!');
          }}
          onDailyReset={handleDailyReset}
          onClearAllData={handleClearAllData}
          onImportBackup={handleImportBackup}
          onResetLevelXP={handleResetLevelXP}
          authUser={authUser}
          onOpenAccountSync={() => setIsAccountModalOpen(true)}
          syncStatus={syncStatus}
          lastSyncedAt={lastSyncedAt}
          onGoogleLogout={async () => {
            await logoutGoogleWorkspace();
            // Do NOT wipe local data on sign-out — data stays locally
            // and will be re-loaded from cloud on next sign-in
            triggerToast('Signed out. Your local data is preserved.');
          }}
        />

        <AccountSyncModal
          isOpen={isAccountModalOpen}
          onClose={() => setIsAccountModalOpen(false)}
          authUser={authUser}
          syncStatus={syncStatus}
          lastSyncedAt={lastSyncedAt}
          syncErrorMsg={syncErrorMsg}
          userProfile={userProfile}
          todos={todos}
          symptomLogs={symptomLogs}
          notes={notes}
          sessionLogs={sessionLogs}
          battery={battery}
          onForceSync={handleForceSync}
          onRestoreFromCloud={handleRestoreFromCloud}
          onClearLocalData={handleClearAllData}
          onImportBackup={handleImportBackup}
        />
      </div>
    </div>
  );
}
