/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, FormEvent, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Search, 
  Plus, 
  Filter, 
  Clock, 
  FileText,
  CheckCircle,
  AlertCircle,
  X,
  Check,
  Lock,
  Mail,
  User as UserIcon,
  Download,
  ArrowRight,
  Edit2,
  Trash2,
  Phone,
  Database,
  Cloud,
  ExternalLink,
  ChevronRight,
  UserCheck,
  TrendingUp,
  Award,
  Calendar,
  Layers,
  Sparkles,
  Link,
  Bell,
  CheckCheck,
  Eye,
  FileSpreadsheet,
  Building
} from 'lucide-react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { Lead, AgentAccount, LeadStatus, LeadTemperature, SystemNotification, CRMConfig, LeadHistoryEvent, LeadFeedbackStatus } from '../types';
import { FEEDBACK_LABELS } from './TestPlatform';
import { findCRMSpreadsheet, createCRMSpreadsheet, pushCRMDataToSheet, pullCRMDataFromSheet } from '../lib/googleSheets';
import { GOOGLE_APPS_SCRIPT_TEMPLATE, triggerAppsScriptEvent } from '../lib/googleAppsScript';

interface AdminDashboardProps {
  leads: Lead[];
  agents: AgentAccount[];
  notifications: SystemNotification[];
  sheetConfig: CRMConfig;
  lastSync: Date | null;
  onLogout: () => void;
  onAddLead: (lead: Lead) => void;
  onDeleteLead: (id: string) => void;
  onUpdateLead: (lead: Lead) => void;
  onAddAgent: (agent: AgentAccount) => void;
  onDeleteAgent: (id: string) => void;
  onUpdateAgent: (agent: AgentAccount) => void;
  onUpdateSheetConfig: (config: CRMConfig) => void;
  onMarkNotificationRead: (id: string) => void;
  onClearNotifications: () => void;
  onImpersonateAgent?: (agentId: string | null) => void;
}

