import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/auth';
import { getGymBookingsForDate, getPTBookingsForDate, checkSlotAvailability, createBooking, getUserProfile, UserProfile, getPersonAllBookingsForDate, getClientsForPt, Booking } from '../../services/bookingService';
import { format, addDays, startOfDay, addMinutes, setHours, setMinutes, isBefore } from 'date-fns';
import { useRouter, useFocusEffect } from 'expo-router';
import CustomAlert from '../../components/CustomAlert';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, bookingTypeColor } from '@/constants/theme';
import { BOOKING_WINDOW_DAYS } from '@/constants/config';
import { ScreenHeader, EmptyState, DateStrip, SlotList, SlotItem } from '@/components/ui';

const GYM_OPEN_HOUR = 7;
const GYM_CLOSE_HOUR = 20;

export default function GymBookingScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];

    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [profileLoading, setProfileLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
    const [availableSlots, setAvailableSlots] = useState<{ time: Date; available: boolean; isNextAvailable: boolean; attendees: number; conflictType?: string; conflictBookingId?: string; conflictBookingType?: string; }[]>([]);
    const [loading, setLoading] = useState(false);
    const [bookingLoading, setBookingLoading] = useState(false);

    // Custom Alert State
    const [alertConfig, setAlertConfig] = useState<{
        visible: boolean;
        title: string;
        message: string;
        isError?: boolean;
        isSuccess?: boolean;
        confirmText?: string;
        onConfirm?: () => void;
    }>({ visible: false, title: '', message: '' });

    const closeAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));

    // Generate the next BOOKING_WINDOW_DAYS days for the selector
    const dates = useMemo(() => Array.from({ length: BOOKING_WINDOW_DAYS }).map((_, i) => addDays(startOfDay(new Date()), i)), []);

    useEffect(() => {
        if (user) {
            getUserProfile(user.uid).then(profile => {
                setUserProfile(profile);
                setProfileLoading(false);
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    useEffect(() => {
        fetchAvailability();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate]);

    useFocusEffect(useCallback(() => {
        fetchAvailability();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate, userProfile]));

    const fetchAvailability = async () => {
        setLoading(true);
        try {
            const bookingsForDay = await getGymBookingsForDate(selectedDate);

            let userMyBookings: Booking[] = [];

            // If the user happens to have instructional PT bookings, block them out too
            if (user?.uid) {
                const instructorBookings = await getPTBookingsForDate(selectedDate, user.uid);
                if (instructorBookings.length > 0) {
                    // Build a userId→firstName map from the PT's client list for labelling
                    const clients = userProfile?.role === 'pt' || userProfile?.role === 'admin'
                        ? await getClientsForPt(user.uid)
                        : [];
                    const clientNameMap: Record<string, string> = {};
                    clients.forEach(c => { clientNameMap[c.id] = c.name?.split(' ')[0] || 'Client'; });

                    // Group sessions by start time to handle paired workouts
                    const groupedPT = new Map<number, Booking[]>();
                    instructorBookings.forEach(b => {
                        const time = b.startTime.getTime();
                        if (!groupedPT.has(time)) groupedPT.set(time, []);
                        groupedPT.get(time)!.push(b);
                    });

                    groupedPT.forEach((sessions, time) => {
                        const names = sessions.map(s => s.userId ? clientNameMap[s.userId] : 'Client').filter(n => n);
                        let baseName = 'PT Session';
                        if (names.length === 1) {
                            baseName = `PT Session with ${names[0]}`;
                        } else if (names.length > 1) {
                            baseName = `PT Session with ${names[0]} and ${names[1]}`;
                        }

                        const isPending = sessions.some(s => s.status === 'pending');
                        const reason = isPending ? `${baseName} (Pending)` : baseName;

                        // Push one block representing the group
                        bookingsForDay.push({ ...sessions[0], type: 'block', reason });
                    });
                }

                // Add the user's personal bookings (confirmed + pending) as blocks so they can't double book
                const myBookings = await getPersonAllBookingsForDate(user.uid, selectedDate);
                userMyBookings = myBookings;
                myBookings.forEach(b => {
                    let reason = 'Booked';
                    if (b.type === 'pt' && b.status === 'pending') reason = 'PT Request Pending';
                    else if (b.type === 'pt') reason = 'PT Session';
                    else if (b.type === 'gym') reason = 'Gym Session';
                    else if (b.type === 'group') reason = 'Group Class';
                    bookingsForDay.push({ ...b, type: 'block', reason });
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

                const targetSlotEnd = addMinutes(currentTime, 15);
                const myConflict = userMyBookings.find(b => b.startTime < targetSlotEnd && b.endTime > currentTime);
                const generalBlock = bookingsForDay.find(b => b.type === 'block' && b.startTime < targetSlotEnd && b.endTime > currentTime);
                const conflictBookingId = myConflict?.id || (generalBlock ? 'admin-block' : undefined);
                const conflictBookingType = myConflict?.type || generalBlock?.type;

                slots.push({
                    time: currentTime,
                    available: slotData.available,
                    isNextAvailable: isFullHourAvailable,
                    attendees: slotData.count,
                    conflictType: slotData.blockReason || (!slotData.available ? 'Full' : undefined),
                    conflictBookingId,
                    conflictBookingType
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

    // PT sessions are requested from the PT screen — this screen books gym slots only
    const handleBookSlot = async (slot: { time: Date; available: boolean; isNextAvailable: boolean; attendees: number }) => {
        if (!user || !userProfile) return;

        const duration = slot.isNextAvailable ? 60 : 15;

        if (!slot.isNextAvailable) {
            setAlertConfig({
                visible: true,
                title: 'Limited Availability',
                message: 'Due to capacity limits, you can only book a 15-minute session at this time. Would you like to proceed?',
                onConfirm: () => confirmGymBooking(slot.time, duration),
            });
            return;
        }

        setAlertConfig({
            visible: true,
            title: 'Confirm Booking',
            message: `Book gym session at ${format(slot.time, 'HH:mm')} for 1 hour?`,
            onConfirm: () => confirmGymBooking(slot.time, duration),
        });
    };

    const confirmGymBooking = async (startTime: Date, durationMinutes: number) => {
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
            fetchAvailability();
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

    const canGym = userProfile?.canBookGym ?? true;
    const isGated = !profileLoading && !canGym;

    const slotItems: SlotItem[] = availableSlots.map(slot => {
        const groupColor = slot.conflictBookingId === 'admin-block' ? theme.textTertiary : bookingTypeColor(theme, slot.conflictBookingType);
        if (!slot.available) {
            return {
                key: slot.time.toISOString(),
                time: slot.time,
                title: slot.conflictType === 'Full' ? 'Full' : (slot.conflictType || 'Unavailable'),
                tone: slot.conflictType === 'Full' ? 'danger' : 'muted',
                available: false,
                groupId: slot.conflictBookingId,
                groupColor,
            };
        }
        return {
            key: slot.time.toISOString(),
            time: slot.time,
            title: slot.isNextAvailable ? `Until ${format(addMinutes(slot.time, 60), 'HH:mm')}` : '15 minutes only',
            tone: slot.isNextAvailable ? 'default' : 'warning',
            meta: slot.attendees > 0 ? `${slot.attendees}/4 booked` : undefined,
            available: true,
            groupId: slot.conflictBookingId,
            groupColor,
        };
    });

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={styles.headerContainer}>
                <ScreenHeader title="Book the Gym" subtitle="Pick a start time — sessions are an hour" onBack={() => router.navigate('/')} backLabel="Dashboard" />
            </View>

            {!isGated && <DateStrip dates={dates} selectedDate={selectedDate} onSelect={setSelectedDate} />}

            {isGated ? (
                <View style={styles.gatedContainer}>
                    <EmptyState
                        icon="lock-closed-outline"
                        title="Gym access needed"
                        subtitle="Ask your PT to turn on gym access. You can still book 1-to-1 sessions from the PT screen."
                    />
                </View>
            ) : (
                <ScrollView contentContainerStyle={styles.slotsContainer}>
                    {loading || profileLoading ? (
                        <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 50 }} />
                    ) : slotItems.length === 0 ? (
                        <EmptyState icon="time-outline" title="No times left today" subtitle="Pick another day above." />
                    ) : (
                        <SlotList
                            slots={slotItems}
                            disabled={bookingLoading}
                            onPress={item => {
                                const slot = availableSlots.find(s => s.time.getTime() === item.time.getTime());
                                if (slot) handleBookSlot(slot);
                            }}
                        />
                    )}
                </ScrollView>
            )}

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                confirmText={alertConfig.confirmText}
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
    headerContainer: {
        paddingHorizontal: Spacing.xl,
    },
    slotsContainer: {
        padding: Spacing.xl,
        paddingBottom: Spacing.huge,
    },
    gatedContainer: {
        flex: 1,
        justifyContent: 'center',
        padding: Spacing.xl,
    },
});
