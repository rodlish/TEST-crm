/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc,
  getDoc,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { auth, db, OperationType, handleFirestoreError, sanitizeForFirestore } from './lib/firebase';
import { seedDatabase } from './lib/seed';
import Login from './components/Login';
import TestPlatform from './components/TestPlatform'; // Repurposed as AgentWorkspace
import AdminDashboard from './components/AdminDashboard';
import { User, Lead, AgentAccount, SystemNotification, CRMConfig, Team } from './types';
import { triggerAppsScriptEvent } from './lib/googleAppsScript';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [agents, setAgents] = useState<AgentAccount[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [sheetConfig, setSheetConfig] = useState<CRMConfig>(() => {
    const cached = localStorage.getItem('crm_sheet_config');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        return {};
      }
    }
    return {};
  });
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [impersonatedAgentId, setImpersonatedAgentId] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const [presenceLogs, setPresenceLogs] = useState<any[]>([]);

  // User Presence Tracking
  useEffect(() => {
    if (!currentUser) return;

    // Set initial presence status as 'en_ligne' when logging in
    const startPresence = async () => {
      const { transitionPresence } = await import('./lib/presence');
      await transitionPresence(currentUser.email, currentUser.name, currentUser.role, 'en_ligne');
    };
    
    startPresence();

    // Heartbeat every 20 seconds to keep connection doc updated
    const interval = setInterval(async () => {
      const { sendHeartbeat } = await import('./lib/presence');
      // Retrieve the current user's actual status from the latest list, or default to 'en_ligne'
      const myConn = onlineUsers.find(u => u.email.toLowerCase().trim() === currentUser.email.toLowerCase().trim());
      const currentStatus = myConn?.status || 'en_ligne';
      
      await sendHeartbeat(currentUser.email, currentUser.name, currentUser.role, currentStatus);
    }, 20000);

    const handleUnload = () => {
      const sanitizedEmail = currentUser.email.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
      deleteDoc(doc(db, 'connections', sanitizedEmail)).catch(() => {});
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [currentUser, onlineUsers.length]);

  // Listen to active connections
  useEffect(() => {
    if (!currentUser) return;

    const unsub = onSnapshot(collection(db, 'connections'), (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data());
      setOnlineUsers(data);
    }, (err) => {
      console.error("Failed to fetch connections", err);
    });

    return () => unsub();
  }, [currentUser]);

  // Listen to chronological presence logs
  useEffect(() => {
    if (!currentUser) return;

    const unsub = onSnapshot(collection(db, 'presence_logs'), (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data());
      // Sort newest logs first
      data.sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime());
      setPresenceLogs(data);
    }, (err) => {
      console.error("Failed to fetch presence logs", err);
    });

    return () => unsub();
  }, [currentUser]);

  // Authentication monitoring
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        if (user.isAnonymous) {
          const storedEmail = localStorage.getItem('candidate_email');
          if (storedEmail) {
            // Check if account still active via firestore (agents are stored in candidates)
            const trimmedEmail = storedEmail.toLowerCase().trim();
            const sanitizedId = trimmedEmail.replace(/[^a-z0-9]/g, '_');
            
            getDoc(doc(db, 'candidates', sanitizedId)).then(async (docSnap) => {
              let agentData: AgentAccount | null = null;
              if (docSnap.exists()) {
                agentData = docSnap.data() as AgentAccount;
              } else {
                try {
                  const q = query(collection(db, 'candidates'), where('email', '==', trimmedEmail));
                  const querySnap = await getDocs(q);
                  if (!querySnap.empty) {
                    agentData = querySnap.docs[0].data() as AgentAccount;
                  }
                } catch (err) {
                  console.error('Error fetching persistent agent by field query:', err);
                }
              }

              if (agentData && agentData.isActive !== false) {
                 setCurrentUser({
                   email: agentData.email,
                   role: agentData.role || 'agent',
                   name: agentData.name
                 });
              } else {
                 signOut(auth);
                 localStorage.removeItem('candidate_email');
              }
            });
          }
        } else {
          // Check if admin
          const isAdmin = user.email === 'e.rodlish@gmail.com' || 
                          user.email === 'admin@ted-company.com';
          
          if (isAdmin) {
            setCurrentUser({
              email: user.email!,
              role: 'admin',
              name: user.displayName || 'Administrateur'
            });
            seedDatabase();
          } else {
            // Non-admin email-authenticated user, fetch role from candidates
            const trimmedEmail = user.email!.toLowerCase().trim();
            const sanitizedId = trimmedEmail.replace(/[^a-z0-9]/g, '_');
            getDoc(doc(db, 'candidates', sanitizedId)).then(async (docSnap) => {
              let agentData: AgentAccount | null = null;
              if (docSnap.exists()) {
                agentData = docSnap.data() as AgentAccount;
              } else {
                try {
                  const q = query(collection(db, 'candidates'), where('email', '==', trimmedEmail));
                  const querySnap = await getDocs(q);
                  if (!querySnap.empty) {
                    agentData = querySnap.docs[0].data() as AgentAccount;
                  }
                } catch (err) {
                  console.error('Error fetching persistent agent by field query:', err);
                }
              }

              if (agentData) {
                if (agentData.isActive === false) {
                  signOut(auth);
                  localStorage.removeItem('candidate_email');
                  return;
                }
                setCurrentUser({
                  email: agentData.email,
                  role: agentData.role || 'agent',
                  name: agentData.name
                });
              } else {
                setCurrentUser({
                  email: user.email!,
                  role: 'agent',
                  name: user.displayName || 'Conseiller CRM'
                });
              }
            });
          }
        }
      } else {
        // Only clear if we don't have a local session manually set
        setCurrentUser(prev => (prev?.role === 'agent' || prev?.role === 'supervisor' || prev?.role === 'manager') ? prev : null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Data fetching based on role
  useEffect(() => {
    if (!currentUser) return;

    let unsubLeads = () => {};
    let unsubAgents = () => {};
    let unsubTeams = () => {};
    let unsubNotifications = () => {};
    let unsubConfig = () => {};

    // 1. Fetch Google Sheet config (Global CRM settings) dengan self-healing permanent backup
    unsubConfig = onSnapshot(doc(db, 'settings', 'crm_config'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as CRMConfig;
        setSheetConfig(data);
        localStorage.setItem('crm_sheet_config', JSON.stringify(data));
      } else {
        // Fallback to local storage if document doesn't exist
        const cached = localStorage.getItem('crm_sheet_config');
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            setSheetConfig(parsed);
            // Self-heal: automatically re-save to Firestore so it is permanently re-attached!
            setDoc(doc(db, 'settings', 'crm_config'), parsed);
          } catch (e) {
            console.error('Error parsing cached config:', e);
          }
        }
      }
    });

    // 2. Fetch Teams (accessible to everyone)
    unsubTeams = onSnapshot(collection(db, 'teams'), (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as Team);
      setTeams(data);
    }, (err) => {
      console.error("Failed to fetch teams", err);
    });

    if (currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.role === 'supervisor') {
      // Listen to all leads
      unsubLeads = onSnapshot(collection(db, 'leads'), (snapshot) => {
        const data = snapshot.docs.map(doc => doc.data() as Lead);
        // Sort leads by newest
        data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setLeads(data);
        setLastSync(new Date());
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'leads'));

      // Listen to all agents (stored in candidates collection for seamless auth preservation)
      unsubAgents = onSnapshot(collection(db, 'candidates'), (snapshot) => {
        const data = snapshot.docs.map(doc => doc.data() as AgentAccount);
        setAgents(data);
        setLastSync(new Date());
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'candidates'));

      // Listen to system notifications
      unsubNotifications = onSnapshot(collection(db, 'notifications'), (snapshot) => {
        const data = snapshot.docs.map(doc => doc.data() as SystemNotification);
        data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setNotifications(data);
      });
    } else {
      // For agents: listen to all leads, but we can filter those assigned to them in the component
      unsubLeads = onSnapshot(collection(db, 'leads'), (snapshot) => {
        const data = snapshot.docs.map(doc => doc.data() as Lead);
        // Sort leads by newest
        data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setLeads(data);
        setLastSync(new Date());
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'leads'));

      // Listen to local agent metadata
      const sanitizedId = currentUser.email.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
      unsubAgents = onSnapshot(doc(db, 'candidates', sanitizedId), (docSnap) => {
        if (docSnap.exists()) {
          setAgents([docSnap.data() as AgentAccount]);
        }
      }, (err) => handleFirestoreError(err, OperationType.GET, `candidates/${sanitizedId}`));

      // Listen to system notifications
      unsubNotifications = onSnapshot(collection(db, 'notifications'), (snapshot) => {
        const data = snapshot.docs.map(doc => doc.data() as SystemNotification);
        data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setNotifications(data);
      });
    }

    return () => {
      unsubLeads();
      unsubAgents();
      unsubTeams();
      unsubNotifications();
      unsubConfig();
    };
  }, [currentUser]);

  // Handle logout
  const handleLogout = async () => {
    try {
      if (currentUser) {
        const { transitionPresence } = await import('./lib/presence');
        await transitionPresence(currentUser.email, currentUser.name, currentUser.role, 'deconnecte');
        
        const sanitizedEmail = currentUser.email.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
        await deleteDoc(doc(db, 'connections', sanitizedEmail)).catch(() => {});
      }
      await signOut(auth);
      localStorage.removeItem('candidate_email');
      setCurrentUser(null);
      setImpersonatedAgentId(null);
    } catch (err) {
      console.error('Logout error', err);
    }
  };

  // Agent accounts mutations
  const handleAddAgent = async (agent: AgentAccount) => {
    try {
      const sanitized = sanitizeForFirestore(agent);
      await setDoc(doc(db, 'candidates', agent.id), sanitized);

      // Trigger Apps Script webhook for agent account sync
      if (sheetConfig?.appsScriptUrl) {
        triggerAppsScriptEvent(sheetConfig.appsScriptUrl, 'agent_created', {
          lead: {} as any,
          agent,
          modifiedBy: currentUser?.name || 'Système',
          timestamp: new Date().toISOString()
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `candidates/${agent.id}`);
    }
  };

  const handleDeleteAgent = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'candidates', id));

      // Trigger Apps Script webhook for agent deletion
      if (sheetConfig?.appsScriptUrl) {
        triggerAppsScriptEvent(sheetConfig.appsScriptUrl, 'agent_deleted', {
          lead: {} as any,
          agentId: id,
          modifiedBy: currentUser?.name || 'Système',
          timestamp: new Date().toISOString()
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `candidates/${id}`);
    }
  };

  const handleUpdateAgent = async (updated: AgentAccount) => {
    try {
      const sanitized = sanitizeForFirestore(updated);
      await setDoc(doc(db, 'candidates', updated.id), sanitized, { merge: true });

      // Trigger Apps Script webhook for agent modification
      if (sheetConfig?.appsScriptUrl) {
        triggerAppsScriptEvent(sheetConfig.appsScriptUrl, 'agent_updated', {
          lead: {} as any,
          agent: updated,
          modifiedBy: currentUser?.name || 'Système',
          timestamp: new Date().toISOString()
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `candidates/${updated.id}`);
    }
  };

  // Team mutations
  const handleAddTeam = async (team: Team) => {
    try {
      const sanitized = sanitizeForFirestore(team);
      await setDoc(doc(db, 'teams', team.id), sanitized);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `teams/${team.id}`);
    }
  };

  const handleUpdateTeam = async (updated: Team) => {
    try {
      const sanitized = sanitizeForFirestore(updated);
      await setDoc(doc(db, 'teams', updated.id), sanitized, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `teams/${updated.id}`);
    }
  };

  const handleDeleteTeam = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'teams', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `teams/${id}`);
    }
  };

  // Lead mutations
  const handleAddLead = async (lead: Lead) => {
    try {
      const sanitized = sanitizeForFirestore(lead);
      await setDoc(doc(db, 'leads', lead.id), sanitized);

      // Create a notification for the new lead
      const notif: SystemNotification = {
        id: `notif_${Math.random().toString(36).substr(2, 9)}`,
        title: 'Nouveau Lead Enregistré',
        message: `${lead.name} (${lead.company || 'Particulier'}) a été ajouté depuis ${lead.source}.`,
        date: new Date().toISOString(),
        type: 'info',
        read: false,
        leadId: lead.id
      };
      await setDoc(doc(db, 'notifications', notif.id), sanitizeForFirestore(notif));

      // Trigger Apps Script webhook if configured
      if (sheetConfig?.appsScriptUrl) {
        triggerAppsScriptEvent(sheetConfig.appsScriptUrl, 'lead_created', {
          lead,
          modifiedBy: currentUser?.name || 'Système',
          timestamp: new Date().toISOString()
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `leads/${lead.id}`);
    }
  };

  const handleDeleteLead = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'leads', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `leads/${id}`);
    }
  };

  const handleUpdateLead = async (updated: Lead) => {
    try {
      const oldLead = leads.find(l => l.id === updated.id);
      let eventType: 'lead_updated' | 'status_changed' | 'agent_assigned' = 'lead_updated';
      if (oldLead) {
        if (updated.status !== oldLead.status) {
          eventType = 'status_changed';
        } else if (updated.assignedAgentId !== oldLead.assignedAgentId) {
          eventType = 'agent_assigned';
        }
      }

      const sanitized = sanitizeForFirestore(updated);
      await setDoc(doc(db, 'leads', updated.id), sanitized, { merge: true });

      // Trigger Apps Script webhook if configured
      if (sheetConfig?.appsScriptUrl) {
        const matchedAgent = agents.find(a => a.id === updated.assignedAgentId);
        triggerAppsScriptEvent(sheetConfig.appsScriptUrl, eventType, {
          lead: updated,
          agent: matchedAgent,
          modifiedBy: currentUser?.name || 'Système',
          timestamp: new Date().toISOString()
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `leads/${updated.id}`);
    }
  };

  // Google sheet config mutation
  const handleUpdateSheetConfig = async (config: CRMConfig) => {
    try {
      const sanitized = sanitizeForFirestore(config);
      await setDoc(doc(db, 'settings', 'crm_config'), sanitized, { merge: true });
      localStorage.setItem('crm_sheet_config', JSON.stringify(config));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'settings/crm_config');
    }
  };

  // Notifications mutations
  const handleMarkNotificationRead = async (id: string) => {
    try {
      await setDoc(doc(db, 'notifications', id), { read: true }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `notifications/${id}`);
    }
  };

  const handleClearNotifications = async () => {
    try {
      for (const notif of notifications) {
        if (notif.read) {
          await deleteDoc(doc(db, 'notifications', notif.id));
        }
      }
    } catch (err) {
      console.error('Clear notification error:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLogin={setCurrentUser} />;
  }

  if (currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.role === 'supervisor') {
    const impersonatedAgent = impersonatedAgentId ? agents.find(a => a.id === impersonatedAgentId) : null;
    
    if (impersonatedAgent) {
      return (
        <TestPlatform 
          onLogout={handleLogout} 
          agent={impersonatedAgent}
          leads={leads}
          notifications={notifications}
          onUpdateLead={handleUpdateLead}
          onMarkNotificationRead={handleMarkNotificationRead}
          lastSync={lastSync}
          onBackToAdmin={() => setImpersonatedAgentId(null)}
          sheetConfig={sheetConfig}
          onlineUsers={onlineUsers}
          presenceLogs={presenceLogs}
        />
      );
    }

    return (
      <AdminDashboard 
        currentUser={currentUser}
        leads={leads}
        agents={agents}
        teams={teams}
        notifications={notifications}
        sheetConfig={sheetConfig}
        lastSync={lastSync}
        onlineUsers={onlineUsers}
        presenceLogs={presenceLogs}
        onLogout={handleLogout}
        onAddLead={handleAddLead}
        onDeleteLead={handleDeleteLead}
        onUpdateLead={handleUpdateLead}
        onAddAgent={handleAddAgent}
        onDeleteAgent={handleDeleteAgent}
        onUpdateAgent={handleUpdateAgent}
        onAddTeam={handleAddTeam}
        onUpdateTeam={handleUpdateTeam}
        onDeleteTeam={handleDeleteTeam}
        onUpdateSheetConfig={handleUpdateSheetConfig}
        onMarkNotificationRead={handleMarkNotificationRead}
        onClearNotifications={handleClearNotifications}
        onImpersonateAgent={setImpersonatedAgentId}
      />
    );
  }

  const currentAgent = agents.find(a => a.email === currentUser.email);

  if (!currentAgent && !loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 text-center">
        <h2 className="text-2xl font-bold text-slate-900 mb-4">Accès Non Autorisé</h2>
        <p className="text-slate-500 mb-8 max-w-md">Votre compte n'est pas encore enregistré dans l'équipe. Veuillez contacter l'administrateur système.</p>
        <button onClick={handleLogout} className="btn-primary">Retour à la connexion</button>
      </div>
    );
  }

  return currentAgent ? (
    <TestPlatform 
      onLogout={handleLogout} 
      agent={currentAgent}
      leads={leads}
      notifications={notifications}
      onUpdateLead={handleUpdateLead}
      onMarkNotificationRead={handleMarkNotificationRead}
      lastSync={lastSync}
      sheetConfig={sheetConfig}
      onlineUsers={onlineUsers}
      presenceLogs={presenceLogs}
    />
  ) : null;
}
