import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Modal, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { getAnalyticsData, AnalyticsData } from '../services/bookingService';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { format, addDays, subDays, isToday } from 'date-fns';
import { Badge, EmptyState } from '@/components/ui';

type BookingTypeBadgeProps = { type: string };
const BookingTypeBadge = ({ type }: BookingTypeBadgeProps) => {
    if (type === 'pt') return <Badge label="PT" tone="tint" />;
    if (type === 'group') return <Badge label="GROUP" tone="info" />;
    return <Badge label={type.toUpperCase()} tone="neutral" />;
};

export default function AnalyticsScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    
    const [targetDate, setTargetDate] = useState<Date>(new Date());
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Detail Modal State
    const [detailModalVisible, setDetailModalVisible] = useState(false);
    const [selectedCardType, setSelectedCardType] = useState<'all' | 'gym' | 'pt' | 'cancelled'>('all');
    const [selectedCardTitle, setSelectedCardTitle] = useState('');

    const fetchData = useCallback(async (date: Date) => {
        try {
            const result = await getAnalyticsData(date);
            setData(result);
        } catch (error) {
            console.error('Error fetching analytics:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchData(targetDate);
    }, [targetDate, fetchData]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchData(targetDate);
    };

    const StatCard = ({ title, value, icon, color, subValue, onPress }: { title: string; value: number; icon: any; color: string; subValue?: string; onPress?: () => void }) => {
        const CardComponent = onPress ? TouchableOpacity : View;
        return (
            <CardComponent 
                style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={onPress}
                activeOpacity={0.7}
            >
                <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
                    <Ionicons name={icon} size={22} color={color} />
                </View>
                <View style={styles.statInfo}>
                    <Text style={[styles.statTitle, { color: theme.textSecondary }]}>{title}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={[styles.statValue, { color: theme.text }]}>{value}</Text>
                        {onPress && (
                            <Ionicons name="chevron-forward" size={14} color={theme.textSecondary} style={{ opacity: 0.5 }} />
                        )}
                    </View>
                    {subValue ? <Text style={[styles.statSubValue, { color: theme.textSecondary }]}>{subValue}</Text> : null}
                </View>
            </CardComponent>
        );
    };

    const handleCardPress = (type: 'all' | 'gym' | 'pt' | 'cancelled', title: string) => {
        setSelectedCardType(type);
        setSelectedCardTitle(title);
        setDetailModalVisible(true);
    };

    const filteredBookings = useMemo(() => {
        if (!data || !data.bookingsForDay) return [];
        const bookings = data.bookingsForDay;
        
        switch (selectedCardType) {
            case 'gym':
                return bookings.filter(b => b.type === 'gym' && b.status === 'confirmed');
            case 'pt':
                return bookings.filter(b => b.type === 'pt' && b.status === 'confirmed');
            case 'cancelled':
                return bookings.filter(b => b.status === 'cancelled');
            case 'all':
            default:
                return bookings.filter(b => b.status === 'confirmed');
        }
    }, [data, selectedCardType]);

    const gymAccessPercent = data && data.clientsTotal > 0
        ? Math.round((data.clientsWithGymAccess / data.clientsTotal) * 100)
        : 0;

    const noGymAccess = (data?.clientsTotal ?? 0) - (data?.clientsWithGymAccess ?? 0);

    if (loading && !refreshing) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 50 }} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={28} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: theme.text }]}>Analytics</Text>
                <View style={{ width: 28 }} />
            </View>

            {/* DATE SELECTOR HEADER */}
            <View style={[styles.dateSelectorContainer, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                <TouchableOpacity 
                    style={styles.dateArrowBtn} 
                    onPress={() => setTargetDate(prev => subDays(prev, 1))}
                >
                    <Ionicons name="chevron-back" size={22} color={theme.text} />
                </TouchableOpacity>
                
                <View style={styles.dateLabelContainer}>
                    <Text style={[styles.dateLabelText, { color: theme.text }]}>
                        {format(targetDate, 'EEEE, d MMMM yyyy')}
                    </Text>
                    {isToday(targetDate) ? (
                        <View style={[styles.todayBadge, { backgroundColor: theme.tintMuted }]}>
                            <Text style={[styles.todayBadgeText, { color: theme.tint }]}>TODAY</Text>
                        </View>
                    ) : (
                        <TouchableOpacity 
                            style={styles.todayShortcut} 
                            onPress={() => setTargetDate(new Date())}
                        >
                            <Text style={[styles.todayShortcutText, { color: theme.tint }]}>Go to Today</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <TouchableOpacity 
                    style={styles.dateArrowBtn} 
                    onPress={() => setTargetDate(prev => addDays(prev, 1))}
                >
                    <Ionicons name="chevron-forward" size={22} color={theme.text} />
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
            >
                {/* DAILY SNAPSHOT */}
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                    {isToday(targetDate) ? "Today's Snapshot" : `${format(targetDate, 'EEEE')}'s Snapshot`}
                </Text>
                <View style={styles.statsGrid}>
                    <StatCard
                        title="Total Bookings"
                        value={data?.bookingsToday ?? 0}
                        icon="calendar"
                        color={theme.info}
                        onPress={() => handleCardPress('all', 'Total Bookings')}
                    />
                    <StatCard
                        title="Gym Sessions"
                        value={data?.gymBookingsToday ?? 0}
                        icon="barbell"
                        color={theme.tint}
                        onPress={() => handleCardPress('gym', 'Gym Sessions')}
                    />
                    <StatCard
                        title="PT Sessions"
                        value={data?.ptSessionsToday ?? 0}
                        icon="body"
                        color={theme.success}
                        onPress={() => handleCardPress('pt', 'PT Sessions')}
                    />
                    <StatCard
                        title="Cancellations"
                        value={data?.cancelledToday ?? 0}
                        icon="close-circle"
                        color={theme.danger}
                        onPress={() => handleCardPress('cancelled', 'Cancellations')}
                    />
                </View>

                {/* WEEKLY */}
                <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 28 }]}>This Week</Text>
                <View style={styles.statsGrid}>
                    <StatCard title="Total Bookings" value={data?.bookingsThisWeek ?? 0} icon="bar-chart" color={theme.tint} />
                    <StatCard title="Gym Sessions" value={data?.gymBookingsThisWeek ?? 0} icon="barbell" color={theme.info} />
                    <StatCard title="PT Sessions" value={data?.ptSessionsThisWeek ?? 0} icon="fitness" color="#8b5cf6" />
                    <StatCard title="Cancelled" value={data?.cancelledThisWeek ?? 0} icon="trash" color={theme.warning} />
                </View>

                {/* GROUP SESSIONS */}
                <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 28 }]}>Group Sessions</Text>
                <View style={styles.statsGrid}>
                    <StatCard title="This Week" value={data?.groupSessionsThisWeek ?? 0} icon="people" color={theme.info} />
                    <StatCard title="This Month" value={data?.groupSessionsThisMonth ?? 0} icon="people-circle" color="#8b5cf6" />
                    <StatCard title="Recurring Plans" value={data?.activeRecurringTemplates ?? 0} icon="repeat" color={theme.success} />
                    <StatCard title="Cancel Rate" value={data?.cancellationRate ?? 0} icon="trending-down" color={theme.danger} subValue="% this week" />
                </View>

                {(data?.groupBreakdown?.length ?? 0) > 0 && (
                    <>
                        <Text style={[styles.subSectionTitle, { color: theme.textSecondary }]}>By Group — {data?.currentMonth}</Text>
                        <View style={[styles.breakdownCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            <View style={[styles.breakdownHeader, { borderBottomColor: theme.border }]}>
                                <Text style={[styles.breakdownHeaderText, { color: theme.textSecondary, flex: 1 }]}>Group</Text>
                                <Text style={[styles.breakdownHeaderText, { color: theme.textSecondary, width: 64, textAlign: 'center' }]}>Members</Text>
                                <Text style={[styles.breakdownHeaderText, { color: theme.textSecondary, width: 64, textAlign: 'center' }]}>Sessions</Text>
                            </View>
                            {data!.groupBreakdown.map((g, index) => (
                                <View
                                    key={g.groupId}
                                    style={[styles.breakdownRow, index !== data!.groupBreakdown.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
                                >
                                    <View style={styles.ptInfo}>
                                        <View style={[styles.avatar, { backgroundColor: theme.info + '20' }]}>
                                            <Text style={[styles.avatarText, { color: theme.info }]}>{g.groupName.charAt(0)}</Text>
                                        </View>
                                        <Text style={[styles.ptName, { color: theme.text }]}>{g.groupName}</Text>
                                    </View>
                                    <Text style={[styles.breakdownCount, { color: theme.textSecondary, width: 64, textAlign: 'center', fontSize: 15 }]}>{g.memberCount}</Text>
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
                        <Text style={[styles.subSectionTitle, { color: theme.textSecondary }]}>Most popular gym & PT start times this week</Text>
                        <View style={[styles.peakCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            {data!.peakHours.map((slot, index) => {
                                const maxCount = data!.peakHours[0].count;
                                const barWidth = maxCount > 0 ? (slot.count / maxCount) * 100 : 0;
                                const rankColor = index === 0 ? theme.tint : index === 1 ? '#8b5cf6' : theme.info;
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
                    <View style={[styles.iconContainer, { backgroundColor: theme.warning + '20' }]}>
                        <Ionicons name="time" size={22} color={theme.warning} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 14 }}>
                        <Text style={[styles.highlightLabel, { color: theme.textSecondary }]}>Awaiting PT Approval</Text>
                        <Text style={[styles.highlightValue, { color: theme.text }]}>
                            {data?.pendingRequestsTotal ?? 0} request{(data?.pendingRequestsTotal ?? 0) !== 1 ? 's' : ''}
                        </Text>
                    </View>
                    {(data?.pendingRequestsTotal ?? 0) > 0 && (
                        <View style={[styles.pendingBadge, { backgroundColor: theme.warning }]}>
                            <Text style={[styles.pendingBadgeText, { color: theme.onTint }]}>{data?.pendingRequestsTotal}</Text>
                        </View>
                    )}
                </View>

                {/* MEMBERSHIP ACCESS */}
                <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 28 }]}>Membership Access</Text>
                <View style={[styles.membershipCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={styles.membershipRow}>
                        <Text style={[styles.membershipLabel, { color: theme.textSecondary }]}>Total Clients</Text>
                        <Text style={[styles.membershipValue, { color: theme.text }]}>{data?.clientsTotal ?? 0}</Text>
                    </View>
                    <View style={[styles.divider, { backgroundColor: theme.border }]} />
                    <View style={styles.membershipRow}>
                        <View style={styles.membershipLabelRow}>
                            <View style={[styles.dot, { backgroundColor: theme.success }]} />
                            <Text style={[styles.membershipLabel, { color: theme.textSecondary }]}>Gym Access Granted</Text>
                        </View>
                        <Text style={[styles.membershipValue, { color: theme.success }]}>{data?.clientsWithGymAccess ?? 0}</Text>
                    </View>
                    <View style={[styles.divider, { backgroundColor: theme.border }]} />
                    <View style={styles.membershipRow}>
                        <View style={styles.membershipLabelRow}>
                            <View style={[styles.dot, { backgroundColor: theme.danger }]} />
                            <Text style={[styles.membershipLabel, { color: theme.textSecondary }]}>No Gym Access</Text>
                        </View>
                        <Text style={[styles.membershipValue, { color: theme.danger }]}>{noGymAccess}</Text>
                    </View>
                    {(data?.clientsTotal ?? 0) > 0 && (
                        <>
                            <View style={[styles.divider, { backgroundColor: theme.border }]} />
                            <View style={styles.progressBarContainer}>
                                <View style={[styles.progressBarTrack, { backgroundColor: theme.border }]}>
                                    <View style={[styles.progressBarFill, { width: `${gymAccessPercent}%`, backgroundColor: theme.success }]} />
                                </View>
                                <Text style={[styles.progressLabel, { color: theme.textSecondary }]}>{gymAccessPercent}% have gym access</Text>
                            </View>
                        </>
                    )}
                </View>

                {/* PT BREAKDOWN */}
                <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 28 }]}>PT Breakdown</Text>
                <View style={[styles.breakdownCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={[styles.breakdownHeader, { borderBottomColor: theme.border }]}>
                        <Text style={[styles.breakdownHeaderText, { color: theme.textSecondary, flex: 1 }]}>Trainer</Text>
                        <Text style={[styles.breakdownHeaderText, { color: theme.textSecondary, width: 50, textAlign: 'center' }]}>Today</Text>
                        <Text style={[styles.breakdownHeaderText, { color: theme.textSecondary, width: 50, textAlign: 'center' }]}>Week</Text>
                        <Text style={[styles.breakdownHeaderText, { color: theme.tint, width: 56, textAlign: 'center' }]}>Month</Text>
                    </View>
                    {data?.ptBreakdown && data.ptBreakdown.length > 0 ? (
                        data.ptBreakdown.map((pt, index) => (
                            <View
                                key={pt.ptId}
                                style={[styles.breakdownRow, index !== data.ptBreakdown.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
                            >
                                <View style={styles.ptInfo}>
                                    <View style={[styles.avatar, { backgroundColor: theme.tintMuted }]}>
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
                        <EmptyState icon="people-outline" title="No PT data available." compact />
                    )}
                </View>
                {data?.currentMonth && (
                    <Text style={[styles.billingNote, { color: theme.textSecondary }]}>
                        Month column shows confirmed PT sessions for {data.currentMonth} — use for billing.
                    </Text>
                )}
            </ScrollView>

            {/* CLICK-THROUGH DRILL-DOWN MODAL */}
            <Modal
                visible={detailModalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setDetailModalVisible(false)}
            >
                <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
                    <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
                            <View>
                                <Text style={[styles.modalTitle, { color: theme.text }]}>{selectedCardTitle}</Text>
                                <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                                    {format(targetDate, 'EEEE, d MMMM yyyy')}
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={[styles.modalCloseBtn, { backgroundColor: theme.cardAlt }]}
                                onPress={() => setDetailModalVisible(false)}
                            >
                                <Ionicons name="close" size={20} color={theme.text} />
                            </TouchableOpacity>
                        </View>

                        <FlatList
                            data={filteredBookings}
                            keyExtractor={(item) => item.id || Math.random().toString()}
                            contentContainerStyle={styles.modalListContent}
                            renderItem={({ item }) => {
                                const userName = item.user?.name || item.user?.email || 'Unknown Client';
                                return (
                                    <View style={[styles.bookingItem, { borderBottomColor: theme.border }]}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.bookingClientName, { color: theme.text }]}>
                                                {userName}
                                            </Text>
                                            {item.type === 'pt' && item.instructorName ? (
                                                <Text style={[styles.bookingSubText, { color: theme.textSecondary }]}>
                                                    Trainer: {item.instructorName}
                                                </Text>
                                            ) : null}
                                            <Text style={[styles.bookingTimeText, { color: theme.tint }]}>
                                                {format(item.startTime, 'HH:mm')} - {format(item.endTime, 'HH:mm')}
                                            </Text>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <BookingTypeBadge type={item.type} />
                                            {item.status === 'cancelled' && (
                                                <Text style={{ color: theme.danger, fontSize: 11, fontWeight: '700', marginTop: 4 }}>
                                                    CANCELLED
                                                </Text>
                                            )}
                                        </View>
                                    </View>
                                );
                            }}
                            ListEmptyComponent={<EmptyState icon="calendar-outline" title="No bookings found for this category." />}
                        />
                    </View>
                </View>
            </Modal>
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
    pendingBadgeText: { fontSize: 14, fontWeight: '700' },
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

    // DATE SELECTOR STYLES
    dateSelectorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    dateArrowBtn: {
        padding: 6,
    },
    dateLabelContainer: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 8,
    },
    dateLabelText: {
        fontSize: 15,
        fontWeight: '700',
    },
    todayBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    todayBadgeText: {
        fontSize: 10,
        fontWeight: '700',
    },
    todayShortcut: {
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    todayShortcutText: {
        fontSize: 12,
        fontWeight: '700',
    },

    // MODAL STYLES
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalContent: {
        borderTopLeftRadius: Radii.xl,
        borderTopRightRadius: Radii.xl,
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        maxHeight: '80%',
        minHeight: '40%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
    },
    modalSubtitle: {
        fontSize: 12,
        marginTop: 2,
    },
    modalCloseBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalListContent: {
        padding: 20,
        paddingBottom: 40,
    },
    bookingItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    bookingClientName: {
        fontSize: 16,
        fontWeight: '600',
    },
    bookingSubText: {
        fontSize: 13,
        marginTop: 2,
    },
    bookingTimeText: {
        fontSize: 13,
        fontWeight: '600',
        marginTop: 2,
    },
});
