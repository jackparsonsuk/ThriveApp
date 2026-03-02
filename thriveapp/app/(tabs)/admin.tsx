import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/auth';
import { getAllBookingsForDate, blockOutSlot, cancelBooking, Booking, UserProfile } from '../../services/bookingService';
import { format, addDays, startOfDay, addMinutes, setHours, setMinutes } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import CustomAlert from '../../components/CustomAlert';

// Operating hours
const OPEN_HOUR = 6;
const CLOSE_HOUR = 22;

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
    container: { flex: 1, backgroundColor: '#f4f4f4' },
    header: { padding: 20, backgroundColor: '#333' },
    title: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
    subtitle: { fontSize: 16, color: '#ccc', marginTop: 5 },
    dateSelectorContainer: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
    dateSelector: { padding: 15, gap: 10 },
    dateCard: { paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', alignItems: 'center', minWidth: 60 },
    dateCardSelected: { backgroundColor: '#F26122', borderColor: '#F26122' },
    dayText: { fontSize: 12, color: '#666', textTransform: 'uppercase' },
    dateText: { fontSize: 18, fontWeight: 'bold', color: '#333', marginTop: 2 },
    textSelected: { color: '#fff' },
    scheduleContainer: { padding: 15, paddingBottom: 40 },
    timeBlock: { backgroundColor: '#fff', borderRadius: 10, marginBottom: 15, overflow: 'hidden', borderWidth: 1, borderColor: '#eee' },
    timeHeader: { backgroundColor: '#f9f9f9', padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    timeText: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    blockBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffebee', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: '#ffcdd2' },
    blockBtnText: { color: '#f44336', fontSize: 12, fontWeight: 'bold', marginLeft: 4 },
    blockedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f44336', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
    blockedText: { color: '#fff', fontSize: 12, fontWeight: 'bold', marginLeft: 4 },
    attendeesList: { padding: 10 },
    emptyText: { color: '#999', fontStyle: 'italic', padding: 10 },
    attendeeCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    attendeeInfo: { flex: 1 },
    attendeeName: { fontSize: 16, fontWeight: '500', color: '#333', marginBottom: 4 },
    badgeContainer: { flexDirection: 'row', gap: 6 },
    typeBadge: { fontSize: 10, fontWeight: 'bold', color: '#fff', backgroundColor: '#333', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    ptBadge: { fontSize: 10, fontWeight: 'bold', color: '#fff', backgroundColor: '#4caf50', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    groupBadge: { fontSize: 10, fontWeight: 'bold', color: '#fff', backgroundColor: '#2196f3', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    removeBtn: { padding: 5 },
});