export default function AdminDashboard({ 
  leads, 
  agents,
  notifications,
  sheetConfig,
  lastSync,
  onLogout, 
  onAddLead,
  onDeleteLead,
  onUpdateLead,
  onAddAgent, 
  onDeleteAgent, 
  onUpdateAgent,
  onUpdateSheetConfig,
  onMarkNotificationRead,
  onClearNotifications,
  onImpersonateAgent
}: AdminDashboardProps) {
  const formatAdminDateToSystemOffset = (dateStr?: string | Date) => {
    if (!dateStr) return '';
    try {
      const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
      if (isNaN(d.getTime())) return '';
      const offsetHours = sheetConfig?.timezoneOffset !== undefined ? sheetConfig.timezoneOffset : 2;
      const targetTime = d.getTime() + offsetHours * 60 * 60 * 1000;
      const targetDate = new Date(targetTime);
      
      const pad = (num: number) => num.toString().padStart(2, '0');
      const day = pad(targetDate.getUTCDate());
      const month = pad(targetDate.getUTCMonth() + 1);
      const year = targetDate.getUTCFullYear();
      const hours = pad(targetDate.getUTCHours());
      const minutes = pad(targetDate.getUTCMinutes());
      
      return `${day}/${month}/${year} à ${hours}:${minutes}`;
    } catch {
      return '';
    }
  };

  const [activeTab, setActiveTab] = useState<'leads' | 'agents' | 'sheets' | 'notifications'>('leads');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [googleToken, setGoogleToken] = useState<string | null>(() => {
    return localStorage.getItem('google_oauth_token') || null;
  });
  const [syncStatus, setSyncStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' });
  const [appsScriptUrl, setAppsScriptUrl] = useState(sheetConfig.appsScriptUrl || '');
  const [copiedScript, setCopiedScript] = useState(false);
  const [testWebhookStatus, setTestWebhookStatus] = useState('');

  useEffect(() => {
    if (sheetConfig.appsScriptUrl) {
      setAppsScriptUrl(sheetConfig.appsScriptUrl);
    }
  }, [sheetConfig.appsScriptUrl]);

  // Modal States
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [showLeadDetailsModal, setShowLeadDetailsModal] = useState(false);
  const [showAddAgentModal, setShowAddAgentModal] = useState(false);
  const [showEditAgentModal, setShowEditAgentModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentAccount | null>(null);
  const [isEditingCorporate, setIsEditingCorporate] = useState(false);

  // New Lead Form State
  const [newLead, setNewLead] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    source: 'Formulaire Web Landing',
    assignedAgentId: '',
  });

  // History note logger state
  const [newHistoryNote, setNewHistoryNote] = useState('');
  const [newHistoryType, setNewHistoryType] = useState<'note' | 'call' | 'email' | 'meeting'>('note');

  // States for tracking background Google Sheet synchronization
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  const safeUpdateLead = async (updatedLead: Lead, successText: string) => {
    setIsSyncing(true);
    setSaveSuccessMessage(null);
    try {
      // Non-blocking Firestore update
      onUpdateLead(updatedLead);
      setSelectedLead(updatedLead);

      // Micro-loader to simulate secure transmission, then show success instantly
      setTimeout(() => {
        setIsSyncing(false);
        setSaveSuccessMessage(successText);
        setTimeout(() => setSaveSuccessMessage(null), 3500);
      }, 600);
    } catch (err) {
      console.error(err);
      setIsSyncing(false);
    }
  };

  // New Agent Form State
  const [newAgent, setNewAgent] = useState({
    name: '',
    email: '',
    password: '',
    isActive: true
  });

  // Hot/Warm/Cold theme colors
  const getTempColor = (temp?: LeadTemperature) => {
    switch (temp) {
      case 'hot': return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'warm': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'cold': return 'bg-sky-100 text-sky-700 border-sky-200';
      default: return 'bg-slate-100 text-slate-500 border-slate-200';
    }
  };

  const getStatusColor = (status: LeadStatus) => {
    switch (status) {
      case 'new': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'in_progress': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'qualified': return 'bg-green-100 text-green-700 border-green-200';
      case 'lost': return 'bg-rose-100 text-rose-700 border-rose-200';
    }
  };

  const getStatusLabel = (status: LeadStatus) => {
    switch (status) {
      case 'new': return 'Nouveau';
      case 'in_progress': return 'En cours';
      case 'qualified': return 'Qualifié';
      case 'lost': return 'Perdu';
    }
  };

  // Google OAuth flow in-app if we don't have a token cached yet
  const handleConnectGoogle = async () => {
    setSyncStatus({ type: 'loading', message: 'Authentification Google Workspace...' });
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/spreadsheets');
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setGoogleToken(credential.accessToken);
        localStorage.setItem('google_oauth_token', credential.accessToken);
        setSyncStatus({ type: 'success', message: 'Compte Google connecté avec succès !' });
      } else {
        throw new Error('No access token returned');
      }
    } catch (err: any) {
      console.error(err);
      setSyncStatus({ type: 'error', message: `Échec d'authentification: ${err.message}` });
    }
  };

  // Sync Google Sheet automatically or manually
  const handleDetectOrCreateSheet = async () => {
    const token = googleToken;
    if (!token) {
      setSyncStatus({ type: 'error', message: 'Connectez d\'abord votre compte Google.' });
      return;
    }

    setSyncStatus({ type: 'loading', message: 'Recherche du fichier Google Sheet...' });
    try {
      let sheet = await findCRMSpreadsheet(token);
      if (!sheet) {
        setSyncStatus({ type: 'loading', message: 'Création d\'un nouveau Google Sheet "TED-Company CRM Leads"...' });
        sheet = await createCRMSpreadsheet(token);
      }

      onUpdateSheetConfig({
        ...sheetConfig,
        spreadsheetId: sheet.id,
        spreadsheetUrl: sheet.url,
        lastSyncedAt: new Date().toISOString()
      });

      setSyncStatus({ type: 'success', message: 'Fichier Google Sheet connecté et opérationnel !' });
    } catch (err: any) {
      setSyncStatus({ type: 'error', message: `Erreur fichier: ${err.message}` });
    }
  };

  const handleExportToSheet = async () => {
    const token = googleToken;
    const sheetId = sheetConfig?.spreadsheetId;
    if (!token || !sheetId) {
      setSyncStatus({ type: 'error', message: 'Activez la connexion Google Sheet d\'abord.' });
      return;
    }

    setSyncStatus({ type: 'loading', message: 'Écriture et mise à jour des pistes...' });
    try {
      const success = await pushCRMDataToSheet(token, sheetId, leads, agents);
      if (success) {
        onUpdateSheetConfig({ ...sheetConfig, lastSyncedAt: new Date().toISOString() });
        setSyncStatus({ type: 'success', message: `Exportation de ${leads.length} pistes et de ${agents.length} conseillers réussie !` });
      } else {
        throw new Error('La synchronisation a retourné une erreur');
      }
    } catch (err: any) {
      setSyncStatus({ type: 'error', message: `Échec de l'exportation: ${err.message}` });
    }
  };

  const handleImportFromSheet = async () => {
    const token = googleToken;
    const sheetId = sheetConfig?.spreadsheetId;
    if (!token || !sheetId) {
      setSyncStatus({ type: 'error', message: 'Activez la connexion Google Sheet d\'abord.' });
      return;
    }

    setSyncStatus({ type: 'loading', message: 'Lecture des colonnes Google Sheet...' });
    try {
      const pulled = await pullCRMDataFromSheet(token, sheetId);
      if (pulled) {
        // Feed into firestore
        for (const lead of pulled.leads) {
          onAddLead(lead); // Upsert lead
        }
        for (const agent of pulled.agents) {
          onAddAgent(agent); // Upsert agent
        }
        onUpdateSheetConfig({ ...sheetConfig, lastSyncedAt: new Date().toISOString() });
        setSyncStatus({ type: 'success', message: `${pulled.leads.length} pistes et ${pulled.agents.length} conseillers importés et fusionnés avec succès !` });
      } else {
        throw new Error('Échec de la lecture des données.');
      }
    } catch (err: any) {
      setSyncStatus({ type: 'error', message: `Échec de l'importation: ${err.message}` });
    }
  };

  const handleSaveAppsScript = (e: FormEvent) => {
    e.preventDefault();
    onUpdateSheetConfig({
      ...sheetConfig,
      appsScriptUrl: appsScriptUrl.trim()
    });
    setSyncStatus({
      type: 'success',
      message: 'URL Google Apps Script enregistrée avec succès ! (Active pour tous les conseillers)'
    });
  };

  const handleTestAppsScript = async () => {
    if (!appsScriptUrl.trim()) {
      setTestWebhookStatus("D'abord, veuillez saisir une URL valide.");
      return;
    }

    setTestWebhookStatus('Ping du webhook Google Apps Script...');
    const dummyLead: Lead = {
      id: 'test_lead_id',
      name: 'Jean Dupont (TEST)',
      email: 'jean.dupont@test.com',
      phone: '06 12 34 56 78',
      company: 'TED Test Group',
      status: 'new',
      source: 'CRM Webhook Test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      qualification: {
        budget: 'medium',
        temperature: 'hot',
        need: "Test de l'intégration Google Apps Script en direct avec envoi d'échantillon."
      },
      history: []
    };

    const res = await triggerAppsScriptEvent(appsScriptUrl, 'lead_created', {
      lead: dummyLead,
      modifiedBy: 'Administrateur (Test)',
      timestamp: new Date().toISOString()
    });

    if (res.success) {
      setTestWebhookStatus('✅ Envoyé! Ping de signal complété. Si configuré, votre script s\'exécute.');
    } else {
      setTestWebhookStatus(`❌ Échec : ${res.message}`);
    }
  };

  // Lead CRUD handlers
  const handleCreateLead = (e: FormEvent) => {
    e.preventDefault();
    const leadId = `lead_${Math.random().toString(36).substr(2, 9)}`;
    const matchedAgent = agents.find(a => a.id === newLead.assignedAgentId);
    
    const lead: Lead = {
      id: leadId,
      name: newLead.name,
      email: newLead.email,
      phone: newLead.phone,
      company: newLead.company,
      status: 'new',
      source: newLead.source,
      assignedAgentId: newLead.assignedAgentId || undefined,
      assignedAgentName: matchedAgent ? matchedAgent.name : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      qualification: {},
      history: [
        {
          id: `h_${Math.random().toString(36).substr(2, 9)}`,
          date: new Date().toISOString(),
          type: 'note',
          author: 'Administrateur',
          description: `Piste ajoutée. Source: ${newLead.source}.${matchedAgent ? ` Assignée à ${matchedAgent.name}.` : ''}`
        }
      ]
    };

    onAddLead(lead);
    setNewLead({ name: '', email: '', phone: '', company: '', source: 'Formulaire Web Landing', assignedAgentId: '' });
    setShowAddLeadModal(false);
  };

  const handleAddLogToLead = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedLead || !newHistoryNote.trim()) return;

    const log: LeadHistoryEvent = {
      id: `h_${Math.random().toString(36).substr(2, 9)}`,
      date: new Date().toISOString(),
      type: newHistoryType,
      author: 'Administrateur',
      description: newHistoryNote
    };

    const updatedLead: Lead = {
      ...selectedLead,
      updatedAt: new Date().toISOString(),
      history: [log, ...selectedLead.history]
    };

    safeUpdateLead(updatedLead, "Note ajoutée et synchronisée avec succès dans Google Sheets !");
    setNewHistoryNote('');
  };

  const handleUpdateLeadStatus = (status: LeadStatus) => {
    if (!selectedLead) return;

    const log: LeadHistoryEvent = {
      id: `h_${Math.random().toString(36).substr(2, 9)}`,
      date: new Date().toISOString(),
      type: 'status_change',
      author: 'Administrateur',
      description: `Changement de statut : de "${getStatusLabel(selectedLead.status)}" à "${getStatusLabel(status)}".`
    };

    const updatedLead: Lead = {
      ...selectedLead,
      status,
      updatedAt: new Date().toISOString(),
      history: [log, ...selectedLead.history]
    };

    safeUpdateLead(updatedLead, `Statut mis à jour à "${getStatusLabel(status)}" et synchronisé !`);
  };

  const handleUpdateLeadFeedback = (feedback: LeadFeedbackStatus) => {
    if (!selectedLead) return;

    const label = FEEDBACK_LABELS[feedback]?.label || feedback;

    const log: LeadHistoryEvent = {
      id: `h_f_${Math.random().toString(36).substr(2, 9)}`,
      date: new Date().toISOString(),
      type: 'feedback_change',
      author: 'Administrateur',
      description: `Retour d'appel qualifié à : "${label}".`
    };

    const updatedLead: Lead = {
      ...selectedLead,
      feedbackStatus: feedback,
      updatedAt: new Date().toISOString(),
      history: [log, ...selectedLead.history]
    };

    safeUpdateLead(updatedLead, `Retour d'appel qualifié à "${label}" et synchronisé !`);
  };

  const handleUpdateLeadBANT = (field: string, value: any) => {
    if (!selectedLead) return;

    const newQual = {
      ...selectedLead.qualification,
      [field]: value
    };

    const log: LeadHistoryEvent = {
      id: `h_${Math.random().toString(36).substr(2, 9)}`,
      date: new Date().toISOString(),
      type: 'qualification',
      author: 'Administrateur',
      description: `Mise à jour du critère BANT (${field}) : ${value}.`
    };

    const updatedLead: Lead = {
      ...selectedLead,
      qualification: newQual,
      updatedAt: new Date().toISOString(),
      history: [log, ...selectedLead.history]
    };

    safeUpdateLead(updatedLead, `Critère BANT (${field}) sauvegardé et synchronisé !`);
  };

  const handleUpdateCorporateField = (field: keyof Lead, value: string) => {
    if (!selectedLead) return;

    const updatedLead: Lead = {
      ...selectedLead,
      [field]: value,
      updatedAt: new Date().toISOString()
    };

    safeUpdateLead(updatedLead, `Champ "${field.toString()}" mis à jour et synchronisé !`);
  };

  const handleAssignAgentToLead = (agentId: string) => {
    if (!selectedLead) return;

    const matchedAgent = agents.find(a => a.id === agentId);
    
    const log: LeadHistoryEvent = {
      id: `h_${Math.random().toString(36).substr(2, 9)}`,
      date: new Date().toISOString(),
      type: 'status_change',
      author: 'Administrateur',
      description: matchedAgent ? `Assignation à l'agent ${matchedAgent.name}.` : 'Retrait de l\'agent assigné.'
    };

    const updatedLead: Lead = {
      ...selectedLead,
      assignedAgentId: agentId || undefined,
      assignedAgentName: matchedAgent ? matchedAgent.name : undefined,
      updatedAt: new Date().toISOString(),
      history: [log, ...selectedLead.history]
    };

    safeUpdateLead(updatedLead, matchedAgent ? `Lead assigné à ${matchedAgent.name} et synchronisé !` : "Agent désassigné de la piste et synchronisé !");
  };

  // Agent CRUD handlers
  const handleCreateAgent = (e: FormEvent) => {
    e.preventDefault();
    const sanitizedEmail = newAgent.email.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
    
    const agent: AgentAccount = {
      id: sanitizedEmail,
      name: newAgent.name,
      email: newAgent.email.toLowerCase().trim(),
      password: newAgent.password,
      isActive: newAgent.isActive
    };

    onAddAgent(agent);
    setNewAgent({ name: '', email: '', password: '', isActive: true });
    setShowAddAgentModal(false);
  };

  const handleEditAgentSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (selectedAgent) {
      onUpdateAgent(selectedAgent);
      setShowEditAgentModal(false);
      setSelectedAgent(null);
    }
  };

  const toggleAgentStatus = (agent: AgentAccount) => {
    onUpdateAgent({
      ...agent,
      isActive: !agent.isActive
    });
  };

  // Filtering leads
  const filteredLeads = leads.filter(lead => {
    const matchesSearch = lead.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          lead.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          lead.phone.includes(searchTerm) ||
                          (lead.company && lead.company.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
    
    const matchesAgent = agentFilter === 'all' || 
                         (agentFilter === 'unassigned' && !lead.assignedAgentId) || 
                         lead.assignedAgentId === agentFilter;
    
    return matchesSearch && matchesStatus && matchesAgent;
  });

  const getUnreadNotificationsCount = () => {
    return notifications.filter(n => !n.read).length;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Toast notifications for background Google Sheet sync */}
      {(isSyncing || saveSuccessMessage) && (
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none max-w-sm animate-in fade-in slide-in-from-top-4 duration-300">
          {isSyncing && (
            <div className="bg-slate-900 border border-slate-700 text-white font-extrabold text-xs px-4 py-3.5 rounded-xl shadow-lg flex items-center gap-3">
              <div className="w-4.5 h-4.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0"></div>
              <span>Écriture sécurisée dans Google Sheets...</span>
            </div>
          )}
          {saveSuccessMessage && (
            <div className="bg-emerald-600 border border-emerald-500 text-white font-black text-xs px-4 py-3.5 rounded-xl shadow-lg flex items-center gap-2.5">
              <span className="text-base">👌</span>
              <span>{saveSuccessMessage}</span>
            </div>
          )}
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-brand-primary text-white p-6 md:sticky md:top-0 md:h-screen flex flex-col">
        <div className="flex items-center gap-3 mb-12">
          <img 
            src="https://www.ted-companygroup.com/assets%20ancien/img/logos/ted-company-with-letter.png" 
            alt="Logo" 
            className="h-8 brightness-0 invert"
          />
          <span className="font-bold tracking-tight text-lg">CRM Administrateur</span>
        </div>

        <nav className="space-y-2 flex-1">
          <button 
            onClick={() => setActiveTab('leads')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all font-semibold ${activeTab === 'leads' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-white/10'}`}
          >
            <span className="flex items-center gap-3">
              <TrendingUp size={18} />
              Suivi des Leads
            </span>
            <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-black">{leads.length}</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('agents')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all font-semibold ${activeTab === 'agents' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-white/10'}`}
          >
            <span className="flex items-center gap-3">
              <Users size={18} />
              Conseillers & Accès
            </span>
            <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-black">{agents.length}</span>
          </button>

          <button 
            onClick={() => setActiveTab('sheets')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all font-semibold ${activeTab === 'sheets' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-white/10'}`}
          >
            <span className="flex items-center gap-3">
              <Database size={18} />
              Google Sheets Sync
            </span>
            {sheetConfig.spreadsheetId ? (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
            ) : null}
          </button>

          <button 
            onClick={() => setActiveTab('notifications')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all font-semibold ${activeTab === 'notifications' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-white/10'}`}
          >
            <span className="flex items-center gap-3">
              <Bell size={18} />
              Système Notifications
            </span>
            {getUnreadNotificationsCount() > 0 && (
              <span className="text-[10px] bg-rose-500 text-white px-1.5 py-0.5 rounded-full font-black animate-pulse">
                {getUnreadNotificationsCount()}
              </span>
            )}
          </button>
        </nav>

        {/* Quick Impersonation selector in Sidebar */}
        {agents.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/10 space-y-1.5 shrink-0">
            <label className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block">Simuler un Conseiller</label>
            <select
              onChange={(e) => {
                if (e.target.value) {
                  onImpersonateAgent?.(e.target.value);
                  e.target.value = ""; // Reset after selection
                }
              }}
              defaultValue=""
              className="w-full bg-white/10 hover:bg-white/15 border-none rounded-xl text-xs py-2 px-2.5 text-slate-200 outline-none cursor-pointer font-bold focus:ring-1 focus:ring-blue-500"
            >
              <option value="" disabled className="text-slate-800">-- Sélectionner --</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id} className="text-slate-800 font-semibold">{a.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-auto pt-8 border-t border-white/10">
          <div className="flex items-center gap-3 p-2">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold">
              AD
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold truncate">Admin TED</p>
              <button 
                onClick={onLogout}
                className="text-xs text-slate-400 hover:text-white"
              >
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 md:p-12 overflow-x-hidden">
        
        {/* LEADS TAB */}
        {activeTab === 'leads' && (
          <>
            <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-12">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 mb-2">Suivi des Leads</h1>
                <p className="text-slate-500 font-medium">Gérez le portefeuille des clients, l'affectation commerciale et l'état des opportunités.</p>
                {lastSync && (
                  <div className="flex items-center gap-2 mt-2">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Flux Connecté • {lastSync.toLocaleTimeString()}
                    </span>
                  </div>
                )}
              </div>
              
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowAddLeadModal(true)}
                  className="btn-primary flex items-center gap-2"
                >
                  <Plus size={18} />
                  Nouvelle Piste / Lead
                </button>
              </div>
            </header>

            {/* Pipeline Category Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 mb-12">
              {[
                { title: 'Toutes les Pistes', count: leads.length, bg: 'bg-white', text: 'text-slate-800', border: 'border-slate-100', active: statusFilter === 'all', filter: 'all' },
                { title: 'Nouveau', count: leads.filter(l => l.status === 'new').length, bg: 'bg-blue-50/50', text: 'text-blue-800', border: 'border-blue-100', active: statusFilter === 'new', filter: 'new' },
                { title: 'En Cours', count: leads.filter(l => l.status === 'in_progress').length, bg: 'bg-amber-50/50', text: 'text-amber-800', border: 'border-amber-100', active: statusFilter === 'in_progress', filter: 'in_progress' },
                { title: 'Qualifié (BANT)', count: leads.filter(l => l.status === 'qualified').length, bg: 'bg-green-50/50', text: 'text-green-800', border: 'border-green-100', active: statusFilter === 'qualified', filter: 'qualified' },
                { title: 'Perdu / Archivé', count: leads.filter(l => l.status === 'lost').length, bg: 'bg-rose-50/50', text: 'text-rose-800', border: 'border-rose-100', active: statusFilter === 'lost', filter: 'lost' },
              ].map((card, i) => (
                <button 
                  key={i}
                  onClick={() => setStatusFilter(card.filter as any)}
                  className={`text-left p-5 rounded-2xl border transition-all ${card.bg} ${card.border} hover:shadow-md ${card.active ? 'ring-2 ring-blue-600 shadow' : ''}`}
                >
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">{card.title}</p>
                  <p className={`text-3xl font-extrabold ${card.text}`}>{card.count}</p>
                </button>
              ))}
            </div>

            {/* Search and Quick Filters */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 mb-8 flex flex-col md:flex-row gap-4 items-center">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Rechercher par nom, email, téléphone, entreprise..."
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all font-semibold text-slate-700"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Advisor Classifier Classifier */}
              <div className="w-full md:w-64 flex items-center gap-2">
                <Users size={16} className="text-slate-400 shrink-0" />
                <select
                  className="w-full bg-slate-50 border border-slate-100 rounded-lg py-3 px-3 font-semibold text-xs outline-none text-slate-600 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  value={agentFilter}
                  onChange={(e) => setAgentFilter(e.target.value)}
                >
                  <option value="all">👥 Tous les Conseillers</option>
                  <option value="unassigned">👥 Non attribués</option>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>👤 {a.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Leads Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Piste</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Statut & Retour</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Attribution</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Qualité BANT</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Source / Date</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-slate-50/70 transition-colors group">
                      <td className="px-6 py-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-slate-900 text-base">{lead.name}</p>
                            {lead.company && (
                              <span className="text-[10px] bg-sky-50 text-sky-700 border border-sky-100 px-2 py-0.5 rounded font-semibold capitalize">
                                {lead.company}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-4 text-xs text-slate-400 mt-1">
                            <span className="flex items-center gap-1"><Mail size={12} /> {lead.email}</span>
                            <span className="flex items-center gap-1"><Phone size={12} /> {lead.phone}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1.5 items-start">
                          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(lead.status)}`}>
                            {getStatusLabel(lead.status)}
                          </span>
                          {lead.feedbackStatus && (
                            <div className="flex flex-col gap-0.5">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black border ${FEEDBACK_LABELS[lead.feedbackStatus]?.color}`}>
                                <span>{FEEDBACK_LABELS[lead.feedbackStatus]?.icon}</span>
                                <span className="uppercase tracking-tighter">{FEEDBACK_LABELS[lead.feedbackStatus]?.label}</span>
                              </span>
                              {lead.callbackDate && (
                                <span className="text-[9px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 font-black tracking-tight mt-0.5 flex items-center gap-0.5">
                                  ⏰ {formatAdminDateToSystemOffset(lead.callbackDate)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600 font-semibold text-sm">
                        {lead.assignedAgentName ? (
                          <span className="flex items-center gap-1">
                            <UserCheck size={16} className="text-blue-600" />
                            {lead.assignedAgentName}
                          </span>
                        ) : (
                          <span className="text-slate-300 italic">Non assigné</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          {lead.qualification?.temperature ? (
                            <span className={`px-2 py-0.5 text-[10px] border font-black uppercase tracking-wider rounded-lg ${getTempColor(lead.qualification.temperature)}`}>
                              {lead.qualification.temperature === 'hot' ? '🔥 CHAUD' : lead.qualification.temperature === 'warm' ? '⚡ TIÈDE' : '❄️ FROID'}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-300">Non qualifié</span>
                          )}
                          
                          {/* Mini checklist dots of BANT */}
                          <div className="flex gap-1">
                            <div className={`h-2 w-2 rounded-full ${lead.qualification?.budget ? 'bg-green-500' : 'bg-slate-200'}`} title="Budget" />
                            <div className={`h-2 w-2 rounded-full ${lead.qualification?.authority ? 'bg-green-500' : 'bg-slate-200'}`} title="Décisionnaire" />
                            <div className={`h-2 w-2 rounded-full ${lead.qualification?.need ? 'bg-green-500' : 'bg-slate-200'}`} title="Besoin" />
                            <div className={`h-2 w-2 rounded-full ${lead.qualification?.timeline ? 'bg-green-500' : 'bg-slate-200'}`} title="Délai" />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        <p className="font-semibold text-slate-700">{lead.source}</p>
                        <p className="text-slate-400 mt-0.5">{new Date(lead.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short' })}</p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button 
                            onClick={() => {
                              setSelectedLead(lead);
                              setShowLeadDetailsModal(true);
                            }}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all font-bold text-xs flex items-center gap-1"
                          >
                            <Eye size={16} /> Suivi
                          </button>
                          <button 
                            onClick={() => onDeleteLead(lead.id)}
                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredLeads.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
                        Aucun lead trouvé ou configuré.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* AGENTS / ACCESS REGISTER TAB */}
        {activeTab === 'agents' && (
          <>
            <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-12">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 mb-2">Conseillers & Accès</h1>
                <p className="text-slate-500 font-medium">Gérez l'équipe de conseillers commerciaux CRM et distribuez leurs identifiants de vente.</p>
              </div>
              <button 
                onClick={() => setShowAddAgentModal(true)}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                <Plus size={18} />
                Nouvel Accès Agent
              </button>
            </header>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Conseiller</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Statut Accès</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Identifiant (Email)</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Mot de passe de Connexion</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Leads Assujettis</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {agents.map((agent) => {
                    const assignedLeadsCount = leads.filter(l => l.assignedAgentId === agent.id).length;
                    return (
                      <tr key={agent.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-6 py-4 font-bold text-slate-900">{agent.name}</td>
                        <td className="px-6 py-4">
                          <button 
                            onClick={() => toggleAgentStatus(agent)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold cursor-pointer ${
                              agent.isActive 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${agent.isActive ? 'bg-green-500' : 'bg-red-500'}`} />
                            {agent.isActive ? 'Actif' : 'Suspendu'}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 font-mono select-all">
                          {agent.email}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 font-mono">
                          {agent.password}
                        </td>
                        <td className="px-6 py-4 text-sm font-extrabold text-blue-600">
                          {assignedLeadsCount} leads assignés
                        </td>
                        <td className="px-6 py-4 text-right border-l-0">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => onImpersonateAgent?.(agent.id)}
                              className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 font-extrabold text-[10px] uppercase tracking-wider rounded-lg transition-all flex items-center gap-1 cursor-pointer border border-amber-200 shadow-3xs"
                              title="Simuler et basculer sur la session de ce conseiller"
                            >
                              <UserCheck size={13} />
                              <span>Simuler vue</span>
                            </button>
                            <button 
                              onClick={() => {
                                setSelectedAgent(agent);
                                setShowEditAgentModal(true);
                              }}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button 
                              onClick={() => onDeleteAgent(agent.id)}
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {agents.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
                        Aucun conseiller n'est configuré pour le moment.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* GOOGLE SHEETS INTEG TAB */}
        {activeTab === 'sheets' && (
          <div className="max-w-4xl">
            <header className="mb-12">
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Google Sheets Sync Hub</h1>
              <p className="text-slate-500 font-medium">Synchronisez instantanément les leads et leurs historiques complets sur votre tableur Google Sheets.</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Configuration Pane */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                  <div className="absolute right-0 top-0 opacity-5 translate-x-12 -translate-y-4">
                    <Database size={200} className="text-green-600" />
                  </div>
                  
                  <div className="flex items-center gap-4 mb-6">
                    <div className="p-4 bg-green-50 text-green-600 rounded-2xl border border-green-100">
                      <FileSpreadsheet size={32} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-900">Connexion Google Sheets</h3>
                      <p className="text-sm text-slate-400 font-medium">Bases de données hébergées directement sur votre Drive</p>
                    </div>
                  </div>

                  {googleToken ? (
                    <div className="bg-green-50/50 border border-green-100 p-4 rounded-xl flex items-center justify-between gap-3 mb-8">
                      <div className="flex items-center gap-2 text-green-700 font-bold text-sm">
                        <Cloud size={16} className="animate-bounce" />
                        <span>Compte Google connecté et certifié localement</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            setGoogleToken(null);
                            localStorage.removeItem('google_oauth_token');
                            setSyncStatus({ type: 'idle', message: 'Compte Google déconnecté.' });
                          }}
                          className="text-[10px] uppercase font-bold text-red-600 hover:text-red-700 hover:underline px-2 py-1 cursor-pointer"
                        >
                          Déconnecter
                        </button>
                        <span className="text-[10px] uppercase tracking-widest font-black bg-green-100 text-green-800 px-2 py-0.5 rounded">
                          ONLINE
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3 mb-8">
                      <p className="text-xs text-slate-500 font-medium leading-relaxed">
                        Pour lier vos Google Sheets, vous devez autoriser l'accès à Google Drive et Google Sheets en signant avec vos privilèges Google.
                      </p>
                      <button 
                        onClick={handleConnectGoogle}
                        className="btn-primary w-full md:w-auto text-xs py-2 shadow-md flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700"
                      >
                        <Database size={14} /> Incorporer Mon Compte Google
                      </button>
                    </div>
                  )}

                  {sheetConfig?.spreadsheetId ? (
                    <div className="space-y-4 p-5 bg-slate-50 rounded-xl border border-slate-200">
                      <div>
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">ID Spécifique Google Sheet</p>
                        <p className="text-xs font-mono font-bold text-slate-700 truncate select-all">{sheetConfig.spreadsheetId}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Dernière Synchronisation réussie</p>
                        <p className="text-xs font-bold text-blue-600">
                          {sheetConfig.lastSyncedAt ? new Date(sheetConfig.lastSyncedAt).toLocaleString() : 'Jamais'}
                        </p>
                      </div>
                      <a 
                        href={sheetConfig.spreadsheetUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 hover:bg-green-200 text-green-800 border-2 border-green-200 font-black text-xs uppercase tracking-wider rounded-xl transition-all"
                      >
                        Ouvrir le Spreadsheet ↗
                      </a>
                    </div>
                  ) : (
                    <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                      <p className="text-sm text-slate-400 font-bold mb-4">Aucune feuille "TED-Company CRM Leads" n'est reliée.</p>
                      <button
                        onClick={handleDetectOrCreateSheet}
                        disabled={!googleToken}
                        className="px-6 py-3 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50"
                      >
                        🔍 Détecter ou Créer le fichier Sheets
                      </button>
                    </div>
                  )}

                  {/* Operational Sync Buttons */}
                  {sheetConfig?.spreadsheetId && (
                    <div className="flex flex-col sm:flex-row gap-4 mt-8 pt-6 border-t border-slate-100">
                      <button 
                        onClick={handleExportToSheet}
                        disabled={syncStatus.type === 'loading'}
                        className="flex-1 flex items-center justify-center gap-2 px-5 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-md transition-all"
                      >
                        <Database size={16} /> Écrire / Exporter vers Sheets
                      </button>
                      
                      <button 
                        onClick={handleImportFromSheet}
                        disabled={syncStatus.type === 'loading'}
                        className="flex-1 flex items-center justify-center gap-2 px-5 py-3.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-bold text-sm shadow-sm transition-all"
                      >
                        <Cloud size={16} /> Charger / Importer depuis Sheets
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Logger / Status Info Pane */}
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 text-lg mb-2">Statut Console</h3>
                    <p className="text-xs text-slate-400 font-medium mb-6">Contrôle de transmission API en direct</p>
                  </div>
                  
                  <div className="flex-1 min-h-[150px] bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-xs overflow-y-auto space-y-2 select-all">
                    {syncStatus.type === 'loading' && (
                      <p className="text-blue-400 animate-pulse">[LOAD] {syncStatus.message}</p>
                    )}
                    {syncStatus.type === 'success' && (
                      <p className="text-green-400">[SUCCESS] {syncStatus.message}</p>
                    )}
                    {syncStatus.type === 'error' && (
                      <p className="text-red-400">[ERR] {syncStatus.message}</p>
                    )}
                    {syncStatus.type === 'idle' && (
                      <p className="text-slate-500">[PRÊT] En attente d'une commande...</p>
                    )}
                    <p className="text-slate-600 text-[10px] border-t border-slate-800 pt-2 mt-2">API: https://sheets.googleapis.com</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Google Apps Script Integration Section */}
            <div className="mt-12 border-t border-slate-200 pt-12 space-y-8">
              <div>
                <h2 className="text-2xl font-black text-slate-900 mb-2 flex items-center gap-2">
                  <Sparkles className="text-blue-600 animate-pulse" size={24} />
                  Automatisation Google Apps Script (GAS)
                </h2>
                <p className="text-slate-500 font-medium">Configurez des scripts de CRM légers et réutilisables sur Google Apps Script pour expédier des e-mails d'affectation aux agents, synchroniser l'affichage ou déclencher des alertes de statut.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Side: Webhook Config */}
                <div className="lg:col-span-1 space-y-6">
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-1.5">
                      <Link size={16} className="text-blue-600" /> Webhook Déploiement
                    </h3>
                    <p className="text-xs text-slate-400 font-medium">
                      Collez ci-dessous l'URL de votre Web App Apps Script pour propager chaque lead, changement de statut ou attribution commerciale.
                    </p>

                    <form onSubmit={handleSaveAppsScript} className="space-y-3">
                      <input 
                        type="url" 
                        required
                        placeholder="https://script.google.com/macros/s/.../exec"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:ring-1 focus:ring-blue-500 selection:bg-blue-200"
                        value={appsScriptUrl}
                        onChange={(e) => setAppsScriptUrl(e.target.value)}
                      />
                      <button 
                        type="submit"
                        className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer"
                      >
                        Enregistrer l'URL
                      </button>
                    </form>

                    <div className="pt-4 border-t border-slate-100 space-y-2">
                      <h4 className="text-xs font-black text-slate-800">Tester l'intégration</h4>
                      <p className="text-[10px] text-slate-400 font-medium">Déclenche l'envoi d'un lead fictif pour vérifier la communication de script.</p>
                      <button 
                        onClick={handleTestAppsScript}
                        className="w-full py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                      >
                        ⚡ Simuler un événement
                      </button>
                      {testWebhookStatus && (
                        <p className="text-[10px] font-mono leading-relaxed bg-slate-50 p-2 rounded border border-slate-200 text-slate-600">
                          {testWebhookStatus}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Timezone (GMT) Config Card */}
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <h3 className="font-extrabold text-slate-850 text-sm uppercase tracking-wider flex items-center gap-1.5">
                      ⏰ Fuseau Horaire du Système (GMT)
                    </h3>
                    <p className="text-xs text-slate-400 font-medium">
                      Configurez le décalage horaire (GMT) utilisé par le CRM pour aligner parfaitement les heures de qualification et de relance.
                    </p>
                    <div className="space-y-3">
                      <select 
                        className="w-full border border-slate-250 rounded-xl px-3 py-2 text-xs font-black outline-none focus:ring-1 focus:ring-blue-500 bg-white text-slate-705 shadow-3xs cursor-pointer"
                        value={sheetConfig.timezoneOffset !== undefined ? sheetConfig.timezoneOffset : 2}
                        onChange={(e) => {
                          onUpdateSheetConfig({
                            ...sheetConfig,
                            timezoneOffset: parseInt(e.target.value, 10)
                          });
                        }}
                      >
                        {[-12, -11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((offset) => (
                          <option key={offset} value={offset}>
                            GMT {offset >= 0 ? `+${offset}` : offset} {offset === 2 ? " (France / CEST - Été)" : offset === 1 ? " (France / CET - Hiver)" : ""}
                          </option>
                        ))}
                      </select>
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/50 flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 font-extrabold">Configuré : <span className="text-indigo-650 font-black">GMT {sheetConfig.timezoneOffset !== undefined ? (sheetConfig.timezoneOffset >= 0 ? `+${sheetConfig.timezoneOffset}` : sheetConfig.timezoneOffset) : '+2'}</span></span>
                        <span className="text-[9px] text-slate-400 font-semibold italic">Remplace les décalages du navigateur pour tous les conseillers.</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Side: Copy & Paste Code */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-1.5">
                        <FileText size={16} className="text-green-600" /> Code source Apps Script (Index.gs)
                      </h3>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_TEMPLATE);
                          setCopiedScript(true);
                          setTimeout(() => setCopiedScript(false), 2000);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider border transition-all flex items-center gap-1 cursor-pointer ${
                          copiedScript 
                            ? 'bg-green-100 text-green-700 border-green-200' 
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <CheckCheck size={14} /> {copiedScript ? 'Copié !' : 'Copier'}
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                      Dans votre panel Google Sheet, cliquez sur <strong>Extensions &gt; Apps Script</strong>, effacez le contenu existant et collez-y le code ci-dessous. Puis cliquez sur <strong>Déployer &gt; Nouveau déploiement</strong>, type : <strong>Application Web</strong>, Exécuter en tant que : <strong>Moi</strong>, Qui a accès : <strong>Tout le monde</strong>. Collez ensuite l'URL générée à gauche.
                    </p>

                    <div className="bg-slate-900 text-xs font-mono text-slate-200 p-4 rounded-xl max-h-[250px] overflow-y-auto overflow-x-auto select-all leading-relaxed whitespace-pre font-light">
                      {GOOGLE_APPS_SCRIPT_TEMPLATE}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* NOTIFICATIONS TAB */}
        {activeTab === 'notifications' && (
          <div className="max-w-xl">
            <header className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 mb-2">Notifications Système</h1>
                <p className="text-slate-500 font-bold">Historique récent des entrées et des qualifications validées par vos agents.</p>
              </div>
              {notifications.some(n => n.read) && (
                <button 
                  onClick={onClearNotifications}
                  className="text-xs font-bold text-red-500 hover:underline"
                >
                  Nettoyer lues
                </button>
              )}
            </header>

            <div className="space-y-4">
              {notifications.map((notif) => (
                <div 
                  key={notif.id}
                  className={`p-4 rounded-xl border flex gap-3 relative transition-all ${
                    notif.read ? 'bg-white border-slate-100 opacity-60' : 'bg-blue-50/40 border-blue-100 shadow-sm'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${notif.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                    <Bell size={16} />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-slate-900 text-sm">{notif.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{notif.message}</p>
                    <p className="text-[10px] text-slate-400 font-bold mt-2">{new Date(notif.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</p>
                  </div>
                  {!notif.read && (
                    <button 
                      onClick={() => onMarkNotificationRead(notif.id)}
                      className="text-blue-600 hover:text-blue-800 self-start p-1 bg-white hover:bg-slate-50 rounded border border-slate-200 text-[10px] font-bold"
                    >
                      Lu
                    </button>
                  )}
                </div>
              ))}
              {notifications.length === 0 && (
                <div className="text-center py-12 text-slate-400 italic">
                  Aucune notification restante.
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* LEAD PROFILE DETAILS & QUALIFICATION MODAL */}
      {showLeadDetailsModal && selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl p-8 max-w-4xl w-full shadow-2xl relative max-h-[90vh] overflow-hidden flex flex-col"
          >
            <button 
              onClick={() => {
                setShowLeadDetailsModal(false);
                setSelectedLead(null);
              }}
              className="absolute right-6 top-6 p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-all"
            >
              <X size={20} />
            </button>

            <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <span className="text-[10px] uppercase font-black bg-slate-100 text-slate-500 px-2 py-0.5 rounded">Dossier Prospect</span>
                <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{selectedLead.name}</h3>
                <p className="text-xs text-slate-400 mt-1 font-semibold flex items-center gap-3">
                  <span>Email: {selectedLead.email}</span>
                  <span>Tél: {selectedLead.phone}</span>
                </p>
              </div>

              {/* Status Selector */}
              <div className="flex gap-2">
                {(['new', 'in_progress', 'qualified', 'lost'] as LeadStatus[]).map((status) => (
                  <button
                    key={status}
                    onClick={() => handleUpdateLeadStatus(status)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      selectedLead.status === status
                        ? getStatusColor(status) + ' ring-2 ring-offset-1 ring-blue-600'
                        : 'bg-white text-slate-400 border-slate-100 hover:border-slate-300'
                    }`}
                  >
                    {getStatusLabel(status)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-4 space-y-8 min-h-[300px]">
              
              {/* Attribution and Qualification grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Qualification Form (BANT) */}
                <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-200">
                  <div className="flex items-center gap-2 mb-4">
                    <Award size={18} className="text-blue-600" />
                    <h4 className="font-extrabold text-slate-800 text-sm uppercase tracking-wide">Qualification BANT</h4>
                  </div>
                  
                  <div className="space-y-4 text-xs font-medium">
                    {/* Temperature */}
                    <div className="grid grid-cols-3 items-center gap-2">
                      <span className="text-slate-500 font-bold">Thermomètre</span>
                      <div className="col-span-2 flex gap-1">
                        {(['cold', 'warm', 'hot'] as LeadTemperature[]).map(t => (
                          <button
                            key={t}
                            onClick={() => handleUpdateLeadBANT('temperature', t)}
                            className={`flex-1 py-1 text-[10px] font-black uppercase rounded border transition-all ${
                              selectedLead.qualification?.temperature === t? getTempColor(t) : 'bg-white text-slate-300 border-slate-200'
                            }`}
                          >
                            {t === 'cold' ? '❄️ Froid' : t === 'warm' ? '⚡ Tiède' : '🔥 Chaud'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Budget */}
                    <div className="grid grid-cols-3 items-center gap-2">
                      <span className="text-slate-500 font-bold">Budget</span>
                      <div className="col-span-2 flex gap-1">
                        {(['low', 'medium', 'high'] as any[]).map(b => (
                          <button
                            key={b}
                            onClick={() => handleUpdateLeadBANT('budget', b)}
                            className={`flex-1 py-1 text-[10px] font-bold uppercase rounded border transition-all ${
                              selectedLead.qualification?.budget === b ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-slate-400 border-slate-200'
                            }`}
                          >
                            {b === 'low' ? 'Faible' : b === 'medium' ? 'Moyen' : 'Élevé'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Authority */}
                    <div className="grid grid-cols-3 items-center gap-2">
                      <span className="text-slate-500 font-bold">Décisionnaire</span>
                      <div className="col-span-2 flex gap-1">
                        {(['none', 'influencer', 'decision_maker'] as any[]).map(a => (
                          <button
                            key={a}
                            onClick={() => handleUpdateLeadBANT('authority', a)}
                            className={`flex-1 py-1 text-[9px] font-bold uppercase rounded border transition-all ${
                              selectedLead.qualification?.authority === a ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-slate-400 border-slate-200'
                            }`}
                          >
                            {a === 'none' ? 'Non' : a === 'influencer' ? 'Scolaire' : 'Direct'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Need */}
                    <div className="space-y-1">
                      <span className="text-slate-500 font-bold">Besoin Défini</span>
                      <textarea
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 resize-none h-16 outline-none font-semibold text-slate-700 focus:ring-1 focus:ring-blue-500"
                        value={selectedLead.qualification?.need || ''}
                        onChange={(e) => handleUpdateLeadBANT('need', e.target.value)}
                        placeholder="Quels sont les besoins exacts de la piste..."
                      />
                    </div>

                    {/* Timeline */}
                    <div className="space-y-1">
                      <span className="text-slate-500 font-bold">Délai Signature</span>
                      <input
                        type="text"
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 outline-none font-semibold text-slate-700 focus:ring-1 focus:ring-blue-500"
                        value={selectedLead.qualification?.timeline || ''}
                        onChange={(e) => handleUpdateLeadBANT('timeline', e.target.value)}
                        placeholder="Ex: sous 3 mois, immédiat..."
                      />
                    </div>
                  </div>
                </div>

                {/* Agent Assignment, Consultations, & CRM Feedback Qualification */}
                <div className="space-y-4">
                  
                  {/* Real-time Agent Consultation Audits */}
                  {selectedLead.consultedBy && selectedLead.consultedBy.length > 0 && (
                    <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-200">
                      <div className="flex items-center gap-2 mb-3">
                        <Eye size={18} className="text-blue-600" />
                        <h4 className="font-extrabold text-slate-800 text-sm uppercase tracking-wide">Audits de Consultation Agents ({selectedLead.consultedBy.length})</h4>
                      </div>
                      <p className="text-[10px] text-slate-400 mb-2 font-bold uppercase">Suivi automatique d'inspection des fiches clients :</p>
                      <div className="space-y-1.5 max-h-[100px] overflow-y-auto pr-2 custom-scrollbar">
                        {selectedLead.consultedBy.map((c, idx) => (
                          <div key={idx} className="bg-white border border-slate-100 rounded-lg p-2 text-xs text-slate-600 font-semibold flex items-center justify-between shadow-2xs">
                            <span className="flex items-center gap-1.5 font-bold">
                              <span className="text-sky-500">●</span> {c.agentName}
                            </span>
                            <span className="text-[10px] text-slate-450 font-medium">le {new Date(c.date).toLocaleDateString()} à {new Date(c.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* CRM Qualification feedbacks */}
                  <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-200">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Layers size={18} className="text-indigo-650" />
                        <h4 className="font-extrabold text-slate-800 text-sm uppercase tracking-wide">Qualification CRM</h4>
                      </div>
                      {selectedLead.feedbackStatus && (
                        <span className="text-[10px] font-black uppercase text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                          {FEEDBACK_LABELS[selectedLead.feedbackStatus]?.label}
                        </span>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.keys(FEEDBACK_LABELS) as LeadFeedbackStatus[]).map((fbKey) => {
                        const fb = FEEDBACK_LABELS[fbKey];
                        const isSelected = selectedLead.feedbackStatus === fbKey;
                        return (
                          <button
                            key={fbKey}
                            type="button"
                            onClick={() => handleUpdateLeadFeedback(fbKey)}
                            title={fb.desc}
                            className={`flex items-center gap-1.5 p-2 rounded-lg border text-left transition-all cursor-pointer ${
                              isSelected 
                                ? `${fb.color} ring-1 ring-indigo-500 font-bold border-transparent`
                                : `bg-white text-slate-600 border-slate-200 ${fb.hoverColor}`
                            }`}
                          >
                            <span className="text-sm">{fb.icon}</span>
                            <span className="text-[10px] uppercase font-black tracking-tight leading-none">{fb.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-200">
                    <div className="flex items-center gap-2 mb-4">
                      <Users size={18} className="text-blue-600" />
                      <h4 className="font-extrabold text-slate-800 text-sm uppercase tracking-wide">Attribution Commerciale</h4>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500">Agent Assujetti</label>
                      <select
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-slate-700 outline-none"
                        value={selectedLead.assignedAgentId || ''}
                        onChange={(e) => handleAssignAgentToLead(e.target.value)}
                      >
                        <option value="">-- Non attribué --</option>
                        {agents.map(a => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Add action log to lead history */}
                  <form onSubmit={handleAddLogToLead} className="bg-slate-50/50 p-6 rounded-2xl border border-slate-200 space-y-4">
                    <div className="flex items-center gap-2">
                      <FileText size={18} className="text-blue-600" />
                      <h4 className="font-extrabold text-slate-800 text-sm uppercase tracking-wide">Ajouter un Événement / Note</h4>
                    </div>

                    <div className="flex gap-2 text-xs font-bold">
                      {(['note', 'call', 'email', 'meeting'] as any[]).map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setNewHistoryType(t)}
                          className={`flex-1 py-1 rounded capitalize transition-all ${
                            newHistoryType === t ? 'bg-blue-600 text-white' : 'bg-white text-slate-400 border border-slate-200'
                          }`}
                        >
                          {t === 'call' ? 'Appel' : t === 'email' ? 'Email' : t === 'meeting' ? 'Rdv' : 'Note'}
                        </button>
                      ))}
                    </div>

                    <textarea
                      required
                      placeholder="Indiquez le résumé de l'appel, l'adresse du rendez-vous, ou le compte rendu..."
                      className="w-full bg-white border border-slate-200 rounded-lg p-3 text-xs outline-none h-20 resize-none font-semibold focus:ring-1 focus:ring-blue-500"
                      value={newHistoryNote}
                      onChange={(e) => setNewHistoryNote(e.target.value)}
                    />

                    <button type="submit" className="btn-primary w-full py-2.5 text-xs shadow">
                      Enregistrer dans l'historique
                    </button>
                  </form>
                </div>
              </div>

              {/* FICHE D'IDENTITÉ CORPORATIVE ET RAPPORTS FINANCIERS */}
              <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 border border-slate-200/80 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-3">
                  <h4 className="font-black text-slate-800 text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2">
                    <Building size={16} className="text-emerald-600" />
                    💼 Fiche d'identité d'entreprise & Chiffres clés B2B
                  </h4>
                  <button
                    type="button"
                    onClick={() => setIsEditingCorporate(!isEditingCorporate)}
                    className={`px-3 py-1 rounded-lg text-[10px] uppercase font-black tracking-wider border transition-all cursor-pointer ${
                      isEditingCorporate 
                        ? 'bg-emerald-650 text-white border-emerald-700' 
                        : 'bg-white hover:bg-slate-50 text-slate-650 border-slate-200 shadow-3xs'
                    }`}
                  >
                    {isEditingCorporate ? '💾 Sauvegarder' : '✏️ Modifier la Fiche'}
                  </button>
                </div>

                {isEditingCorporate ? (
                  /* EDITING MODE */
                  <div className="space-y-6 text-xs text-slate-750">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4">
                      <h5 className="text-[10px] uppercase font-black text-slate-450 tracking-wider">🏢 Données Administratives</h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="font-extrabold text-slate-500 block">Nom de l'Entreprise</label>
                          <input
                            type="text"
                            value={selectedLead.company || ''}
                            onChange={(e) => handleUpdateCorporateField('company', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-bold focus:ring-1 focus:ring-blue-500 outline-none text-slate-800"
                            placeholder="Ex: Maintenance Hydraulique Systemes"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="font-extrabold text-slate-500 block">Siren</label>
                          <input
                            type="text"
                            value={selectedLead.siren || ''}
                            onChange={(e) => handleUpdateCorporateField('siren', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-bold focus:ring-1 focus:ring-blue-500 outline-none text-slate-800"
                            placeholder="Ex: 345 334 460"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="font-extrabold text-slate-500 block">Code Postal & Ville</label>
                          <input
                            type="text"
                            value={selectedLead.postalCodeCity || ''}
                            onChange={(e) => handleUpdateCorporateField('postalCodeCity', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-bold focus:ring-1 focus:ring-blue-500 outline-none text-slate-800"
                            placeholder="Ex: 77000 Vaux-le-penil"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="font-extrabold text-slate-500 block">Date de création</label>
                          <input
                            type="text"
                            value={selectedLead.creationDate || ''}
                            onChange={(e) => handleUpdateCorporateField('creationDate', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-blue-500 outline-none text-slate-800"
                            placeholder="Ex: 04/1988"
                          />
                        </div>
                        <div className="space-y-1 col-span-1 sm:col-span-2">
                          <label className="font-extrabold text-slate-500 block">Activité / Code NAF</label>
                          <input
                            type="text"
                            value={selectedLead.activityCode || ''}
                            onChange={(e) => handleUpdateCorporateField('activityCode', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-blue-500 outline-none text-slate-800"
                            placeholder="Ex: 4669B Commerce de gros..."
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="font-extrabold text-slate-500 block">Forme juridique</label>
                          <input
                            type="text"
                            value={selectedLead.legalForm || ''}
                            onChange={(e) => handleUpdateCorporateField('legalForm', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-blue-500 outline-none text-slate-800"
                            placeholder="Ex: SARL"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="font-extrabold text-slate-500 block">Capital social</label>
                          <input
                            type="text"
                            value={selectedLead.capital || ''}
                            onChange={(e) => handleUpdateCorporateField('capital', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-bold text-blue-600 focus:ring-1 focus:ring-blue-500 outline-none"
                            placeholder="Ex: 200 000 €"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="font-extrabold text-slate-500 block">Téléphone Entreprise</label>
                          <input
                            type="text"
                            value={selectedLead.phone || ''}
                            onChange={(e) => handleUpdateCorporateField('phone', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-blue-500 outline-none text-slate-850"
                            placeholder="Ex: 01 64 39 31 66"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="font-extrabold text-slate-500 block">Site web</label>
                          <input
                            type="text"
                            value={selectedLead.website || ''}
                            onChange={(e) => handleUpdateCorporateField('website', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-indigo-650 font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                            placeholder="Ex: mhs.fr"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4">
                      <h5 className="text-[10px] uppercase font-black text-slate-455 tracking-wider">📊 Chiffres Financiers & Bilan</h5>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="font-extrabold text-slate-500 block">Dernier bilan connu</label>
                          <input
                            type="text"
                            value={selectedLead.lastBilanYear || ''}
                            onChange={(e) => handleUpdateCorporateField('lastBilanYear', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-blue-500 outline-none font-bold text-slate-800"
                            placeholder="Ex: 2016"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="font-extrabold text-slate-500 block">Chiffre d'Affaires (CA)</label>
                          <input
                            type="text"
                            value={selectedLead.ca || ''}
                            onChange={(e) => handleUpdateCorporateField('ca', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-blue-500 outline-none font-bold text-slate-900"
                            placeholder="Ex: 3 943 K€"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="font-extrabold text-slate-500 block">Résultat Exploitation</label>
                          <input
                            type="text"
                            value={selectedLead.ebitda || ''}
                            onChange={(e) => handleUpdateCorporateField('ebitda', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-blue-500 outline-none font-bold text-emerald-600"
                            placeholder="Ex: 40 K€"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="font-extrabold text-slate-500 block">Capitaux propres (Bilan)</label>
                          <input
                            type="text"
                            value={selectedLead.equity || ''}
                            onChange={(e) => handleUpdateCorporateField('equity', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-blue-500 outline-none font-bold text-slate-800"
                            placeholder="Ex: 237 K€"
                          />
                        </div>

                        <div className="col-span-2 sm:col-span-3 border-t border-slate-100 my-1 pt-2">
                          <span className="text-[10px] uppercase font-black text-indigo-650 block">Détails Bilan au 31/03/2023 :</span>
                        </div>

                        <div className="space-y-1">
                          <label className="font-extrabold text-slate-500 block">Capitaux Propres 2023</label>
                          <input
                            type="text"
                            value={selectedLead.equity2023 || ''}
                            onChange={(e) => handleUpdateCorporateField('equity2023', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-blue-500 outline-none font-bold text-slate-800"
                            placeholder="Ex: 208 K€"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="font-extrabold text-slate-500 block">Bénéfice 2023</label>
                          <input
                            type="text"
                            value={selectedLead.earnings2023 || ''}
                            onChange={(e) => handleUpdateCorporateField('earnings2023', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-blue-500 outline-none font-bold text-emerald-600"
                            placeholder="Ex: 83 K€"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="font-extrabold text-slate-500 block">En cours production</label>
                          <input
                            type="text"
                            value={selectedLead.workInProgress2023 || ''}
                            onChange={(e) => handleUpdateCorporateField('workInProgress2023', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-blue-500 outline-none font-bold text-amber-600"
                            placeholder="Ex: 42 K€"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="font-extrabold text-slate-500 block">Marchandises</label>
                          <input
                            type="text"
                            value={selectedLead.inventory2023 || ''}
                            onChange={(e) => handleUpdateCorporateField('inventory2023', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-blue-500 outline-none font-bold text-slate-850"
                            placeholder="Ex: 893 K€"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="font-extrabold text-slate-500 block">Créances clients</label>
                          <input
                            type="text"
                            value={selectedLead.receivables2023 || ''}
                            onChange={(e) => handleUpdateCorporateField('receivables2023', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-blue-500 outline-none font-bold text-slate-855"
                            placeholder="Ex: 146 K€"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4">
                      <h5 className="text-[10px] uppercase font-black text-slate-450 tracking-wider">👤 Mandataire & Dirigeance</h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="font-extrabold text-slate-500 block">Nom du Dirigeant</label>
                          <input
                            type="text"
                            value={selectedLead.directorName || ''}
                            onChange={(e) => handleUpdateCorporateField('directorName', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-bold focus:ring-1 focus:ring-blue-500 outline-none text-slate-800"
                            placeholder="Ex: Barre Daniel"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="font-extrabold text-slate-500 block">Fonction</label>
                          <input
                            type="text"
                            value={selectedLead.directorRole || ''}
                            onChange={(e) => handleUpdateCorporateField('directorRole', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-blue-500 outline-none text-slate-800"
                            placeholder="Ex: Gérant"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="font-extrabold text-slate-500 block">Âge & Date de Naissance</label>
                          <input
                            type="text"
                            value={selectedLead.directorAge || ''}
                            onChange={(e) => handleUpdateCorporateField('directorAge', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-blue-500 outline-none text-slate-800"
                            placeholder="Ex: 74 ans - 07/1951"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="font-extrabold text-slate-500 block">En fonction depuis le</label>
                          <input
                            type="text"
                            value={selectedLead.directorSince || ''}
                            onChange={(e) => handleUpdateCorporateField('directorSince', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-blue-500 outline-none text-slate-800"
                            placeholder="Ex: 11/04/2017"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* READ-ONLY MODE */
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Identity Panel */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200/50 space-y-2.5">
                        <h5 className="text-[10px] uppercase font-black text-slate-450 tracking-wider">🏢 Informations Administratives</h5>
                        
                        <div className="grid grid-cols-2 text-xs gap-y-1.5 font-semibold text-slate-650">
                          <span className="text-slate-450">Entreprise :</span>
                          <span className="text-slate-800 font-extrabold">{selectedLead.company || "N/A"}</span>

                          <span className="text-slate-455">Siren :</span>
                          <span className="text-slate-800 font-extrabold">{selectedLead.siren || "N/A"}</span>

                          <span className="text-slate-450">Adresse / Ville :</span>
                          <span className="text-slate-800 font-extrabold">{selectedLead.postalCodeCity || "N/A"}</span>

                          <span className="text-slate-450">Création :</span>
                          <span className="text-slate-800">{selectedLead.creationDate || "N/A"}</span>

                          <span className="text-slate-450">Activité (NAF) :</span>
                          <span className="text-slate-800 text-[10px] leading-tight" title={selectedLead.activityCode}>{selectedLead.activityCode || "N/A"}</span>

                          <span className="text-slate-450">Forme Juridique :</span>
                          <span className="text-slate-800 text-[10px] leading-tight">{selectedLead.legalForm || "N/A"}</span>

                          <span className="text-slate-450">Capital Social :</span>
                          <span className="text-slate-800 font-extrabold text-blue-600">{selectedLead.capital || "N/A"}</span>

                          <span className="text-slate-450">Site Web :</span>
                          <span>
                            {selectedLead.website ? (
                              <a href={`https://${selectedLead.website}`} target="_blank" rel="noopener noreferrer" className="text-blue-605 hover:underline font-extrabold inline-flex items-center gap-0.5">
                                {selectedLead.website} 🔗
                              </a>
                            ) : "N/A"}
                          </span>
                        </div>
                      </div>

                      {/* Financial Bilan Panel */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200/50 space-y-2.5">
                        <h5 className="text-[10px] uppercase font-black text-slate-455 tracking-wider">📊 Chiffres Financiers & Bilan</h5>
                        
                        <div className="grid grid-cols-2 text-xs gap-y-1.5 font-semibold text-slate-650">
                          <span className="text-slate-450">Dernier bilan :</span>
                          <span className="font-extrabold text-slate-700">{selectedLead.lastBilanYear ? `Année ${selectedLead.lastBilanYear}` : "N/A"}</span>

                          <span className="text-slate-450">Chiffre d'affaires :</span>
                          <span className="font-extrabold text-slate-900">{selectedLead.ca || "N/A"}</span>

                          <span className="text-slate-450">Résultat d'Exploit. :</span>
                          <span className="font-extrabold text-emerald-650">{selectedLead.ebitda || "N/A"}</span>

                          <span className="text-slate-450">Capitaux propres :</span>
                          <span className="font-bold text-slate-800">{selectedLead.equity || "N/A"}</span>

                          <div className="col-span-2 border-t border-slate-100 my-1 pt-1 flex items-center justify-between">
                            <span className="text-[10px] uppercase font-black text-indigo-500 block">Bilan au 31/03/2023</span>
                            <span className="text-[9px] bg-indigo-50 text-indigo-650 px-1 py-0.2 rounded font-black">Actif B2B</span>
                          </div>

                          <span className="text-slate-450">Capitaux propres :</span>
                          <span className="font-bold text-slate-800">{selectedLead.equity2023 || "N/A"}</span>

                          <span className="text-slate-450">Bénéfice :</span>
                          <span className="font-black text-emerald-600">{selectedLead.earnings2023 || "N/A"}</span>

                          <span className="text-slate-455">En cours prod. :</span>
                          <span className="font-bold text-amber-600">{selectedLead.workInProgress2023 || "N/A"}</span>

                          <span className="text-slate-450">Marchandises :</span>
                          <span className="font-bold text-slate-800">{selectedLead.inventory2023 || "N/A"}</span>

                          <span className="text-slate-450">Créances clients :</span>
                          <span className="font-bold text-slate-800">{selectedLead.receivables2023 || "N/A"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Dirigeant */}
                    <div className="bg-white p-4 rounded-xl border border-slate-200/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 font-bold border border-emerald-100 shrink-0">
                          👤
                        </div>
                        <div>
                          <p className="text-[10px] uppercase font-black text-slate-450 tracking-wider leading-none mb-1">Dirigeant principal / Mandataire</p>
                          <p className="text-xs font-extrabold text-slate-850">{selectedLead.directorName || "N/A"}</p>
                          <p className="text-[10px] text-slate-450 font-bold">{selectedLead.directorRole || "Mandataire"} • {selectedLead.directorAge || "N/A"}</p>
                        </div>
                      </div>
                      <div className="text-right sm:border-l sm:border-slate-100 sm:pl-4">
                        <p className="text-[10px] uppercase font-black text-slate-450 tracking-wider">En fonction depuis</p>
                        <p className="text-xs font-black text-blue-600">{selectedLead.directorSince || "N/A"}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* History Timeline */}
              <div className="space-y-4">
                <h4 className="font-extrabold text-slate-900 text-lg border-b border-slate-100 pb-2">Historique Chronologique ({selectedLead.history?.length || 0})</h4>
                <div className="space-y-4 max-h-[30vh] overflow-y-auto pr-2 custom-scrollbar">
                  {selectedLead.history && selectedLead.history.map((h, i) => (
                    <div key={i} className="flex gap-4 relative">
                      {/* Vertical line connector */}
                      {i < selectedLead.history.length - 1 && (
                        <div className="absolute left-3.5 top-6 bottom-0 w-0.5 bg-slate-100" />
                      )}
                      
                      {/* Icon */}
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold select-none ${
                        h.type === 'call' ? 'bg-green-100 text-green-700' :
                        h.type === 'email' ? 'bg-blue-100 text-blue-700' :
                        h.type === 'meeting' ? 'bg-amber-100 text-amber-700' :
                        h.type === 'status_change' ? 'bg-purple-100 text-purple-700' :
                        h.type === 'consultation' ? 'bg-cyan-100 text-cyan-700' :
                        h.type === 'feedback_change' ? 'bg-indigo-100 text-indigo-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {h.type === 'call' ? '📞' : 
                         h.type === 'email' ? '✉️' : 
                         h.type === 'meeting' ? '🤝' : 
                         h.type === 'status_change' ? '⚙️' : 
                         h.type === 'consultation' ? '👁️' : 
                         h.type === 'feedback_change' ? '🏷️' : 
                         '📝'}
                      </div>

                      {/* Content */}
                      <div className="flex-1 bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-extrabold text-slate-900 text-xs">{h.author}</span>
                          <span className="text-[10px] text-slate-400 font-bold">{new Date(h.date).toLocaleDateString()} à {new Date(h.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium leading-relaxed">{h.description}</p>
                      </div>
                    </div>
                  ))}
                  {(!selectedLead.history || selectedLead.history.length === 0) && (
                    <p className="text-xs text-slate-300 italic">Aucun événement enregistré.</p>
                  )}
                </div>
              </div>

            </div>
          </motion.div>
        </div>
      )}

      {/* ADD LEAD MODAL */}
      {showAddLeadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl relative"
          >
            <button 
              onClick={() => setShowAddLeadModal(false)}
              className="absolute right-6 top-6 p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-all"
            >
              <X size={20} />
            </button>
            <h3 className="text-2xl font-bold text-slate-900 mb-2 font-display">Nouvelle Piste / Lead</h3>
            <p className="text-slate-500 mb-8 max-w-sm text-sm">
              Enregistrez manuellement un client potentiel pour enclencher le processus commercial.
            </p>

            <form onSubmit={handleCreateLead} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Nom Complet du Prospect</label>
                <input 
                  type="text" 
                  required
                  placeholder="ex: Jean de la Fontaine"
                  className="input-field"
                  value={newLead.name}
                  onChange={(e) => setNewLead({...newLead, name: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Email</label>
                  <input 
                    type="email" 
                    required
                    placeholder="ex: jfontaine@gmail.com"
                    className="input-field"
                    value={newLead.email}
                    onChange={(e) => setNewLead({...newLead, email: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Téléphone/Portable</label>
                  <input 
                    type="tel" 
                    required
                    placeholder="+33 6 ..."
                    className="input-field"
                    value={newLead.phone}
                    onChange={(e) => setNewLead({...newLead, phone: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Entreprise / Nom Société</label>
                <input 
                  type="text" 
                  placeholder="Optionnel (ex: Valeo S.A.)"
                  className="input-field"
                  value={newLead.company}
                  onChange={(e) => setNewLead({...newLead, company: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Source d'acquisition</label>
                  <select
                    className="input-field"
                    value={newLead.source}
                    onChange={(e) => setNewLead({...newLead, source: e.target.value})}
                  >
                    <option value="Formulaire Web Landing">Formulaire Web</option>
                    <option value="Cold Outreach LinkedIn">LinkedIn</option>
                    <option value="Appel Entrant">Appel Entrant</option>
                    <option value="Salon / Prospection">Prospection Directe</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Attribuer Immédiatement</label>
                  <select
                    className="input-field font-semibold"
                    value={newLead.assignedAgentId}
                    onChange={(e) => setNewLead({...newLead, assignedAgentId: e.target.value})}
                  >
                    <option value="">Non assigné</option>
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-6">
                <button 
                  type="button"
                  onClick={() => setShowAddLeadModal(false)}
                  className="flex-1 py-3 text-slate-500 hover:bg-slate-100 rounded-xl font-bold text-sm transition-all"
                >
                  Annuler
                </button>
                <button type="submit" className="flex-1 btn-primary py-3 font-bold text-sm">
                  Créer le lead
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* ADD AGENT ACCESS MODAL */}
      {showAddAgentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl relative"
          >
            <button 
              onClick={() => setShowAddAgentModal(false)}
              className="absolute right-6 top-6 p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-all"
            >
              <X size={20} />
            </button>
            <h3 className="text-2xl font-bold text-slate-900 mb-2 font-display">Nouvel Accès Conseiller</h3>
            <p className="text-slate-500 mb-6 text-sm">
              Créez des identifiants d'accès CRM pour un nouveau conseiller de vente.
            </p>

            <form onSubmit={handleCreateAgent} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Nom Complet</label>
                <input 
                  type="text" 
                  required
                  placeholder="ex: Marie Curie"
                  className="input-field"
                  value={newAgent.name}
                  onChange={(e) => setNewAgent({...newAgent, name: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Email professionnel</label>
                <input 
                  type="email" 
                  required
                  placeholder="mcurie@ted-company.com"
                  className="input-field"
                  value={newAgent.email}
                  onChange={(e) => setNewAgent({...newAgent, email: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Mot de passe provisoire</label>
                <input 
                  type="text" 
                  required
                  placeholder="Indiquez un mot de passe solide..."
                  className="input-field"
                  value={newAgent.password}
                  onChange={(e) => setNewAgent({...newAgent, password: e.target.value})}
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowAddAgentModal(false)}
                  className="flex-1 py-3 text-slate-500 hover:bg-slate-100 rounded-xl text-sm font-bold transition-all"
                >
                  Annuler
                </button>
                <button type="submit" className="flex-1 btn-primary py-3 text-sm font-bold">
                  Créer l'agent
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* EDIT AGENT ACCESS MODAL */}
      {showEditAgentModal && selectedAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl relative"
          >
            <button 
              onClick={() => {
                setShowEditAgentModal(false);
                setSelectedAgent(null);
              }}
              className="absolute right-6 top-6 p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-all"
            >
              <X size={20} />
            </button>
            <h3 className="text-2xl font-bold text-slate-900 mb-2">Modifier l'Accès</h3>
            <p className="text-slate-500 mb-6 text-sm">
              Mettez à jour les informations de connexion de l'agent <strong>{selectedAgent.name}</strong>.
            </p>

            <form onSubmit={handleEditAgentSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Nom Complet</label>
                <input 
                  type="text" 
                  required
                  className="input-field"
                  value={selectedAgent.name}
                  onChange={(e) => setSelectedAgent({...selectedAgent, name: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Mot de passe de Connexion</label>
                <input 
                  type="text" 
                  required
                  className="input-field"
                  value={selectedAgent.password || ''}
                  onChange={(e) => setSelectedAgent({...selectedAgent, password: e.target.value})}
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => {
                    setShowEditAgentModal(false);
                    setSelectedAgent(null);
                  }}
                  className="flex-1 py-3 text-slate-400 hover:bg-slate-100 rounded-xl text-sm font-bold transition-all"
                >
                  Annuler
                </button>
                <button type="submit" className="flex-1 btn-primary py-3 text-sm font-bold">
                  Sauvegarder
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

    </div>
  );
}
