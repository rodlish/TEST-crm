/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, FormEvent } from 'react';
import { LogIn, User as UserIcon, Lock, AlertCircle, CheckCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { User, AgentAccount } from '../types';

interface LoginProps {
  onLogin: (user: User) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const trimmedEmail = email.toLowerCase().trim();

    try {
      // 1. Try Firebase Auth first (for admins or agents registered in Firebase Auth)
      const userCredential = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      const user = userCredential.user;
      
      const isAdmin = (user.email === 'e.rodlish@gmail.com' || user.email === 'admin@ted-company.com');
      
      if (!isAdmin) {
        // Find agent account robustly to check if active
        const sanitizedId = user.email!.toLowerCase().replace(/[^a-z0-9]/g, '_');
        let agentData: AgentAccount | null = null;
        const directDoc = await getDoc(doc(db, 'candidates', sanitizedId));
        if (directDoc.exists()) {
          agentData = directDoc.data() as AgentAccount;
        } else {
          const q = query(collection(db, 'candidates'), where('email', '==', user.email!.toLowerCase().trim()));
          const querySnap = await getDocs(q);
          if (!querySnap.empty) {
            agentData = querySnap.docs[0].data() as AgentAccount;
          }
        }

        if (agentData && agentData.isActive === false) {
           setError('Votre compte agent a été désactivé.');
           setIsLoading(false);
           await auth.signOut();
           return;
        }
      }

      onLogin({
        email: user.email!,
        role: isAdmin ? 'admin' : 'agent',
        name: user.displayName || user.email?.split('@')[0] || 'Utilisateur'
      });
    } catch (authErr: any) {
      // 2. Fallback for manually created agents (Custom Firestore Login)
      try {
        const sanitizedId = trimmedEmail.replace(/[^a-z0-9]/g, '_');
        let agentData: AgentAccount | null = null;

        const directDoc = await getDoc(doc(db, 'candidates', sanitizedId));
        if (directDoc.exists()) {
          agentData = directDoc.data() as AgentAccount;
        } else {
          const q = query(collection(db, 'candidates'), where('email', '==', trimmedEmail));
          const querySnap = await getDocs(q);
          if (!querySnap.empty) {
            agentData = querySnap.docs[0].data() as AgentAccount;
          }
        }

        if (agentData) {
          if (agentData.isActive === false) {
            setError('Votre compte agent a été désactivé. Veuillez contacter l\'administrateur.');
            setIsLoading(false);
            return;
          }

          if (agentData.password === password) {
            try {
              const { signInAnonymously } = await import('firebase/auth');
              await signInAnonymously(auth);
              // Store email in localStorage for persistence recovery
              localStorage.setItem('candidate_email', agentData.email);
            } catch (anonErr) {
              console.error('Anonymous auth failed:', anonErr);
            }

            onLogin({
              email: agentData.email,
              role: 'agent',
              name: agentData.name
            });
            setIsLoading(false);
            return;
          }
        }
      } catch (fsErr) {
        console.error('Firestore login error:', fsErr);
      }

      setError('Identifiants invalides. Veuillez vérifier votre email et mot de passe.');
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError('');
    const provider = new GoogleAuthProvider();
    // Request spreadsheet scopes from the admin right on login
    provider.addScope('https://www.googleapis.com/auth/spreadsheets');
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setError('Erreur de connexion avec Google.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-white">
      {/* Brand Section - Visible on Desktop */}
      <div className="hidden md:flex flex-1 bg-brand-primary relative overflow-hidden items-center justify-center p-12 text-white">
        {/* Subtle Background Pattern */}
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:20px_20px]" />
        
        <div className="relative z-10 max-w-lg">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center"
          >
            <img 
              src="https://www.ted-companygroup.com/assets%20ancien/img/logos/ted-company-with-letter.png" 
              alt="TED-Company Group" 
              className="h-24 mx-auto mb-12 brightness-0 invert"
            />
            <h1 className="text-4xl font-bold leading-tight mb-6">
              Portail CRM & Leads <span className="text-blue-400">TED-Company Group</span>.
            </h1>
            <p className="text-lg text-slate-300 mb-10">
              Pilotez l'attribution des prospects, qualifiez les leads, suivez l'historique de vente et synchronisez le tout avec Google Sheets en temps réel.
            </p>
            
            <div className="space-y-4">
              {[
                "Synchronisation directe Google Sheets & Drive",
                "Qualification BANT et thermomètre de leads",
                "Historique complet des actions & d'appels",
                "Attribution sécurisée aux agents exclusifs"
              ].map((text, i) => (
                <div key={i} className="flex items-center justify-start max-w-sm mx-auto gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                    <CheckCircle size={14} />
                  </div>
                  <span className="text-slate-200 text-sm font-medium">{text}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Login Section */}
      <main className="flex-1 flex items-center justify-center p-6 md:p-12 lg:p-24 bg-slate-50 md:bg-white">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          {/* Mobile Logo */}
          <div className="md:hidden flex flex-col items-center mb-8">
            <img 
              src="https://www.ted-companygroup.com/assets%20ancien/img/logos/ted-company-with-letter.png" 
              alt="TED-Company Group" 
              className="h-16 mb-4"
            />
          </div>

          <div className="mb-10 text-center md:text-left">
            <h2 className="text-3xl font-bold text-slate-900 mb-2">CRM Connexion</h2>
            <p className="text-slate-500 font-medium">Connectez-vous à votre espace agent ou administrateur.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-xl text-sm border border-red-100"
              >
                <AlertCircle size={18} />
                <span>{error}</span>
              </motion.div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                Identifiant / Email
              </label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  id="email-input"
                  type="text" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field pl-12 bg-white" 
                  placeholder="votre.nom@ted-company.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                  Mot de passe
                </label>
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  id="password-input"
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pl-12 bg-white" 
                  placeholder={isLoading ? "••••••••" : "Votre mot de passe"}
                  required
                />
              </div>
            </div>

            <button 
              id="login-button"
              type="submit" 
              disabled={isLoading}
              className="btn-primary w-full flex items-center justify-center gap-3 py-4 shadow-lg shadow-blue-900/20"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn size={20} />
                  Se connecter au CRM
                </>
              )}
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-slate-50 md:bg-white px-2 text-slate-500 font-bold">Ou Admin Google</span>
              </div>
            </div>

            <button 
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 py-4 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
            >
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.1c-.22-.66-.35-1.39-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              Accès Admin via Google
            </button>
          </form>

          <div className="mt-12 pt-8 border-t border-slate-100">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs text-slate-400">
                © {new Date().getFullYear()} TED-Company Group.
              </p>
              <div className="flex gap-4">
                <a href="#" className="text-xs text-slate-500 hover:text-brand-accent">CRM Admin</a>
                <a href="#" className="text-xs text-slate-500 hover:text-brand-accent">Assistance</a>
              </div>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
