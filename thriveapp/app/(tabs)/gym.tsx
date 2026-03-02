import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/auth';
import { getGymBookingsForDate, checkSlotAvailability, createBooking, Booking } from '../../services/bookingService';
import { format, addDays, startOfDay, addMinutes, setHours, setMinutes, isBefore } from 'date-fns';
import { useRouter } from 'expo-router';
import CustomAlert from '../../components/CustomAlert';

const GYM_OPEN_HOUR = 6;
const GYM_CLOSE_HOUR = 22;

export default function GymBookingScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
    const [availableSlots, setAvailableSlots] = useState<{ time: Date; available: boolean; isNextAvailable: boolean }[]>([]);
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

            const slots = [];
            let currentTime = setMinutes(setHours(selectedDate, GYM_OPEN_HOUR), 0);
            const endTime = setMinutes(setHours(selectedDate, GYM_CLOSE_HOUR), 0);
            const now = new Date();

            while (currentTime < endTime) {
                // Only show future slots for today
                if (isBefore(currentTime, now)) {
                    currentTime = addMinutes(currentTime, 30);
                    continue;
                }

                const isAvailable = checkSlotAvailability(currentTime, bookingsForDay);

                // Peek at next 30 min slot to see if 1 hour booking is possible
                const nextSlotStart = addMinutes(currentTime, 30);
                const isNextAvailable = checkSlotAvailability(nextSlotStart, bookingsForDay);

                slots.push({
                    time: currentTime,
                    available: isAvailable,
                    isNextAvailable: isNextAvailable,
                });

                currentTime = addMinutes(currentTime, 30);
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

    const handleBookSlot = async (slot: { time: Date; available: boolean; isNextAvailable: boolean }) => {
        if (!user) return;

        let duration = 60;
        if (!slot.isNextAvailable) {
            duration = 30;
            setAlertConfig({
                visible: true,
                title: 'Limited Availability',
                message: 'Due to capacity limits, you can only book a 30-minute session at this time. Would you like to proceed?',
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
                                    <Text style={styles.slotDuration}>
                                        {slot.isNextAvailable ? '1 Hour' : '30 Mins'}
                                    </Text>
                                )}
                                {!slot.available && (
                                    <Text style={styles.slotFullText}>Full</Text>
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
        backgroundColor: '#fff',
    },
    header: {
        padding: 20,
        backgroundColor: '#333', // Thrive Charcoal
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
    },
    subtitle: {
        fontSize: 16,
        color: '#ccc',
        marginTop: 5,
    },
    dateSelectorContainer: {
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        backgroundColor: '#f9f9f9',
    },
    dateSelector: {
        padding: 15,
        gap: 10,
    },
    dateCard: {
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderRadius: 8,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#ddd',
        alignItems: 'center',
        minWidth: 60,
    },
    dateCardSelected: {
        backgroundColor: '#F26122', // Thrive Orange
        borderColor: '#F26122',
    },
    dayText: {
        fontSize: 12,
        color: '#666',
        textTransform: 'uppercase',
    },
    dateText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
        marginTop: 2,
    },
    textSelected: {
        color: '#fff',
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
        backgroundColor: '#f0f0f0',
        padding: 15,
        borderRadius: 8,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#e0e0e0',
    },
    slotCardUnavailable: {
        backgroundColor: '#f5f5f5',
        opacity: 0.5,
    },
    slotTime: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
    },
    slotTextUnavailable: {
        color: '#999',
        textDecorationLine: 'line-through',
    },
    slotDuration: {
        fontSize: 12,
        color: '#F26122',
        marginTop: 4,
        fontWeight: 'bold',
    },
    slotFullText: {
        fontSize: 12,
        color: '#d32f2f',
        marginTop: 4,
    },
    noSlotsText: {
        textAlign: 'center',
        color: '#666',
        fontSize: 16,
        marginTop: 50,
    }
});
