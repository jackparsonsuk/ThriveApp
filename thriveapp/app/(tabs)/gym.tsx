import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/auth';
import { getGymBookingsForDate, getPTBookingsForDate, getUserBookingsForDate, checkSlotAvailability, createBooking } from '../../services/bookingService';
import { format, addDays, startOfDay, addMinutes, setHours, setMinutes, isBefore } from 'date-fns';
import { useRouter } from 'expo-router';
import CustomAlert from '../../components/CustomAlert';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii } from '@/constants/theme';

const GYM_OPEN_HOUR = 7;
const GYM_CLOSE_HOUR = 20;

export default function GymBookingScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                <Text style={[styles.title, { color: theme.text }]}>Gym Session</Text>
                <Text style={styles.subtitle}>Select a date and time to train</Text>
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
                                    isSelected && styles.dateCardSelected,
                                ]}
                                onPress={() => setSelectedDate(date)}
                            >
                                <Text style={[
                                    styles.dayText,
                                    { color: isSelected ? '#fff' : theme.icon }
                                ]}>
                                    {format(date, 'EEE')}
                                </Text>
                                <Text style={[
                                    styles.dateText,
                                    { color: isSelected ? '#fff' : theme.text }
                                ]}>
                                    {format(date, 'd')}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            <ScrollView contentContainerStyle={styles.slotsContainer}>
                {loading ? (
                    <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 50 }} />
                ) : availableSlots.length === 0 ? (
                    <Text style={[styles.noSlotsText, { color: theme.icon }]}>No more slots available for this day.</Text>
                ) : (
                    <View style={[styles.slotsList, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        {availableSlots.map((slot, index) => {
                            const isLast = index === availableSlots.length - 1;
                            return (
                                <View key={index}>
                                    <TouchableOpacity
                                        style={[
                                            styles.slotRow,
                                            !slot.available && styles.slotRowUnavailable
                                        ]}
                                        disabled={!slot.available || bookingLoading}
                                        onPress={() => handleBookSlot(slot)}
                                    >
                                        <View style={styles.slotTimeContainer}>
                                            <Text style={[
                                                styles.slotTime,
                                                { color: slot.available ? theme.text : theme.icon },
                                                !slot.available && styles.slotTextUnavailable
                                            ]}>
                                                {format(slot.time, 'HH:mm')}
                                            </Text>
                                        </View>

                                        <View style={styles.slotDetailsContainer}>
                                            {slot.available ? (
                                                <>
                                                    <Text style={[styles.slotDuration, { color: theme.tint }]}>
                                                        {slot.isNextAvailable ? '1 Hour' : '15 Mins'}
                                                    </Text>
                                                    <Text style={[styles.slotAttendees, { color: theme.icon }]}>
                                                        {slot.attendees} / 4 Booked
                                                    </Text>
                                                </>
                                            ) : (
                                                <>
                                                    <Text style={[styles.slotFullText, { color: slot.conflictType === 'Full' ? '#FF3B30' : theme.icon }]}>
                                                        {slot.conflictType || 'Full'}
                                                    </Text>
                                                </>
                                            )}
                                        </View>

                                        <View style={styles.slotChevron}>
                                            {slot.available && (
                                                <Ionicons name="chevron-forward" size={20} color={theme.icon} opacity={0.5} />
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                    {!isLast && <View style={[styles.separator, { backgroundColor: theme.border }]} />}
                                </View>
                            );
                        })}
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
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 20,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    title: {
        fontSize: 34,
        fontWeight: '700', // iOS large title weight
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 15,
        color: '#8E8E93',
        marginTop: 4,
    },
    dateSelectorContainer: {
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    dateSelector: {
        paddingHorizontal: 15,
        paddingVertical: 12,
        gap: 8,
    },
    dateCard: {
        paddingVertical: 10,
        paddingHorizontal: 8,
        borderRadius: Radii.pill,
        alignItems: 'center',
        minWidth: 54,
    },
    dateCardSelected: {
        // Shadow for the selected pill
        shadowColor: '#F26122',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    dayText: {
        fontSize: 11,
        textTransform: 'uppercase',
        fontWeight: '600',
        marginBottom: 4,
    },
    dateText: {
        fontSize: 20,
        fontWeight: '500',
    },
    slotsContainer: {
        padding: 16,
        paddingBottom: 40,
    },
    slotsList: {
        borderRadius: Radii.lg,
        borderWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden',
    },
    slotRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    slotRowUnavailable: {
        opacity: 0.6,
        backgroundColor: 'rgba(0,0,0,0.02)', // Subtle highlight for disabled inside light card
    },
    slotTimeContainer: {
        width: 70,
    },
    slotTime: {
        fontSize: 17,
        fontWeight: '600',
        letterSpacing: -0.4,
    },
    slotTextUnavailable: {
        textDecorationLine: 'line-through',
    },
    slotDetailsContainer: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingRight: 10,
    },
    slotDuration: {
        fontSize: 15,
        fontWeight: '600',
    },
    slotAttendees: {
        fontSize: 14,
        fontWeight: '400',
    },
    slotFullText: {
        fontSize: 15,
        fontWeight: '500',
    },
    slotChevron: {
        width: 20,
        alignItems: 'flex-end',
    },
    separator: {
        height: StyleSheet.hairlineWidth,
        marginLeft: 16, // iOS style inset separator
    },
    noSlotsText: {
        textAlign: 'center',
        fontSize: 16,
        marginTop: 50,
    }
});
