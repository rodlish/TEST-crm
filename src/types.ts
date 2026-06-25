/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'admin' | 'agent' | 'supervisor' | 'manager';

export interface User {
  email: string;
  role: UserRole;
  name: string;
  password?: string;
}

export interface Team {
  id: string;
  name: string;
  supervisorId?: string; // sanitized email/ID of the supervisor
  supervisorIds?: string[]; // Multiple supervisors
  managerIds?: string[]; // Multiple managers affected to this project
  createdAt: string;
}

export interface AgentAccount {
  id: string; // sanitized email
  name: string;
  email: string;
  password?: string;
  isActive: boolean;
  assignedLeadsCount?: number;
  team?: string;
  role?: UserRole;
}

export type LeadStatus = 'new' | 'in_progress' | 'qualified' | 'lost';
export type LeadTemperature = 'cold' | 'warm' | 'hot';
export type LeadFeedbackStatus = 'ne_repond_pas' | 'relance' | 'messagerie' | 'argumenter' | 'rappeler' | 'rendez_vous' | 'confirmer' | 'refus';

export interface LeadQualification {
  budget?: 'low' | 'medium' | 'high';
  authority?: 'none' | 'influencer' | 'decision_maker';
  need?: string;
  timeline?: string;
  temperature?: LeadTemperature;
}

export interface LeadHistoryEvent {
  id: string;
  date: string;
  type: 'status_change' | 'qualification' | 'note' | 'call' | 'email' | 'meeting' | 'consultation' | 'feedback_change';
  author: string;
  description: string;
  title?: string;
}

export interface LeadConsultation {
  agentName: string;
  agentEmail?: string;
  date: string;
  durationSeconds?: number;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string;
  status: LeadStatus;
  feedbackStatus?: LeadFeedbackStatus;
  callbackDate?: string;
  source: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
  createdAt: string;
  updatedAt: string;
  qualification: LeadQualification;
  history: LeadHistoryEvent[];
  consultedBy?: LeadConsultation[];
  // French Corporate & Financial Info
  siren?: string;
  postalCodeCity?: string;
  creationDate?: string;
  activityCode?: string;
  legalForm?: string;
  capital?: string;
  website?: string;
  lastBilanYear?: string;
  ca?: string;         // Chiffre d'Affaires
  ebitda?: string;     // Résultat d'exploitation
  equity?: string;     // Capitaux propres (general/2016)
  equity2023?: string; // Capitaux propres 2023
  earnings2023?: string; // Bénéfice 2023
  workInProgress2023?: string; // En cours production
  inventory2023?: string; // Marchandises
  receivables2023?: string; // Créances clients
  directorName?: string;
  directorRole?: string;
  directorAge?: string;
  directorSince?: string;
}

export interface SystemNotification {
  id: string;
  title: string;
  message: string;
  date: string;
  type: 'info' | 'warning' | 'success';
  read: boolean;
  leadId?: string;
}

export interface CRMConfig {
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  appsScriptUrl?: string;
  lastSyncedAt?: string;
  timezoneOffset?: number;
}
