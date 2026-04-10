import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { APP_VERSION } from '../constants/config';
import { Colors, Radii } from '../constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface UpdateBannerProps {
    latestVersion?: string;
}

/**
 * A notification banner that appears at the top of the dashboard
 * when a newer version of the app is available in Firestore.
 */
export default function UpdateBanner({ latestVersion }: UpdateBannerProps) {
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];

    // Only show if latestVersion exists and is different from current version
    if (!latestVersion || latestVersion === APP_VERSION) {
        return null;
    }

    const handleRefresh = () => {
        if (Platform.OS === 'web') {
            // Force reload the page ignoring the cache to ensure the new JS is fetched
            window.location.reload();
        } else {
            // For native, we could use expo-updates if installed, 
            // but for now we just show the message.
            console.log('Update available:', latestVersion);
        }
    };

    return (
        <View style={[styles.banner, { backgroundColor: '#F26122', borderColor: '#D95217' }]}>
            <View style={styles.content}>
                <Ionicons name="refresh-circle-outline" size={24} color="#ffffff" style={styles.icon} />
                <View style={styles.textContainer}>
                    <Text style={styles.title}>New Update Available</Text>
                    <Text style={styles.subtitle}>Version {latestVersion} is now live with new features.</Text>
                </View>
                <TouchableOpacity 
                    style={styles.button}
                    onPress={handleRefresh}
                >
                    <Text style={[styles.buttonText, { color: '#F26122' }]}>
                        {Platform.OS === 'web' ? 'Refresh Now' : 'Got it'}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    banner: {
        marginBottom: 20,
        borderRadius: Radii.lg,
        padding: 16,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    icon: {
        marginRight: 12,
    },
    textContainer: {
        flex: 1,
    },
    title: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    subtitle: {
        color: 'rgba(255, 255, 255, 0.9)',
        fontSize: 13,
        fontWeight: '500',
        marginTop: 1,
    },
    button: {
        backgroundColor: '#ffffff',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: Radii.pill,
        marginLeft: 12,
    },
    buttonText: {
        fontSize: 12,
        fontWeight: '700',
    },
});
