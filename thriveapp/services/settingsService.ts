import { db } from '../config/firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const SETTINGS_COLLECTION = 'settings';
const GLOBAL_DOC = 'global';

export interface GlobalSettings {
    signupCode?: string;
    announcementText?: string;
    showAnnouncement?: boolean;
}

/**
 * Fetches the global settings from Firestore.
 */
export const getGlobalSettings = async (): Promise<GlobalSettings> => {
    try {
        const settingsRef = doc(db, SETTINGS_COLLECTION, GLOBAL_DOC);
        const settingsDoc = await getDoc(settingsRef);
        
        if (settingsDoc.exists()) {
            return settingsDoc.data() as GlobalSettings;
        } else {
            return { signupCode: '' };
        }
    } catch (error) {
        console.error('Error fetching global settings:', error);
        throw error;
    }
};

/**
 * Updates the global settings in Firestore.
 * Requires admin privileges via Firestore rules.
 */
export const updateGlobalSettings = async (settings: Partial<GlobalSettings>): Promise<void> => {
    try {
        const settingsRef = doc(db, SETTINGS_COLLECTION, GLOBAL_DOC);
        // We use merge: true so we don't overwrite other global settings if they exist now or in the future
        await setDoc(settingsRef, settings, { merge: true });
    } catch (error) {
        console.error('Error updating global settings:', error);
        throw error;
    }
};
