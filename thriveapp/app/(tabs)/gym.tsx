import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/auth';
import { getGymBookingsForDate, getPTBookingsForDate, checkSlotAvailability, createBooking, getUserProfile, UserProfile, getPersonAllBookingsForDate, getClientsForPt, Booking } from '../../services/bookingService';
import { format, addDays, startOfDay, addMinutes, setHours, setMinutes, isBefore } from 'date-fns';
import { useRouter, useFocusEffect } from 'expo-router';
import CustomAlert from '../../components/CustomAlert';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii } from '@/constants/theme';
import { BOOKING_WINDOW_DAYS } from '@/constants/config';
import { useMouseDragScroll } from '@/hooks/useMouseDragScroll';

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
    const [availableSlots, setAvailableSlots] = useState<{ time: Date; available: boolean; isNextAvailable: boolean; attendees: number; conflictType?: string; ptAvailable: boolean; ptOccupied?: boolean; conflictBookingId?: string; conflictBookingType?: string; }[]>([]);
    const [loading, setLoading] = useState(false);
    const [bookingLoading, setBookingLoading] = useState(false);
    const flatListRef = useRef<FlatList>(null);
    const [hasInitialScrolled, setHasInitialScrolled] = useState(false);
    const { onScroll, dragProps } = useMouseDragScroll(flatListRef);

    // Custom Alert State
    const [alertConfig, setAlertConfig] = useState<{
        visible: boolean;
        title: string;
        message: string;
        isError?: boolean;
        isSuccess?: boolean;
        confirmText?: string;
        onConfirm?: () => void;
        secondaryConfirmText?: string;
        onSecondaryConfirm?: () => void;
    }>({ visible: false, title: '', message: '' });

    const closeAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));

    // Generate the next BOOKING_WINDOW_DAYS days for the selector
    const dates = Array.from({ length: BOOKING_WINDOW_DAYS }).map((_, i) => addDays(startOfDay(new Date()), i));

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

    useEffect(() => {
        const index = dates.findIndex(d => d.getTime() === selectedDate.getTime());
        if (index !== -1 && (index > 0 || hasInitialScrolled)) {
            const timer = setTimeout(() => {
                flatListRef.current?.scrollToIndex({ 
                    index, 
                    animated: true, 
                    viewPosition: 0.5 
                });
                setHasInitialScrolled(true);
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [selectedDate]);

    const fetchAvailability = async () => {
        setLoading(true);
        try {
            const bookingsForDay = await getGymBookingsForDate(selectedDate);

            let ptBookingsForDay: Booking[] = [];
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

                // Fetch the assigned PT's full schedule so we know when they're free for PT requests
                if (userProfile?.assignedPtId) {
                    const [ptPersonal, ptSessions] = await Promise.all([
                        getPersonAllBookingsForDate(userProfile.assignedPtId, selectedDate),
                        getPTBookingsForDate(selectedDate, userProfile.assignedPtId),
                    ]);
                    const combined = [...ptPersonal, ...ptSessions];
                    ptBookingsForDay = Array.from(new Map(combined.map(b => [b.id, b])).values());
                }
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

                // PT is available if they have no bookings overlapping the 1-hour PT session window
                const ptSessionEnd = addMinutes(currentTime, 60);
                const ptConflict = ptBookingsForDay.some(b => b.startTime < ptSessionEnd && b.endTime > currentTime);
                const ptAvailable = !ptConflict;
                
                // PT is occupied exactly at this 15 minute slot (to distinguish from simply not having a full 60min window)
                const targetSlotEnd = addMinutes(currentTime, 15);
                const ptOccupied = ptBookingsForDay.some(b => b.startTime < targetSlotEnd && b.endTime > currentTime);

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
                    ptAvailable,
                    ptOccupied,
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

    const handleBookSlot = async (slot: { time: Date; available: boolean; isNextAvailable: boolean; attendees: number; ptAvailable: boolean; ptOccupied?: boolean }) => {
        if (!user || !userProfile) return;

        const canGym = userProfile.canBookGym ?? true;
        const hasPt = !!userProfile.assignedPtId;
        const duration = slot.isNextAvailable ? 60 : 15;

        if (canGym && hasPt) {
            if (!slot.ptAvailable) {
                // PT is busy — gym only
                setAlertConfig({
                    visible: true,
                    title: 'Book This Slot',
                    message: `Your PT is unavailable at ${format(slot.time, 'HH:mm')}. You can still book a gym session.`,
                    onConfirm: () => confirmGymBooking(slot.time, duration),
                    confirmText: 'Book Gym Session',
                });
                return;
            }
            // Show choice modal
            setAlertConfig({
                visible: true,
                title: 'Book This Slot',
                message: `What would you like to book at ${format(slot.time, 'HH:mm')}?`,
                onConfirm: () => confirmGymBooking(slot.time, duration),
                secondaryConfirmText: 'Request PT Session',
                onSecondaryConfirm: () => confirmPTRequest(slot.time),
                confirmText: 'Book Gym Session',
            });
        } else if (canGym && !hasPt) {
            // Standard gym booking
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
        } else if (!canGym && hasPt) {
            if (!slot.ptAvailable) {
                setAlertConfig({
                    visible: true,
                    title: 'PT Unavailable',
                    message: `Your PT already has a booking at ${format(slot.time, 'HH:mm')}. Please choose another time.`,
                    isError: true,
                });
                return;
            }
            // PT request only
            setAlertConfig({
                visible: true,
                title: 'Request PT Session',
                message: `Send a PT session request for ${format(slot.time, 'HH:mm')}?`,
                onConfirm: () => confirmPTRequest(slot.time),
            });
        }
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

    const confirmPTRequest = async (startTime: Date) => {
        if (!user || !userProfile?.assignedPtId) return;
        setBookingLoading(true);
        try {
            const endTime = addMinutes(startTime, 60);
            await createBooking({
                userId: user.uid,
                startTime,
                endTime,
                type: 'pt',
                ptId: userProfile.assignedPtId,
                status: 'pending'
            });
            setAlertConfig({
                visible: true,
                title: 'Request Sent!',
                message: 'PT session request sent — your PT will confirm it shortly.',
                isSuccess: true,
                onConfirm: undefined
            });
            fetchAvailability();
        } catch (error) {
            console.error('Error sending PT request:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to send PT request. Please try again.',
                isError: true
            });
        } finally {
            setBookingLoading(false);
        }
    };

    const canGym = userProfile?.canBookGym ?? true;
    const hasPt = !!userProfile?.assignedPtId;
    const isGated = !profileLoading && !canGym && !hasPt;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                <Text style={[styles.title, { color: theme.text }]}>Gym Session</Text>
                <Text style={styles.subtitle}>Select a date and time to train</Text>
            </View>

            <View 
                style={[styles.dateSelectorContainer, { backgroundColor: theme.background, borderBottomColor: theme.border }, isGated && { display: 'none' }]}
                {...dragProps}
            >
                <FlatList
                    ref={flatListRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.dateSelector}
                    data={dates}
                    keyExtractor={(_, index) => index.toString()}
                    onScroll={onScroll}
                    scrollEventThrottle={16}
                    getItemLayout={(_, index) => ({
                        length: 62, // minWidth (54) + gap (8)
                        offset: 62 * index,
                        index,
                    })}
                    onScrollToIndexFailed={(info) => {
                        setTimeout(() => {
                            flatListRef.current?.scrollToIndex({ index: info.index, animated: false });
                        }, 100);
                    }}
                    renderItem={({ item: date }) => {
                        const isSelected = selectedDate.getTime() === date.getTime();
                        return (
                            <TouchableOpacity
                                style={[
                                    styles.dateCard,
                                    { backgroundColor: isSelected ? theme.tint : 'transparent' },
                                    isSelected && styles.dateCardSelected,
                                ]}
                                onPress={() => setSelectedDate(date)}
                            >
                                <Text style={[styles.dayText, { color: isSelected ? '#fff' : theme.icon }]}>
                                    {format(date, 'EEE')}
                                </Text>
                                <Text style={[styles.dateText, { color: isSelected ? '#fff' : theme.text }]}>
                                    {format(date, 'd')}
                                </Text>
                            </TouchableOpacity>
                        );
                    }}
                />
            </View>

            {isGated ? (
                <View style={styles.gatedContainer}>
                    <Ionicons name="lock-closed-outline" size={48} color={theme.icon} />
                    <Text style={[styles.gatedText, { color: theme.text }]}>Gym Access Required</Text>
                    <Text style={[styles.gatedSubText, { color: theme.icon }]}>Contact your PT to gain access or book a session.</Text>
                </View>
            ) : null}

            <ScrollView contentContainerStyle={styles.slotsContainer} style={isGated ? { display: 'none' } : undefined}>
                {loading || profileLoading ? (
                    <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 50 }} />
                ) : availableSlots.length === 0 ? (
                    <Text style={[styles.noSlotsText, { color: theme.icon }]}>No more slots available for this day.</Text>
                ) : (
                    <View style={[styles.slotsList, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        {availableSlots.map((slot, index) => {
                            const isLast = index === availableSlots.length - 1;

                            // Grouping outline logic
                            const hasGroup = !!slot.conflictBookingId;
                            const prevSlot = hasGroup && index > 0 ? availableSlots[index - 1] : null;
                            const nextSlot = hasGroup && index < availableSlots.length - 1 ? availableSlots[index + 1] : null;

                            const isFirstInBlock = hasGroup && prevSlot?.conflictBookingId !== slot.conflictBookingId;
                            const isLastInBlock = hasGroup && nextSlot?.conflictBookingId !== slot.conflictBookingId;
                            const isMiddleInBlock = hasGroup && !isFirstInBlock && !isLastInBlock;

                            let outlineStyle: any = {};
                            if (hasGroup) {
                                const bookingColors: Record<string, string> = { 
                                    pt_block: theme.tint, 
                                    pt: '#10B981', 
                                    gym: '#3B82F6', 
                                    group: '#8B5CF6', 
                                    block: '#64748B' 
                                };
                                const groupColor = bookingColors[slot.conflictBookingType ?? ''] || theme.tint;

                                outlineStyle = {
                                    borderColor: groupColor,
                                    borderLeftWidth: 2,
                                    borderRightWidth: 2,
                                };
                                if (isFirstInBlock) {
                                    outlineStyle.borderTopWidth = 2;
                                    outlineStyle.borderTopLeftRadius = 8;
                                    outlineStyle.borderTopRightRadius = 8;
                                    outlineStyle.marginTop = 4;
                                }
                                if (isLastInBlock) {
                                    outlineStyle.borderBottomWidth = 2;
                                    outlineStyle.borderBottomLeftRadius = 8;
                                    outlineStyle.borderBottomRightRadius = 8;
                                    outlineStyle.marginBottom = 4;
                                }
                            }

                            return (
                                <View key={index}>
                                    <TouchableOpacity
                                        style={[
                                            styles.slotRow,
                                            !slot.available && styles.slotRowUnavailable,
                                            outlineStyle
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
                                                    <View style={styles.slotRightInfo}>
                                                        {!slot.ptAvailable && hasPt && (
                                                            <Text style={[styles.ptBusyBadge, { color: theme.icon }]}>
                                                                {slot.ptOccupied ? 'PT Busy' : 'PT < 1hr Free'}
                                                            </Text>
                                                        )}
                                                        <Text style={[styles.slotAttendees, { color: theme.icon }]}>
                                                            {slot.attendees} / 4 Booked
                                                        </Text>
                                                    </View>
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
                                    {(!isLast && !(hasGroup && !isLastInBlock)) && <View style={[styles.separator, { backgroundColor: theme.border }]} />}
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
                confirmText={alertConfig.confirmText}
                secondaryConfirmText={alertConfig.secondaryConfirmText}
                onSecondaryConfirm={alertConfig.onSecondaryConfirm}
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
    slotRightInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    ptBusyBadge: {
        fontSize: 12,
        fontWeight: '500',
        opacity: 0.6,
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
    },
    gatedContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        marginTop: 60,
    },
    gatedText: {
        fontSize: 20,
        fontWeight: '700',
        marginTop: 16,
        marginBottom: 8,
        textAlign: 'center',
    },
    gatedSubText: {
        fontSize: 15,
        textAlign: 'center',
        lineHeight: 22,
    },
});
