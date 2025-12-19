import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, User, Lock, LayoutGrid, ShieldAlert, X, Mail, Send, CheckCircle2, Loader2 } from 'lucide-react';
import { COMPANY_LOGO } from '../constants';

interface AuthProps {
  onLogin: (email: string, pass: string) => Promise<void> | void;
  onResetPassword: (email: string) => Promise<boolean>;
  error?: string;
}

export const Auth: React.FC<AuthProps> = ({ onLogin, onResetPassword, error }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  // Forgot Password States
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoverySuccess, setRecoverySuccess] = useState(false);

  // Security State
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutTimer, setLockoutTimer] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);

  // Handle 3D Tilt Effect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const { innerWidth, innerHeight } = window;
      const x = (e.clientX / innerWidth - 0.5) * 20;
      const y = (e.clientY / innerHeight - 0.5) * 20;
      setMousePos({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Countdown timer for lockout
  useEffect(() => {
      let interval: any;
      if (isLocked && lockoutTimer > 0) {
          interval = setInterval(() => {
              setLockoutTimer((prev) => prev - 1);
          }, 1000);
      } else if (lockoutTimer === 0 && isLocked) {
          setIsLocked(false);
          setFailedAttempts(0);
      }
      return () => clearInterval(interval);
  }, [isLocked, lockoutTimer]);

  // Monitor external error prop
  useEffect(() => {
      if (error) {
          setIsLoggingIn(false);
          const newFailCount = failedAttempts + 1;
          setFailedAttempts(newFailCount);
          if (newFailCount >= 3) {
              setIsLocked(true);
              setLockoutTimer(30); 
          }
      }
  }, [error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked || isLoggingIn) return;
    
    setIsLoggingIn(true);
    try {
        await onLogin(email, password);
    } catch (err) {
        console.error("Login component error:", err);
    } finally {
        // Only reset loading if we didn't navigate away (App handles navigation)
        setTimeout(() => setIsLoggingIn(false), 2000);
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!recoveryEmail || recoveryLoading) return;
      
      setRecoveryLoading(true);
      try {
          const success = await onResetPassword(recoveryEmail);
          if (success) {
              setRecoverySuccess(true);
          } else {
              alert("Email not found in our records.");
          }
      } catch (err) {
          alert("System busy. Please try later.");
      } finally {
          setRecoveryLoading(false);
      }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6 relative overflow-hidden select-none">
      
      <style>{`
        @keyframes float {
          0% { transform: translate(0px, 0px) rotate(0deg); }
          33% { transform: translate(30px, -50px) rotate(10deg); }
          66% { transform: translate(-20px, 20px) rotate(-5deg); }
          100% { transform: translate(0px, 0px) rotate(0deg); }
        }
        @keyframes drift {
            0% { transform: translate(-50%, -50%) rotate(-5deg) scale(1); opacity: 0.02; }
            50% { transform: translate(-50%, -45%) rotate(5deg) scale(1.1); opacity: 0.08; }
            100% { transform: translate(-50%, -50%) rotate(-5deg) scale(1); opacity: 0.02; }
        }
        .animate-float-slow { animation: float 15s ease-in-out infinite; }
        .animate-float-medium { animation: float 10s ease-in-out infinite reverse; }
        .animate-float-fast { animation: float 8s ease-in-out infinite; }
        .animate-text-drift { animation: drift 20s ease-in-out infinite; }
        .perspective-container { perspective: 1000px; }
        .preserve-3d { transform-style: preserve-3d; }
      `}</style>

      {/* Abstract 3D Shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
         <div className="absolute -top-[10%] -right-[5%] w-[500px] h-[500px] bg-gradient-to-br from-blue-600/30 to-purple-600/30 rounded-full blur-3xl animate-float-slow"></div>
         <div className="absolute -bottom-[10%] -left-[5%] w-[600px] h-[600px] bg-gradient-to-tr from-emerald-500/20 to-cyan-500/20 rounded-full blur-3xl animate-float-medium"></div>
         <div className="absolute top-1/2 left-1/2 font-black text-[30vw] text-white leading-none tracking-tighter select-none animate-text-drift z-0 pointer-events-none whitespace-nowrap blur-sm">KBT</div>
      </div>

      <div className="perspective-container w-full max-w-md flex justify-center">
        <div 
          ref={containerRef}
          className="w-full relative z-10 transition-transform duration-100 ease-out preserve-3d"
          style={{ transform: `rotateY(${mousePos.x}deg) rotateX(${-mousePos.y}deg)` }}
        >
          {/* 3D Logo */}
          <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-32 h-32 bg-slate-900 rounded-3xl shadow-2xl flex items-center justify-center border border-slate-700" style={{ transform: 'translateZ(50px) translateX(-50%)' }}>
               <div className="w-full h-full p-4">
                 <img src={COMPANY_LOGO} className="w-full h-full object-contain drop-shadow-lg" alt="Logo" />
               </div>
          </div>

          <div className="bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] overflow-hidden pt-20 pb-8 px-8 relative">
            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none"></div>

            <div className="text-center mb-8 relative" style={{ transform: 'translateZ(20px)' }}>
              <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-emerald-400 tracking-tight mb-2">KALRA BUILDTECH</h1>
              <p className="text-slate-400 text-sm font-medium tracking-widest uppercase">Secure FMS Portal</p>
            </div>

            {isLocked ? (
                 <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 text-red-200 text-sm rounded-xl flex flex-col items-center justify-center gap-2 backdrop-blur-sm animate-pulse" style={{ transform: 'translateZ(30px)' }}>
                    <ShieldAlert size={32} className="text-red-400"/>
                    <span className="font-bold text-center">Too many failed attempts.</span>
                    <span className="text-xs">Try again in {lockoutTimer}s</span>
                 </div>
            ) : error && (
              <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 text-red-200 text-sm rounded-xl flex items-center gap-3 backdrop-blur-sm animate-pulse" style={{ transform: 'translateZ(30px)' }}>
                <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_10px_red]" />
                {error} {failedAttempts > 0 && `(${failedAttempts}/3)`}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6 relative" style={{ transform: 'translateZ(30px)' }}>
              <div className="space-y-2 group">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1 group-focus-within:text-blue-400 transition-colors">Email ID</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors"><User size={20} /></div>
                  <input
                    type="email"
                    required
                    disabled={isLocked || isLoggingIn}
                    className="w-full bg-slate-950/50 border border-slate-700 text-white pl-12 pr-4 py-4 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all placeholder-slate-600 shadow-inner disabled:opacity-50"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                  />
                </div>
              </div>

              <div className="space-y-2 group">
                <div className="flex justify-between items-center px-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider group-focus-within:text-cyan-400 transition-colors">Password</label>
                    <button 
                        type="button" 
                        onClick={() => setShowForgotModal(true)}
                        className="text-[10px] font-black text-blue-400 uppercase tracking-tighter hover:text-blue-300 transition-colors"
                    >
                        Forgot?
                    </button>
                </div>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-400 transition-colors"><Lock size={20} /></div>
                  <input
                    type="password"
                    required
                    disabled={isLocked || isLoggingIn}
                    className="w-full bg-slate-950/50 border border-slate-700 text-white pl-12 pr-4 py-4 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all placeholder-slate-600 shadow-inner disabled:opacity-50"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLocked || isLoggingIn}
                className={`w-full font-bold py-4 rounded-xl shadow-[0_20px_40px_-10px_rgba(59,130,246,0.5)] active:scale-[0.98] transition-all flex items-center justify-center gap-3 group relative overflow-hidden ${
                    isLocked || isLoggingIn ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white'
                }`}
              >
                {!isLocked && !isLoggingIn && <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>}
                <span className="relative z-10 flex items-center gap-2">
                   {isLoggingIn ? <><Loader2 size={20} className="animate-spin" /> Authenticating...</> : isLocked ? `Locked (${lockoutTimer}s)` : <>Secure Login <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" /></>}
                </span>
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-white/5 text-center" style={{ transform: 'translateZ(20px)' }}>
               <p className="text-xs text-slate-500 flex items-center justify-center gap-2">
                  <LayoutGrid size={14} />
                  Powered by KBT FMS System
               </p>
            </div>
          </div>
        </div>
      </div>

      {/* FORGOT PASSWORD MODAL */}
      {showForgotModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-white/10 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden p-8 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center mb-6">
                      <div className="w-10 h-10 bg-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center"><Mail size={20}/></div>
                      <button onClick={() => { setShowForgotModal(false); setRecoverySuccess(false); }} className="text-slate-500 hover:text-white p-2"><X size={20}/></button>
                  </div>
                  
                  {recoverySuccess ? (
                      <div className="text-center space-y-4 py-4">
                          <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-2"><CheckCircle2 size={32}/></div>
                          <h3 className="text-xl font-bold text-white">Recovery Sent!</h3>
                          <p className="text-slate-400 text-sm text-balance">We've sent a temporary login key to <b>{recoveryEmail}</b>. Please check your inbox.</p>
                          <button onClick={() => { setShowForgotModal(false); setRecoverySuccess(false); }} className="w-full bg-white text-slate-900 font-bold py-3 rounded-xl mt-4">Back to Login</button>
                      </div>
                  ) : (
                      <form onSubmit={handleRecoverySubmit}>
                          <h3 className="text-xl font-bold text-white mb-2">Recover Access</h3>
                          <p className="text-slate-400 text-sm mb-6">Enter your registered email address to receive a recovery link.</p>
                          
                          <div className="space-y-4">
                              <div>
                                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Work Email</label>
                                  <input 
                                    type="email" 
                                    required 
                                    className="w-full bg-slate-950 border border-slate-800 text-white p-4 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="your@kalrabuildtech.com"
                                    value={recoveryEmail}
                                    onChange={e => setRecoveryEmail(e.target.value)}
                                  />
                              </div>
                              <button 
                                type="submit"
                                disabled={recoveryLoading}
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 disabled:opacity-50 transition-all"
                              >
                                  {recoveryLoading ? <Loader2 size={18} className="animate-spin"/> : <><Send size={18}/> Send Reset Link</>}
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
