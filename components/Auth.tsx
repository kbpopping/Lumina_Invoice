import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { api } from '../services/api';
import { Button } from './ui/Button';
import { motion } from 'motion/react';
import { Eye, EyeOff } from 'lucide-react';

interface AuthProps {
  onAuthSuccess?: (user: User) => void;
}

function getFriendlyAuthError(err: any): string {
  const code = err?.code || '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password. If you previously signed in with Google, use "Continue with Google" below or click Forgot Password.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in instead, or use "Continue with Google".';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment before trying again.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not yet enabled in the Firebase Console for this project. Enable Email/Password under Authentication → Sign-in method, or use "Continue with Google" below.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in popup was closed. Please try again.';
    case 'auth/popup-blocked':
      return 'Popup was blocked by your browser. Please allow popups for this site and try again.';
    default:
      return err?.message || 'Unable to authenticate. Please try again.';
  }
}

export const Auth: React.FC<AuthProps> = ({ onAuthSuccess }) => {
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState(() => localStorage.getItem('lumina_last_email') || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) {
      setError('Please enter your email address.');
      return;
    }

    if (authMode === 'signup') {
      if (password.length < 6) {
        setError('Password must be at least 6 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setLoading(true);
    try {
      if (authMode === 'login') {
        const user = await api.signInWithEmail(cleanEmail, password);
        if (onAuthSuccess) onAuthSuccess(user);
      } else if (authMode === 'signup') {
        const user = await api.signUpWithEmail(cleanEmail, password, displayName);
        if (onAuthSuccess) onAuthSuccess(user);
      } else if (authMode === 'forgot') {
        await api.sendPasswordReset(cleanEmail);
        setMessage(
          `Password reset email sent to ${cleanEmail}. Check your inbox (and spam folder) to set a new password.`
        );
        setAuthMode('login');
      }
    } catch (err: any) {
      setError(getFriendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setMessage('');
    setGoogleLoading(true);
    try {
      const user = await api.signInWithGoogle();
      if (onAuthSuccess) onAuthSuccess(user);
    } catch (err: any) {
      setError(getFriendlyAuthError(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  const switchMode = (mode: 'login' | 'signup' | 'forgot') => {
    setAuthMode(mode);
    setError('');
    setMessage('');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
      <img
        src="https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=2400&h=1600"
        alt="Office Background"
        className="absolute inset-0 w-full h-full object-cover opacity-100"
        referrerPolicy="no-referrer"
      />
      <div className="absolute inset-0 bg-slate-900/25 backdrop-blur-[2px]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden relative z-10"
      >
        <div className="p-8 md:p-10">
          <div className="text-center mb-7">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-900 mb-4 shadow-xl shadow-slate-200">
              <span className="text-2xl font-black text-white">L</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight mb-1">
              {authMode === 'login'
                ? 'Welcome Back'
                : authMode === 'signup'
                ? 'Create Account'
                : 'Reset Password'}
            </h1>
            <p className="text-slate-500 font-medium tracking-tight text-sm">
              {authMode === 'login'
                ? 'Sign in to access your saved invoices & inventory'
                : authMode === 'signup'
                ? 'Register with email & password to sync to the cloud'
                : 'Enter your email to receive a password reset link'}
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-100 text-red-600 text-xs font-semibold rounded-xl leading-relaxed">
              {error}
            </div>
          )}

          {message && (
            <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold rounded-xl leading-relaxed">
              {message}
            </div>
          )}

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            {authMode === 'signup' && (
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">
                  Full Name (Optional)
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all text-sm font-medium"
                  placeholder="Your name"
                />
              </div>
            )}

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all text-sm font-medium"
                placeholder="you@example.com"
              />
            </div>

            {authMode !== 'forgot' && (
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all text-sm font-medium pr-11"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {authMode === 'login' && (
                  <div className="flex justify-end mt-1.5 px-1">
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider hover:underline"
                    >
                      Forgot Password?
                    </button>
                  </div>
                )}
              </div>
            )}

            {authMode === 'signup' && (
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">
                  Confirm Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all text-sm font-medium"
                  placeholder="••••••••"
                />
              </div>
            )}

            <Button
              type="submit"
              className="w-full py-3 rounded-2xl font-bold text-base bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-200 transition-all"
              disabled={loading || googleLoading}
            >
              {loading
                ? 'Please wait...'
                : authMode === 'login'
                ? 'Sign In'
                : authMode === 'signup'
                ? 'Create Account'
                : 'Send Reset Link'}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-[10px] font-bold uppercase tracking-widest">
              <span className="bg-white px-3 text-slate-400">Or</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading || googleLoading}
            className="w-full py-3 px-4 rounded-2xl font-semibold text-sm bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 shadow-sm transition-all flex items-center justify-center gap-3 disabled:opacity-60"
          >
            {googleLoading ? (
              <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                />
              </svg>
            )}
            <span>{googleLoading ? 'Connecting...' : 'Continue with Google'}</span>
          </button>

          <div className="mt-6 pt-5 border-t border-slate-100 text-center text-xs font-semibold text-slate-400">
            {authMode === 'login' ? (
              <>
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className="text-slate-900 hover:underline font-bold"
                >
                  Sign Up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="text-slate-900 hover:underline font-bold"
                >
                  Sign In
                </button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
