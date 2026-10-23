import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../config/firebaseConfig';
import { signOut } from 'firebase/auth';
import { useAuth } from '../../context/auth';
import { getUserBookings, Booking } from '../../services/bookingService';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import CustomAlert from '../../components/CustomAlert';
import InstallAppCard from '../../components/InstallAppCard';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSeason } from '@/context/season';
import { SEASONS } from '@/constants/seasons';
import { Colors, Radii, Spacing, Typography, bookingTypeColor } from '@/constants/theme';
import Constants from 'expo-constants';
import { format } from '@/utils/dates';
import { getCalendarFeedUrl, toWebcalUrl, toGoogleCalendarUrl } from '../../services/calendarFeedService';
import { ScreenHeader, Card, SectionHeader, Badge, Button, StatBox, Avatar, Toggle } from '@/components/ui';

export default function ProfileScreen() {
    const router = useRouter();
    const { user, profile, profileLoading } = useAuth();
    const [loading, setLoading] = useState(true);
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const { availableSeason, optedOut, setOptedOut } = useSeason();

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
        confirmText?: string;
        isDestructive?: boolean;
    }>({ visible: false, title: '', message: '' });

    const closeAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));

    // PT calendar feed: fetched on first use, since it creates the link if there isn't one yet
    const [feedUrl, setFeedUrl] = useState<string | null>(null);
    const [feedLoading, setFeedLoading] = useState(false);

    const withFeedUrl = async (action: (url: string) => Promise<unknown> | void, reset = false) => {
        setFeedLoading(true);
        try {
            const url = !reset && feedUrl ? feedUrl : await getCalendarFeedUrl(reset);
            setFeedUrl(url);
            await action(url);
        } catch (error) {
            console.error('Error getting calendar feed link:', error);
            setAlertConfig({ visible: true, title: 'Something went wrong', message: "Couldn't get your calendar link. Please try again.", isError: true });
        } finally {
            setFeedLoading(false);
        }
    };

    const copyFeedUrl = () => withFeedUrl(async url => {
        await Clipboard.setStringAsync(url);
        setAlertConfig({ visible: true, title: 'Copied', message: 'Paste this link into your calendar app where it asks to subscribe or add a calendar from a URL.', isSuccess: true });
    });

    const confirmResetFeedUrl = () => setAlertConfig({
        visible: true,
        title: 'Reset calendar link?',
        message: 'Your current link will stop working, and any calendar subscribed to it will stop updating. You can then add the new one.',
        confirmText: 'Reset',
        isDestructive: true,
        onConfirm: () => {
            withFeedUrl(() => setAlertConfig({ visible: true, title: 'Link reset', message: 'Your old link no longer works. Add your calendar again to keep it updating.', isSuccess: true }), true);
        },
    });

    const fetchProfileAndData = async () => {
        if (!user || profileLoading) return;
        try {
            const p = profile;

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
    }, [user, profileLoading]);

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

                        {(profile?.role === 'pt' || profile?.role === 'admin') && (
                            <View style={styles.calendarSection}>
                                <SectionHeader title="Your Calendar" />
                                <Card>
                                    <Text style={[styles.calendarHelp, { color: theme.textSecondary }]}>
                                        See your PT sessions, requests and blocked time in your phone&apos;s calendar. It keeps itself up to date as sessions are booked, moved or cancelled.
                                    </Text>
                                    <View style={styles.calendarButtons}>
                                        <Button variant="tint" icon="logo-apple" label="Add to Apple Calendar" disabled={feedLoading} onPress={() => withFeedUrl(url => Linking.openURL(toWebcalUrl(url)))} />
                                        <Button variant="tint" icon="logo-google" label="Add to Google Calendar" disabled={feedLoading} onPress={() => withFeedUrl(url => Linking.openURL(toGoogleCalendarUrl(url)))} />
                                        <Button variant="secondary" size="sm" icon="copy-outline" label="Copy link" disabled={feedLoading} onPress={copyFeedUrl} />
                                    </View>
                                    <Text style={[styles.calendarNote, { color: theme.textTertiary }]}>
                                        Keep this link private: anyone with it can see your sessions. Google Calendar can take a few hours to show changes.
                                    </Text>
                                    <TouchableOpacity onPress={confirmResetFeedUrl} disabled={feedLoading} accessibilityRole="button">
                                        <Text style={[styles.calendarReset, { color: theme.tint }]}>Reset link</Text>
                                    </TouchableOpacity>
                                </Card>
                            </View>
                        )}

                        <InstallAppCard />

                        {availableSeason && (
                            <View style={styles.calendarSection}>
                                <SectionHeader title="Appearance" />
                                <Card>
                                    <View style={styles.settingRow}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.settingLabel, { color: theme.text }]}>
                                                {SEASONS[availableSeason].label} theme {SEASONS[availableSeason].emoji}
                                            </Text>
                                            <Text style={[styles.settingDescription, { color: theme.textSecondary }]}>
                                                Seasonal emoji and greetings. Only changes this device.
                                            </Text>
                                        </View>
                                        <Toggle value={!optedOut} onValueChange={val => setOptedOut(!val)} accessibilityLabel={`${SEASONS[availableSeason].label} theme`} />
                                    </View>
                                </Card>
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
                confirmText={alertConfig.confirmText}
                isDestructive={alertConfig.isDestructive}
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
    settingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    settingLabel: { ...Typography.headline, marginBottom: 2 },
    settingDescription: { ...Typography.footnote, fontWeight: '400', lineHeight: 18 },
    calendarSection: {
        marginBottom: Spacing.xxl,
    },
    calendarHelp: {
        ...Typography.subhead,
        marginBottom: Spacing.lg,
    },
    calendarButtons: {
        gap: Spacing.sm,
    },
    calendarNote: {
        ...Typography.footnote,
        marginTop: Spacing.lg,
    },
    calendarReset: {
        ...Typography.footnote,
        fontWeight: '600',
        marginTop: Spacing.sm,
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
