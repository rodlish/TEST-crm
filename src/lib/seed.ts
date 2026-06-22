import { collection, getDocs, setDoc, doc } from 'firebase/firestore';
import { db, sanitizeForFirestore } from './firebase';
import { Lead, AgentAccount } from '../types';

const INITIAL_AGENTS: AgentAccount[] = [
  {
    id: 'agent_sofiane',
    name: 'Sofiane El Amri',
    email: 'sofiane@ted-company.com',
    password: 'password123',
    isActive: true,
    assignedLeadsCount: 2,
  },
  {
    id: 'agent_laura',
    name: 'Laura Balthazar',
    email: 'laura@ted-company.com',
    password: 'password123',
    isActive: true,
    assignedLeadsCount: 1,
  }
];

const INITIAL_LEADS: Lead[] = [
  {
    id: 'lead_1',
    name: 'Alexandre Dumas',
    email: 'alexandre.dumas@pro-lux.fr',
    phone: '+33 6 12 34 56 78',
    company: 'Pro-Lux France',
    status: 'new',
    source: 'Formulaire Web Landing',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    qualification: {},
    history: [
      {
        id: 'h_1',
        date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'note',
        author: 'Système',
        description: 'Piste créée automatiquement depuis le formulaire web.',
      }
    ]
  },
  {
    id: 'lead_2',
    name: 'Sarah Connor',
    email: 'sconnor@cyberdyne.corp',
    phone: '+1 555 123 4567',
    company: 'Cyberdyne Systems',
    status: 'in_progress',
    source: 'Cold Outreach LinkedIn',
    assignedAgentId: 'agent_sofiane',
    assignedAgentName: 'Sofiane El Amri',
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    qualification: {
      budget: 'high',
      authority: 'decision_maker',
      need: 'Besoin urgent de solutions cloud externalisées de garde de données sécurisées.',
      timeline: 'Moins de 2 mois',
      temperature: 'hot',
    },
    history: [
      {
        id: 'h_2_1',
        date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'note',
        author: 'Système',
        description: 'Piste ajoutée.',
      },
      {
        id: 'h_2_2',
        date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'status_change',
        author: 'Administrateur',
        description: 'Assignation du Lead à Sofiane El Amri.',
      },
      {
        id: 'h_2_3',
        date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'call',
        author: 'Sofiane El Amri',
        description: 'Appel de qualification effectué : Budget validé, décisionnaire direct (CIO). Intérêt très fort pour nos formules d\'externalisation.',
      }
    ]
  },
  {
    id: 'lead_3',
    name: 'Jean-Pierre Lambert',
    email: 'jplambert@valeo.com',
    phone: '+33 1 45 89 12 34',
    company: 'Valeo S.A.',
    status: 'qualified',
    source: 'Appel Entrant',
    assignedAgentId: 'agent_sofiane',
    assignedAgentName: 'Sofiane El Amri',
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    qualification: {
      budget: 'medium',
      authority: 'influencer',
      need: 'Audit de sécurité des infrastructures physiques à l\'international.',
      timeline: 'Dans les 6 mois',
      temperature: 'warm',
    },
    history: [
      {
        id: 'h_3_1',
        date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'note',
        author: 'Administrateur',
        description: 'Nouveau lead enregistré suite à un appel direct.',
      },
      {
        id: 'h_3_2',
        date: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'status_change',
        author: 'Administrateur',
        description: 'Assignation à Sofiane El Amri.',
      },
      {
        id: 'h_3_3',
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'qualification',
        author: 'Sofiane El Amri',
        description: 'Qualification approfondie complétée. Profil approuvé et transmis pour devis final.',
      }
    ]
  },
  {
    id: 'lead_mhs',
    name: 'Barre Daniel',
    email: 'daniel.barre@mhs.fr',
    phone: '01 64 39 31 66',
    company: 'Maintenance Hydraulique Systemes',
    status: 'new',
    source: 'Intégration Manuelle',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    qualification: {},
    history: [
      {
        id: 'h_mhs_1',
        date: new Date().toISOString(),
        type: 'note',
        author: 'Système',
        description: 'Dossier créé automatiquement pour Maintenance Hydraulique Systemes.',
      }
    ],
    siren: '345 334 460',
    postalCodeCity: '77000 Vaux-le-penil',
    creationDate: '04/1988',
    activityCode: '4669B Commerce de gros (commerce interentreprises) de fournitures et équipements industriels divers',
    legalForm: 'Société à responsabilité limitée (sans autre indication)',
    capital: '200 000 €',
    website: 'mhs.fr',
    lastBilanYear: '2016',
    ca: '3 943 K€',
    ebitda: '40 K€',
    equity: '237 K€',
    equity2023: '208 K€',
    earnings2023: '83 K€',
    workInProgress2023: '42 K€',
    inventory2023: '893 K€',
    receivables2023: '146 K€',
    directorName: 'Barre Daniel',
    directorRole: 'Gérant',
    directorAge: '74 ans - 07/1951',
    directorSince: '11/04/2017',
  }
];

export async function seedDatabase() {
  // Seed leads if empty
  const leadsSnapshot = await getDocs(collection(db, 'leads'));
  if (leadsSnapshot.empty) {
    console.log('Seeding initial CRM leads...');
    for (const lead of INITIAL_LEADS) {
      const sanitized = sanitizeForFirestore(lead);
      await setDoc(doc(db, 'leads', lead.id), sanitized);
    }
  }

  // Seed agents if empty
  const agentsSnapshot = await getDocs(collection(db, 'candidates')); // using candidates collection for accesses
  if (agentsSnapshot.empty) {
    console.log('Seeding initial CRM agents (accesses)...');
    for (const agent of INITIAL_AGENTS) {
      const sanitized = sanitizeForFirestore(agent);
      await setDoc(doc(db, 'candidates', agent.id), sanitized);
    }
  }
}
