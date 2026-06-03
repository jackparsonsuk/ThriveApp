import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../config/firebaseConfig';
import { signOut } from 'firebase/auth';
import { useAuth } from '../../context/auth';
import { getUserProfile, UserProfile, getUserBookings, Booking } from '../../services/bookingService';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import CustomAlert from '../../components/CustomAlert';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii } from '@/constants/theme';
import Constants from 'expo-constants';
import { format } from 'date-fns';

export default function ProfileScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];

    // Stats State
    const [ptCount, setPtCount] = useState(0);
    const [gymCount, setGymCount] = useState(0);
    const [groupCount, setGroupCount] = useState(0);
    const [nextSession, setNextSession] = useState<Booking | null>(null);
    const [statsLoading, setStatsLoading] = useState(true);

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
            
            if (p) {
                setStatsLoading(true);
                const bookings = await getUserBookings(user.uid);
                const now = new Date();
                
                // Completed sessions (confirmed and in the past)
                const completed = bookings.filter(b => b.startTime < now);
                const pts = completed.filter(b => b.type === 'pt').length;
                const gyms = completed.filter(b => b.type === 'gym').length;
                const groups = completed.filter(b => b.type === 'group').length;
                
                setPtCount(pts);
                setGymCount(gyms);
                setGroupCount(groups);
                
                // Next upcoming confirmed session
                const upcoming = bookings
                    .filter(b => b.startTime >= now)
                    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
                
                if (upcoming.length > 0) {
                    setNextSession(upcoming[0]);
                } else {
                    setNextSession(null);
                }
            }
        } catch (error) {
            console.error('Error fetching profile data:', error);
        } finally {
            setLoading(false);
            setStatsLoading(false);
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

                        {profile?.role === 'client' && (
                            <View style={styles.statsSection}>
                                <Text style={[styles.sectionHeading, { color: theme.text }]}>Your Stats</Text>
                                {statsLoading ? (
                                    <ActivityIndicator size="small" color={theme.tint} style={{ marginVertical: 20 }} />
                                ) : (
                                    <>
                                        <View style={styles.statsGrid}>
                                            <View style={[styles.statBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                                <Ionicons name="body" size={20} color="#10b981" />
                                                <Text style={[styles.statNumber, { color: theme.text }]}>{ptCount}</Text>
                                                <Text style={[styles.statLabel, { color: theme.icon }]}>PT Sessions</Text>
                                            </View>
                                            <View style={[styles.statBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                                <Ionicons name="barbell" size={20} color={theme.tint} />
                                                <Text style={[styles.statNumber, { color: theme.text }]}>{gymCount}</Text>
                                                <Text style={[styles.statLabel, { color: theme.icon }]}>Gym Bookings</Text>
                                            </View>
                                            <View style={[styles.statBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                                <Ionicons name="people" size={20} color="#3b82f6" />
                                                <Text style={[styles.statNumber, { color: theme.text }]}>{groupCount}</Text>
                                                <Text style={[styles.statLabel, { color: theme.icon }]}>Group Classes</Text>
                                            </View>
                                        </View>

                                        {nextSession && (
                                            <View style={[styles.nextSessionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                                <View style={[styles.nextSessionIcon, { backgroundColor: theme.tint + '15' }]}>
                                                    <Ionicons name="calendar" size={20} color={theme.tint} />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[styles.nextSessionTitle, { color: theme.icon }]}>NEXT SESSION</Text>
                                                    <Text style={[styles.nextSessionDate, { color: theme.text }]}>
                                                        {format(nextSession.startTime, 'EEEE, d MMMM')}
                                                    </Text>
                                                    <Text style={[styles.nextSessionTime, { color: theme.text }]}>
                                                        {format(nextSession.startTime, 'HH:mm')} - {format(nextSession.endTime, 'HH:mm')}
                                                    </Text>
                                                    <View style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                                                        <Text style={[styles.nextSessionType, { color: theme.tint }]}>
                                                            {nextSession.type === 'pt' ? 'PT Session' : nextSession.type === 'group' ? 'Group Class' : 'Gym Session'}
                                                        </Text>
                                                    </View>
                                                </View>
                                            </View>
                                        )}
                                    </>
                                )}
                            </View>
                        )}

                        <View style={styles.actionSection}>
                            <TouchableOpacity style={[styles.logoutButton, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]} onPress={handleLogout}>
                                <Ionicons name="log-out-outline" size={20} color="#ef4444" style={{ marginRight: 8 }} />
                                <Text style={styles.logoutButtonText}>Log Out</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={{ flex: 1, justifyContent: 'flex-end', marginTop: 40 }}>
                            <TouchableOpacity onPress={() => router.push('/changelog')}>
                                <Text style={[styles.versionText, { color: theme.icon }]}>Version {Constants.expoConfig?.version} · Made by Jack · https://www.jackweb.design/</Text>
                            </TouchableOpacity>
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
    statsSection: {
        marginBottom: 30,
    },
    sectionHeading: {
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 16,
        letterSpacing: -0.4,
    },
    statsGrid: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 20,
    },
    statBox: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 8,
        borderRadius: Radii.lg,
        borderWidth: StyleSheet.hairlineWidth,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.02,
        shadowRadius: 4,
        elevation: 1,
    },
    statNumber: {
        fontSize: 22,
        fontWeight: '700',
        marginVertical: 6,
    },
    statLabel: {
        fontSize: 11,
        fontWeight: '600',
        textAlign: 'center',
    },
    nextSessionCard: {
        flexDirection: 'row',
        padding: 16,
        borderRadius: Radii.xl,
        borderWidth: StyleSheet.hairlineWidth,
        alignItems: 'center',
        gap: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 6,
        elevation: 2,
    },
    nextSessionIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    nextSessionTitle: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1,
        marginBottom: 2,
    },
    nextSessionDate: {
        fontSize: 18,
        fontWeight: '700',
        letterSpacing: -0.3,
    },
    nextSessionTime: {
        fontSize: 14,
        marginTop: 2,
        fontWeight: '500',
    },
    nextSessionType: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
});
