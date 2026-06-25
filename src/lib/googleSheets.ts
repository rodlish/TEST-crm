/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Lead, LeadHistoryEvent, AgentAccount } from '../types';

/**
 * Ensures the sheet has enough columns and sheets before we pull or push data
 */
export async function ensureSheetSchemaAndResize(accessToken: string, spreadsheetId: string): Promise<void> {
  try {
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to read spreadsheet metadata: ${response.statusText}`);
    }

    const doc = await response.json();
    const sheets = doc.sheets || [];

    const leadsSheet = sheets.find((s: any) => s.properties.title === 'Leads');
    const historySheet = sheets.find((s: any) => s.properties.title === 'Historique');
    const agentsSheet = sheets.find((s: any) => s.properties.title === 'Agents');
    const presenceSheet = sheets.find((s: any) => s.properties.title === 'Présence_Agents');
    const logsPresenceSheet = sheets.find((s: any) => s.properties.title === 'Logs_Présence');

    const requests: any[] = [];

    // Leads sheet adjustments
    if (leadsSheet) {
      const colCount = leadsSheet.properties.gridProperties?.columnCount || 0;
      if (colCount < 38) {
        requests.push({
          updateSheetProperties: {
            properties: {
              sheetId: leadsSheet.properties.sheetId,
              gridProperties: {
                columnCount: 40
              }
            },
            fields: 'gridProperties/columnCount'
          }
        });
      }
    } else {
      requests.push({
        addSheet: {
          properties: {
            title: 'Leads',
            gridProperties: {
              frozenRowCount: 1,
              columnCount: 40
            }
          }
        }
      });
    }

    // Historique sheet adjustments
    if (historySheet) {
      const colCount = historySheet.properties.gridProperties?.columnCount || 0;
      if (colCount < 8) {
        requests.push({
          updateSheetProperties: {
            properties: {
              sheetId: historySheet.properties.sheetId,
              gridProperties: {
                columnCount: 10
              }
            },
            fields: 'gridProperties/columnCount'
          }
        });
      }
    } else {
      requests.push({
        addSheet: {
          properties: {
            title: 'Historique',
            gridProperties: {
              frozenRowCount: 1,
              columnCount: 10
            }
          }
        }
      });
    }

    // Agents sheet adjustments
    if (agentsSheet) {
      const colCount = agentsSheet.properties.gridProperties?.columnCount || 0;
      if (colCount < 6) {
        requests.push({
          updateSheetProperties: {
            properties: {
              sheetId: agentsSheet.properties.sheetId,
              gridProperties: {
                columnCount: 10
              }
            },
            fields: 'gridProperties/columnCount'
          }
        });
      }
    } else {
      requests.push({
        addSheet: {
          properties: {
            title: 'Agents',
            gridProperties: {
              frozenRowCount: 1,
              columnCount: 10
            }
          }
        }
      });
    }

    // Présence_Agents sheet adjustments
    if (!presenceSheet) {
      requests.push({
        addSheet: {
          properties: {
            title: 'Présence_Agents',
            gridProperties: {
              frozenRowCount: 1,
              columnCount: 10
            }
          }
        }
      });
    }

    // Logs_Présence sheet adjustments
    if (!logsPresenceSheet) {
      requests.push({
        addSheet: {
          properties: {
            title: 'Logs_Présence',
            gridProperties: {
              frozenRowCount: 1,
              columnCount: 10
            }
          }
        }
      });
    }

    if (requests.length > 0) {
      const resizeRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requests })
      });
      if (!resizeRes.ok) {
        console.warn('Failed to resize spreadsheet sheets or add missing ones', await resizeRes.text());
      }
    }

    // Always ensure headers are correct or updated to handle new corporate/feedback data
    const headersBody = {
      valueInputOption: 'USER_ENTERED',
      data: [
        {
          range: 'Leads!A1:AK1',
          values: [
            [
              'ID',
              'Nom Complet',
              'Email',
              'Téléphone',
              'Entreprise',
              'Statut (new|in_progress|qualified|lost)',
              'Source',
              'Budget (low|medium|high)',
              'Décisionnaire (decision_maker|influencer|none)',
              'Besoin',
              'Délai',
              'Température (cold|warm|hot)',
              'Agent Assigné',
              'Créé le',
              'Modifié le',
              'Siren',
              'Code Postal & Ville',
              'Date de création',
              'Activité',
              'Forme juridique',
              'Capital social',
              'Site web',
              'Date du dernier bilan connu',
              'Chiffres d\'affaires',
              'Résultat d\'exploitation',
              'Capitaux propres 2016',
              'Capitaux propres 2023',
              'Bénéfice 2023',
              'En cours production 2023',
              'Marchandises 2023',
              'Créances clients 2023',
              'Nom Dirigeant',
              'Fonction Dirigeant',
              'Âge Dirigeant',
              'Dirigeant Depuis',
              'Qualification Retour client',
              'Date de relance',
            ],
          ],
        },
        {
          range: 'Historique!A1:G1',
          values: [
            ['ID Log', 'ID Lead', 'Nom du Lead', 'Date', "Type d'Action", 'Auteur', 'Description/Note'],
          ],
        },
        {
          range: 'Agents!A1:F1',
          values: [
            ['ID Agent', 'Nom Complet', 'Email', 'Mot de passe', 'Actif', 'Leads Assignés'],
          ],
        },
        {
          range: 'Présence_Agents!A1:F1',
          values: [
            ['Nom Complet', 'Email', 'Rôle', 'Statut Actuel', 'Début du Statut', 'Dernière Activité'],
          ],
        },
        {
          range: 'Logs_Présence!A1:H1',
          values: [
            ['ID Log', 'Nom Complet', 'Email', 'Rôle', 'Statut', 'Heure Début', 'Heure Fin', 'Durée (minutes)'],
          ],
        },
      ],
    };

    const headersResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(headersBody),
      }
    );

    if (!headersResponse.ok) {
      console.warn('Could not write database headers:', await headersResponse.text());
    }

  } catch (error) {
    console.error('Error ensuring sheet schema/resize:', error);
  }
}

/**
 * Searches the user's Google Drive for a spreadsheet named "TED-Company CRM Leads"
 */
export async function findCRMSpreadsheet(accessToken: string): Promise<{ id: string; url: string } | null> {
  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='TED-Company CRM Leads' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false&fields=files(id,webViewLink)`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to search drive: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.files && data.files.length > 0) {
      return {
        id: data.files[0].id,
        url: data.files[0].webViewLink,
      };
    }
    return null;
  } catch (error) {
    console.error('Error finding spreadsheet in Drive:', error);
    return null;
  }
}

