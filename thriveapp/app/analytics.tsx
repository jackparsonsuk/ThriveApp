import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { getAnalyticsData, AnalyticsData } from '../services/bookingService';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii } from '@/constants/theme';

export default function AnalyticsScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const result = await getAnalyticsData();
            setData(result);
        } catch (error) {
            console.error('Error fetching analytics:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchData();
    };

    if (loading && !refreshing) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 50 }} />
            </SafeAreaView>
        );
    }

    const StatCard = ({ title, value, icon, color, subValue }: { title: string; value: number; icon: any; color: string; subValue?: string }) => (
        <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
                <Ionicons name={icon} size={22} color={color} />
            </View>
            <View style={styles.statInfo}>
                <Text style={[styles.statTitle, { color: theme.icon }]}>{title}</Text>
                <Text style={[styles.statValue, { color: theme.text }]}>{value}</Text>
                {subValue ? <Text style={[styles.statSubValue, { color: theme.icon }]}>{subValue}</Text> : null}
            </View>
        </View>
    );

    const gymAccessPercent = data && data.clientsTotal > 0
        ? Math.round((data.clientsWithGymAccess / data.clientsTotal) * 100)
        : 0;

    const noGymAccess = (data?.clientsTotal ?? 0) - (data?.clientsWithGymAccess ?? 0);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={28} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: theme.text }]}>Analytics</Text>
                <View style={{ width: 28 }} />
            </View>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
            >
                {/* TODAY */}
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Today's Snapshot</Text>
                <View style={styles.statsGrid}>
                    <StatCard title="Total Bookings" value={data?.bookingsToday ?? 0} icon="calendar" color="#3b82f6" />
                    <StatCard title="Gym Sessions" value={data?.gymBookingsToday ?? 0} icon="barbell" color={theme.tint} />
                    <StatCard title="PT Sessions" value={data?.ptSessionsToday ?? 0} icon="body" color="#10b981" />
                    <StatCard title="Cancellations" value={data?.cancelledToday ?? 0} icon="close-circle" color="#ef4444" />
                </View>

                {/* WEEKLY */}
                <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 28 }]}>This Week</Text>
                <View style={styles.statsGrid}>
                    <StatCard title="Total Bookings" value={data?.bookingsThisWeek ?? 0} icon="bar-chart" color={theme.tint} />
                    <StatCard title="Gym Sessions" value={data?.gymBookingsThisWeek ?? 0} icon="barbell" color="#3b82f6" />
                    <StatCard title="PT Sessions" value={data?.ptSessionsThisWeek ?? 0} icon="fitness" color="#8b5cf6" />
                    <StatCard title="Cancelled" value={data?.cancelledThisWeek ?? 0} icon="trash" color="#f59e0b" />
                </View>

                {/* GROUP SESSIONS */}
                <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 28 }]}>Group Sessions</Text>
                <View style={styles.statsGrid}>
                    <StatCard title="This Week" value={data?.groupSessionsThisWeek ?? 0} icon="people" color="#3b82f6" />
                    <StatCard title="This Month" value={data?.groupSessionsThisMonth ?? 0} icon="people-circle" color="#8b5cf6" />
                    <StatCard title="Recurring Plans" value={data?.activeRecurringTemplates ?? 0} icon="repeat" color="#10b981" />
                    <StatCard title="Cancel Rate" value={data?.cancellationRate ?? 0} icon="trending-down" color="#ef4444" subValue="% this week" />
                </View>

                {(data?.groupBreakdown?.length ?? 0) > 0 && (
                    <>
                        <Text style={[styles.subSectionTitle, { color: theme.icon }]}>By Group — {data?.currentMonth}</Text>
                        <View style={[styles.breakdownCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            <View style={[styles.breakdownHeader, { borderBottomColor: theme.border }]}>
                                <Text style={[styles.breakdownHeaderText, { color: theme.icon, flex: 1 }]}>Group</Text>
                                <Text style={[styles.breakdownHeaderText, { color: theme.icon, width: 64, textAlign: 'center' }]}>Members</Text>
                                <Text style={[styles.breakdownHeaderText, { color: theme.icon, width: 64, textAlign: 'center' }]}>Sessions</Text>
                            </View>
                            {data!.groupBreakdown.map((g, index) => (
                                <View
                                    key={g.groupId}
                                    style={[styles.breakdownRow, index !== data!.groupBreakdown.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
                                >
                                    <View style={styles.ptInfo}>
                                        <View style={[styles.avatar, { backgroundColor: '#3b82f620' }]}>
                                            <Text style={[styles.avatarText, { color: '#3b82f6' }]}>{g.groupName.charAt(0)}</Text>
                                        </View>
                                        <Text style={[styles.ptName, { color: theme.text }]}>{g.groupName}</Text>
                                    </View>
                                    <Text style={[styles.breakdownCount, { color: theme.icon, width: 64, textAlign: 'center', fontSize: 15 }]}>{g.memberCount}</Text>
                                    <Text style={[styles.breakdownCount, { color: theme.text, width: 64, textAlign: 'center' }]}>{g.sessionsThisMonth}</Text>
                                </View>
                            ))}
                        </View>
                    </>
                )}

                {/* PEAK HOURS */}
                {(data?.peakHours?.length ?? 0) > 0 && (
                    <>
                        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 28 }]}>Peak Booking Hours</Text>
                        <Text style={[styles.subSectionTitle, { color: theme.icon }]}>Most popular gym & PT start times this week</Text>
                        <View style={[styles.peakCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            {data!.peakHours.map((slot, index) => {
                                const maxCount = data!.peakHours[0].count;
                                const barWidth = maxCount > 0 ? (slot.count / maxCount) * 100 : 0;
                                const rankColor = index === 0 ? theme.tint : index === 1 ? '#8b5cf6' : '#3b82f6';
                                return (
                                    <View key={slot.hour} style={[styles.peakRow, index !== data!.peakHours.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                                        <Text style={[styles.peakHourLabel, { color: theme.text }]}>{slot.hour}</Text>
                                        <View style={styles.peakBarContainer}>
                                            <View style={[styles.peakBarTrack, { backgroundColor: theme.border }]}>
                                                <View style={[styles.peakBarFill, { width: `${barWidth}%`, backgroundColor: rankColor }]} />
                                            </View>
                                        </View>
                                        <Text style={[styles.peakCount, { color: rankColor }]}>{slot.count}</Text>
                                    </View>
                                );
                            })}
                        </View>
                    </>
                )}

                {/* PENDING REQUESTS */}
                <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 28 }]}>Pending PT Requests</Text>
                <View style={[styles.highlightRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={[styles.iconContainer, { backgroundColor: '#f59e0b20' }]}>
                        <Ionicons name="time" size={22} color="#f59e0b" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 14 }}>
                        <Text style={[styles.highlightLabel, { color: theme.icon }]}>Awaiting PT Approval</Text>
                        <Text style={[styles.highlightValue, { color: theme.text }]}>
                            {data?.pendingRequestsTotal ?? 0} request{(data?.pendingRequestsTotal ?? 0) !== 1 ? 's' : ''}
                        </Text>
                    </View>
                    {(data?.pendingRequestsTotal ?? 0) > 0 && (
                        <View style={[styles.pendingBadge, { backgroundColor: '#f59e0b' }]}>
                            <Text style={styles.pendingBadgeText}>{data?.pendingRequestsTotal}</Text>
                        </View>
                    )}
                </View>

                {/* MEMBERSHIP ACCESS */}
                <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 28 }]}>Membership Access</Text>
                <View style={[styles.membershipCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={styles.membershipRow}>
                        <Text style={[styles.membershipLabel, { color: theme.icon }]}>Total Clients</Text>
                        <Text style={[styles.membershipValue, { color: theme.text }]}>{data?.clientsTotal ?? 0}</Text>
                    </View>
                    <View style={[styles.divider, { backgroundColor: theme.border }]} />
                    <View style={styles.membershipRow}>
                        <View style={styles.membershipLabelRow}>
                            <View style={[styles.dot, { backgroundColor: '#10b981' }]} />
                            <Text style={[styles.membershipLabel, { color: theme.icon }]}>Gym Access Granted</Text>
                        </View>
                        <Text style={[styles.membershipValue, { color: '#10b981' }]}>{data?.clientsWithGymAccess ?? 0}</Text>
                    </View>
                    <View style={[styles.divider, { backgroundColor: theme.border }]} />
                    <View style={styles.membershipRow}>
                        <View style={styles.membershipLabelRow}>
                            <View style={[styles.dot, { backgroundColor: '#ef4444' }]} />
                            <Text style={[styles.membershipLabel, { color: theme.icon }]}>No Gym Access</Text>
                        </View>
                        <Text style={[styles.membershipValue, { color: '#ef4444' }]}>{noGymAccess}</Text>
                    </View>
                    {(data?.clientsTotal ?? 0) > 0 && (
                        <>
                            <View style={[styles.divider, { backgroundColor: theme.border }]} />
                            <View style={styles.progressBarContainer}>
                                <View style={[styles.progressBarTrack, { backgroundColor: theme.border }]}>
                                    <View style={[styles.progressBarFill, { width: `${gymAccessPercent}%`, backgroundColor: '#10b981' }]} />
                                </View>
                                <Text style={[styles.progressLabel, { color: theme.icon }]}>{gymAccessPercent}% have gym access</Text>
                            </View>
                        </>
                    )}
                </View>

                {/* PT BREAKDOWN */}
                <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 28 }]}>PT Breakdown</Text>
                <View style={[styles.breakdownCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={[styles.breakdownHeader, { borderBottomColor: theme.border }]}>
                        <Text style={[styles.breakdownHeaderText, { color: theme.icon, flex: 1 }]}>Trainer</Text>
                        <Text style={[styles.breakdownHeaderText, { color: theme.icon, width: 50, textAlign: 'center' }]}>Today</Text>
                        <Text style={[styles.breakdownHeaderText, { color: theme.icon, width: 50, textAlign: 'center' }]}>Week</Text>
                        <Text style={[styles.breakdownHeaderText, { color: theme.tint, width: 56, textAlign: 'center' }]}>Month</Text>
                    </View>
                    {data?.ptBreakdown && data.ptBreakdown.length > 0 ? (
                        data.ptBreakdown.map((pt, index) => (
                            <View
                                key={pt.ptId}
                                style={[styles.breakdownRow, index !== data.ptBreakdown.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
                            >
                                <View style={styles.ptInfo}>
                                    <View style={[styles.avatar, { backgroundColor: theme.tint + '20' }]}>
                                        <Text style={[styles.avatarText, { color: theme.tint }]}>{pt.ptName.charAt(0)}</Text>
                                    </View>
                                    <Text style={[styles.ptName, { color: theme.text }]}>{pt.ptName}</Text>
                                </View>
                                <Text style={[styles.breakdownCount, { color: theme.text, width: 50, textAlign: 'center' }]}>{pt.countToday}</Text>
                                <Text style={[styles.breakdownCount, { color: theme.text, width: 50, textAlign: 'center' }]}>{pt.countWeek}</Text>
                                <Text style={[styles.breakdownCount, { color: theme.tint, width: 56, textAlign: 'center', fontWeight: '800' }]}>{pt.countMonth}</Text>
                            </View>
                        ))
                    ) : (
                        <Text style={[styles.emptyText, { color: theme.icon }]}>No PT data available.</Text>
                    )}
                </View>
                {data?.currentMonth && (
                    <Text style={[styles.billingNote, { color: theme.icon }]}>
                        Month column shows confirmed PT sessions for {data.currentMonth} — use for billing.
                    </Text>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    backButton: { padding: 4 },
    title: { fontSize: 20, fontWeight: '700' },
    scrollContent: { padding: 20, paddingBottom: 40 },
    sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14, letterSpacing: -0.5 },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    statCard: {
        flex: 1,
        minWidth: '45%',
        padding: 14,
        borderRadius: Radii.lg,
        borderWidth: StyleSheet.hairlineWidth,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    iconContainer: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    statInfo: { flex: 1 },
    statTitle: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
    statValue: { fontSize: 22, fontWeight: '700' },
    statSubValue: { fontSize: 10, marginTop: 2 },
    highlightRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: Radii.lg,
        borderWidth: StyleSheet.hairlineWidth,
    },
    highlightLabel: { fontSize: 13, fontWeight: '500', marginBottom: 2 },
    highlightValue: { fontSize: 20, fontWeight: '700' },
    pendingBadge: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    pendingBadgeText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    membershipCard: { borderRadius: Radii.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
    membershipRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
    membershipLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    membershipLabel: { fontSize: 15, fontWeight: '500' },
    membershipValue: { fontSize: 18, fontWeight: '700' },
    dot: { width: 8, height: 8, borderRadius: 4 },
    divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
    progressBarContainer: { paddingHorizontal: 16, paddingVertical: 14 },
    progressBarTrack: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
    progressBarFill: { height: '100%', borderRadius: 4 },
    progressLabel: { fontSize: 12, fontWeight: '500' },
    breakdownCard: { borderRadius: Radii.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
    breakdownHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
    breakdownHeaderText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
    breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
    ptInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    avatar: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
    avatarText: { fontSize: 14, fontWeight: '700' },
    ptName: { fontSize: 15, fontWeight: '600' },
    breakdownCount: { fontSize: 17, fontWeight: '700' },
    emptyText: { padding: 20, textAlign: 'center', fontStyle: 'italic' },
    billingNote: { fontSize: 12, fontStyle: 'italic', marginTop: 8, textAlign: 'center' },
    subSectionTitle: { fontSize: 13, fontWeight: '500', marginTop: -6, marginBottom: 12 },
    peakCard: { borderRadius: Radii.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
    peakRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
    peakHourLabel: { fontSize: 15, fontWeight: '600', width: 72 },
    peakBarContainer: { flex: 1 },
    peakBarTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
    peakBarFill: { height: '100%', borderRadius: 4 },
    peakCount: { fontSize: 15, fontWeight: '700', width: 32, textAlign: 'right' },
});
