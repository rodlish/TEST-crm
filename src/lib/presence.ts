import { doc, getDoc, setDoc, deleteDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export type PresenceStatus = 'en_ligne' | 'en_pause' | 'deconnecte';

export interface PresenceState {
  email: string;
  name: string;
  role: 'admin' | 'agent';
  status: PresenceStatus;
  statusStartedAt: string;
  lastActive: string;
}

export interface PresenceLog {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'agent';
  status: PresenceStatus;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
}

/**
 * Transition the presence status of an agent/admin, calculate duration of previous state,
 * and create a log entry in Firestore.
 */
export async function transitionPresence(
  email: string,
  name: string,
  role: 'admin' | 'agent',
  newStatus: PresenceStatus
): Promise<void> {
  if (!email) return;

  const sanitizedEmail = email.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
  const presenceRef = doc(db, 'connections', sanitizedEmail);
  const nowStr = new Date().toISOString();

  try {
    const docSnap = await getDoc(presenceRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data() as PresenceState;
      const oldStatus = data.status;
      const startedAtStr = data.statusStartedAt;

      // Only log if the status actually changed and has a valid start date
      if (oldStatus && startedAtStr && oldStatus !== newStatus) {
        const startMs = new Date(startedAtStr).getTime();
        const endMs = new Date(nowStr).getTime();
        const durationMinutes = Math.max(1, Math.round((endMs - startMs) / 60000));

        // Create log record
        const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const logRef = doc(db, 'presence_logs', logId);
        
        await setDoc(logRef, {
          id: logId,
          email: data.email,
          name: data.name,
          role: data.role || role,
          status: oldStatus,
          startedAt: startedAtStr,
          endedAt: nowStr,
          durationMinutes
        });
      }
    }

    // Set new state in connections collection
    await setDoc(presenceRef, {
      email: email,
      name: name,
      role: role,
      status: newStatus,
      statusStartedAt: nowStr,
      lastActive: nowStr
    }, { merge: true });

  } catch (err) {
    console.error('Error transitioning presence:', err);
  }
}

/**
 * Keep presence connection updated with a heartbeat
 */
export async function sendHeartbeat(email: string, name: string, role: 'admin' | 'agent', status: PresenceStatus): Promise<void> {
  if (!email) return;
  const sanitizedEmail = email.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
  const presenceRef = doc(db, 'connections', sanitizedEmail);
  const nowStr = new Date().toISOString();

  try {
    await setDoc(presenceRef, {
      email,
      name,
      role,
      status,
      lastActive: nowStr
    }, { merge: true });
  } catch (err) {
    console.error('Error sending heartbeat:', err);
  }
}
