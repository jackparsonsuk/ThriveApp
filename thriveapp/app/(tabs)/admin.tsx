import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/auth';
import { getAllBookingsForDate, blockOutSlot, cancelBooking, Booking, UserProfile } from '../../services/bookingService';
import { format, addDays, startOfDay, addMinutes, setHours, setMinutes } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import CustomAlert from '../../components/CustomAlert';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii } from '@/constants/theme';

// Operating hours
const OPEN_HOUR = 7;
const CLOSE_HOUR = 20;

export default function AdminScheduleScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
    const [dailyBookings, setDailyBookings] = useState<(Booking & { user?: UserProfile })[]>([]);
    const [loading, setLoading] = useState(false);

    // Custom Alert State
    const [alertConfig, setAlertConfig] = useState<{
        visible: boolean;
        title: string;
        message: string;
        isDestructive?: boolean;
        confirmText?: string;
        cancelText?: string;
        onConfirm?: () => void;
    }>({ visible: false, title: '', message: '' });

    const closeAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));

    const dates = Array.from({ length: 14 }).map((_, i) => addDays(startOfDay(new Date()), i));

    useEffect(() => {
        fetchSchedule();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate]);

    const fetchSchedule = async () => {
        setLoading(true);
        try {
            const bookings = await getAllBookingsForDate(selectedDate);
            setDailyBookings(bookings);
        } catch (error) {
            console.error('Error fetching admin schedule:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to load the schedule.',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleCancelBooking = (bookingId: string, userName: string) => {
        setAlertConfig({
            visible: true,
            title: 'Remove Client',
            message: `Are you sure you want to cancel the booking for ${userName}?`,
            isDestructive: true,
            confirmText: 'Remove',
            onConfirm: async () => {
                setLoading(true);
                try {
                    await cancelBooking(bookingId);
                    fetchSchedule();
                } catch {
                    setAlertConfig({ visible: true, title: 'Error', message: 'Failed to cancel booking.' });
                    setLoading(false);
                }
            }
        });
    };

    const handleBlockSlot = (time: Date) => {
        setAlertConfig({
            visible: true,
            title: 'Block Out Slot',
            message: `Prevent clients from booking 15 minutes at ${format(time, 'HH:mm')}?`,
            isDestructive: true,
            confirmText: 'Block Slot',
            onConfirm: async () => {
                if (!user) return;
                setLoading(true);
                try {
                    await blockOutSlot(user.uid, time, addMinutes(time, 15), 'Admin block out');
                    fetchSchedule();
                } catch {
                    setAlertConfig({ visible: true, title: 'Error', message: 'Failed to block slot.' });
                    setLoading(false);
                }
            }
        });
    };

    // Generate time blocks UI
    const generateTimeBlocks = () => {
        const blocks = [];
        let currentTime = setMinutes(setHours(selectedDate, OPEN_HOUR), 0);
        const endTime = setMinutes(setHours(selectedDate, CLOSE_HOUR), 0);

        while (currentTime < endTime) {
            const blockEnd = addMinutes(currentTime, 15);

            // Find all bookings overlapping this 15-min window
            const overlapping = dailyBookings.filter(b => b.startTime < blockEnd && b.endTime > currentTime);

            blocks.push({
                time: currentTime,
                bookings: overlapping
            });

            currentTime = addMinutes(currentTime, 15);
        }
        return blocks;
    };

    const timeBlocks = generateTimeBlocks();

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                <View style={styles.headerTop}>
                    <Text style={[styles.title, { color: theme.text }]}>Admin Schedule</Text>
                    <TouchableOpacity 
                        style={[styles.analyticsBtn, { backgroundColor: theme.tint }]}
                        onPress={() => router.push('/analytics')}
                    >
                        <Ionicons name="stats-chart" size={18} color="#fff" />
                        <Text style={styles.analyticsBtnText}>Analytics</Text>
                    </TouchableOpacity>
                </View>
                <Text style={[styles.subtitle, { color: theme.icon }]}>Manage bookings and block out time slots</Text>
            </View>

            <View style={[styles.dateSelectorContainer, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateSelector}>
                    {dates.map((date, index) => {
                        const isSelected = selectedDate.getTime() === date.getTime();
                        return (
                            <TouchableOpacity
                                key={index}
                                style={[
                                    styles.dateCard,
                                    { backgroundColor: isSelected ? theme.tint : 'transparent' },
                                    isSelected && styles.dateCardSelected
                                ]}
                                onPress={() => setSelectedDate(date)}
                            >
                                <Text style={[
                                    styles.dayText,
                                    { color: isSelected ? '#fff' : theme.icon }
                                ]}>{format(date, 'EEE')}</Text>
                                <Text style={[
                                    styles.dateText,
                                    { color: isSelected ? '#fff' : theme.text }
                                ]}>{format(date, 'd')}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            <ScrollView contentContainerStyle={styles.scheduleContainer}>
                {loading ? (
                    <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 50 }} />
                ) : (
                    timeBlocks.map((block, index) => {
                        const hasBlock = block.bookings.some(b => b.type === 'block');

                        return (
                            <View key={index} style={[styles.timeBlock, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                <View style={[styles.timeHeader, { borderBottomColor: theme.border }]}>
                                    <Text style={[styles.timeText, { color: theme.text }]}>{format(block.time, 'HH:mm')}</Text>

                                    {!hasBlock ? (
                                        <TouchableOpacity style={[styles.blockBtn, { borderColor: theme.tint }]} onPress={() => handleBlockSlot(block.time)}>
                                            <Ionicons name="lock-closed" size={14} color={theme.tint} />
                                            <Text style={[styles.blockBtnText, { color: theme.tint }]}>Block Slot</Text>
                                        </TouchableOpacity>
                                    ) : (
                                        <TouchableOpacity
                                            style={styles.blockedBadge}
                                            onPress={() => {
                                                const blockBooking = block.bookings.find(b => b.type === 'block');
                                                if (blockBooking && blockBooking.id) {
                                                    handleCancelBooking(blockBooking.id, 'this blocked slot');
                                                }
                                            }}
                                        >
                                            <Ionicons name="lock-open" size={14} color="#fff" />
                                            <Text style={styles.blockedText}>UNBLOCK</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>

                                <View style={styles.attendeesList}>
                                    {block.bookings.length === 0 && !hasBlock && (
                                        <Text style={[styles.emptyText, { color: theme.icon }]}>No one booked.</Text>
                                    )}

                                    {block.bookings.map(b => {
                                        if (b.type === 'block') return null;

                                        const userName = b.user?.name || b.user?.email || 'Unknown Client';
                                        return (
                                            <View key={b.id} style={[styles.attendeeCard, { borderBottomColor: theme.border }]}>
                                                <View style={styles.attendeeInfo}>
                                                    <Text style={[styles.attendeeName, { color: theme.text }]}>{userName}</Text>
                                                    <View style={styles.badgeContainer}>
                                                        <Text style={styles.typeBadge}>{b.type.toUpperCase()}</Text>
                                                        {b.type === 'pt' && <Text style={[styles.ptBadge, { backgroundColor: theme.tint }]}>PT Session</Text>}
                                                        {b.type === 'group' && <Text style={styles.groupBadge}>Group</Text>}
                                                    </View>
                                                </View>

                                                <TouchableOpacity
                                                    style={styles.removeBtn}
                                                    onPress={() => handleCancelBooking(b.id!, userName)}
                                                >
                                                    <Ionicons name="close-circle" size={24} color={theme.icon} />
                                                </TouchableOpacity>
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>
                        );
                    })
                )}
            </ScrollView>

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                isDestructive={alertConfig.isDestructive}
                confirmText={alertConfig.confirmText}
                cancelText={alertConfig.cancelText}
                onClose={closeAlert}
                onConfirm={alertConfig.onConfirm}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20, borderBottomWidth: StyleSheet.hairlineWidth },
    title: { fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
    subtitle: { fontSize: 16, marginTop: 4 },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    analyticsBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.pill, gap: 6 },
    analyticsBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    dateSelectorContainer: { borderBottomWidth: StyleSheet.hairlineWidth },
    dateSelector: { paddingHorizontal: 15, paddingVertical: 12, gap: 8 },
    dateCard: { paddingVertical: 10, paddingHorizontal: 8, borderRadius: Radii.pill, alignItems: 'center', minWidth: 54 },
    dateCardSelected: { shadowColor: '#F26122', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
    dayText: { fontSize: 11, textTransform: 'uppercase', fontWeight: '600', marginBottom: 4 },
    dateText: { fontSize: 20, fontWeight: '500' },
    scheduleContainer: { padding: 16, paddingBottom: 40 },
    timeBlock: { borderRadius: Radii.lg, marginBottom: 15, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
    timeHeader: { backgroundColor: 'transparent', padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    timeText: { fontSize: 18, fontWeight: '700', letterSpacing: -0.4 },
    blockBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'transparent', paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radii.pill, borderWidth: 1 },
    blockBtnText: { fontSize: 13, fontWeight: '700', marginLeft: 6, textTransform: 'uppercase' },
    blockedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239, 68, 68, 0.2)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9999, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.5)' },
    blockedText: { color: '#ef4444', fontSize: 12, fontWeight: '700', marginLeft: 4 },
    attendeesList: { padding: 10 },
    emptyText: { fontStyle: 'italic', padding: 10 },
    attendeeCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottomWidth: StyleSheet.hairlineWidth },
    attendeeInfo: { flex: 1 },
    attendeeName: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
    badgeContainer: { flexDirection: 'row', gap: 6 },
    typeBadge: { fontSize: 10, fontWeight: '700', color: '#1a1a1a', backgroundColor: '#a3a3a3', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    ptBadge: { fontSize: 10, fontWeight: '700', color: '#ffffff', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    groupBadge: { fontSize: 10, fontWeight: '700', color: '#ffffff', backgroundColor: '#3b82f6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    removeBtn: { padding: 5, opacity: 0.8 },
});
