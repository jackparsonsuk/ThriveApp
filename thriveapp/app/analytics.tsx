import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Modal, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { getAnalyticsData, AnalyticsData } from '../services/bookingService';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Spacing, Typography, bookingTypeColor } from '@/constants/theme';
import { format, addDays, subDays, isToday } from 'date-fns';
import { Badge, EmptyState, IconButton, ScreenHeader } from '@/components/ui';

type BookingTypeBadgeProps = { type: string };
const BookingTypeBadge = ({ type }: BookingTypeBadgeProps) => {
    if (type === 'pt') return <Badge label="PT" tone="tint" />;
    if (type === 'group') return <Badge label="Group" tone="info" />;
    return <Badge label={type === 'gym' ? 'Gym' : type} tone="neutral" />;
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

    // Colour means booking type (same as everywhere else in the app); anything that
    // isn't a booking type stays neutral, so the grid doesn't turn into a rainbow.
    const StatCard = ({ title, value, icon, color, suffix, onPress }: { title: string; value: number; icon: keyof typeof Ionicons.glyphMap; color?: string; suffix?: string; onPress?: () => void }) => {
        const CardComponent = onPress ? TouchableOpacity : View;
        const iconColor = color ?? theme.textSecondary;
        return (
            <CardComponent
                style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={onPress}
                activeOpacity={0.7}
                accessibilityRole={onPress ? 'button' : undefined}
            >
                <View style={styles.statTop}>
                    <View style={[styles.iconContainer, { backgroundColor: color ? color + '22' : theme.fill }]}>
                        <Ionicons name={icon} size={16} color={iconColor} />
                    </View>
                    {onPress && <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />}
                </View>
                <Text style={[styles.statValue, { color: theme.text }]}>
                    {value}{suffix ? <Text style={[styles.statSuffix, { color: theme.textSecondary }]}>{suffix}</Text> : null}
                </Text>
                <Text style={[styles.statTitle, { color: theme.textSecondary }]} numberOfLines={2}>{title}</Text>
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
            <View style={styles.header}>
                <ScreenHeader
                    title="Analytics"
                    onBack={() => (router.canGoBack() ? router.back() : router.navigate('/admin'))}
                    backLabel="Admin"
                />
                <View style={[styles.dateSelector, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <IconButton icon="chevron-back" size={34} accessibilityLabel="Previous day" onPress={() => setTargetDate(prev => subDays(prev, 1))} />
                    <View style={styles.dateLabelContainer}>
                        <Text style={[styles.dateLabelText, { color: theme.text }]}>
                            {isToday(targetDate) ? 'Today' : format(targetDate, 'EEE d MMM yyyy')}
                        </Text>
                        {!isToday(targetDate) && (
                            <TouchableOpacity onPress={() => setTargetDate(new Date())} hitSlop={8}>
                                <Text style={[styles.todayShortcutText, { color: theme.tint }]}>Back to today</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    <IconButton icon="chevron-forward" size={34} accessibilityLabel="Next day" onPress={() => setTargetDate(prev => addDays(prev, 1))} />
                </View>
            </View>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
            >
                {/* DAILY SNAPSHOT */}
                <Text style={[styles.sectionTitle, styles.firstSection, { color: theme.text }]}>
                    {isToday(targetDate) ? 'Today' : format(targetDate, 'EEEE d MMMM')}
                </Text>
                <View style={styles.statsGrid}>
                    <StatCard
                        title="All bookings"
                        value={data?.bookingsToday ?? 0}
                        icon="calendar-outline"
                        onPress={() => handleCardPress('all', 'Total Bookings')}
                    />
                    <StatCard
                        title="Gym sessions"
                        value={data?.gymBookingsToday ?? 0}
                        icon="barbell-outline"
                        color={bookingTypeColor(theme, 'gym')}
                        onPress={() => handleCardPress('gym', 'Gym Sessions')}
                    />
                    <StatCard
                        title="PT sessions"
                        value={data?.ptSessionsToday ?? 0}
                        icon="body-outline"
                        color={bookingTypeColor(theme, 'pt')}
                        onPress={() => handleCardPress('pt', 'PT Sessions')}
                    />
                    <StatCard
                        title="Cancellations"
                        value={data?.cancelledToday ?? 0}
                        icon="close-circle-outline"
                        color={theme.danger}
                        onPress={() => handleCardPress('cancelled', 'Cancellations')}
                    />
                </View>

                {/* WEEKLY */}
                <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 28 }]}>This Week</Text>
                <View style={styles.statsGrid}>
                    <StatCard title="All bookings" value={data?.bookingsThisWeek ?? 0} icon="calendar-outline" />
                    <StatCard title="Gym sessions" value={data?.gymBookingsThisWeek ?? 0} icon="barbell-outline" color={bookingTypeColor(theme, 'gym')} />
                    <StatCard title="PT sessions" value={data?.ptSessionsThisWeek ?? 0} icon="body-outline" color={bookingTypeColor(theme, 'pt')} />
                    <StatCard title="Cancellations" value={data?.cancelledThisWeek ?? 0} icon="close-circle-outline" color={theme.danger} />
                </View>

                {/* GROUP SESSIONS */}
                <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 28 }]}>Groups & Plans</Text>
                <View style={styles.statsGrid}>
                    <StatCard title="Group sessions this week" value={data?.groupSessionsThisWeek ?? 0} icon="people-outline" color={bookingTypeColor(theme, 'group')} />
                    <StatCard title="Group sessions this month" value={data?.groupSessionsThisMonth ?? 0} icon="people-outline" color={bookingTypeColor(theme, 'group')} />
                    <StatCard title="Active recurring plans" value={data?.activeRecurringTemplates ?? 0} icon="repeat-outline" />
                    <StatCard title="Cancellation rate this week" value={data?.cancellationRate ?? 0} suffix="%" icon="trending-down-outline" />
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
                                        <View style={[styles.avatar, { backgroundColor: theme.purple + '22' }]}>
                                            <Text style={[styles.avatarText, { color: theme.purple }]}>{g.groupName.charAt(0)}</Text>
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
                                // Order and bar length already show the ranking, so one colour is enough
                                const rankColor = index === 0 ? theme.tint : theme.textSecondary;
                                return (
                                    <View key={slot.hour} style={[styles.peakRow, index !== data!.peakHours.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                                        <Text style={[styles.peakHourLabel, { color: theme.text }]}>{slot.hour}</Text>
                                        <View style={styles.peakBarContainer}>
                                            <View style={[styles.peakBarTrack, { backgroundColor: theme.fill }]}>
                                                <View style={[styles.peakBarFill, { width: `${barWidth}%`, backgroundColor: index === 0 ? theme.tint : theme.textTertiary }]} />
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
                            <Text style={[styles.membershipLabel, { color: theme.textSecondary }]}>Gym access</Text>
                        </View>
                        <Text style={[styles.membershipValue, { color: theme.text }]}>{data?.clientsWithGymAccess ?? 0}</Text>
                    </View>
                    <View style={[styles.divider, { backgroundColor: theme.border }]} />
                    <View style={styles.membershipRow}>
                        <View style={styles.membershipLabelRow}>
                            <View style={[styles.dot, { backgroundColor: theme.textTertiary }]} />
                            <Text style={[styles.membershipLabel, { color: theme.textSecondary }]}>PT only (no gym access)</Text>
                        </View>
                        <Text style={[styles.membershipValue, { color: theme.text }]}>{noGymAccess}</Text>
                    </View>
                    {(data?.clientsTotal ?? 0) > 0 && (
                        <>
                            <View style={[styles.divider, { backgroundColor: theme.border }]} />
                            <View style={styles.progressBarContainer}>
                                <View style={[styles.progressBarTrack, { backgroundColor: theme.fill }]}>
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
                            <IconButton icon="close" size={34} accessibilityLabel="Close" onPress={() => setDetailModalVisible(false)} />
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
                                            <Text style={[styles.bookingTimeText, { color: theme.textSecondary }]}>
                                                {format(item.startTime, 'HH:mm')} - {format(item.endTime, 'HH:mm')}
                                            </Text>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <BookingTypeBadge type={item.type} />
                                            {item.status === 'cancelled' && (
                                                <View style={{ marginTop: Spacing.xs }}>
                                                    <Badge label="Cancelled" tone="danger" />
                                                </View>
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
        paddingHorizontal: Spacing.xl,
        paddingBottom: Spacing.md,
    },
    scrollContent: { padding: Spacing.xl, paddingTop: Spacing.sm, paddingBottom: Spacing.huge },
    sectionTitle: { ...Typography.title3, marginBottom: Spacing.md },
    firstSection: { marginTop: Spacing.sm },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm + 2 },
    statCard: {
        flex: 1,
        minWidth: '45%',
        padding: Spacing.md + 2,
        borderRadius: Radii.lg,
        borderWidth: StyleSheet.hairlineWidth,
    },
    statTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
    iconContainer: { width: 30, height: 30, borderRadius: Radii.pill, justifyContent: 'center', alignItems: 'center' },
    statTitle: { ...Typography.footnote, fontWeight: '400', marginTop: 2 },
    statValue: { ...Typography.title1, fontVariant: ['tabular-nums'] },
    statSuffix: { ...Typography.headline },
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
    billingNote: { ...Typography.footnote, fontWeight: '400', marginTop: Spacing.sm, textAlign: 'center' },
    subSectionTitle: { ...Typography.footnote, fontWeight: '400', marginTop: -Spacing.xs, marginBottom: Spacing.md },
    peakCard: { borderRadius: Radii.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
    peakRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
    peakHourLabel: { fontSize: 15, fontWeight: '600', width: 72 },
    peakBarContainer: { flex: 1 },
    peakBarTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
    peakBarFill: { height: '100%', borderRadius: 4 },
    peakCount: { fontSize: 15, fontWeight: '700', width: 32, textAlign: 'right' },

    // DATE SELECTOR STYLES
    dateSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: Spacing.sm,
        borderRadius: Radii.lg,
        borderWidth: StyleSheet.hairlineWidth,
    },
    dateLabelContainer: {
        alignItems: 'center',
    },
    dateLabelText: {
        ...Typography.headline,
    },
    todayShortcutText: {
        ...Typography.caption,
        marginTop: 2,
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
