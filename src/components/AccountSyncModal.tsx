import React, { useState, useEffect } from 'react';
import {
  X,
  Cloud,
  CloudCheck,
  CloudUpload,
  CloudDownload,
  CloudOff,
  RefreshCw,
  User,
  Shield,
  ShieldCheck,
  AlertTriangle,
  LogIn,
  LogOut,
  Mail,
  Lock,
  KeyRound,
  UserPlus,
  FileJson,
  Download,
  Upload,
  Check,
  Sparkles,
  Database,
  ListTodo,
  FileText,
  Activity,
  Timer,
  BatteryCharging,
} from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { UserProfile, TodoItem, SymptomLog, NoteItem, SessionLog } from '../types';
import { auth } from '../lib/firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import { signInWithGoogleWorkspace } from '../lib/googleWorkspace';

export type SyncState = 'synced' | 'syncing' | 'error' | 'offline' | 'guest';

interface AccountSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  authUser: FirebaseUser | null;
  syncStatus: SyncState;
  lastSyncedAt: number | null;
  syncErrorMsg: string | null;
  userProfile: UserProfile;
  todos: TodoItem[];
  symptomLogs: SymptomLog[];
  notes: NoteItem[];
  sessionLogs: SessionLog[];
  battery: number;
  onForceSync: () => Promise<void>;
  onRestoreFromCloud: () => Promise<void>;
  onClearLocalData: () => void;
}

