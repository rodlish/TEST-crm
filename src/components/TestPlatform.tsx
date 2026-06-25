/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, FormEvent, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LogOut, 
  Search, 
  Clock, 
  FileText,
  CheckCircle,
  AlertCircle,
  X,
  Mail,
  User as UserIcon,
  Phone,
  Database,
  Users,
  Award,
  Calendar,
  Layers,
  Sparkles,
  Link,
  Bell,
  CheckCheck,
  Eye,
  Check,
  Building,
  ArrowRight
} from 'lucide-react';
import { Lead, AgentAccount, LeadStatus, LeadTemperature, SystemNotification, LeadHistoryEvent, LeadFeedbackStatus, LeadConsultation, CRMConfig } from '../types';

export const FEEDBACK_LABELS: Record<LeadFeedbackStatus, { label: string; desc: string; color: string; hoverColor: string; icon: string }> = {
  ne_repond_pas: { label: "Ne répond pas", desc: "Le prospect n'a pas décroché ni répondu.", color: "bg-slate-100 text-slate-700 border-slate-300", hoverColor: "hover:bg-slate-200", icon: "🔇" },
  relance: { label: "Relance", desc: "Besoin de recontacter le prospect.", color: "bg-indigo-50 text-indigo-750 border-indigo-200", hoverColor: "hover:bg-indigo-100", icon: "🔁" },
  messagerie: { label: "Messagerie", desc: "Message vocal déposé sur répondeur.", color: "bg-blue-50 text-blue-700 border-blue-200", hoverColor: "hover:bg-blue-100", icon: "📟" },
  argumenter: { label: "Argumenter", desc: "En cours de discussion / argumentaire de vente.", color: "bg-pink-50 text-pink-700 border-pink-200", hoverColor: "hover:bg-pink-100", icon: "🗣️" },
  rappeler: { label: "Rappeler", desc: "Rappel convenu avec le prospect.", color: "bg-amber-50 text-amber-700 border-amber-200", hoverColor: "hover:bg-amber-100", icon: "📞" },
  rendez_vous: { label: "Rendez-vous", desc: "Rendez-vous de qualification planifié.", color: "bg-violet-50 text-violet-700 border-violet-200", hoverColor: "hover:bg-violet-100", icon: "🤝" },
  confirmer: { label: "Confirmer", desc: "Intérêt ferme & accord commercial.", color: "bg-emerald-50 text-emerald-700 border-emerald-200", hoverColor: "hover:bg-emerald-100", icon: "✅" },
  refus: { label: "Refus", desc: "Prospect non intéressé / rejet du dossier.", color: "bg-rose-50 text-rose-700 border-rose-200", hoverColor: "hover:bg-rose-100", icon: "❌" }
};

interface TestPlatformProps {
  onLogout: () => void;
  agent: AgentAccount;
  leads: Lead[];
  notifications: SystemNotification[];
  onUpdateLead: (lead: Lead) => void;
  onMarkNotificationRead: (id: string) => void;
  lastSync: Date | null;
  onBackToAdmin?: () => void;
  sheetConfig?: CRMConfig;
  onlineUsers?: any[];
  presenceLogs?: any[];
}