/**
 * Creates a brand new spreadsheet named "TED-Company CRM Leads" with proper sheets and headers.
 */
export async function createCRMSpreadsheet(accessToken: string): Promise<{ id: string; url: string }> {
  try {
    const sheetsBody = {
      properties: {
        title: 'TED-Company CRM Leads',
      },
      sheets: [
        {
          properties: {
            title: 'Leads',
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
        {
          properties: {
            title: 'Historique',
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
        {
          properties: {
            title: 'Agents',
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
      ],
    };

    const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sheetsBody),
    });

    if (!createResponse.ok) {
      throw new Error(`Failed to create spreadsheet: ${createResponse.statusText}`);
    }

    const createdSheet = await createResponse.json();
    const spreadsheetId = createdSheet.spreadsheetId;
    const webViewLink = createdSheet.spreadsheetUrl;

    // Set headers
    const headersBody = {
      valueInputOption: 'USER_ENTERED',
      data: [
        {
          range: 'Leads!A1:AJ1',
          values: [
            [
              'ID',
              'Nom Complet',
              'Email',
              'Téléphone',
              'Entreprise',
              'Statut (new|in_progress|qualified|lost)',
              'Source',
              'Budget (low|medium|high)',
              'Décisionnaire (decision_maker|influencer|none)',
              'Besoin',
              'Délai',
              'Température (cold|warm|hot)',
              'Agent Assigné',
              'Créé le',
              'Modifié le',
              'Siren',
              'Code Postal & Ville',
              'Date de création',
              'Activité',
              'Forme juridique',
              'Capital social',
              'Site web',
              'Date du dernier bilan connu',
              'Chiffres d\'affaires',
              'Résultat d\'exploitation',
              'Capitaux propres 2016',
              'Capitaux propres 2023',
              'Bénéfice 2023',
              'En cours production 2023',
              'Marchandises 2023',
              'Créances clients 2023',
              'Nom Dirigeant',
              'Fonction Dirigeant',
              'Âge Dirigeant',
              'Dirigeant Depuis',
              'Qualification Retour client',
            ],
          ],
        },
        {
          range: 'Historique!A1:G1',
          values: [
            ['ID Log', 'ID Lead', 'Nom du Lead', 'Date', "Type d'Action", 'Auteur', 'Description/Note'],
          ],
        },
        {
          range: 'Agents!A1:F1',
          values: [
            ['ID Agent', 'Nom Complet', 'Email', 'Mot de passe', 'Actif', 'Leads Assignés'],
          ],
        },
      ],
    };

    const headersResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(headersBody),
      }
    );

    if (!headersResponse.ok) {
      console.warn('Could not initialize headers automatically');
    }

    // Adjust column styling a bit automatically
    return {
      id: spreadsheetId,
      url: webViewLink,
    };
  } catch (error) {
    console.error('Error creating spreadsheet:', error);
    throw error;
  }
}

/**
 * Pushes all leads and history to the active sheet
 */
export async function pushCRMDataToSheet(
  accessToken: string,
  spreadsheetId: string,
  leads: Lead[],
  agents?: AgentAccount[],
  activePresences?: any[],
  presenceLogs?: any[]
): Promise<boolean> {
  try {
    // Dynamically check and resize/upgrade sheet columns and tabs to avoid API grid bounds errors
    await ensureSheetSchemaAndResize(accessToken, spreadsheetId);

    // 1. Convert leads to Rows
    const leadRows = leads.map((lead) => [
      lead.id,
      lead.name,
      lead.email,
      lead.phone,
      lead.company || '',
      lead.status,
      lead.source || '',
      lead.qualification?.budget || '',
      lead.qualification?.authority || '',
      lead.qualification?.need || '',
      lead.qualification?.timeline || '',
      lead.qualification?.temperature || '',
      lead.assignedAgentName || '',
      lead.createdAt || '',
      lead.updatedAt || '',
      lead.siren || '',
      lead.postalCodeCity || '',
      lead.creationDate || '',
      lead.activityCode || '',
      lead.legalForm || '',
      lead.capital || '',
      lead.website || '',
      lead.lastBilanYear || '',
      lead.ca || '',
      lead.ebitda || '',
      lead.equity || '',
      lead.equity2023 || '',
      lead.earnings2023 || '',
      lead.workInProgress2023 || '',
      lead.inventory2023 || '',
      lead.receivables2023 || '',
      lead.directorName || '',
      lead.directorRole || '',
      lead.directorAge || '',
      lead.directorSince || '',
      lead.feedbackStatus || '',
      lead.callbackDate || '',
    ]);

    // 2. Convert all history events to Rows
    let historyRows: any[][] = [];
    leads.forEach((lead) => {
      if (lead.history && lead.history.length > 0) {
        lead.history.forEach((h) => {
          historyRows.push([
            h.id,
            lead.id,
            lead.name,
            h.date,
            h.type,
            h.author,
            h.description,
          ]);
        });
      }
    });

    // 3. Convert agents to Rows
    const agentRows = (agents || []).map((agent) => [
      agent.id,
      agent.name,
      agent.email,
      agent.password || '',
      agent.isActive ? 'Oui' : 'Non',
      agent.assignedLeadsCount || 0,
    ]);

    // 4. Convert active connections (presence) to Rows
    const presenceRows = (activePresences || []).map((p) => [
      p.name || '',
      p.email || '',
      p.role === 'admin' ? 'Administrateur' : 'Conseiller',
      p.status === 'en_ligne' ? 'En ligne' : p.status === 'en_pause' ? 'En pause' : 'Déconnecté',
      p.statusStartedAt || '',
      p.lastActive || '',
    ]);

    // 5. Convert presence logs to Rows
    const logRows = (presenceLogs || []).map((l) => [
      l.id || '',
      l.name || '',
      l.email || '',
      l.role === 'admin' ? 'Administrateur' : 'Conseiller',
      l.status === 'en_ligne' ? 'Activité' : l.status === 'en_pause' ? 'Pause' : 'Déconnexion',
      l.startedAt || '',
      l.endedAt || '',
      l.durationMinutes || 0,
    ]);

    // We overwrite the rest of sheets by writing from row 2
    // But we need to make sure we clear old data first to avoid overlapping with shorter arrays
    const clearBody = {
      ranges: [
        'Leads!A2:AK10000', 
        'Historique!A2:G10000', 
        'Agents!A2:F10000',
        'Présence_Agents!A2:F10000',
        'Logs_Présence!A2:H10000'
      ],
    };

    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(clearBody),
    });

    // 3. Update sheets in batch
    const updateData: any = [];
    
    if (leadRows.length > 0) {
      updateData.push({
        range: `Leads!A2:AK${leadRows.length + 1}`,
        values: leadRows,
      });
    }

    if (historyRows.length > 0) {
      updateData.push({
        range: `Historique!A2:G${historyRows.length + 1}`,
        values: historyRows,
      });
    }

    if (agentRows.length > 0) {
      updateData.push({
        range: `Agents!A2:F${agentRows.length + 1}`,
        values: agentRows,
      });
    }

    if (presenceRows.length > 0) {
      updateData.push({
        range: `Présence_Agents!A2:F${presenceRows.length + 1}`,
        values: presenceRows,
      });
    }

    if (logRows.length > 0) {
      updateData.push({
        range: `Logs_Présence!A2:H${logRows.length + 1}`,
        values: logRows,
      });
    }

    if (updateData.length > 0) {
      const batchUpdateBody = {
        valueInputOption: 'USER_ENTERED',
        data: updateData,
      };

      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(batchUpdateBody),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to push data to sheet: ${response.statusText}`);
      }
    }

    return true;
  } catch (err) {
    console.error('Error synchronizing to Google Sheets:', err);
    return false;
  }
}

/**
 * Downloads data from Google Sheet and parses it into Lead items
 */
export async function pullCRMDataFromSheet(
  accessToken: string,
  spreadsheetId: string
): Promise<{ leads: Lead[]; agents: AgentAccount[] } | null> {
  try {
    // Dynamically check and resize/upgrade sheet columns and tabs to avoid API grid bounds errors
    await ensureSheetSchemaAndResize(accessToken, spreadsheetId);

    const ranges = 'ranges=Leads!A2:AK10000&ranges=Historique!A2:G10000&ranges=Agents!A2:F10000';
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${ranges}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to read sheet values: ${response.statusText}`);
    }

    const data = await response.json();
    const leadValues = data.valueRanges?.[0]?.values || [];
    const historyValues = data.valueRanges?.[1]?.values || [];
    const agentValues = data.valueRanges?.[2]?.values || [];

    // Map history elements by Lead ID
    const historyMap: Record<string, LeadHistoryEvent[]> = {};
    historyValues.forEach((row: any[]) => {
      const [idLog, idLead, , date, type, author, description] = row;
      if (idLead) {
        if (!historyMap[idLead]) {
          historyMap[idLead] = [];
        }
        historyMap[idLead].push({
          id: idLog || `h_${Math.random().toString(36).substr(2, 9)}`,
          date: date || new Date().toISOString(),
          type: (type || 'note') as any,
          author: author || 'Système',
          description: description || '',
        });
      }
    });

    const parsedLeads: Lead[] = leadValues.map((row: any[]) => {
      const [
        id,
        name,
        email,
        phone,
        company,
        status,
        source,
        budget,
        authority,
        need,
        timeline,
        temperature,
        assignedAgentName,
        createdAt,
        updatedAt,
        siren,
        postalCodeCity,
        creationDate,
        activityCode,
        legalForm,
        capital,
        website,
        lastBilanYear,
        ca,
        ebitda,
        equity,
        equity2023,
        earnings2023,
        workInProgress2023,
        inventory2023,
        receivables2023,
        directorName,
        directorRole,
        directorAge,
        directorSince,
        feedbackStatus,
        callbackDate,
      ] = row;

      const leadId = id || `lead_${Math.random().toString(36).substr(2, 9)}`;

      return {
        id: leadId,
        name: name || 'Piste Sans Nom',
        email: email || '',
        phone: phone || '',
        company: company || '',
        status: (status || 'new') as any,
        feedbackStatus: (feedbackStatus || undefined) as any,
        callbackDate: callbackDate || '',
        source: source || 'Formulaire Web',
        assignedAgentName: assignedAgentName || '',
        createdAt: createdAt || new Date().toISOString(),
        updatedAt: updatedAt || new Date().toISOString(),
        qualification: {
          budget: (budget || undefined) as any,
          authority: (authority || undefined) as any,
          need: need || '',
          timeline: timeline || '',
          temperature: (temperature || undefined) as any,
        },
        history: historyMap[leadId] || [],
        siren: siren || '',
        postalCodeCity: postalCodeCity || '',
        creationDate: creationDate || '',
        activityCode: activityCode || '',
        legalForm: legalForm || '',
        capital: capital || '',
        website: website || '',
        lastBilanYear: lastBilanYear || '',
        ca: ca || '',
        ebitda: ebitda || '',
        equity: equity || '',
        equity2023: equity2023 || '',
        earnings2023: earnings2023 || '',
        workInProgress2023: workInProgress2023 || '',
        inventory2023: inventory2023 || '',
        receivables2023: receivables2023 || '',
        directorName: directorName || '',
        directorRole: directorRole || '',
        directorAge: directorAge || '',
        directorSince: directorSince || '',
      };
    });

    const parsedAgents: AgentAccount[] = agentValues.map((row: any[]) => {
      const [id, name, email, password, isActive, assignedLeadsCount] = row;
      return {
        id: id || `agent_${Math.random().toString(36).substr(2, 9)}`,
        name: name || '',
        email: email || '',
        password: password || 'password123',
        isActive: isActive === 'Oui' || isActive === 'true' || isActive === true,
        assignedLeadsCount: Number(assignedLeadsCount) || 0,
      };
    });

    return { leads: parsedLeads, agents: parsedAgents };
  } catch (error) {
    console.error('Error fetching data from Google Sheet:', error);
    return null;
  }
}
