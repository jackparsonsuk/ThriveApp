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
import { Colors, Radii, Spacing, Typography, bookingTypeColor } from '@/constants/theme';
import Constants from 'expo-constants';
import { format } from 'date-fns';
import { ScreenHeader, Card, SectionHeader, Badge, Button, StatBox, Avatar } from '@/components/ui';

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
            <ScrollView contentContainerStyle={styles.content}>
                <ScreenHeader title="Profile" />

                {loading ? (
                    <ActivityIndicator size="large" color={theme.tint} />
                ) : (
                    <>
                        <Card elevated style={styles.infoCard}>
                            <View style={styles.avatarWrap}>
                                <Avatar name={profile?.name} size={72} solid />
                            </View>
                            <Text style={[styles.nameText, { color: theme.text }]}>{profile?.name}</Text>
                            <Text style={[styles.emailText, { color: theme.textSecondary }]}>{profile?.email}</Text>
                            {/* Badge sizes to its text, so it needs centring explicitly in this centred card */}
                            <View style={{ alignSelf: 'center' }}>
                                <Badge label={profile?.role === 'pt' ? 'PT' : profile?.role ?? ''} tone="tint" uppercase />
                            </View>
                        </Card>

                        {profile?.role === 'client' && (
                            <View style={styles.statsSection}>
                                <SectionHeader title="Your Stats" />
                                {statsLoading ? (
                                    <ActivityIndicator size="small" color={theme.tint} style={{ marginVertical: 20 }} />
                                ) : (
                                    <>
                                        <View style={styles.statsGrid}>
                                            <StatBox icon="body-outline" iconColor={bookingTypeColor(theme, 'pt')} value={ptCount} label="PT sessions" />
                                            <StatBox icon="barbell-outline" iconColor={bookingTypeColor(theme, 'gym')} value={gymCount} label="Gym sessions" />
                                            <StatBox icon="people-outline" iconColor={bookingTypeColor(theme, 'group')} value={groupCount} label="Group classes" />
                                        </View>

                                        {nextSession && (
                                            <Card style={styles.nextSessionCard}>
                                                <View style={[styles.nextSessionIcon, { backgroundColor: theme.tintMuted }]}>
                                                    <Ionicons name="calendar" size={20} color={theme.tint} />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[styles.nextSessionTitle, { color: theme.textSecondary }]}>NEXT SESSION</Text>
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
                                            </Card>
                                        )}
                                    </>
                                )}
                            </View>
                        )}

                        <View style={styles.actionSection}>
                            <Button variant="destructive" icon="log-out-outline" label="Log Out" onPress={handleLogout} />
                        </View>

                        <View style={{ flex: 1, justifyContent: 'flex-end', marginTop: Spacing.xxl }}>
                            <TouchableOpacity onPress={() => router.push('/changelog')} accessibilityRole="link">
                                <Text style={[styles.versionText, { color: theme.textTertiary }]}>
                                    Version {Constants.expoConfig?.version} · <Text style={{ color: theme.tint }}>What&apos;s new</Text>
                                </Text>
                                <Text style={[styles.creditText, { color: theme.textTertiary }]}>Made by Jack · jackweb.design</Text>
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
    content: {
        flexGrow: 1,
        padding: Spacing.xl,
    },
    infoCard: {
        alignItems: 'center',
        paddingVertical: Spacing.xxl + 6,
        marginBottom: Spacing.xxl,
    },
    avatarWrap: {
        marginBottom: Spacing.lg,
    },
    nameText: {
        ...Typography.title1,
        marginBottom: Spacing.xs + 2,
    },
    emailText: {
        ...Typography.body,
        marginBottom: Spacing.lg,
    },
    actionSection: {
        marginTop: Spacing.sm,
    },
    versionText: {
        textAlign: 'center',
        ...Typography.footnote,
        marginTop: Spacing.xl,
    },
    creditText: {
        textAlign: 'center',
        ...Typography.caption,
        fontWeight: '400',
        marginTop: Spacing.xs,
        marginBottom: Spacing.md,
    },
    statsSection: {
        marginBottom: Spacing.xxl,
    },
    statsGrid: {
        flexDirection: 'row',
        gap: Spacing.sm,
        marginBottom: Spacing.xl,
    },
    nextSessionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.lg,
    },
    nextSessionIcon: {
        width: 44,
        height: 44,
        borderRadius: Radii.md,
        justifyContent: 'center',
        alignItems: 'center',
    },
    nextSessionTitle: {
        ...Typography.caption2,
        letterSpacing: 1,
        marginBottom: 2,
    },
    nextSessionDate: {
        ...Typography.headline,
        fontSize: 18,
    },
    nextSessionTime: {
        ...Typography.subhead,
        marginTop: 2,
    },
    nextSessionType: {
        ...Typography.caption,
        textTransform: 'uppercase',
    },
});