export const AccountSyncModal: React.FC<AccountSyncModalProps> = ({
  isOpen,
  onClose,
  authUser,
  syncStatus,
  lastSyncedAt,
  syncErrorMsg,
  userProfile,
  todos,
  symptomLogs,
  notes,
  sessionLogs,
  battery,
  onForceSync,
  onRestoreFromCloud,
  onClearLocalData,
}) => {
  // Auth Form State
  const [authTab, setAuthTab] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [emailInput, setEmailInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);

  // Sync Action State
  const [isSyncingNow, setIsSyncingNow] = useState<boolean>(false);
  const [isRestoringNow, setIsRestoringNow] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Relative time updater
  const [timeAgoStr, setTimeAgoStr] = useState<string>('Never');

  useEffect(() => {
    if (!lastSyncedAt) {
      setTimeAgoStr('Not yet synced in this session');
      return;
    }
    const updateRelative = () => {
      const diffSec = Math.floor((Date.now() - lastSyncedAt) / 1000);
      if (diffSec < 5) {
        setTimeAgoStr('Just now (Live)');
      } else if (diffSec < 60) {
        setTimeAgoStr(`${diffSec} seconds ago`);
      } else if (diffSec < 3600) {
        const mins = Math.floor(diffSec / 60);
        setTimeAgoStr(`${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`);
      } else {
        setTimeAgoStr(new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
    };
    updateRelative();
    const interval = setInterval(updateRelative, 5000);
    return () => clearInterval(interval);
  }, [lastSyncedAt]);

  if (!isOpen) return null;

  const handleEmailAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);

    if (!emailInput.trim()) {
      setAuthError('Please enter a valid email address.');
      return;
    }
    if (authTab !== 'forgot' && !passwordInput.trim()) {
      setAuthError('Please enter your password.');
      return;
    }

    setIsAuthLoading(true);
    try {
      if (authTab === 'signin') {
        const cred = await signInWithEmailAndPassword(auth, emailInput.trim(), passwordInput);
        setAuthSuccess(`Signed in successfully as ${cred.user.email}!`);
      } else if (authTab === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, emailInput.trim(), passwordInput);
        setAuthSuccess(`Account created! Signed in as ${cred.user.email}.`);
      } else if (authTab === 'forgot') {
        await sendPasswordResetEmail(auth, emailInput.trim());
        setAuthSuccess(`Password reset instructions sent to ${emailInput.trim()}.`);
      }
    } catch (err: any) {
      console.warn('Authentication error:', err);
      let msg = err.message || 'Authentication failed.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        msg = 'Invalid email or password. Please check your credentials.';
      } else if (err.code === 'auth/wrong-password') {
        msg = 'Incorrect password. Try again or reset password.';
      } else if (err.code === 'auth/email-already-in-use') {
        msg = 'An account with this email already exists. Switch to Sign In.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Password should be at least 6 characters long.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      }
      setAuthError(msg);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setAuthSuccess(null);
    setIsAuthLoading(true);
    try {
      const res = await signInWithGoogleWorkspace();
      if (res?.user) {
        setAuthSuccess(`Signed in as ${res.user.displayName || res.user.email}!`);
      }
    } catch (err: any) {
      console.warn('Google Sign-in failed:', err);
      setAuthError(err?.message || 'Google Sign-in was cancelled or encountered an error.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setAuthSuccess('Signed out successfully.');
      setTimeout(() => setAuthSuccess(null), 3000);
    } catch (err: any) {
      setAuthError(err?.message || 'Failed to sign out');
    }
  };

  const triggerForceSync = async () => {
    setIsSyncingNow(true);
    setActionFeedback('Uploading cloud snapshot...');
    try {
      await onForceSync();
      setActionFeedback('✨ Cloud Snapshot verified and saved!');
    } catch (err: any) {
      setActionFeedback('❌ Sync failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsSyncingNow(false);
      setTimeout(() => setActionFeedback(null), 3500);
    }
  };

  const triggerRestore = async () => {
    if (!window.confirm('Restore latest snapshot from Cloud? This will replace any unsynced local changes with your cloud snapshot.')) {
      return;
    }
    setIsRestoringNow(true);
    setActionFeedback('Pulling latest snapshot from cloud...');
    try {
      await onRestoreFromCloud();
      setActionFeedback('✨ Restored state successfully from cloud!');
    } catch (err: any) {
      setActionFeedback('❌ Restore failed: ' + (err?.message || 'No cloud snapshot found'));
    } finally {
      setIsRestoringNow(false);
      setTimeout(() => setActionFeedback(null), 3500);
    }
  };

  const handleExportJSON = () => {
    const backupData = {
      version: '3.5',
      exportDate: new Date().toISOString(),
      userProfile,
      todos,
      symptomLogs,
      notes,
      sessionLogs,
      battery,
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mental_medic_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.userProfile) localStorage.setItem('zawe_profile', JSON.stringify(parsed.userProfile));
        if (parsed.todos) localStorage.setItem('zawe_todos', JSON.stringify(parsed.todos));
        if (parsed.symptomLogs) localStorage.setItem('zawe_symptoms', JSON.stringify(parsed.symptomLogs));
        if (parsed.notes) localStorage.setItem('zawe_notes', JSON.stringify(parsed.notes));
        if (parsed.sessionLogs) localStorage.setItem('zawe_session_logs', JSON.stringify(parsed.sessionLogs));
        if (parsed.battery) localStorage.setItem('zawe_battery', parsed.battery.toString());

        alert('Backup successfully imported! Refreshing page to load state.');
        window.location.reload();
      } catch (err) {
        alert('Invalid JSON backup file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-pink-200 dark:border-slate-800 rounded-3xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-pink-50/50 dark:bg-slate-850">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-pink-500 text-white flex items-center justify-center shadow-sm">
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
                Cloud Account & Continuous Sync
              </h2>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Live multi-device snapshot backup engine
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 text-xs text-slate-700 dark:text-slate-300">
          
          {/* Status Indicator Card */}
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 dark:text-slate-200">Sync Status</span>
              </div>

              {/* Status Badge */}
              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase flex items-center gap-1.5 shadow-2xs ${
                  !authUser
                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    : syncStatus === 'syncing'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                    : syncStatus === 'error'
                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                    : syncStatus === 'offline'
                    ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                }`}
              >
                {!authUser && <CloudOff className="w-3 h-3" />}
                {authUser && syncStatus === 'syncing' && <RefreshCw className="w-3 h-3 animate-spin" />}
                {authUser && syncStatus === 'synced' && <CloudCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />}
                {authUser && syncStatus === 'error' && <AlertTriangle className="w-3 h-3 text-rose-500" />}
                {authUser && syncStatus === 'offline' && <CloudOff className="w-3 h-3" />}
                <span>
                  {!authUser
                    ? 'Guest Mode (Local Only)'
                    : syncStatus === 'syncing'
                    ? 'Syncing to Cloud...'
                    : syncStatus === 'error'
                    ? 'Sync Error'
                    : syncStatus === 'offline'
                    ? 'Offline (Cached)'
                    : 'Live Cloud Synced'}
                </span>
              </span>
            </div>

            {/* Sync Details Banner */}
            {authUser ? (
              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 dark:text-slate-400">Account:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100 truncate max-w-[200px]">
                    {authUser.email || authUser.displayName || 'Authenticated User'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 dark:text-slate-400">Last Snapshot:</span>
                  <span className="font-semibold text-pink-600 dark:text-pink-400">{timeAgoStr}</span>
                </div>
                {syncErrorMsg && (
                  <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 text-rose-700 dark:text-rose-300 text-[11px] font-medium">
                    ⚠️ {syncErrorMsg}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-pink-50/60 dark:bg-slate-800 p-3 rounded-xl border border-pink-200 dark:border-slate-700 text-[11px] text-pink-900 dark:text-pink-200">
                💡 <strong>Continuous Cloud Sync</strong> automatically uploads your tasks, focus bits, somatic notes, and battery energy level in real-time across your devices. Sign in below to enable live backup!
              </div>
            )}

            {/* Action Feedback Banner */}
            {actionFeedback && (
              <div className="p-2.5 rounded-xl bg-pink-100 dark:bg-slate-800 border border-pink-300 dark:border-pink-800 text-pink-800 dark:text-pink-200 text-xs font-bold text-center animate-fadeIn">
                {actionFeedback}
              </div>
            )}

            {/* Sync Controls (When Logged In) */}
            {authUser && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={triggerForceSync}
                  disabled={isSyncingNow || syncStatus === 'syncing'}
                  className="py-2 px-3 bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-pink-500/20 text-xs"
                >
                  <CloudUpload className={`w-3.5 h-3.5 ${isSyncingNow ? 'animate-bounce' : ''}`} />
                  <span>{isSyncingNow ? 'Uploading...' : 'Sync to Cloud Now'}</span>
                </button>

                <button
                  type="button"
                  onClick={triggerRestore}
                  disabled={isRestoringNow}
                  className="py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs border border-slate-200 dark:border-slate-600"
                >
                  <CloudDownload className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  <span>Restore from Cloud</span>
                </button>
              </div>
            )}
          </div>

          {/* Current Snapshot Payload Summary */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
              Current Live Snapshot Payload
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-700 flex items-center gap-2">
                <ListTodo className="w-4 h-4 text-pink-500 shrink-0" />
                <div>
                  <p className="text-[10px] text-slate-400">Tasks & Bits</p>
                  <p className="font-bold text-slate-800 dark:text-slate-100">{todos.length} items</p>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-700 flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-500 shrink-0" />
                <div>
                  <p className="text-[10px] text-slate-400">Somatic Notes</p>
                  <p className="font-bold text-slate-800 dark:text-slate-100">{notes.length} notes</p>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-700 flex items-center gap-2">
                <Activity className="w-4 h-4 text-rose-500 shrink-0" />
                <div>
                  <p className="text-[10px] text-slate-400">Symptom Logs</p>
                  <p className="font-bold text-slate-800 dark:text-slate-100">{symptomLogs.length} logs</p>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-700 flex items-center gap-2">
                <Timer className="w-4 h-4 text-indigo-500 shrink-0" />
                <div>
                  <p className="text-[10px] text-slate-400">Sprint Sessions</p>
                  <p className="font-bold text-slate-800 dark:text-slate-100">{sessionLogs.length} logs</p>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-700 flex items-center gap-2">
                <BatteryCharging className="w-4 h-4 text-emerald-500 shrink-0" />
                <div>
                  <p className="text-[10px] text-slate-400">Energy Level</p>
                  <p className="font-bold text-slate-800 dark:text-slate-100">{battery}%</p>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-700 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                <div>
                  <p className="text-[10px] text-slate-400">Career XP</p>
                  <p className="font-bold text-slate-800 dark:text-slate-100">{userProfile.xp || 0} XP</p>
                </div>
              </div>
            </div>
          </div>

          {/* Account Login / Switch Area */}
          {!authUser ? (
            <div className="space-y-3 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <User className="w-4 h-4 text-pink-500" />
                <span>Sign In to Enable Cloud Sync</span>
              </h3>

              {/* Google One-Click Login */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isAuthLoading}
                className="w-full py-2.5 px-3 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl border border-slate-300 dark:border-slate-600 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs text-xs"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span>Continue with Google Workspace</span>
              </button>

              <div className="flex items-center my-2">
                <div className="flex-1 border-t border-slate-200 dark:border-slate-700"></div>
                <span className="px-2 text-[10px] text-slate-400 font-bold uppercase">or email</span>
                <div className="flex-1 border-t border-slate-200 dark:border-slate-700"></div>
              </div>

              {/* Segmented Auth Mode Switcher */}
              <div className="flex bg-slate-200/80 dark:bg-slate-900 p-1 rounded-xl gap-1 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('signin');
                    setAuthError(null);
                  }}
                  className={`flex-1 py-1 rounded-lg transition-all cursor-pointer text-center ${
                    authTab === 'signin'
                      ? 'bg-white dark:bg-slate-800 text-pink-600 dark:text-pink-400 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('signup');
                    setAuthError(null);
                  }}
                  className={`flex-1 py-1 rounded-lg transition-all cursor-pointer text-center ${
                    authTab === 'signup'
                      ? 'bg-white dark:bg-slate-800 text-pink-600 dark:text-pink-400 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  Create Account
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('forgot');
                    setAuthError(null);
                  }}
                  className={`flex-1 py-1 rounded-lg transition-all cursor-pointer text-center ${
                    authTab === 'forgot'
                      ? 'bg-white dark:bg-slate-800 text-pink-600 dark:text-pink-400 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  Reset
                </button>
              </div>

              {/* Auth Form */}
              <form onSubmit={handleEmailAuthSubmit} className="space-y-2.5 pt-1">
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    placeholder="Email address"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-pink-500"
                  />
                </div>

                {authTab !== 'forgot' && (
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      required
                      placeholder="Password"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-pink-500"
                    />
                  </div>
                )}

                {authError && (
                  <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{authError}</span>
                  </div>
                )}

                {authSuccess && (
                  <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span>{authSuccess}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isAuthLoading}
                  className="w-full py-2 bg-pink-500 hover:bg-pink-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-pink-500/20 text-xs"
                >
                  {authTab === 'signin' && <LogIn className="w-3.5 h-3.5" />}
                  {authTab === 'signup' && <UserPlus className="w-3.5 h-3.5" />}
                  {authTab === 'forgot' && <KeyRound className="w-3.5 h-3.5" />}
                  <span>
                    {isAuthLoading
                      ? 'Connecting...'
                      : authTab === 'signin'
                      ? 'Sign In to Sync'
                      : authTab === 'signup'
                      ? 'Create Account & Start Syncing'
                      : 'Send Password Reset'}
                  </span>
                </button>
              </form>
            </div>
          ) : (
            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-100 block">Manage Session</span>
                <span className="text-[10px] text-slate-400">Signed in as {authUser.email}</span>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="px-3.5 py-1.5 rounded-xl bg-slate-200 hover:bg-rose-100 hover:text-rose-600 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold flex items-center gap-1.5 transition-all cursor-pointer text-xs"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          )}

          {/* Local JSON Backup / Restore (Offline fallback) */}
          <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700 space-y-3">
            <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Database className="w-4 h-4 text-purple-500" />
              <span>Offline JSON Backups</span>
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleExportJSON}
                className="py-2 px-3 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Export File</span>
              </button>

              <label className="py-2 px-3 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs text-center">
                <Upload className="w-3.5 h-3.5 text-slate-500" />
                <span>Import File</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportJSON}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-pink-500 hover:bg-pink-600 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
