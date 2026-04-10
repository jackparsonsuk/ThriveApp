const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

/**
 * Syncs the package.json version to Firebase Firestore settings/global.latestVersion
 * Uses firebase-admin and requires service-account.json to be present.
 */
async function syncVersion() {
    try {
        const packageJsonPath = path.join(__dirname, '../package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const version = packageJson.version;

        if (!version) {
            throw new Error('No version found in package.json');
        }

        console.log(`🚀 Syncing local version (${version}) to Firebase Firestore...`);

        // 1. Load Service Account Key
        const serviceAccountPath = path.join(__dirname, '../service-account.json');
        
        if (!fs.existsSync(serviceAccountPath)) {
            console.error('\n❌ Error: service-account.json not found!');
            console.log('\nTo fix this:');
            console.log('1. Go to Firebase Console > Project Settings > Service Accounts');
            console.log('2. Generate a new private key and save it as "service-account.json" in the project root.');
            process.exit(1);
        }

        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

        // 2. Initialize Firebase Admin
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });

        const db = admin.firestore();

        // 3. Update the document
        console.log('📡 Updating Firestore...');
        await db.collection('settings').doc('global').set({
            latestVersion: version
        }, { merge: true });

        console.log('\n✅ Success! Firebase updated to version:', version);
    } catch (error) {
        console.error('\n❌ Error syncing version:', error.message);
        process.exit(1);
    }
}

syncVersion();