export default function TestPlatform({ 
  onLogout, 
  agent, 
  leads, 
  notifications,
  onUpdateLead, 
  onMarkNotificationRead,
  lastSync,
  onBackToAdmin,
  sheetConfig,
  onlineUsers = [],
  presenceLogs = []
}: TestPlatformProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'leads' | 'presence'>('leads');

  const conn = (onlineUsers || []).find(u => u.email.toLowerCase().trim() === agent.email.toLowerCase().trim());
  const currentStatus = conn?.status || 'en_ligne';

  const [searchType, setSearchType] = useState<'all' | 'date' | 'feedback' | 'phone' | 'id_client'>('all');
  const [activeStatus, setActiveStatus] = useState<LeadStatus | 'all'>('all');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  // Note/log state
  const [historyNote, setHistoryNote] = useState('');
  const [historyType, setHistoryType] = useState<'note' | 'call' | 'email' | 'meeting'>('note');
  const [isEditingCorporate, setIsEditingCorporate] = useState(false);

  const [originalLead, setOriginalLead] = useState<Lead | null>(null);
  const [isSaved, setIsSaved] = useState<boolean>(true);
  const [hasJustSaved, setHasJustSaved] = useState<boolean>(false);
  const [dateWarning, setDateWarning] = useState<string | null>(null);
  const [recallAlert, setRecallAlert] = useState<Lead | null>(null);
  const [isDateValidated, setIsDateValidated] = useState<boolean>(true);

  const isQualifiedAndLocked = selectedLead 
    ? (selectedLead.status === 'qualified' || selectedLead.status === 'lost' || hasJustSaved)
    : false;

  const handleStatusChange = async (newStatus: 'en_ligne' | 'en_pause' | 'deconnecte') => {
    if (newStatus === 'en_pause' && !isSaved && selectedLead) {
      alert("Veuillez d'abord enregistrer et qualifier la fiche actuelle avant de pouvoir vous mettre en pause !");
      return;
    }
    const { transitionPresence } = await import('../lib/presence');
    await transitionPresence(agent.email, agent.name, 'agent', newStatus);
  };

  // States for tracking background Google Sheet synchronization
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Track active lead consultation session
  const leadsRef = useRef(leads);
  const agentRef = useRef(agent);
  const activeLeadSessionRef = useRef<{ leadId: string; startTime: number } | null>(null);

  useEffect(() => {
    leadsRef.current = leads;
    agentRef.current = agent;
  }, [leads, agent]);

  useEffect(() => {
    // If there was a previous lead session active, save its duration
    if (activeLeadSessionRef.current) {
      const prevSession = activeLeadSessionRef.current;
      const durationSeconds = Math.round((Date.now() - prevSession.startTime) / 1000);
      
      if (durationSeconds > 0) {
        const prevLead = leadsRef.current.find(l => l.id === prevSession.leadId);
        if (prevLead) {
          const recentConsultations = [...(prevLead.consultedBy || [])];
          const myLastConsultIdx = recentConsultations.findIndex(c => c.agentEmail === agentRef.current.email);
          if (myLastConsultIdx !== -1) {
            recentConsultations[myLastConsultIdx] = {
              ...recentConsultations[myLastConsultIdx],
              durationSeconds: (recentConsultations[myLastConsultIdx].durationSeconds || 0) + durationSeconds
            };
            onUpdateLead({
              ...prevLead,
              consultedBy: recentConsultations,
              updatedAt: new Date().toISOString()
            });
          }
        }
      }
    }

    if (selectedLead) {
      activeLeadSessionRef.current = {
        leadId: selectedLead.id,
        startTime: Date.now()
      };
    } else {
      activeLeadSessionRef.current = null;
    }
  }, [selectedLead?.id]);

  useEffect(() => {
    return () => {
      if (activeLeadSessionRef.current) {
        const prevSession = activeLeadSessionRef.current;
        const durationSeconds = Math.round((Date.now() - prevSession.startTime) / 1000);
        if (durationSeconds > 0) {
          const prevLead = leadsRef.current.find(l => l.id === prevSession.leadId);
          if (prevLead) {
            const recentConsultations = [...(prevLead.consultedBy || [])];
            const myLastConsultIdx = recentConsultations.findIndex(c => c.agentEmail === agentRef.current.email);
            if (myLastConsultIdx !== -1) {
              recentConsultations[myLastConsultIdx] = {
                ...recentConsultations[myLastConsultIdx],
                durationSeconds: (recentConsultations[myLastConsultIdx].durationSeconds || 0) + durationSeconds
              };
              onUpdateLead({
                ...prevLead,
                consultedBy: recentConsultations,
                updatedAt: new Date().toISOString()
              });
            }
          }
        }
      }
    };
  }, []);

  // Clear selected lead when agent goes on break
  useEffect(() => {
    if (currentStatus === 'en_pause' && selectedLead) {
      setSelectedLead(null);
    }
  }, [currentStatus, selectedLead]);

  // Helper to format date with system timezoneOffset
  const formatDateToSystemOffset = (dateStr?: string | Date) => {
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

  const getSystemLocalDateTimeString = (utcDateStr?: string | Date) => {
    if (!utcDateStr) return '';
    try {
      const d = typeof utcDateStr === 'string' ? new Date(utcDateStr) : utcDateStr;
      if (isNaN(d.getTime())) return '';
      const offsetHours = sheetConfig?.timezoneOffset !== undefined ? sheetConfig.timezoneOffset : 2;
      const targetTime = d.getTime() + offsetHours * 60 * 60 * 1000;
      const targetDate = new Date(targetTime);
      return targetDate.toISOString().slice(0, 16);
    } catch {
      return '';
    }
  };

  const getSystemLocalDateString = (utcDateStr?: string | Date) => {
    if (!utcDateStr) return '';
    try {
      const d = typeof utcDateStr === 'string' ? new Date(utcDateStr) : utcDateStr;
      if (isNaN(d.getTime())) return '';
      const offsetHours = sheetConfig?.timezoneOffset !== undefined ? sheetConfig.timezoneOffset : 2;
      const targetTime = d.getTime() + offsetHours * 60 * 60 * 1000;
      const targetDate = new Date(targetTime);
      return targetDate.toISOString().slice(0, 10);
    } catch {
      return '';
    }
  };

  const getSystemLocalTimeString = (utcDateStr?: string | Date) => {
    if (!utcDateStr) return '';
    try {
      const d = typeof utcDateStr === 'string' ? new Date(utcDateStr) : utcDateStr;
      if (isNaN(d.getTime())) return '';
      const offsetHours = sheetConfig?.timezoneOffset !== undefined ? sheetConfig.timezoneOffset : 2;
      const targetTime = d.getTime() + offsetHours * 60 * 60 * 1000;
      const targetDate = new Date(targetTime);
      return targetDate.toISOString().slice(11, 16);
    } catch {
      return '';
    }
  };

  const getLocalDateTimeString = (dateObj: Date = new Date()) => {
    const tzOffset = dateObj.getTimezoneOffset() * 60000;
    return new Date(dateObj.getTime() - tzOffset).toISOString().slice(0, 16);
  };

  // Auto-validate state transitions when user shifts leads
  useEffect(() => {
    setIsDateValidated(true);
    setDateWarning(null);
  }, [selectedLead?.id]);

  const findDueRecallLead = (currentLeads: Lead[]): Lead | null => {
    const now = new Date();
    const dueRecallLeads = currentLeads.filter(l => {
      const isAssigned = l.assignedAgentId === agent.id || l.assignedAgentId?.toLowerCase() === agent.email.toLowerCase();
      if (!isAssigned) return false;
      if (!l.callbackDate) return false;
      const recallTime = new Date(l.callbackDate);
      return recallTime <= now;
    });

    if (dueRecallLeads.length === 0) return null;
    dueRecallLeads.sort((a, b) => new Date(a.callbackDate!).getTime() - new Date(b.callbackDate!).getTime());
    return dueRecallLeads[0];
  };

  useEffect(() => {
    // Background polling: automatically bring up overdue/due leads if the adviser was inactive or saved state is satisfied
    const timer = setInterval(() => {
      if (isSaved) {
        const due = findDueRecallLead(leads);
        if (due && selectedLead?.id !== due.id) {
          setSelectedLead(due);
          setOriginalLead({
            ...due,
            qualification: due.qualification ? { ...due.qualification } : {}
          });
          setRecallAlert(due);
        }
      }
    }, 15000);

    return () => clearInterval(timer);
  }, [leads, isSaved, selectedLead]);

  // Filter leads assigned exclusively to this agent (by checking agent email or ID)
  // Our agent id in seeds is like 'agent_sofiane' or 'agent_laura', or email
  const assignedLeads = leads.filter(lead => 
    (lead.assignedAgentId === agent.id || 
     lead.assignedAgentId?.toLowerCase() === agent.email.toLowerCase()) &&
    lead.status !== 'new'
  );

  const filteredLeads = assignedLeads.filter(lead => {
    let matchesSearch = false;
    const term = searchTerm.toLowerCase().trim();

    if (!term) {
      matchesSearch = true;
    } else if (searchType === 'all') {
      matchesSearch = lead.name.toLowerCase().includes(term) || 
                      lead.email.toLowerCase().includes(term) ||
                      lead.phone.includes(term) ||
                      lead.id.toLowerCase().includes(term) ||
                      (lead.company && lead.company.toLowerCase().includes(term)) ||
                      (lead.createdAt && new Date(lead.createdAt).toLocaleDateString().includes(term)) ||
                      (lead.feedbackStatus && (FEEDBACK_LABELS[lead.feedbackStatus]?.label || '').toLowerCase().includes(term));
    } else if (searchType === 'date') {
      const dateStr = lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : '';
      matchesSearch = dateStr.includes(term);
    } else if (searchType === 'feedback') {
      const feedbackStr = lead.feedbackStatus ? (FEEDBACK_LABELS[lead.feedbackStatus]?.label || '').toLowerCase() : '';
      matchesSearch = feedbackStr.includes(term);
    } else if (searchType === 'phone') {
      matchesSearch = lead.phone.includes(term);
    } else if (searchType === 'id_client') {
      matchesSearch = lead.id.toLowerCase().includes(term) || lead.name.toLowerCase().includes(term);
    }
    
    const matchesStatus = activeStatus === 'all' || lead.status === activeStatus;
    
    return matchesSearch && matchesStatus;
  });

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

  const corporateFields: (keyof Lead)[] = [
    'company', 'siren', 'postalCodeCity', 'creationDate', 'activityCode', 'legalForm',
    'capital', 'phone', 'website', 'lastBilanYear', 'ca', 'ebitda', 'equity', 'equity2023',
    'earnings2023', 'workInProgress2023', 'inventory2023', 'receivables2023', 'directorName',
    'directorRole', 'directorAge', 'directorSince'
  ];

  const handleSelectLead = (lead: Lead) => {
    if (currentStatus === 'en_pause') {
      alert("Vous êtes actuellement en pause. Veuillez repasser en statut actif pour consulter un dossier client.");
      return;
    }

    if (!isSaved && selectedLead) {
      const confirmLeave = window.confirm(
        "Vous avez des modifications non enregistrées sur ce dossier. Voulez-vous vraiment changer de dossier ? Vos modifications non sauvegardées seront perdues."
      );
      if (!confirmLeave) return;
    }

    setSelectedLead(lead);
    
    const consultation: LeadConsultation = {
      agentName: agent.name,
      agentEmail: agent.email,
      date: new Date().toISOString()
    };

    const recentConsultations = lead.consultedBy || [];
    const isRecentlyConsulted = recentConsultations.length > 0 && 
      recentConsultations[0].agentName === agent.name && 
      (new Date().getTime() - new Date(recentConsultations[0].date).getTime()) < 30000; // 30s limit to avoid click spam

    if (!isRecentlyConsulted) {
      const historyLog: LeadHistoryEvent = {
        id: `h_c_${Math.random().toString(36).substr(2, 9)}`,
        date: new Date().toISOString(),
        type: 'consultation',
        author: agent.name,
        description: `Dossier consulté.`
      };

      const updatedLead: Lead = {
        ...lead,
        consultedBy: [consultation, ...recentConsultations],
        history: [historyLog, ...(lead.history || [])],
        updatedAt: new Date().toISOString()
      };

      onUpdateLead(updatedLead);
      setSelectedLead(updatedLead);
      setOriginalLead({
        ...updatedLead,
        qualification: updatedLead.qualification ? { ...updatedLead.qualification } : {}
      });
      setIsSaved(true);
      setHasJustSaved(false);
    } else {
      setOriginalLead({
        ...lead,
        qualification: lead.qualification ? { ...lead.qualification } : {}
      });
      setIsSaved(true);
      setHasJustSaved(false);
    }
  };

  const handleFetchNextNewLead = () => {
    if (currentStatus === 'en_pause') {
      alert("Vous êtes actuellement en pause. Veuillez repasser en statut actif pour consulter un dossier client.");
      return;
    }

    if (!isSaved && selectedLead) {
      alert("Veuillez enregistrer vos modifications actuelles (ENREGISTRER) avant de passer au lead suivant !");
      return;
    }

    // 1. Find the next "new" lead:
    // First, try to find a 'new' lead assigned to this agent specifically
    let nextLead = leads.find(lead => 
      lead.status === 'new' && 
      (lead.assignedAgentId === agent.id || lead.assignedAgentId?.toLowerCase() === agent.email.toLowerCase())
    );

    // Second, if none, find any unassigned 'new' lead
    if (!nextLead) {
      nextLead = leads.find(lead => 
        lead.status === 'new' && 
        (!lead.assignedAgentId || lead.assignedAgentId.trim() === '')
      );
    }

    // Third, if none, pick literally any 'new' lead
    if (!nextLead) {
      nextLead = leads.find(lead => lead.status === 'new');
    }

    if (!nextLead) {
      alert("Aucun nouveau dossier (Nouveau) n'est disponible pour le moment dans la base.");
      return;
    }

    // Prepare status transition & assignment
    const consultation: LeadConsultation = {
      agentName: agent.name,
      agentEmail: agent.email,
      date: new Date().toISOString()
    };

    const historyLogConsult: LeadHistoryEvent = {
      id: `h_c_${Math.random().toString(36).substr(2, 9)}`,
      date: new Date().toISOString(),
      type: 'consultation',
      author: agent.name,
      description: `Dossier consulté.`
    };

    const historyLogStatus: LeadHistoryEvent = {
      id: `h_s_${Math.random().toString(36).substr(2, 9)}`,
      date: new Date().toISOString(),
      type: 'status_change',
      author: agent.name,
      description: `Lead récupéré via le bouton "Suivant". Statut modifié automatiquement de "Nouveau" à "En cours".`
    };

    const updatedLead: Lead = {
      ...nextLead,
      status: 'in_progress',
      assignedAgentId: agent.id,
      assignedAgentName: agent.name,
      consultedBy: [consultation, ...(nextLead.consultedBy || [])],
      history: [historyLogStatus, historyLogConsult, ...(nextLead.history || [])],
      updatedAt: new Date().toISOString()
    };

    // Trigger update (which pushes to Google Sheets sync)
    onUpdateLead(updatedLead);
    // Select this lead immediately
    setSelectedLead(updatedLead);
    setOriginalLead({
      ...updatedLead,
      qualification: updatedLead.qualification ? { ...updatedLead.qualification } : {}
    });
    // Set unsaved initially because they must qualify the lead at least once before requesting another one!
    setIsSaved(false);
    setHasJustSaved(false);
  };

  const handleUpdateFeedbackStatus = (feedback: LeadFeedbackStatus) => {
    if (!selectedLead || isQualifiedAndLocked) return;

    const updated: Lead = {
      ...selectedLead,
      feedbackStatus: feedback,
      updatedAt: new Date().toISOString()
    };

    if (feedback === 'confirmer' || feedback === 'refus') {
      updated.callbackDate = '';
      setIsDateValidated(true);
      setDateWarning(null);
    }

    setSelectedLead(updated);
    setIsSaved(false);
  };

  const handleSeparateRecallChange = (newDateVal: string, newTimeVal: string) => {
    if (!selectedLead || isQualifiedAndLocked) return;

    if (!newDateVal && !newTimeVal) {
      setSelectedLead({
        ...selectedLead,
        callbackDate: ''
      });
      setIsSaved(false);
      setDateWarning(null);
      setIsDateValidated(true);
      return;
    }

    let datePart = newDateVal;
    if (!datePart) {
      datePart = getSystemLocalDateString(new Date().toISOString());
    }
    let timePart = newTimeVal;
    if (!timePart) {
      timePart = getSystemLocalTimeString(new Date().toISOString());
    }

    const combinedLocalStr = `${datePart}T${timePart}`;
    
    try {
      const utcDateEquivalent = new Date(combinedLocalStr + ":00Z");
      if (isNaN(utcDateEquivalent.getTime())) {
        return;
      }
      
      const offsetHours = sheetConfig?.timezoneOffset !== undefined ? sheetConfig.timezoneOffset : 2;
      const actualTimeMs = utcDateEquivalent.getTime() - offsetHours * 60 * 60 * 1000;
      const finalUtcDate = new Date(actualTimeMs);

      const now = new Date();
      if (finalUtcDate <= now) {
        setDateWarning("La date et l'heure de relance doivent être dans le futur.");
        setIsDateValidated(false);
      } else {
        setDateWarning(null);
        setIsDateValidated(false);
      }

      setSelectedLead({
        ...selectedLead,
        callbackDate: finalUtcDate.toISOString()
      });
      setIsSaved(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveCorporate = async () => {
    if (!selectedLead || !originalLead) return;

    // Detect changed fields for corporate record and log them
    const changes: string[] = [];
    corporateFields.forEach(field => {
      const origVal = (originalLead[field] ?? '').toString().trim();
      const newVal = (selectedLead[field] ?? '').toString().trim();
      if (origVal !== newVal) {
        let label = field.toString();
        if (field === 'company') label = 'Entreprise';
        else if (field === 'siren') label = 'Siren';
        else if (field === 'postalCodeCity') label = 'Ville/CP';
        else if (field === 'creationDate') label = 'Date création';
        else if (field === 'activityCode') label = 'Code NAF';
        else if (field === 'legalForm') label = 'Forme juridique';
        else if (field === 'capital') label = 'Capital';
        else if (field === 'phone') label = 'Téléphone';
        else if (field === 'website') label = 'Site web';
        else if (field === 'lastBilanYear') label = 'Année Bilan';
        else if (field === 'ca') label = 'CA';
        else if (field === 'ebitda') label = 'Résultat Exploit.';
        else if (field === 'equity') label = 'Capitaux propres';
        else if (field === 'equity2023') label = 'Capitaux propres 2023';
        else if (field === 'earnings2023') label = 'Bénéfice 2023';
        else if (field === 'workInProgress2023') label = 'En cours prod 2023';
        else if (field === 'inventory2023') label = 'Marchandises 2023';
        else if (field === 'receivables2023') label = 'Créances client 2023';
        else if (field === 'directorName') label = 'Nom Dirigeant';
        else if (field === 'directorRole') label = 'Fonction Dirigeant';
        else if (field === 'directorAge') label = 'Âge Dirigeant';
        else if (field === 'directorSince') label = 'Dirigeant Depuis';
        
        changes.push(`${label} ("${origVal || 'vide'}" ➔ "${newVal || 'vide'}")`);
      }
    });

    let updated = { ...selectedLead };

    if (changes.length > 0) {
      const log: LeadHistoryEvent = {
        id: `h_corp_${Math.random().toString(36).substr(2, 9)}`,
        date: new Date().toISOString(),
        type: 'note',
        author: agent.name,
        description: `Notes administratives modifiées : ${changes.join(', ')}.`
      };

      updated = {
        ...selectedLead,
        history: [log, ...(selectedLead.history || [])],
        updatedAt: new Date().toISOString()
      };
    }

    setIsSyncing(true);
    setSaveSuccessMessage(null);
    try {
      // Fire-and-forget or let Firestore update asynchronously
      onUpdateLead(updated);
      setSelectedLead(updated);
      setOriginalLead({
        ...updated,
        qualification: updated.qualification ? { ...updated.qualification } : {}
      });
      setIsSaved(true);
      setIsEditingCorporate(false);

      // Micro-loader to simulate secure transmission, then show success instantly
      setTimeout(() => {
        setIsSyncing(false);
        setSaveSuccessMessage("Fiche d'entreprise modifiée et mise à jour avec Google Sheets !");
        setTimeout(() => setSaveSuccessMessage(null), 3500);
      }, 600);
    } catch (err: any) {
      console.error(err);
      setIsSyncing(false);
    }
  };

  // Submit history action log & qualifications changes to Sheets
  const handleAddLog = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedLead) return;

    const updatedHistory = [...(selectedLead.history || [])];
    const now = new Date().toISOString();

    const feedbackChanged = originalLead && originalLead.feedbackStatus !== selectedLead.feedbackStatus;
    const currentFbLabel = selectedLead.feedbackStatus ? (FEEDBACK_LABELS[selectedLead.feedbackStatus]?.label || selectedLead.feedbackStatus) : '';
    const originalFbLabel = originalLead?.feedbackStatus ? (FEEDBACK_LABELS[originalLead.feedbackStatus]?.label || originalLead.feedbackStatus) : 'Aucun';

    // 1. Title of the history block is the qualification label
    let logTitle = "Note / qualification";
    if (selectedLead.feedbackStatus) {
      logTitle = `Retour client : ${FEEDBACK_LABELS[selectedLead.feedbackStatus]?.label}`;
    } else if (originalLead && originalLead.status !== selectedLead.status) {
      logTitle = `Changement de statut : ${getStatusLabel(selectedLead.status)}`;
    }

    // 2. Scheduled recall date & time if programed
    let recallInfo = "";
    if (selectedLead.callbackDate) {
      const rd = new Date(selectedLead.callbackDate);
      recallInfo = `⏰ Relance programmée le ${rd.toLocaleDateString()} à ${rd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    // 3. Structured description representing note body and updates
    let logDesc = historyNote.trim();
    if (!logDesc) {
      if (feedbackChanged) {
        logDesc = `Statut d'appel client mis à jour de "${originalFbLabel}" à "${currentFbLabel}".`;
      } else {
        logDesc = `Fiche mise à jour et qualifiée.`;
      }
    }

    if (recallInfo) {
      logDesc = `${logDesc}\n\n[Rappel / Relance] ${recallInfo}`;
    }

    // Scan for BANT other modifications and group them
    const qualChanges: string[] = [];
    if (originalLead) {
      if (originalLead.status !== selectedLead.status) {
        qualChanges.push(`Statut: ${getStatusLabel(selectedLead.status)}`);
      }
      if (originalLead.qualification?.temperature !== selectedLead.qualification?.temperature) {
        const t = selectedLead.qualification?.temperature;
        qualChanges.push(`Thermomètre: ${t === 'hot' ? 'Chaud' : t === 'warm' ? 'Tiède' : t === 'cold' ? 'Froid' : 'Aucun'}`);
      }
      if (originalLead.qualification?.budget !== selectedLead.qualification?.budget) {
        qualChanges.push(`Budget: ${selectedLead.qualification?.budget || 'Aucun'}`);
      }
      if (originalLead.qualification?.authority !== selectedLead.qualification?.authority) {
        qualChanges.push(`Décisionnaire: ${selectedLead.qualification?.authority || 'Aucun'}`);
      }
      if (originalLead.qualification?.need !== selectedLead.qualification?.need) {
        qualChanges.push(`Besoin mis à jour`);
      }
      if (originalLead.qualification?.timeline !== selectedLead.qualification?.timeline) {
        qualChanges.push(`Délai mis à jour`);
      }
    }

    if (qualChanges.length > 0) {
      logDesc = `${logDesc}\n\nÉléments qualifiés : ${qualChanges.join(', ')}`;
    }

    const groupedEvent: LeadHistoryEvent = {
      id: `h_grouped_${Math.random().toString(36).substr(2, 9)}`,
      date: now,
      type: 'feedback_change',
      author: agent.name,
      title: logTitle,
      description: logDesc
    };

    const finalLogs = [groupedEvent, ...updatedHistory];

    const updated: Lead = {
      ...selectedLead,
      history: finalLogs,
      updatedAt: now
    };

    setIsSyncing(true);
    setSaveSuccessMessage(null);
    try {
      // Non-blocking trigger
      onUpdateLead(updated);
      
      // Look if any recall is due/overdue right away among remaining leads
      const otherLeads = leads.map(l => l.id === updated.id ? updated : l);
      const dueRecall = findDueRecallLead(otherLeads.filter(l => l.id !== updated.id));

      if (dueRecall) {
        // Remount the callback lead immediately!
        setSelectedLead(dueRecall);
        setOriginalLead({
          ...dueRecall,
          qualification: dueRecall.qualification ? { ...dueRecall.qualification } : {}
        });
        setIsSaved(true);
        setHasJustSaved(false);
        setHistoryNote('');
        setRecallAlert(dueRecall);
      } else {
        setSelectedLead(updated);
        setOriginalLead({
          ...updated,
          qualification: updated.qualification ? { ...updated.qualification } : {}
        });
        setIsSaved(true);
        setHasJustSaved(true);
        setHistoryNote('');
      }
      
      // Micro-loader to simulate secure transmission, then show success instantly
      setTimeout(() => {
        setIsSyncing(false);
        setSaveSuccessMessage("Qualification et historique synchronisés en temps réel avec Google Sheets !");
        setTimeout(() => setSaveSuccessMessage(null), 3500);
      }, 600);
    } catch (err: any) {
      console.error(err);
      setIsSyncing(false);
    }
  };

  const handleUpdateStatus = (status: LeadStatus) => {
    if (!selectedLead || isQualifiedAndLocked) return;

    const updated: Lead = {
      ...selectedLead,
      status,
      updatedAt: new Date().toISOString()
    };

    if (status === 'qualified' || status === 'lost') {
      updated.callbackDate = '';
      setIsDateValidated(true);
      setDateWarning(null);
    }

    setSelectedLead(updated);
    setIsSaved(false);
  };

  const handleUpdateQualification = (field: string, value: any) => {
    if (!selectedLead || isQualifiedAndLocked) return;

    const newQual = {
      ...selectedLead.qualification,
      [field]: value
    };

    const updated: Lead = {
      ...selectedLead,
      qualification: newQual,
      updatedAt: new Date().toISOString()
    };

    setSelectedLead(updated);
    setIsSaved(false);
  };

  const handleUpdateCorporateField = (field: keyof Lead, value: string) => {
    if (!selectedLead) return;

    const updated: Lead = {
      ...selectedLead,
      [field]: value,
      updatedAt: new Date().toISOString()
    };

    setSelectedLead(updated);
    setIsSaved(false);
  };

  const agentNotifications = notifications.filter(n => !n.read && n.leadId && assignedLeads.some(l => l.id === n.leadId));

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {onBackToAdmin && (
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-bold shadow-md relative z-50 border-b border-orange-400">
          <div className="flex items-center gap-2">
            <span className="text-sm">⚠️</span>
            <span>Vous simulez actuellement la session de <span className="underline decoration-2 font-black text-white">{agent.name}</span>. Toutes les actions et qualifications CRM pour cet agent sont actives.</span>
          </div>
          <button 
            type="button"
            onClick={onBackToAdmin}
            className="shrink-0 bg-white hover:bg-orange-50 text-orange-700 hover:text-orange-800 transition-all font-black text-[10px] uppercase tracking-wider px-3.5 py-1.5 rounded-lg border border-orange-200 cursor-pointer shadow-sm flex items-center gap-1.5"
          >
            <span>↩</span> Retourner à l'Admin
          </button>
        </div>
      )}
      {/* Top Navigation */}
      <header className="bg-brand-primary text-white py-4 px-6 md:px-12 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <img 
            src="https://www.ted-companygroup.com/assets%20ancien/img/logos/ted-company-with-letter.png" 
            alt="TED Logo" 
            className="h-8 brightness-0 invert"
          />
          <div className="border-l border-white/20 pl-3">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block">Agent • {agent.name}</span>
            <div className="mt-1 flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full animate-pulse ${
                currentStatus === 'en_ligne' ? 'bg-emerald-400' : currentStatus === 'en_pause' ? 'bg-amber-400' : 'bg-slate-400'
              }`}></span>
              <select
                value={currentStatus}
                onChange={(e) => handleStatusChange(e.target.value as any)}
                className="bg-transparent hover:bg-white/10 border-none rounded text-xs font-bold text-white py-0 px-1.5 outline-none cursor-pointer focus:ring-0"
              >
                <option value="en_ligne" className="text-slate-800">🟢 Activité (En ligne)</option>
                <option value="en_pause" className="text-slate-800">🟠 En Pause</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <button
            onClick={handleFetchNextNewLead}
            disabled={(!isSaved && !!selectedLead) || currentStatus === 'en_pause'}
            title={currentStatus === 'en_pause' ? "Vous êtes en pause. Repassez en statut actif pour pouvoir passer au dossier suivant." : (!isSaved && selectedLead ? "Veuillez enregistrer votre qualification actuelle (ENREGISTRER) avant de passer au lead suivant !" : "Consulter le dossier Nouveau suivant")}
            className="flex items-center gap-1.5 px-4.5 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-extrabold text-sm rounded-xl transition-all shadow-md shadow-emerald-900/10 border border-emerald-500 cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:border-slate-300 disabled:scale-100"
          >
            <ArrowRight size={16} />
            <span>{!isSaved && selectedLead ? "Suivant (Enregistrer Requis)" : "Suivant"}</span>
          </button>

          {lastSync && (
            <span className="hidden md:inline-block text-[10px] uppercase font-black tracking-widest text-slate-400">
              Flux Synchrone • {lastSync.toLocaleTimeString()}
            </span>
          )}
          
          <button 
            onClick={onLogout}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-sm rounded-xl transition-all"
          >
            <LogOut size={16} />
            Déconnexion
          </button>
        </div>
      </header>

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

      {/* Tab Switcher Bar for Agent */}
      <div className="max-w-7xl mx-auto w-full px-6 md:px-12 pt-6 flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveTab('leads')}
          className={`pb-3 text-sm font-extrabold transition-all border-b-2 cursor-pointer ${
            activeTab === 'leads' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          📁 Mes Fiches & Qualifications
        </button>
        <button
          onClick={() => setActiveTab('presence')}
          className={`pb-3 text-sm font-extrabold transition-all border-b-2 cursor-pointer ${
            activeTab === 'presence' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          ⏱️ Mon Suivi de Présence & Pauses
        </button>
      </div>

      {activeTab === 'leads' ? (
        /* Main CRM area */
        <div className="flex-1 max-w-7xl mx-auto w-full p-6 md:p-12 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left column: Assigned Leads pipeline */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 mb-2 flex items-center gap-2">
              <Layers size={20} className="text-blue-600" />
              Mes Pistes Assignées
            </h2>
            <p className="text-xs text-slate-500 font-medium mb-6">Sélectionnez un dossier pour qualifier le besoin.</p>

            {/* Quick Filters */}
            <div className="flex flex-wrap gap-1.5 mb-6">
              {[
                { label: 'Tous', filter: 'all' },
                { label: 'En cours', filter: 'in_progress' },
                { label: 'Qualifié', filter: 'qualified' },
                { label: 'Perdu', filter: 'lost' },
              ].map((opt) => (
                <button
                  key={opt.filter}
                  onClick={() => setActiveStatus(opt.filter as any)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all ${
                    activeStatus === opt.filter
                      ? 'bg-blue-600 text-white border-blue-700 shadow-sm'
                      : 'bg-slate-50 text-slate-500 border-slate-100 hover:border-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Filter Selector */}
            <div className="mb-4">
              <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
                Filtrer par :
              </label>
              <select 
                value={searchType}
                onChange={(e) => setSearchType(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-blue-500 font-bold text-slate-700 cursor-pointer shadow-3xs"
              >
                <option value="all">🔍 Tous les champs</option>
                <option value="date">📅 Date de création</option>
                <option value="feedback">📞 Qualification Retour d'appel client</option>
                <option value="phone">📱 Numéro de téléphone</option>
                <option value="id_client">🆔 ID de la fiche ou client</option>
              </select>
            </div>

            {/* Local Search */}
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input 
                type="text" 
                placeholder={
                  searchType === 'date' ? "Saisir une date (ex: 22/06/2026)..." :
                  searchType === 'feedback' ? "Saisir un retour d'appel (ex: Relance, Messagerie)..." :
                  searchType === 'phone' ? "Saisir un numéro de téléphone..." :
                  searchType === 'id_client' ? "Saisir un ID ou nom de client..." :
                  "Saisir un mot-clé..."
                }
                className="w-full bg-slate-50 border border-slate-100 rounded-lg pl-9 pr-3 py-2 text-xs outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Leads List */}
            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
              {filteredLeads.map((lead) => {
                const fb = lead.feedbackStatus ? FEEDBACK_LABELS[lead.feedbackStatus] : null;
                return (
                  <button
                    key={lead.id}
                    onClick={() => handleSelectLead(lead)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all flex flex-col gap-2 ${
                      selectedLead?.id === lead.id
                        ? 'border-blue-600 bg-blue-50/50'
                        : 'border-slate-100 hover:border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 w-full">
                      <div>
                        <p className="font-bold text-slate-900 text-sm leading-tight">{lead.name}</p>
                        {lead.company && <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">{lead.company}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`px-2 py-0.5 text-[9px] rounded-full font-bold border ${getStatusColor(lead.status)}`}>
                          {getStatusLabel(lead.status)}
                        </span>
                        {fb && (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className={`px-1.5 py-0.5 text-[8px] font-black rounded border flex items-center gap-0.5 ${fb.color}`}>
                              <span>{fb.icon}</span> <span>{fb.label}</span>
                            </span>
                            {lead.callbackDate && (
                              <span className="text-[8px] text-indigo-700 bg-indigo-55/75 border border-indigo-100 rounded px-1 py-0.2 font-black tracking-tighter mt-0.5 flex items-center gap-0.5 shadow-3xs">
                                ⏰ {formatDateToSystemOffset(lead.callbackDate)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400 border-t border-slate-100/60 pt-2 w-full mt-2">
                      <span className="font-bold">{lead.source}</span>
                      <span>{new Date(lead.createdAt).toLocaleDateString()}</span>
                    </div>
                  </button>
                );
              })}
              {filteredLeads.length === 0 && (
                <div className="text-center py-12 text-slate-300 italic text-sm">
                  Aucun lead assigné trouvé.
                </div>
              )}
            </div>
          </div>

          {/* Local Alerts / Notifications */}
          {agentNotifications.length > 0 && (
            <div className="bg-amber-50/50 p-6 rounded-2xl border border-amber-100 shadow-sm space-y-3">
              <h4 className="font-extrabold text-amber-900 text-xs uppercase tracking-wider flex items-center gap-1">
                <Bell size={14} className="animate-swing" /> Action Requise
              </h4>
              {agentNotifications.map(notif => (
                <div key={notif.id} className="text-xs bg-white p-3 rounded-lg border border-amber-100 flex items-center justify-between gap-2 shadow-xs">
                  <div>
                    <p className="font-bold text-slate-800">{notif.title}</p>
                    <p className="text-[10px] text-slate-400 leading-tight">{notif.message}</p>
                  </div>
                  <button 
                    onClick={() => onMarkNotificationRead(notif.id)}
                    className="p-1 hover:bg-slate-50 text-emerald-600 rounded"
                    title="Marquer comme traité"
                  >
                    <CheckCheck size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Columns: Active Lead detail view & qualification */}
        <div className="lg:col-span-2">
          {selectedLead ? (
            <motion.div 
              key={selectedLead.id}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-8"
            >
              {/* Header profile */}
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-6 border-b border-log-100">
                <div>
                  <span className="text-[9px] uppercase font-black bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">Fiche Client active</span>
                  <h3 className="text-2xl font-black text-slate-900 mt-2">{selectedLead.name}</h3>
                  <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-500 mt-1">
                    <span>✉️ {selectedLead.email}</span>
                    <span>📞 {selectedLead.phone}</span>
                    {selectedLead.company && <span>🏢 {selectedLead.company}</span>}
                  </div>
                </div>

                {/* Statut tag selector */}
                <div className="flex gap-1">
                  {(['new', 'in_progress', 'qualified', 'lost'] as LeadStatus[]).map(st => (
                    <button
                      key={st}
                      onClick={() => handleUpdateStatus(st)}
                      disabled={isQualifiedAndLocked}
                      className={`px-2.5 py-1 text-xs font-bold rounded border transition-all ${
                        selectedLead.status === st
                          ? getStatusColor(st)
                          : 'bg-white text-slate-300 border-slate-100 hover:border-slate-200'
                      } disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      {getStatusLabel(st)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Consultation History Widget */}
              {selectedLead.consultedBy && selectedLead.consultedBy.length > 0 && (
                <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-xl space-y-2">
                  <h5 className="font-extrabold text-slate-700 text-[11px] uppercase tracking-wider flex items-center gap-1.5 leading-none">
                    <Eye size={14} className="text-blue-650" />
                    Consultations du dossier par les agents ({selectedLead.consultedBy.length})
                  </h5>
                  <div className="flex flex-wrap gap-2 max-h-[85px] overflow-y-auto pr-1">
                    {selectedLead.consultedBy.map((c, idx) => (
                      <div key={idx} className="bg-white border border-slate-100 rounded-lg px-2.5 py-1 text-[10px] text-slate-550 font-bold flex items-center gap-1.5 shadow-sm">
                        <span className="bg-blue-50 text-blue-700 font-extrabold rounded-full h-4 w-4 inline-flex items-center justify-center text-[8px]">👤</span>
                        <span>{c.agentName}</span>
                        <span className="text-slate-300">|</span>
                        <span className="text-slate-400 font-semibold">{new Date(c.date).toLocaleDateString()} à {new Date(c.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* FICHE D'IDENTITÉ CORPORATIVE ET RAPPORTS FINANCIERS */}
              <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 border border-slate-200/80 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-3">
                  <h4 className="font-black text-slate-800 text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2">
                    <Building size={16} className="text-emerald-600" />
                    💼 Fiche d'identité d'entreprise & Chiffres clés B2B
                  </h4>
                  <button
                    type="button"
                    onClick={isEditingCorporate ? handleSaveCorporate : () => setIsEditingCorporate(true)}
                    disabled={isQualifiedAndLocked}
                    className={`px-4 py-2 rounded-xl text-xs uppercase font-black tracking-widest border transition-all duration-200 cursor-pointer shadow-sm ${
                      isQualifiedAndLocked
                        ? 'bg-slate-200 text-slate-400 border-slate-350 cursor-not-allowed opacity-60'
                        : isEditingCorporate 
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-md scale-[1.03] ring-2 ring-emerald-400 ring-offset-1' 
                        : 'bg-white hover:bg-slate-50 text-slate-650 border-slate-200 shadow-3xs'
                    }`}
                  >
                    {isQualifiedAndLocked ? '🔒 Modif. Bloquées' : (isEditingCorporate ? '💾 ENREGISTRER' : '✏️ Modifier la Fiche')}
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
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-blue-500 outline-none text-slate-800"
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
                      <h5 className="text-[10px] uppercase font-black text-slate-450 tracking-wider">📊 Chiffres Financiers & Bilan</h5>
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

                          <span className="text-slate-450">Siren :</span>
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
                        <h5 className="text-[10px] uppercase font-black text-slate-450 tracking-wider">📊 Chiffres Financiers & Bilan</h5>
                        
                        <div className="grid grid-cols-2 text-xs gap-y-1.5 font-semibold text-slate-650">
                          <span className="text-slate-450">Dernier bilan :</span>
                          <span className="font-extrabold text-slate-700">{selectedLead.lastBilanYear ? `Année ${selectedLead.lastBilanYear}` : "N/A"}</span>

                          <span className="text-slate-450">Chiffre d'affaires :</span>
                          <span className="font-extrabold text-slate-900">{selectedLead.ca || "N/A"}</span>

                          <span className="text-slate-455">Résultat d'Exploit. :</span>
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

                          <span className="text-slate-450">En cours prod. :</span>
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

              {/* CRM Feedback Status Qualifier */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <h4 className="font-black text-slate-800 text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2">
                    <Layers size={16} className="text-indigo-650" />
                    Qualification Retour d'appel client (CRM)
                  </h4>
                  {selectedLead.feedbackStatus && (
                    <span className="text-[10px] font-bold text-slate-400 flex flex-wrap items-center gap-2">
                      <span>Qualification actuelle :</span>
                      <span className="font-extrabold text-indigo-600 uppercase tracking-tighter">
                        {FEEDBACK_LABELS[selectedLead.feedbackStatus]?.icon} {FEEDBACK_LABELS[selectedLead.feedbackStatus]?.label}
                      </span>
                      {selectedLead.callbackDate && (
                        <span className="bg-indigo-100/80 text-indigo-850 px-2 py-0.5 rounded text-[9px] font-black border border-indigo-200 flex items-center gap-1 shadow-3xs">
                          ⏰ Relance : {formatDateToSystemOffset(selectedLead.callbackDate)}
                        </span>
                      )}
                    </span>
                  )}
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {(Object.keys(FEEDBACK_LABELS) as LeadFeedbackStatus[]).map((fbKey) => {
                    const fb = FEEDBACK_LABELS[fbKey];
                    const isSelected = selectedLead.feedbackStatus === fbKey;
                    return (
                      <button
                        key={fbKey}
                        onClick={() => handleUpdateFeedbackStatus(fbKey)}
                        disabled={isQualifiedAndLocked}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all text-center group cursor-pointer ${
                          isSelected 
                            ? `${fb.color} ring-2 ring-indigo-500 scale-[1.02] shadow-sm font-black border-transparent`
                            : `bg-white text-slate-600 border-slate-200 ${fb.hoverColor} hover:border-slate-300`
                        } disabled:opacity-60 disabled:cursor-not-allowed`}
                        title={fb.desc}
                      >
                        <span className="text-lg mb-1">{fb.icon}</span>
                        <span className="text-[11px] font-bold tracking-tight leading-none">{fb.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Datetime Recall Selector (min prevents past dates/hours) */}
                {selectedLead.feedbackStatus && selectedLead.feedbackStatus !== 'confirmer' && selectedLead.feedbackStatus !== 'refus' && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-4 p-4 bg-indigo-50/50 border border-indigo-105/65 rounded-xl space-y-2"
                  >
                    <label className="block text-[11px] font-extrabold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                      📅 Programmer la Relance / Rappel (Futur uniquement)
                    </label>
                    <div className="flex flex-col sm:flex-row items-center gap-2">
                      {/* Date selection input */}
                      <div className="relative w-full sm:w-32 shrink-0">
                        <input
                          type="date"
                          disabled={isQualifiedAndLocked}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-3xs disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                          value={getSystemLocalDateString(selectedLead.callbackDate)}
                          onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                          onChange={(e) => handleSeparateRecallChange(e.target.value, getSystemLocalTimeString(selectedLead.callbackDate))}
                        />
                      </div>

                      {/* Time selection input */}
                      <div className="relative w-full sm:w-24 shrink-0">
                        <input
                          type="time"
                          disabled={isQualifiedAndLocked}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-3xs disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                          value={getSystemLocalTimeString(selectedLead.callbackDate)}
                          onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                          onChange={(e) => handleSeparateRecallChange(getSystemLocalDateString(selectedLead.callbackDate), e.target.value)}
                        />
                      </div>

                      {/* OK Button - to validate selected date before saving can proceed */}
                      {!isDateValidated && selectedLead.callbackDate && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsDateValidated(true);
                            setDateWarning(null);
                          }}
                          disabled={isQualifiedAndLocked}
                          className="text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.8 rounded-lg font-black shrink-0 shadow-md cursor-pointer uppercase flex items-center gap-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          👌 OK
                        </button>
                      )}

                      {isDateValidated && selectedLead.callbackDate && (
                        <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1.5 rounded-lg font-extrabold flex items-center gap-1">
                          ✓ Validé
                        </span>
                      )}

                      {/* Cancel Recall date */}
                      {selectedLead.callbackDate && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedLead({ ...selectedLead, callbackDate: '' });
                            setIsSaved(false);
                            setDateWarning(null);
                            setIsDateValidated(true);
                          }}
                          disabled={isQualifiedAndLocked}
                          className="text-[10px] bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 px-2.5 py-1.8 rounded-lg font-bold shrink-0 shadow-3xs cursor-pointer flex items-center gap-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          ❌ Annuler relance
                        </button>
                      )}
                    </div>
                    {dateWarning && (
                      <p className="text-[10px] font-black text-rose-600 animate-pulse">
                        ⚠️ {dateWarning}
                      </p>
                    )}
                  </motion.div>
                )}
              </div>

              {/* BANT and Action area */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-slate-100">
                
                {/* Qualification Form */}
                <div className="space-y-4 bg-slate-50/50 p-6 rounded-xl border border-slate-200">
                  <h4 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-1">
                    <Award size={16} className="text-blue-600" /> Qualification Commerciale
                  </h4>

                  <div className="space-y-4 text-xs font-semibold">
                    {/* Temperature */}
                    <div className="grid grid-cols-3 items-center gap-2">
                      <span className="text-slate-400 font-bold">Thermomètre</span>
                      <div className="col-span-2 flex gap-1">
                        {(['cold', 'warm', 'hot'] as LeadTemperature[]).map(t => (
                          <button
                            key={t}
                            onClick={() => handleUpdateQualification('temperature', t)}
                            disabled={isQualifiedAndLocked}
                            className={`flex-1 py-1 text-[10px] font-black rounded border transition-all uppercase ${
                              selectedLead.qualification?.temperature === t ? getTempColor(t) : 'bg-white text-slate-300 border-slate-200'
                            } disabled:opacity-60 disabled:cursor-not-allowed`}
                          >
                            {t === 'cold' ? '❄️ Froid' : t === 'warm' ? '⚡ Tiède' : '🔥 Chaud'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Budget */}
                    <div className="grid grid-cols-3 items-center gap-2">
                      <span className="text-slate-400 font-bold">Budget client</span>
                      <div className="col-span-2 flex gap-1">
                        {(['low', 'medium', 'high'] as any[]).map(b => (
                          <button
                            key={b}
                            onClick={() => handleUpdateQualification('budget', b)}
                            disabled={isQualifiedAndLocked}
                            className={`flex-1 py-1 text-[10px] rounded border transition-all uppercase ${
                              selectedLead.qualification?.budget === b ? 'bg-blue-600 text-white border-blue-700 font-bold' : 'bg-white text-slate-400 border-slate-200'
                            } disabled:opacity-60 disabled:cursor-not-allowed`}
                          >
                            {b === 'low' ? 'Faible' : b === 'medium' ? 'Moyen' : 'Élevé'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Authority */}
                    <div className="grid grid-cols-3 items-center gap-2">
                      <span className="text-slate-400 font-bold">Décisionnaire</span>
                      <div className="col-span-2 flex gap-1">
                        {(['none', 'influencer', 'decision_maker'] as any[]).map(a => (
                          <button
                            key={a}
                            onClick={() => handleUpdateQualification('authority', a)}
                            disabled={isQualifiedAndLocked}
                            className={`flex-1 py-1 text-[9px] rounded border transition-all uppercase ${
                              selectedLead.qualification?.authority === a ? 'bg-blue-600 text-white border-blue-700 font-bold' : 'bg-white text-slate-400 border-slate-200'
                            } disabled:opacity-60 disabled:cursor-not-allowed`}
                          >
                            {a === 'none' ? 'Non' : a === 'influencer' ? 'Scolaire' : 'Direct'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Need */}
                    <div className="space-y-1">
                      <span className="text-slate-400 font-bold">Besoin Défini</span>
                      <textarea
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 h-14 resize-none outline-none font-semibold text-slate-700 focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                        value={selectedLead.qualification?.need || ''}
                        onChange={(e) => handleUpdateQualification('need', e.target.value)}
                        disabled={isQualifiedAndLocked}
                        placeholder="Quels sont les besoins exacts exprimés par le client..."
                      />
                    </div>

                    {/* Timeline */}
                    <div className="space-y-1">
                      <span className="text-slate-400 font-bold">Délai estimé signature</span>
                      <input
                        type="text"
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none font-semibold text-slate-700 focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                        value={selectedLead.qualification?.timeline || ''}
                        onChange={(e) => handleUpdateQualification('timeline', e.target.value)}
                        disabled={isQualifiedAndLocked}
                        placeholder="Ex: sous 3 semaines, immédiat..."
                      />
                    </div>
                  </div>
                </div>

                {/* Add Follow-up action */}
                <form onSubmit={handleAddLog} className="space-y-4">
                  <div className="bg-slate-50/50 p-6 rounded-xl border border-slate-200 space-y-4">
                    <h4 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-1">
                      <Clock size={16} className="text-blue-600" /> Ajouter Événement
                    </h4>

                    <div className="flex gap-2 text-xs font-bold">
                      <span className="px-3 py-1.5 bg-indigo-50 text-indigo-750 border border-indigo-200 rounded-lg text-[10px] uppercase font-bold tracking-wider">
                        📝 Note
                      </span>
                    </div>

                     <textarea
                      placeholder={isQualifiedAndLocked ? "Dossier qualifié et verrouillé. Aucune modification supplémentaire possible." : "Indiquez le résumé exact de la note..."}
                      className="w-full bg-white border border-slate-200 rounded-lg p-3 text-xs outline-none h-24 resize-none font-semibold focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                      value={historyNote}
                      onChange={(e) => setHistoryNote(e.target.value)}
                      disabled={isQualifiedAndLocked}
                    />

                    <button 
                      type="submit" 
                      disabled={isQualifiedAndLocked || !isDateValidated}
                      className={`w-full py-3 px-5 text-xs font-black tracking-widest uppercase transition-all duration-200 shadow-lg rounded-xl flex items-center justify-center gap-1.5 border ${
                        isQualifiedAndLocked
                          ? 'bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed shadow-none'
                          : isDateValidated 
                          ? 'bg-indigo-600 hover:bg-indigo-500 text-white active:scale-95 border-indigo-400 cursor-pointer' 
                          : 'bg-slate-300 text-slate-500 border-slate-300 opacity-75 cursor-not-allowed'
                      }`}
                    >
                      {isQualifiedAndLocked 
                        ? '💾 FICHE ENREGISTRÉE & QUALIFIÉE (MODIFICATION BLOQUÉE)' 
                        : isDateValidated 
                        ? '💾 ENREGISTRER' 
                        : '⚠️ ENREGISTRER (VALIDER LA RELANCE AVEC OK D\'ABORD)'}
                    </button>
                  </div>
                </form>
              </div>

              {/* History Timeline feed */}
              <div className="space-y-4">
                <h4 className="font-extrabold text-slate-900 text-lg border-b border-slate-100 pb-2 flex items-center gap-2">
                  <FileText size={18} className="text-slate-700" />
                  Historique de Qualification ({selectedLead.history?.length || 0})
                </h4>
                
                <div className="space-y-4 max-h-[35vh] overflow-y-auto pr-2 custom-scrollbar">
                  {selectedLead.history && selectedLead.history.map((hist, ind) => (
                    <div key={ind} className="flex gap-3 relative">
                      {/* Connector Line */}
                      {ind < selectedLead.history.length - 1 && (
                        <div className="absolute left-3 top-6 bottom-0 w-0.5 bg-slate-100" />
                      )}

                      <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] select-none ${
                        hist.type === 'call' ? 'bg-green-100 text-green-700' :
                        hist.type === 'email' ? 'bg-blue-100 text-blue-700' :
                        hist.type === 'meeting' ? 'bg-amber-100 text-amber-700' :
                        hist.type === 'consultation' ? 'bg-cyan-100 text-cyan-700' :
                        hist.type === 'feedback_change' ? 'bg-indigo-100 text-indigo-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {hist.type === 'call' ? '📞' : 
                         hist.type === 'email' ? '✉️' : 
                         hist.type === 'meeting' ? '🤝' : 
                         hist.type === 'consultation' ? '👁️' : 
                         hist.type === 'feedback_change' ? '🏷️' : 
                         '📝'}
                      </div>

                      <div className="flex-1 bg-slate-50/70 p-4 rounded-xl border border-slate-250/60 text-xs shadow-3xs space-y-2.5">
                        <div className="border-b border-slate-150 pb-1.5 flex items-center justify-between">
                          <span className="font-black text-slate-800 text-[11px] uppercase tracking-wider flex items-center gap-1">
                            🏷️ {hist.title || (hist.type === 'consultation' ? "Consultation du Dossier" : "Note / Événement")}
                          </span>
                        </div>
                        
                        <div className="text-slate-650 font-semibold leading-relaxed whitespace-pre-wrap">
                          {hist.description}
                        </div>

                        <div className="text-[10px] text-slate-450 border-t border-slate-100 pt-2 flex flex-col gap-0.5 font-bold mt-2">
                          <span className="flex items-center gap-1 font-semibold text-[9px]">
                            📅 Le {new Date(hist.date).toLocaleDateString()} à {new Date(hist.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-indigo-650 font-black flex items-center gap-1 mt-0.5">
                            👤 Par : <span className="underline decoration-indigo-200">{hist.author}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!selectedLead.history || selectedLead.history.length === 0) && (
                    <p className="text-xs text-slate-300 italic">Aucun log enregistré.</p>
                  )}
                </div>
              </div>

            </motion.div>
          ) : (
            <div className="h-full min-h-[400px] border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center p-8 bg-white/70">
              <Database size={64} className="text-slate-300 mb-4" />
              {currentStatus === 'en_pause' ? (
                <>
                  <h3 className="font-bold text-slate-500 text-lg">Vous êtes actuellement en Pause ⏸️</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm text-center">
                    Vous ne pouvez pas consulter de dossier client pendant votre pause. 
                    Veuillez repasser en statut <strong>Activité (En ligne)</strong> en haut de la page pour reprendre votre travail.
                  </p>
                </>
              ) : (
                <>
                  <h3 className="font-bold text-slate-400 text-lg">Aucun dossier prospect sélectionné</h3>
                  <p className="text-xs text-slate-300 mt-1 max-w-sm text-center">Cliquez sur l'un des leads dans l'onglet de gauche pour le qualification, qualifier son budget et voir son historique commercial.</p>
                </>
              )}
            </div>
          )}
        </div>

      </div>
      ) : (
        /* Mon Suivi de Présence & Pauses Section */
        <div className="flex-1 max-w-7xl mx-auto w-full p-6 md:p-12 space-y-8 animate-in fade-in duration-300">
          <header className="mb-2">
            <h1 className="text-3xl font-extrabold text-slate-950 tracking-tight">Mon Suivi de Présence & Activité</h1>
            <p className="text-slate-500 font-medium mt-1">Gérez votre état de présence, déclarez vos pauses et visualisez vos heures de service cumulées.</p>
          </header>

          {/* Real-time switcher details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className={`p-6 rounded-3xl border ${
              currentStatus === 'en_ligne' 
                ? 'bg-emerald-50/40 border-emerald-100 shadow-sm shadow-emerald-100' 
                : currentStatus === 'en_pause'
                ? 'bg-amber-50/40 border-amber-100 shadow-sm shadow-amber-100'
                : 'bg-slate-50/50 border-slate-100'
            }`}>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Statut de Connexion Actuel</span>
              <div className="flex items-center gap-2 mt-2">
                <span className={`h-3 w-3 rounded-full ${
                  currentStatus === 'en_ligne' ? 'bg-emerald-500 animate-pulse' : currentStatus === 'en_pause' ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'
                }`}></span>
                <span className="text-lg font-black text-slate-900">
                  {currentStatus === 'en_ligne' ? 'Activité (En ligne)' : currentStatus === 'en_pause' ? 'En Pause (Suspendu)' : 'Déconnecté / Invisible'}
                </span>
              </div>

              {conn?.statusStartedAt && (
                <p className="text-xs text-slate-400 mt-2 font-semibold">
                  Depuis le {new Date(conn.statusStartedAt).toLocaleDateString()} à {new Date(conn.statusStartedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}

              {/* Status control buttons */}
              <div className="mt-6 flex flex-col gap-2">
                {currentStatus !== 'en_ligne' && (
                  <button
                    onClick={() => handleStatusChange('en_ligne')}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer transition-all uppercase tracking-wider"
                  >
                    ▶️ Se mettre En ligne / Reprendre
                  </button>
                )}
                {currentStatus === 'en_ligne' && (
                  <button
                    onClick={() => handleStatusChange('en_pause')}
                    className="w-full py-2.5 bg-amber-500 hover:bg-amber-450 active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer transition-all uppercase tracking-wider"
                  >
                    ⏸️ Déclarer une Pause
                  </button>
                )}
              </div>
            </div>

            {/* My Performance Analytics */}
            {(() => {
              const myLogs = presenceLogs.filter(log => log.email.toLowerCase() === agent.email.toLowerCase());
              
              let activeMins = 0;
              let breakMins = 0;
              myLogs.forEach(l => {
                const duration = l.durationMinutes || 0;
                if (l.status === 'en_ligne') {
                  activeMins += duration;
                } else if (l.status === 'en_pause') {
                  breakMins += duration;
                }
              });

              const totalMins = activeMins + breakMins;
              const breakRatio = totalMins > 0 ? Math.round((breakMins / totalMins) * 100) : 0;

              const formatMinToHuman = (mins: number) => {
                if (mins <= 0) return '0 min';
                if (mins < 60) return `${mins} min`;
                const hrs = Math.floor(mins / 60);
                const rem = mins % 60;
                return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
              };

              return (
                <div className="col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-3xs flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Mon Temps de Service</span>
                      <h3 className="text-2xl font-black text-slate-900 mt-2">{formatMinToHuman(activeMins)}</h3>
                    </div>
                    <p className="text-[10px] text-slate-500 font-semibold mt-4">Durée cumulée en ligne (Activité)</p>
                  </div>

                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-3xs flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Mon Temps de Pause</span>
                      <h3 className="text-2xl font-black text-slate-900 mt-2">{formatMinToHuman(breakMins)}</h3>
                    </div>
                    <p className="text-[10px] text-slate-500 font-semibold mt-4">Durée cumulée de pauses déclarées</p>
                  </div>

                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-3xs flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider font-semibold">Ratio Pause / Travail</span>
                      <h3 className="text-2xl font-black text-indigo-600 mt-2">{breakRatio}%</h3>
                    </div>
                    <p className="text-[10px] text-slate-500 font-semibold mt-4">Taux de pause par rapport au temps total</p>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Historical Logs List */}
          <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Mon Historique d'Activité individuel</h2>
              <p className="text-xs text-slate-400 font-semibold">Retrouvez toutes vos sessions de connexion, déconnexion et de pause avec leurs durées associées.</p>
            </div>

            <div className="overflow-x-auto border border-slate-100 rounded-2xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100">
                    <th className="px-6 py-3.5">Action / Événement</th>
                    <th className="px-6 py-3.5">Date & Heure de Début</th>
                    <th className="px-6 py-3.5">Date & Heure de Fin</th>
                    <th className="px-6 py-3.5">Durée Cumulée</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {(() => {
                    const myLogs = presenceLogs.filter(log => log.email.toLowerCase() === agent.email.toLowerCase());

                    if (myLogs.length === 0) {
                      return (
                        <tr>
                          <td colSpan={4} className="text-center py-8 text-slate-400 italic font-semibold">
                            Aucun enregistrement d'activité pour le moment.
                          </td>
                        </tr>
                      );
                    }

                    return myLogs.map((log) => (
                      <tr key={log.id || log.startedAt} className="hover:bg-slate-50/50">
                        <td className="px-6 py-3.5">
                          {log.status === 'en_ligne' ? (
                            <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full text-[10px] font-black border border-emerald-100 flex items-center gap-1 w-fit">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              Activité En ligne
                            </span>
                          ) : log.status === 'en_pause' ? (
                            <span className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full text-[10px] font-black border border-amber-100 flex items-center gap-1 w-fit">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                              Pause Déclarée
                            </span>
                          ) : (
                            <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 w-fit">
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                              Déconnexion
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 font-mono text-slate-600">
                          {new Date(log.startedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td className="px-6 py-3.5 font-mono text-slate-600">
                          {log.endedAt 
                            ? new Date(log.endedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) 
                            : <span className="text-emerald-600 font-extrabold animate-pulse">Session active</span>
                          }
                        </td>
                        <td className="px-6 py-3.5 font-mono font-bold text-slate-900">
                          {log.endedAt ? (
                            log.durationMinutes < 1 
                              ? 'Moins d\'une minute' 
                              : log.durationMinutes < 60
                              ? `${log.durationMinutes} min`
                              : `${Math.floor(log.durationMinutes / 60)}h ${log.durationMinutes % 60}m`
                          ) : (
                            <span className="text-emerald-600 font-extrabold animate-pulse">En cours</span>
                          )}
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Overdue/Planned Recall alert overlay */}
      <AnimatePresence>
        {recallAlert && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-[9999] bg-slate-900 border border-indigo-500/30 text-white p-5 rounded-2xl shadow-2xl max-w-sm flex flex-col gap-3.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-2 items-center">
                <span className="text-xl animate-bounce">⏰</span>
                <div>
                  <h5 className="font-extrabold text-xs uppercase tracking-wider text-indigo-400">RAPPEL CLIENT RETOUR D'APPEL</h5>
                  <p className="font-bold text-xs text-slate-100 leading-tight">Une relance programmée vient de remonter de suite !</p>
                </div>
              </div>
              <button 
                onClick={() => setRecallAlert(null)}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer text-sm font-bold bg-white/5 hover:bg-white/10 h-6 w-6 rounded-full flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="bg-white/5 p-3.5 rounded-xl border border-white/10 text-xs space-y-1">
              <p className="font-black text-white text-sm">{recallAlert.name}</p>
              <p className="text-slate-350 font-medium">📱 Téléphone : <span className="font-black text-slate-100">{recallAlert.phone}</span></p>
              {recallAlert.callbackDate && (
                <p className="text-indigo-300 font-extrabold">Programmé pour : {formatDateToSystemOffset(recallAlert.callbackDate)}</p>
              )}
            </div>

            <div className="flex gap-2 justify-end text-xs font-bold">
              <button
                onClick={() => setRecallAlert(null)}
                className="w-full py-2 bg-indigo-650 hover:bg-indigo-550 border border-indigo-400/30 rounded-lg text-white transition-all text-center cursor-pointer uppercase text-[10px] tracking-wider font-extrabold"
              >
                Prendre en charge la relance
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
