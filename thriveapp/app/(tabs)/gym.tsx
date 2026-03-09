import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/auth';
import { getGymBookingsForDate, getPTBookingsForDate, getUserBookingsForDate, checkSlotAvailability, createBooking, Booking } from '../../services/bookingService';
import { format, addDays, startOfDay, addMinutes, setHours, setMinutes, isBefore } from 'date-fns';
import { useRouter } from 'expo-router';
import CustomAlert from '../../components/CustomAlert';

const GYM_OPEN_HOUR = 7;
const GYM_CLOSE_HOUR = 20;

export default function GymBookingScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
    const [availableSlots, setAvailableSlots] = useState<{ time: Date; available: boolean; isNextAvailable: boolean; attendees: number; conflictType?: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [bookingLoading, setBookingLoading] = useState(false);

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

    // Generate the next 14 days for the selector
    const dates = Array.from({ length: 14 }).map((_, i) => addDays(startOfDay(new Date()), i));

    useEffect(() => {
        fetchAvailability();
    }, [selectedDate]);

    const fetchAvailability = async () => {
        setLoading(true);
        try {
            const bookingsForDay = await getGymBookingsForDate(selectedDate);

            // If the user happens to have instructional PT bookings, block them out too
            if (user?.uid) {
                const instructorBookings = await getPTBookingsForDate(selectedDate, user.uid);
                instructorBookings.forEach(b => {
                    bookingsForDay.push({ ...b, type: 'block', reason: 'PT Session Admin' });
                });

                // Add the user's personal bookings (PT, group, gym) as blocks so they can't double book
                const myBookings = await getUserBookingsForDate(user.uid, selectedDate);
                myBookings.forEach(b => {
                    let reasonLabel = 'Booked';
                    if (b.type === 'pt') reasonLabel = 'PT Session';
                    if (b.type === 'gym') reasonLabel = 'Gym Session';
                    if (b.type === 'group') reasonLabel = 'Group Class';
                    bookingsForDay.push({ ...b, type: 'block', reason: reasonLabel });
                });
            }

            const slots = [];
            let currentTime = setMinutes(setHours(selectedDate, GYM_OPEN_HOUR), 0);
            const endTime = setMinutes(setHours(selectedDate, GYM_CLOSE_HOUR), 0);
            const now = new Date();

            while (currentTime < endTime) {
                // Only show future slots for today
                if (isBefore(currentTime, now)) {
                    currentTime = addMinutes(currentTime, 15);
                    continue;
                }

                const slotData = checkSlotAvailability(currentTime, bookingsForDay);

                // A 1-hour booking needs 4 consecutive 15-minute slots (1st, 2nd, 3rd, 4th)
                const nextSlot1Start = addMinutes(currentTime, 15);
                const nextSlot2Start = addMinutes(currentTime, 30);
                const nextSlot3Start = addMinutes(currentTime, 45);

                const nextSlotData1 = checkSlotAvailability(nextSlot1Start, bookingsForDay);
                const nextSlotData2 = checkSlotAvailability(nextSlot2Start, bookingsForDay);
                const nextSlotData3 = checkSlotAvailability(nextSlot3Start, bookingsForDay);

                const isFullHourAvailable = slotData.available && nextSlotData1.available && nextSlotData2.available && nextSlotData3.available;

                slots.push({
                    time: currentTime,
                    available: slotData.available,
                    isNextAvailable: isFullHourAvailable,
                    attendees: slotData.count,
                    conflictType: slotData.blockReason || (!slotData.available ? 'Full' : undefined)
                });

                currentTime = addMinutes(currentTime, 15);
            }

            setAvailableSlots(slots);
        } catch (error) {
            console.error('Error fetching availability:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to load available slots.',
                isError: true
            });
        } finally {
            setLoading(false);
        }
    };

    const handleBookSlot = async (slot: { time: Date; available: boolean; isNextAvailable: boolean; attendees: number; }) => {
        if (!user) return;

        let duration = 60;
        if (!slot.isNextAvailable) {
            duration = 15;
            setAlertConfig({
                visible: true,
                title: 'Limited Availability',
                message: 'Due to capacity limits, you can only book a 15-minute session at this time. Would you like to proceed?',
                onConfirm: undefined,
            });
            // Hack to store the action since state updates are async
            setAlertConfig(prev => ({ ...prev, onConfirm: () => confirmBooking(slot.time, duration) }));
            return;
        }

        setAlertConfig({
            visible: true,
            title: 'Confirm Booking',
            message: `Book gym session at ${format(slot.time, 'HH:mm')} for 1 hour?`,
            onConfirm: () => confirmBooking(slot.time, duration)
        });
    };

    const confirmBooking = async (startTime: Date, durationMinutes: number) => {
        if (!user) return;
        setBookingLoading(true);
        try {
            const endTime = addMinutes(startTime, durationMinutes);
            await createBooking({
                userId: user.uid,
                startTime,
                endTime,
                type: 'gym',
                status: 'confirmed'
            });

            setAlertConfig({
                visible: true,
                title: 'Success!',
                message: 'Your gym session has been booked.',
                isSuccess: true,
                onConfirm: undefined
            });
            fetchAvailability(); // Refresh slots
        } catch (error) {
            console.error('Error booking slot:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to complete booking. Please try again.',
                isError: true
            });
        } finally {
            setBookingLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Book Gym Session</Text>
                <Text style={styles.subtitle}>Select a date and time</Text>
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
                                <Text style={[styles.dayText, isSelected && styles.textSelected]}>
                                    {format(date, 'EEE')}
                                </Text>
                                <Text style={[styles.dateText, isSelected && styles.textSelected]}>
                                    {format(date, 'd')}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            <ScrollView contentContainerStyle={styles.slotsContainer}>
                {loading ? (
                    <ActivityIndicator size="large" color="#F26122" style={{ marginTop: 50 }} />
                ) : availableSlots.length === 0 ? (
                    <Text style={styles.noSlotsText}>No more slots available for this day.</Text>
                ) : (
                    <View style={styles.slotsGrid}>
                        {availableSlots.map((slot, index) => (
                            <TouchableOpacity
                                key={index}
                                style={[
                                    styles.slotCard,
                                    !slot.available && styles.slotCardUnavailable
                                ]}
                                disabled={!slot.available || bookingLoading}
                                onPress={() => handleBookSlot(slot)}
                            >
                                <Text style={[
                                    styles.slotTime,
                                    !slot.available && styles.slotTextUnavailable
                                ]}>
                                    {format(slot.time, 'HH:mm')}
                                </Text>
                                {slot.available && (
                                    <View style={{ alignItems: 'center' }}>
                                        <Text style={styles.slotDuration}>
                                            {slot.isNextAvailable ? '1 Hour' : '15 Mins'}
                                        </Text>
                                        <Text style={styles.slotAttendees}>
                                            {slot.attendees} / 4 Booked
                                        </Text>
                                    </View>
                                )}
                                {!slot.available && (
                                    <View style={{ alignItems: 'center' }}>
                                        <Text style={styles.slotFullText}>{slot.conflictType || 'Full'}</Text>
                                        {!slot.conflictType || slot.conflictType === 'Full' ? (
                                            <Text style={styles.slotAttendees}>
                                                {slot.attendees} / 4 Booked
                                            </Text>
                                        ) : null}
                                    </View>
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </ScrollView>

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                onClose={() => {
                    closeAlert();
                    if (alertConfig.isSuccess) {
                        router.push('/(tabs)');
                    }
                }}
                onConfirm={alertConfig.onConfirm}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a', // Thrive Darkest Charcoal
    },
    header: {
        padding: 20,
        backgroundColor: '#121212', // Thrive Dark Charcoal
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 90, 0, 0.1)', // Subtle orange border
    },
    title: {
        fontSize: 24,
        fontWeight: '800', // Match website headers
        color: '#ffffff',
    },
    subtitle: {
        fontSize: 16,
        color: '#a3a3a3', // text-secondary from website
        marginTop: 5,
    },
    dateSelectorContainer: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
        backgroundColor: '#0a0a0a',
    },
    dateSelector: {
        padding: 15,
        gap: 10,
    },
    dateCard: {
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderRadius: 16, // --radius-md
        backgroundColor: 'rgba(30, 20, 15, 0.4)', // glass-panel background
        borderWidth: 1,
        borderColor: 'rgba(255, 90, 0, 0.1)',
        alignItems: 'center',
        minWidth: 60,
    },
    dateCardSelected: {
        backgroundColor: '#FF5A00', // True Thrive Orange
        borderColor: '#FF5A00',
    },
    dayText: {
        fontSize: 12,
        color: '#a3a3a3',
        textTransform: 'uppercase',
        fontWeight: '600',
    },
    dateText: {
        fontSize: 18,
        fontWeight: '800',
        color: '#ffffff',
        marginTop: 2,
    },
    textSelected: {
        color: '#ffffff',
    },
    slotsContainer: {
        padding: 20,
    },
    slotsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        justifyContent: 'space-between',
    },
    slotCard: {
        width: '31%', // 3 columns
        backgroundColor: '#121212',
        padding: 15,
        borderRadius: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    slotCardUnavailable: {
        backgroundColor: 'rgba(18, 18, 18, 0.5)',
        borderColor: 'rgba(255, 255, 255, 0.02)',
        opacity: 0.5,
    },
    slotTime: {
        fontSize: 16,
        fontWeight: '700',
        color: '#ffffff',
    },
    slotTextUnavailable: {
        color: '#737373', // text-muted
        textDecorationLine: 'line-through',
    },
    slotDuration: {
        fontSize: 12,
        color: '#FF5A00',
        marginTop: 4,
        fontWeight: 'bold',
    },
    slotFullText: {
        fontSize: 12,
        color: '#ef4444', // Red for full
        marginTop: 4,
        fontWeight: '600',
    },
    slotAttendees: {
        fontSize: 12,
        color: '#737373', // text-muted
        fontWeight: '500',
        marginTop: 4,
    },
    noSlotsText: {
        textAlign: 'center',
        color: '#a3a3a3',
        fontSize: 16,
        marginTop: 50,
    }
});
