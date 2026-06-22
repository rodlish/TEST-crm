/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Lead, AgentAccount } from '../types';

/**
 * Triggers an event payload to the Google Apps Script Web App URL.
 * Handles lead creations, status changes, assignments, and qualification updates.
 */
export async function triggerAppsScriptEvent(
  url: string | undefined,
  eventType: string,
  payload: any
): Promise<{ success: boolean; message: string }> {
  if (!url || !url.trim()) {
    return { 
      success: false, 
      message: 'Apps Script URL non configurée. Le webhook de script a été ignoré.' 
    };
  }

  try {
    // Add a 3.5-second timeout via AbortController to guarantee fetch never hangs
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    // We send payload as a application/json body via fetch
    // Google Apps Script doPost(e) usually requires JSON input string
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors', // standard cross-origin default for Apps Script deployment redirects
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        eventType,
        ...payload
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // In no-cors mode, fetch cannot read response bodies or status, but completes successfully
    return {
      success: true,
      message: `Événement "${eventType}" envoyé avec succès au Google Apps Script !`
    };
  } catch (err: any) {
    console.error('Apps Script error:', err);
    return {
      success: false,
      message: `Erreur d'envoi Apps Script: ${err.message}`
    };
  }
}

/**
 * The ultimate Google Apps Script template that admins can copy and paste directly into Google Apps Script.
 * Fully compatible with our spreadsheet structures & CRM workflows.
 * Automator for writing Leads, Historial Actions, and Counselors in real-time.
 */
