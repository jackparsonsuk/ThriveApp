import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../config/firebaseConfig';
import { signOut } from 'firebase/auth';
import { useAuth } from '../../context/auth';
import { getUserProfile, UserProfile } from '../../services/bookingService';
import { Ionicons } from '@expo/vector-icons';
import CustomAlert from '../../components/CustomAlert';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii } from '@/constants/theme';
import Constants from 'expo-constants';

export default function ProfileScreen() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];

    // Custom Alert State
    const [alertConfig, setAlertConfig] = useState<{
        visible: boolean;
        title: string;
        message: string;
        isError?: boolean;
        isSuccess?: boolean;
        onConfirm?: () => void;
    }>({ visible: false, title: '', message: '' });

    const closeAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));

    const fetchProfileAndData = async () => {
        if (!user) return;
        try {
            const p = await getUserProfile(user.uid);
            setProfile(p);
        } catch (error) {
            console.error('Error fetching profile data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProfileAndData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                <Text style={[styles.title, { color: theme.text }]}>Profile</Text>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {loading ? (
                    <ActivityIndicator size="large" color={theme.tint} />
                ) : (
                    <>
                        <View style={[styles.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            <View style={styles.avatarCircle}>
                                <Ionicons name="person" size={40} color="#fff" />
                            </View>
                            <Text style={[styles.nameText, { color: theme.text }]}>{profile?.name}</Text>
                            <Text style={[styles.emailText, { color: theme.icon }]}>{profile?.email}</Text>
                            <View style={[styles.badge, { backgroundColor: theme.border }]}>
                                <Text style={[styles.badgeText, { color: theme.text }]}>{profile?.role?.toUpperCase()}</Text>
                            </View>
                        </View>

                        <View style={styles.actionSection}>
                            <TouchableOpacity style={[styles.logoutButton, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]} onPress={handleLogout}>
                                <Ionicons name="log-out-outline" size={20} color="#ef4444" style={{ marginRight: 8 }} />
                                <Text style={styles.logoutButtonText}>Log Out</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={{ flex: 1, justifyContent: 'flex-end', marginTop: 40 }}>
                            <Text style={[styles.versionText, { color: theme.icon }]}>Version {Constants.expoConfig?.version}</Text>
                        </View>
                    </>
                )}
            </ScrollView>

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                onClose={() => closeAlert()}
                onConfirm={alertConfig.onConfirm}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 20,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    title: {
        fontSize: 34,
        fontWeight: '700',
        letterSpacing: -0.5,
    },
    content: {
        flexGrow: 1,
        padding: 20,
    },
    infoCard: {
        alignItems: 'center',
        padding: 30,
        borderRadius: Radii.xl,
        borderWidth: StyleSheet.hairlineWidth,
        marginBottom: 30,
        // Optional subtle shadow
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
    },
    avatarCircle: {
        width: 80,
        height: 80,
        borderRadius: Radii.pill,
        backgroundColor: '#F26122', // True Thrive Orange
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 15,
    },
    nameText: {
        fontSize: 24,
        fontWeight: '700',
        marginBottom: 6,
        letterSpacing: -0.5,
    },
    emailText: {
        fontSize: 16,
        marginBottom: 16,
    },
    badge: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: Radii.pill,
    },
    badgeText: {
        fontSize: 13,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    actionSection: {
        marginTop: 10,
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderRadius: Radii.pill,
    },
    logoutButtonText: {
        color: '#ef4444',
        fontWeight: '600',
        fontSize: 16,
    },
    versionText: {
        textAlign: 'center',
        fontSize: 13,
        marginTop: 20,
        marginBottom: 10,
        fontWeight: '500',
    },
});
