import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/auth';
import { getAllBookingsForDate, blockOutSlot, cancelBooking, Booking, UserProfile } from '../../services/bookingService';
import { format, addDays, startOfDay, addMinutes, setHours, setMinutes } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import CustomAlert from '../../components/CustomAlert';

// Operating hours
const OPEN_HOUR = 8;
const CLOSE_HOUR = 20;

export default function AdminScheduleScreen() {
    const { user } = useAuth();
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
                } catch (error) {
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
            message: `Prevent clients from booking 30 minutes at ${format(time, 'HH:mm')}?`,
            isDestructive: true,
            confirmText: 'Block Slot',
            onConfirm: async () => {
                if (!user) return;
                setLoading(true);
                try {
                    await blockOutSlot(user.uid, time, addMinutes(time, 30), 'Admin block out');
                    fetchSchedule();
                } catch (error) {
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
            const blockEnd = addMinutes(currentTime, 30);

            // Find all bookings overlapping this 30-min window
            const overlapping = dailyBookings.filter(b => b.startTime < blockEnd && b.endTime > currentTime);

            blocks.push({
                time: currentTime,
                bookings: overlapping
            });

            currentTime = addMinutes(currentTime, 30);
        }
        return blocks;
    };

    const timeBlocks = generateTimeBlocks();

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Admin Schedule</Text>
                <Text style={styles.subtitle}>Manage bookings and block out time slots</Text>
            </View>

            <View style={styles.dateSelectorContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateSelector}>
                    {dates.map((date, index) => {
                        const isSelected = selectedDate.getTime() === date.getTime();
                        return (
                            <TouchableOpacity
                                key={index}
                                style={[styles.dateCard, isSelected && styles.dateCardSelected]}
                                onPress={() => setSelectedDate(date)}
                            >
                                <Text style={[styles.dayText, isSelected && styles.textSelected]}>{format(date, 'EEE')}</Text>
                                <Text style={[styles.dateText, isSelected && styles.textSelected]}>{format(date, 'd')}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            <ScrollView contentContainerStyle={styles.scheduleContainer}>
                {loading ? (
                    <ActivityIndicator size="large" color="#F26122" style={{ marginTop: 50 }} />
                ) : (
                    timeBlocks.map((block, index) => {
                        const hasBlock = block.bookings.some(b => b.type === 'block');

                        return (
                            <View key={index} style={styles.timeBlock}>
                                <View style={styles.timeHeader}>
                                    <Text style={styles.timeText}>{format(block.time, 'HH:mm')}</Text>

                                    {!hasBlock ? (
                                        <TouchableOpacity style={styles.blockBtn} onPress={() => handleBlockSlot(block.time)}>
                                            <Ionicons name="lock-closed" size={14} color="#f44336" />
                                            <Text style={styles.blockBtnText}>Block Slot</Text>
                                        </TouchableOpacity>
                                    ) : (
                                        <View style={styles.blockedBadge}>
                                            <Ionicons name="warning" size={14} color="#fff" />
                                            <Text style={styles.blockedText}>BLOCKED</Text>
                                        </View>
                                    )}
                                </View>

                                <View style={styles.attendeesList}>
                                    {block.bookings.length === 0 && !hasBlock && (
                                        <Text style={styles.emptyText}>No one booked.</Text>
                                    )}

                                    {block.bookings.map(b => {
                                        if (b.type === 'block') return null;

                                        const userName = b.user?.name || b.user?.email || 'Unknown Client';
                                        return (
                                            <View key={b.id} style={styles.attendeeCard}>
                                                <View style={styles.attendeeInfo}>
                                                    <Text style={styles.attendeeName}>{userName}</Text>
                                                    <View style={styles.badgeContainer}>
                                                        <Text style={styles.typeBadge}>{b.type.toUpperCase()}</Text>
                                                        {b.type === 'pt' && <Text style={styles.ptBadge}>PT Session</Text>}
                                                        {b.type === 'group' && <Text style={styles.groupBadge}>Group</Text>}
                                                    </View>
                                                </View>

                                                <TouchableOpacity
                                                    style={styles.removeBtn}
                                                    onPress={() => handleCancelBooking(b.id!, userName)}
                                                >
                                                    <Ionicons name="close-circle" size={24} color="#ccc" />
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
    container: { flex: 1, backgroundColor: '#0a0a0a' },
    header: { padding: 20, backgroundColor: '#121212', borderBottomWidth: 1, borderBottomColor: 'rgba(255, 90, 0, 0.1)' },
    title: { fontSize: 24, fontWeight: '800', color: '#ffffff' },
    subtitle: { fontSize: 16, color: '#a3a3a3', marginTop: 5 },
    dateSelectorContainer: { backgroundColor: '#0a0a0a', borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.05)' },
    dateSelector: { padding: 15, gap: 10 },
    dateCard: { paddingVertical: 10, paddingHorizontal: 15, borderRadius: 16, backgroundColor: 'rgba(30, 20, 15, 0.4)', borderWidth: 1, borderColor: 'rgba(255, 90, 0, 0.1)', alignItems: 'center', minWidth: 60 },
    dateCardSelected: { backgroundColor: '#FF5A00', borderColor: '#FF5A00' },
    dayText: { fontSize: 12, color: '#a3a3a3', textTransform: 'uppercase', fontWeight: '600' },
    dateText: { fontSize: 18, fontWeight: '800', color: '#ffffff', marginTop: 2 },
    textSelected: { color: '#ffffff' },
    scheduleContainer: { padding: 15, paddingBottom: 40 },
    timeBlock: { backgroundColor: '#121212', borderRadius: 16, marginBottom: 15, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
    timeHeader: { backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.05)', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    timeText: { fontSize: 18, fontWeight: '800', color: '#ffffff' },
    blockBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'transparent', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9999, borderWidth: 1, borderColor: 'rgba(255, 90, 0, 0.5)' },
    blockBtnText: { color: '#FF5A00', fontSize: 12, fontWeight: '700', marginLeft: 4, textTransform: 'uppercase' },
    blockedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239, 68, 68, 0.2)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9999, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.5)' },
    blockedText: { color: '#ef4444', fontSize: 12, fontWeight: '700', marginLeft: 4 },
    attendeesList: { padding: 10 },
    emptyText: { color: '#737373', fontStyle: 'italic', padding: 10 },
    attendeeCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.05)' },
    attendeeInfo: { flex: 1 },
    attendeeName: { fontSize: 16, fontWeight: '600', color: '#ffffff', marginBottom: 4 },
    badgeContainer: { flexDirection: 'row', gap: 6 },
    typeBadge: { fontSize: 10, fontWeight: '700', color: '#1a1a1a', backgroundColor: '#a3a3a3', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    ptBadge: { fontSize: 10, fontWeight: '700', color: '#ffffff', backgroundColor: '#FF5A00', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    groupBadge: { fontSize: 10, fontWeight: '700', color: '#ffffff', backgroundColor: '#3b82f6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    removeBtn: { padding: 5, opacity: 0.8 },
});