export const GOOGLE_APPS_SCRIPT_TEMPLATE = `/**
 * TED-Company CRM - Google Apps Script Master Controller
 * 
 * Paste this script in Extensions > Apps Script of your target Google Spreadsheet.
 * Click "Deploy" > "New Deployment" > Option: "Web App"
 * Set: "Execute as: Me" and "Who has access: Anyone".
 * Paste the generated URL inside your Admin Settings "URL Apps Script".
 */

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    message: "TED-Company CRM Script Engine is running perfectly",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // Wait for up to 30 seconds to acquire the script lock
    lock.waitLock(30000);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: "Outil de verrouillage actif : Trop de requêtes simultanées, veuillez réessayer dans un instant."
    })).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var rawData = e.postData.contents;
    var data = JSON.parse(rawData);
    
    var eventType = data.eventType;
    var timestamp = data.timestamp || new Date().toISOString();
    var modifiedBy = data.modifiedBy || "System";
    
    // Auto initialize / verify tabs exist
    ensureSheetsConfig();
    
    // Process Event Types
    if (eventType === "lead_created") {
      var lead = data.lead;
      updateLeadRowFull(lead);
      if (lead.history && lead.history.length > 0) {
        for (var i = 0; i < lead.history.length; i++) {
          logHistoryToSheet(lead.id, lead.name, lead.history[i]);
        }
      }
      sendEmailNotification(lead, "Nouveau lead reçu : " + lead.name, modifiedBy);
    } 
    else if (eventType === "lead_updated" || eventType === "status_changed" || eventType === "agent_assigned") {
      var lead = data.lead;
      updateLeadRowFull(lead);
      if (eventType === "status_changed" && lead.status === "qualified") {
        sendEmailNotification(lead, "🔥 Lead QUALIFIÉ (BANT validé) : " + lead.name, modifiedBy);
      }
      if (eventType === "agent_assigned") {
        sendAgentAssignmentEmail(lead);
      }
    } 
    else if (eventType === "history_note_added") {
      logHistoryToSheet(data.leadId, data.leadName, data.event);
    }
    else if (eventType === "agent_created" || eventType === "agent_updated") {
      updateAgentRow(data.agent);
    }
    else if (eventType === "agent_deleted") {
      deleteAgentRow(data.agentId);
    }
    
    // Flush changes to sheet database immediately before releasing lock
    SpreadsheetApp.flush();
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      event: eventType,
      message: "Event processed successfully inside Apps Script with LockService protection"
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    // Release lock for other requests to proceed
    lock.releaseLock();
  }
}

// Ensure database tabs and headers are set up perfectly
function ensureSheetsConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Leads Sheet
  var leadsSheet = ss.getSheetByName("Leads");
  if (!leadsSheet) {
    leadsSheet = ss.insertSheet("Leads");
    leadsSheet.appendRow([
      'ID', 'Nom Complet', 'Email', 'Téléphone', 'Entreprise', 'Statut (new|in_progress|qualified|lost)', 'Source', 
      'Budget (low|medium|high)', 'Décisionnaire (decision_maker|influencer|none)', 'Besoin', 'Délai', 'Température (cold|warm|hot)', 
      'Agent Assigné', 'Créé le', 'Modifié le', 'Siren', 'Code Postal & Ville', 'Date de création', 'Activité', 
      'Forme juridique', 'Capital social', 'Site web', 'Date du dernier bilan connu', "Chiffres d'affaires", 
      "Résultat d'exploitation", 'Capitaux propres 2016', 'Capitaux propres 2023', 'Bénéfice 2023', 'En cours production 2023', 
      'Marchandises 2023', 'Créances clients 2023', 'Nom Dirigeant', 'Fonction Dirigeant', 'Âge Dirigeant', 'Dirigeant Depuis', 'Qualification Retour client', 'Date de relance'
    ]);
    leadsSheet.setFrozenRows(1);
  }
  
  // 2. Historique Sheet
  var historySheet = ss.getSheetByName("Historique");
  if (!historySheet) {
    historySheet = ss.insertSheet("Historique");
    historySheet.appendRow(['ID Log', 'ID Lead', 'Nom du Lead', 'Date', "Type d'Action", 'Auteur', 'Description/Note']);
    historySheet.setFrozenRows(1);
  }
  
  // 3. Agents Sheet
  var agentsSheet = ss.getSheetByName("Agents");
  if (!agentsSheet) {
    agentsSheet = ss.insertSheet("Agents");
    agentsSheet.appendRow(['ID Agent', 'Nom Complet', 'Email', 'Mot de passe', 'Actif', 'Leads Assignés']);
    agentsSheet.setFrozenRows(1);
  }
}

// Complete lead synchronizer
function updateLeadRowFull(lead) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Leads");
  var data = sheet.getDataRange().getValues();
  var found = false;
  
  var row = [
    lead.id,
    lead.name || "",
    lead.email || "",
    lead.phone || "",
    lead.company || "",
    lead.status || "new",
    lead.source || "",
    lead.qualification?.budget || "",
    lead.qualification?.authority || "",
    lead.qualification?.need || "",
    lead.qualification?.timeline || "",
    lead.qualification?.temperature || "",
    lead.assignedAgentName || "Non assigné",
    lead.createdAt || "",
    lead.updatedAt || "",
    lead.siren || "",
    lead.postalCodeCity || "",
    lead.creationDate || "",
    lead.activityCode || "",
    lead.legalForm || "",
    lead.capital || "",
    lead.website || "",
    lead.lastBilanYear || "",
    lead.ca || "",
    lead.ebitda || "",
    lead.equity || "",
    lead.equity2023 || "",
    lead.earnings2023 || "",
    lead.workInProgress2023 || "",
    lead.inventory2023 || "",
    lead.receivables2023 || "",
    lead.directorName || "",
    lead.directorRole || "",
    lead.directorAge || "",
    lead.directorSince || "",
    lead.feedbackStatus || "",
    lead.callbackDate || ""
  ];
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === lead.id) {
      sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
      found = true;
      break;
    }
  }
  
  if (!found) {
    sheet.appendRow(row);
  }

  // Auto-sync history notes
  if (lead.history && lead.history.length > 0) {
    var histSheet = ss.getSheetByName("Historique");
    var histData = histSheet.getDataRange().getValues();
    var existingHistIds = {};
    for (var k = 1; k < histData.length; k++) {
      existingHistIds[histData[k][0]] = true;
    }
    
    for (var j = 0; j < lead.history.length; j++) {
      var hItem = lead.history[j];
      if (!existingHistIds[hItem.id]) {
        logHistoryToSheet(lead.id, lead.name, hItem);
      }
    }
  }
}

// Logs an item in Historique tab
function logHistoryToSheet(leadId, leadName, event) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Historique");
  
  var row = [
    event.id || "h_" + Math.random().toString(36).substr(2, 9),
    leadId,
    leadName || "",
    event.date || new Date().toISOString(),
    event.type || "note",
    event.author || "Système",
    event.description || ""
  ];
  
  sheet.appendRow(row);
}

// Complete agent synchronizer
function updateAgentRow(agent) {
  if (!agent) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Agents");
  var data = sheet.getDataRange().getValues();
  var found = false;
  
  var row = [
    agent.id,
    agent.name || "",
    agent.email || "",
    agent.password || "password123",
    agent.isActive ? "Oui" : "Non",
    agent.assignedLeadsCount || 0
  ];
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === agent.id) {
      sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
      found = true;
      break;
    }
  }
  
  if (!found) {
    sheet.appendRow(row);
  }
}

function deleteAgentRow(agentId) {
  if (!agentId) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Agents");
  var data = sheet.getDataRange().getValues();
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === agentId) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
}

// Mail notifier
function sendEmailNotification(lead, subject, author) {
  var alertEmail = "e.rodlish@gmail.com"; 
  
  var htmlBody = \`
    <div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; color: #333;">
      <h2 style="color: #1e3a8a;">TED-Company CRM - Alerte</h2>
      <p>L'événement suivant a été enregistré par : <strong>\${author}</strong></p>
      <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
      <table style="width: 100%; text-align: left; border-collapse: collapse;">
         <tr><th style="padding: 6px 0; width: 150px;">Client :</th><td>\${lead.name}</td></tr>
         <tr><th style="padding: 6px 0;">Email :</th><td>\${lead.email}</td></tr>
         <tr><th style="padding: 6px 0;">Téléphone :</th><td>\${lead.phone}</td></tr>
         <tr><th style="padding: 6px 0;">Source :</th><td>\${lead.source}</td></tr>
         <tr><th style="padding: 6px 0;">Statut :</th><td>\${lead.status}</td></tr>
         <tr><th style="padding: 6px 0;">Conseiller :</th><td>\${lead.assignedAgentName || 'Non assigné'}</td></tr>
      </table>
      <div style="background-color: #f3f4f6; padding: 15px; margin-top: 20px; border-radius: 8px;">
         <strong>Besoin qualifié (BANT) / Qualification :</strong><br/>
         \text\${lead.qualification?.need || 'Aucun détail de besoin spécifié.'}
      </div>
    </div>
  \`;
  
  MailApp.sendEmail({
    to: alertEmail,
    subject: "[CRM WORKFLOW] " + subject,
    htmlBody: htmlBody
  });
}

function sendAgentAssignmentEmail(lead) {
  if (!lead.assignedAgentId) return;
  
  var agentEmail = lead.assignedAgentId.indexOf("@") !== -1 ? lead.assignedAgentId : null;
  if (!agentEmail) return;
  
  var htmlBody = \`
    <div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; color: #333;">
      <h2 style="color: #2563eb;">Nouveau Lead Assigné</h2>
      <p>Bonjour <strong>\${lead.assignedAgentName}</strong>,</p>
      <p>Une nouvelle opportunité commerciale vient de vous être attribuée par l'administrateur système.</p>
      <p>Veuillez vous connecter sur votre Espace Conseiller pour l'appeler et qualifier son dossier :</p>
      <div style="margin: 20px 0;">
        <a href="https://ais-dev-jd6g7ihidy3ppephhdzcwe-651746489374.europe-west2.run.app" 
           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
          Ouvrir l'Espace CRM
        </a>
      </div>
      <table style="width: 100%; text-align: left; border-collapse: collapse;">
         <tr><th style="padding: 4px 0; width: 120px;">Nom Lead:</th><td>\${lead.name}</td></tr>
         <tr><th style="padding: 4px 0;">Entreprise:</th><td>\${lead.company || 'Particulier'}</td></tr>
         <tr><th style="padding: 4px 0;">Source:</th><td>\${lead.source}</td></tr>
      </table>
    </div>
  \`;
  
  MailApp.sendEmail({
    to: agentEmail,
    subject: "⚡ [Nouveau Lead Assigné] " + lead.name + " - TED-Company",
    htmlBody: htmlBody
  });
}
`;
