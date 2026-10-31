import React, { useState } from 'react';
import {
  Lock,
  User,
  ShieldCheck,
  Eye,
  EyeOff,
  ArrowRight,
  KeyRound,
  CheckCircle2,
  Sparkles,
  AlertCircle,
  Building2,
  Wheat,
} from 'lucide-react';
import { UserProfile } from '../shared/types';

interface LoginPageProps {
  onLoginSuccess: (user: UserProfile, sessionToken: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('rohit');
  const [password, setPassword] = useState('Password@123');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Optional password change state
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [tempUser, setTempUser] = useState<UserProfile | null>(null);
  const [tempToken, setTempToken] = useState<string | null>(null);

  // Change password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changeSuccess, setChangeSuccess] = useState(false);
  const [changeLoading, setChangeLoading] = useState(false);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please provide both username and password.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed. Please verify credentials.');
      }

      // Check if user wants to change password now or proceed
      setTempUser(data.user);
      setTempToken(data.sessionToken);

      // Successfully authenticated
      onLoginSuccess(data.user, data.sessionToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please check network.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChangeModalFromLogin = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter your current username and password first.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed. Invalid credentials.');
      }

      setTempUser(data.user);
      setTempToken(data.sessionToken);
      setCurrentPassword(password);
      setShowChangeModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangeError(null);

    if (newPassword.length < 6) {
      setChangeError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setChangeError('New passwords do not match.');
      return;
    }
    if (!tempToken || !tempUser) {
      setChangeError('Session expired. Please log in again.');
      return;
    }

    try {
      setChangeLoading(true);
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sgt-session-token': tempToken,
        },
        body: JSON.stringify({
          targetUserId: tempUser.id,
          currentPassword,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update password.');
      }

      setChangeSuccess(true);
      setTimeout(() => {
        setShowChangeModal(false);
        onLoginSuccess(tempUser, tempToken);
      }, 1500);
    } catch (err) {
      setChangeError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setChangeLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center p-4 sm:p-6 overflow-hidden bg-[#F5F5F7] select-none font-sans">
      {/* Apple-style atmospheric ambient glow circles */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-400/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 -right-32 w-[30rem] h-[30rem] bg-indigo-300/25 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 left-1/4 w-96 h-96 bg-emerald-300/15 rounded-full blur-3xl pointer-events-none" />

      {/* Subtle background grid */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, #000 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Main Glass Card */}
      <div className="relative w-full max-w-[440px] z-10 transition-all duration-300">
        <div className="glass-panel rounded-3xl p-8 sm:p-10 shadow-2xl shadow-slate-900/10 border border-white/80 backdrop-blur-2xl">
          {/* Header & Branding */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="relative mb-4 group">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25 ring-4 ring-white/60">
                <Wheat className="w-8 h-8 text-white drop-shadow" />
              </div>
              <div className="absolute -bottom-1 -right-1 bg-white p-1 rounded-full shadow-md">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
              </div>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-display">
              Shree Guru Traders
            </h1>
            <p className="text-xs uppercase tracking-widest font-semibold text-blue-600 mt-1">
              Integrated Business & Accounting Suite
            </p>
            <p className="text-xs text-slate-500 mt-2 font-normal">
              Admin & Enterprise Workspace Access
            </p>
          </div>

          {/* Quick preset badge info */}
          <div className="mb-6 p-3 rounded-2xl bg-blue-50/70 border border-blue-100 flex items-center justify-between text-xs text-blue-900">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Admin credentials pre-filled</span>
            </div>
            <span className="font-mono font-medium text-[11px] bg-white/80 px-2 py-0.5 rounded-full border border-blue-200">
              rohit
            </span>
          </div>

          {/* Error notice */}
          {error && (
            <div className="mb-6 p-3.5 rounded-2xl bg-red-50/90 border border-red-200/80 text-xs text-red-700 flex items-start gap-2.5 animate-in fade-in slide-in-from-top-1">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium leading-relaxed">{error}</div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 ml-1">
                Username / Admin ID
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. rohit"
                  autoComplete="username"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50/70 border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-600 transition-all font-medium"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5 ml-1">
                <label className="text-xs font-semibold text-slate-700">
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleOpenChangeModalFromLogin}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <KeyRound className="w-3 h-3" />
                  Change Password
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  className="w-full pl-10 pr-11 py-3 rounded-xl bg-slate-50/70 border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-600 transition-all font-medium font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.985] text-white text-sm font-semibold shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Sign In as Admin</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Footer Security Badges */}
          <div className="mt-8 pt-6 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span>SGT APMC Mandi</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
              <span className="font-medium text-slate-600">Secure Session</span>
            </div>
          </div>
        </div>

        {/* Small sub-caption */}
        <p className="text-center text-xs text-slate-400 mt-4">
          Shree Guru Traders Enterprise System • End-to-End Audited
        </p>
      </div>

      {/* Change Password Modal (Apple-style sheet) */}
      {showChangeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-md bg-white/95 backdrop-blur-2xl rounded-3xl p-7 sm:p-8 shadow-2xl border border-white/60">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 font-display">
                  Update Admin Password
                </h3>
                <p className="text-xs text-slate-500">
                  You can change your password now or keep current.
                </p>
              </div>
            </div>

            {changeError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-xs font-medium border border-red-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{changeError}</span>
              </div>
            )}

            {changeSuccess ? (
              <div className="p-6 text-center space-y-2">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto animate-bounce" />
                <h4 className="font-bold text-slate-900 text-base">Password Updated!</h4>
                <p className="text-xs text-slate-500">Redirecting to workspace...</p>
              </div>
            ) : (
              <form onSubmit={handleSubmitPasswordChange} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-type new password"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-mono"
                    required
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowChangeModal(false);
                      if (tempUser && tempToken) {
                        onLoginSuccess(tempUser, tempToken);
                      }
                    }}
                    className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Skip & Continue
                  </button>
                  <button
                    type="submit"
                    disabled={changeLoading}
                    className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all shadow-md shadow-blue-500/20 cursor-pointer disabled:opacity-50"
                  >
                    {changeLoading ? 'Saving...' : 'Update & Continue'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

