import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/auth';
import { getUserProfile, getPTBookingsForDate, createBooking, UserProfile, getAllPTs, assignClientToPt, getClientsForPt, getUserBookingsForDate, createRecurringSession, getGymBookingsForDate, checkSlotAvailability } from '../../services/bookingService';
import { format, addDays, startOfDay, addMinutes, setHours, setMinutes, isBefore } from 'date-fns';
import { useRouter } from 'expo-router';
import CustomAlert from '../../components/CustomAlert';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii } from '@/constants/theme';
import * as Clipboard from 'expo-clipboard';

// Assuming PT operating hours
const PT_OPEN_HOUR = 7;
const PT_CLOSE_HOUR = 20;

const SectionDivider = ({ theme }: { theme: any }) => (
    <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginVertical: 30, marginHorizontal: 20 }} />
);

export default function PTBookingScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
    const [availableSlots, setAvailableSlots] = useState<{ time: Date; available: boolean; attendees: number }[]>([]);
    const [loading, setLoading] = useState(true);
    const [bookingLoading, setBookingLoading] = useState(false);
    const [recurringFrequency, setRecurringFrequency] = useState<'none' | 'weekly' | 'bi-weekly' | 'monthly'>('none');

    // PT Assignment State
    const [ptCodeInput, setPtCodeInput] = useState('');
    const [assigningLoading, setAssigningLoading] = useState(false);

    // PT's Clients State
    const [clients, setClients] = useState<UserProfile[]>([]);
    const [clientsLoading, setClientsLoading] = useState(false);
    const [selectedClientForBooking, setSelectedClientForBooking] = useState<UserProfile | null>(null);

    // Client's Assigned PT State
    const [assignedPtData, setAssignedPtData] = useState<UserProfile | null>(null);

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
        if (user) {
            loadUserProfile();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    useEffect(() => {
        if (userProfile && userProfile.assignedPtId) {
            fetchAssignedPt(userProfile.assignedPtId);
        }

        if (userProfile?.role === 'pt' && user?.uid) {
            fetchClients(user.uid);
            if (selectedClientForBooking) {
                // If PT is booking for a client, check the PT's own availability
                fetchAvailability(user.uid);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate, userProfile, user, selectedClientForBooking]);

    const loadUserProfile = async () => {
        if (!user) return;
        try {
            const profile = await getUserProfile(user.uid);
            setUserProfile(profile);
            if (!profile?.assignedPtId && profile?.role === 'client') {
                setLoading(false); // Stop loading if no PT assigned
            }
        } catch (error) {
            console.error('Error fetching user profile:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to load user profile.',
                isError: true
            });
            setLoading(false);
        }
    };

    const fetchClients = async (ptId: string) => {
        setClientsLoading(true);
        try {
            const ptsClients = await getClientsForPt(ptId);
            setClients(ptsClients);
        } catch (error) {
            console.error('Error fetching clients:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to load your clients.',
                isError: true
            });
        } finally {
            setClientsLoading(false);
        }
    };

    const fetchAssignedPt = async (ptId: string) => {
        setLoading(true);
        try {
            const pts = await getAllPTs();
            const pt = pts.find(p => p.id === ptId);
            if (pt) {
                setAssignedPtData(pt);
            }
        } catch (error) {
            console.error('Error fetching assigned PT profile:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchAvailability = async (ptId: string) => {
        setLoading(true);
        try {
            const bookingsForDay = await getPTBookingsForDate(selectedDate, ptId);

            // If the user wants to book a session with this PT, they shouldn't be able to if THEY are instructing
            if (user?.uid && ptId !== user.uid) {
                const myInstructorBookings = await getPTBookingsForDate(selectedDate, user.uid);
                bookingsForDay.push(...myInstructorBookings);

                // Add the user's personal bookings (PT, group, gym) as blocks
                const myBookings = await getUserBookingsForDate(user.uid, selectedDate);
                bookingsForDay.push(...myBookings);
            }

            const gymBookingsForDay = await getGymBookingsForDate(selectedDate);

            const slots = [];
            let currentTime = setMinutes(setHours(selectedDate, PT_OPEN_HOUR), 0);
            const endTime = setMinutes(setHours(selectedDate, PT_CLOSE_HOUR), 0);
            const now = new Date();

            while (currentTime < endTime) {
                if (isBefore(currentTime, now)) {
                    currentTime = addMinutes(currentTime, 15);
                    continue;
                }

                // For PTs, availability implies NO overlapping bookings at all since it's 1-on-1 (unless group PT)
                // Assume 1 hour session. Thus check if any booking overlaps with [currentTime, currentTime + 60mins]
                const targetEnd = addMinutes(currentTime, 60); // Standard PT session length 1hr
                const overlappingBookings = bookingsForDay.filter(b => {
                    return b.startTime < targetEnd && b.endTime > currentTime;
                });

                const isAvailable = overlappingBookings.length === 0;

                slots.push({
                    time: currentTime,
                    available: isAvailable,
                    attendees: checkSlotAvailability(currentTime, gymBookingsForDay).count
                });

                // Advance by 15 mins for PT slots to allow 15 min increment start times
                currentTime = addMinutes(currentTime, 15);
            }

            setAvailableSlots(slots);
        } catch (error) {
            console.error('Error fetching PT availability:', error);
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

    const handleBookSlot = async (slot: { time: Date; available: boolean }) => {
        const isPtBookingForClient = userProfile?.role === 'pt' && selectedClientForBooking;
        const targetPtId = isPtBookingForClient ? user?.uid : userProfile?.assignedPtId;
        const targetClientName = isPtBookingForClient ? selectedClientForBooking.name : 'you';

        if (!user || !targetPtId) return;

        setAlertConfig({
            visible: true,
            title: 'Confirm PT Booking',
            message: `Book ${recurringFrequency !== 'none' ? recurringFrequency + ' ' : ''}PT session for ${targetClientName} at ${format(slot.time, 'HH:mm')}?`,
            onConfirm: () => confirmBooking(slot.time, targetPtId as string)
        });
    };

    const confirmBooking = async (startTime: Date, ptId: string) => {
        if (!user) return;
        setBookingLoading(true);

        const isPtBookingForClient = userProfile?.role === 'pt' && selectedClientForBooking;
        const targetUserId = isPtBookingForClient ? selectedClientForBooking.id : user.uid;

        try {
            const endTime = addMinutes(startTime, 60);

            if (recurringFrequency === 'none') {
                await createBooking({
                    userId: targetUserId,
                    startTime,
                    endTime,
                    type: 'pt',
                    ptId: ptId,
                    status: 'confirmed'
                });
            } else {
                await createRecurringSession({
                    userId: targetUserId,
                    ptId: ptId,
                    type: 'pt',
                    frequency: recurringFrequency as any,
                    startTime: startTime,
                    endTime: endTime,
                    status: 'active'
                });
            }

            setAlertConfig({
                visible: true,
                title: 'Success!',
                message: isPtBookingForClient ? `Session${recurringFrequency !== 'none' ? 's' : ''} booked for ${selectedClientForBooking.name}.` : 'Your PT session has been booked.',
                isSuccess: true,
                onConfirm: undefined
            });
            fetchAvailability(ptId); // Refresh slots
        } catch (error) {
            console.error('Error booking PT slot:', error);
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

    const handleAssignPT = async () => {
        if (!user || ptCodeInput.trim().length !== 6) {
            setAlertConfig({
                visible: true,
                title: 'Invalid Code',
                message: 'Please enter a valid 6-character PT code.',
                isError: true
            });
            return;
        }

        setAssigningLoading(true);
        try {
            const trimmedInput = ptCodeInput.trim().toUpperCase();
            const pts = await getAllPTs();
            const matchedPt = pts.find(pt => pt.id.substring(0, 6).toUpperCase() === trimmedInput);

            if (matchedPt) {
                if (matchedPt.id === user.uid) {
                    setAlertConfig({
                        visible: true,
                        title: 'Invalid Assignment',
                        message: 'You cannot assign yourself as your own Personal Trainer.',
                        isError: true
                    });
                    setAssigningLoading(false);
                    return;
                }
                await assignClientToPt(user.uid, matchedPt.id);
                // Update the local state to trigger a UI refresh
                setUserProfile(prev => prev ? { ...prev, assignedPtId: matchedPt.id } : null);

                setAlertConfig({
                    visible: true,
                    title: 'PT Assigned!',
                    message: `You are now assigned to ${matchedPt.name || 'your trainer'}.`,
                    isSuccess: true
                });
            } else {
                setAlertConfig({
                    visible: true,
                    title: 'Invalid Code',
                    message: 'We could not find a Personal Trainer with that code.',
                    isError: true
                });
            }
        } catch (error) {
            console.error('Error assigning PT:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Something went wrong. Please try again.',
                isError: true
            });
        } finally {
            setAssigningLoading(false);
        }
    };

    if (userProfile?.role === 'pt' && !selectedClientForBooking) {
        const ptCode = user?.uid ? user.uid.substring(0, 6).toUpperCase() : '------';
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
                <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                    <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                        <Text style={[styles.title, { color: theme.text }]}>Your PT Code</Text>
                        <Text style={[styles.subtitle, { color: theme.icon }]}>Share this with your clients</Text>
                    </View>
                    <View style={[styles.slotsContainer, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10 }}>
                            <View style={[styles.ptCodeCard, { backgroundColor: theme.card, borderColor: theme.tint, shadowColor: theme.tint }]}>
                                <Text style={[styles.ptCodeText, { color: theme.text }]}>{ptCode}</Text>
                            </View>
                            <TouchableOpacity
                                style={{
                                    marginLeft: 15,
                                    padding: 14,
                                    backgroundColor: theme.tint,
                                    borderRadius: Radii.pill,
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    shadowColor: theme.tint,
                                    shadowOffset: { width: 0, height: 4 },
                                    shadowOpacity: 0.3,
                                    shadowRadius: 8,
                                    elevation: 4,
                                }}
                                onPress={async () => {
                                    await Clipboard.setStringAsync(ptCode);
                                    setAlertConfig({
                                        visible: true,
                                        title: 'Copied!',
                                        message: 'Your PT Code has been copied.',
                                        isSuccess: true
                                    });
                                }}
                            >
                                <Ionicons name="copy-outline" size={24} color="#ffffff" />
                            </TouchableOpacity>
                        </View>
                        <Text style={[styles.noPtSubText, { color: theme.icon, textAlign: 'center', marginTop: 25 }]}>
                            Ask your client to enter this 6-character code in their app to automatically assign them to you.
                        </Text>
                    </View>

                    <View style={styles.clientsSection}>
                        <Text style={[styles.clientsTitle, { color: theme.text, borderBottomColor: theme.border }]}>Your Clients</Text>
                        {clientsLoading ? (
                            <ActivityIndicator size="small" color={theme.tint} style={{ marginTop: 20 }} />
                        ) : clients.length > 0 ? (
                            <View style={[styles.groupedList, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                {clients.map((client, index) => {
                                    const isLast = index === clients.length - 1;
                                    return (
                                        <View key={client.id}>
                                            <View style={styles.clientRow}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[styles.clientName, { color: theme.text }]}>{client.name}</Text>
                                                    <Text style={[styles.clientEmail, { color: theme.icon }]}>{client.email}</Text>
                                                </View>
                                                <TouchableOpacity
                                                    style={[styles.bookClientButton, { backgroundColor: theme.tint }]}
                                                    onPress={() => setSelectedClientForBooking(client)}
                                                >
                                                    <Text style={styles.bookClientButtonText}>Book</Text>
                                                </TouchableOpacity>
                                            </View>
                                            {!isLast && <View style={[styles.separator, { backgroundColor: theme.border }]} />}
                                        </View>
                                    );
                                })}
                            </View>
                        ) : (
                            <Text style={[styles.noClientsText, { color: theme.icon }]}>You don't have any clients assigned yet.</Text>
                        )}
                    </View>

                    <SectionDivider theme={theme} />

                    <View style={styles.clientsSection}>
                        <Text style={[styles.clientsTitle, { color: theme.text, borderBottomColor: theme.border }]}>Your Own Training</Text>

                        {userProfile?.assignedPtId ? (
                            assignedPtData ? (
                                <View style={[styles.groupedList, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                    <View style={styles.clientRow}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.clientName, { color: theme.text }]}>Trainer: {assignedPtData.name}</Text>
                                            <Text style={[styles.clientEmail, { color: theme.icon }]}>Your trainer will book your 1-to-1 sessions.</Text>
                                        </View>
                                    </View>
                                </View>
                            ) : (
                                <ActivityIndicator size="small" color={theme.tint} />
                            )
                        ) : (
                            <View>
                                <Text style={[styles.noPtSubText, { color: theme.icon }]}>You don't have a Personal Trainer yet.</Text>
                                <TextInput
                                    style={[styles.codeInput, {
                                        backgroundColor: theme.card,
                                        borderColor: theme.border,
                                        color: theme.text,
                                        fontSize: 22,
                                        padding: 12,
                                        height: 56,
                                        marginTop: 15,
                                        letterSpacing: ptCodeInput.length > 0 ? 6 : 1,
                                    }]}
                                    placeholder="PT Code"
                                    placeholderTextColor={theme.icon}
                                    value={ptCodeInput}
                                    onChangeText={(text) => setPtCodeInput(text.toUpperCase())}
                                    maxLength={6}
                                    autoCapitalize="characters"
                                />
                                <TouchableOpacity
                                    style={[styles.assignButton, { backgroundColor: theme.tint }, (!ptCodeInput || ptCodeInput.length < 6) && { opacity: 0.5 }, { marginTop: 10 }]}
                                    onPress={handleAssignPT}
                                    disabled={!ptCodeInput || ptCodeInput.length < 6 || assigningLoading}
                                >
                                    {assigningLoading ? (
                                        <ActivityIndicator color="#ffffff" />
                                    ) : (
                                        <Text style={styles.assignButtonText}>Assign My PT</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

                    <CustomAlert
                        visible={alertConfig.visible}
                        title={alertConfig.title}
                        message={alertConfig.message}
                        onClose={closeAlert}
                    />
                </ScrollView>
            </SafeAreaView>
        );
    }

    if (userProfile?.role === 'client') {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
                <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                    
                    {!userProfile.assignedPtId ? (
                        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                                <Text style={[styles.title, { color: theme.text }]}>Connect with a PT</Text>
                            </View>
                            <View style={[styles.slotsContainer, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }]}>
                                <Text style={[styles.noPtText, { color: theme.text, textAlign: 'center' }]}>You do not have a Personal Trainer yet.</Text>
                                <Text style={[styles.noPtSubText, { color: theme.icon, textAlign: 'center', marginBottom: 30 }]}>Enter the 6-character code provided by your Thrive Coach.</Text>

                                <TextInput
                                    style={[styles.codeInput, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
                                    placeholder="e.g. A1B2C3"
                                    placeholderTextColor={theme.icon}
                                    value={ptCodeInput}
                                    onChangeText={(text) => setPtCodeInput(text.toUpperCase())}
                                    maxLength={6}
                                    autoCapitalize="characters"
                                />

                                <TouchableOpacity
                                    style={[styles.assignButton, { backgroundColor: theme.tint }, (!ptCodeInput || ptCodeInput.length < 6) && { opacity: 0.5 }]}
                                    onPress={handleAssignPT}
                                    disabled={!ptCodeInput || ptCodeInput.length < 6 || assigningLoading}
                                >
                                    {assigningLoading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.assignButtonText}>Assign My PT</Text>}
                                </TouchableOpacity>
                            </View>
                        </KeyboardAvoidingView>
                    ) : (
                        <View>
                            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                                <Text style={[styles.title, { color: theme.text }]}>Your PT</Text>
                                <Text style={[styles.subtitle, { color: theme.icon }]}>You are connected to a Thrive Coach</Text>
                            </View>

                            {loading ? (
                                <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 50 }} />
                            ) : assignedPtData ? (
                                <View style={[styles.slotsContainer, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, marginTop: 40 }]}>
                                    <Text style={[styles.noPtSubText, { color: theme.icon }]}>You are currently training with</Text>
                                    <View style={[styles.ptCodeCard, { backgroundColor: theme.card, borderColor: theme.tint, marginTop: 20, borderStyle: 'solid' }]}>
                                        <Text style={[styles.ptCodeText, { color: theme.text, letterSpacing: 2, fontSize: 32 }]}>
                                            {assignedPtData.name}
                                        </Text>
                                    </View>
                                    <Text style={[styles.noPtSubText, { color: theme.icon, textAlign: 'center', marginTop: 30 }]}>
                                        Your PT will book your 1-to-1 sessions directly. Reach out to them to arrange a time!
                                    </Text>
                                </View>
                            ) : (
                                <View style={[styles.slotsContainer, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }]}>
                                    <Text style={[styles.noPtText, { color: theme.text, textAlign: 'center' }]}>Failed to load your PT's details.</Text>
                                </View>
                            )}
                        </View>
                    )}
                </ScrollView>
                <CustomAlert visible={alertConfig.visible} title={alertConfig.title} message={alertConfig.message} onClose={closeAlert} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                {userProfile?.role === 'pt' && selectedClientForBooking ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View>
                            <Text style={[styles.title, { color: theme.text }]}>Book for {selectedClientForBooking.name.split(' ')[0]}</Text>
                            <Text style={[styles.subtitle, { color: theme.icon }]}>Select a date and time</Text>
                        </View>
                        <TouchableOpacity onPress={() => setSelectedClientForBooking(null)} style={[styles.backButton, { backgroundColor: theme.border }]}>
                            <Text style={[styles.backButtonText, { color: theme.text }]}>Back</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View>
                        <Text style={[styles.title, { color: theme.text }]}>Book PT Session</Text>
                        <Text style={[styles.subtitle, { color: theme.icon }]}>Select a date and time</Text>
                    </View>
                )}
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

            {userProfile?.role === 'pt' && selectedClientForBooking && (
                <View style={[styles.frequencyContainer, { borderBottomColor: theme.border }]}>
                    <Text style={[styles.frequencyLabel, { color: theme.text }]}>Repeat Session:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.frequencyScroll}>
                        {['none', 'weekly', 'bi-weekly', 'monthly'].map((freq) => (
                            <TouchableOpacity
                                key={freq}
                                style={[
                                    styles.freqButton,
                                    { borderColor: theme.border },
                                    recurringFrequency === freq && { backgroundColor: theme.tint, borderColor: theme.tint }
                                ]}
                                onPress={() => setRecurringFrequency(freq as any)}
                            >
                                <Text style={[
                                    styles.freqButtonText,
                                    { color: recurringFrequency === freq ? '#fff' : theme.icon }
                                ]}>
                                    {freq === 'none' ? 'No Repeat' : freq === 'bi-weekly' ? 'Bi-Weekly' : freq.charAt(0).toUpperCase() + freq.slice(1)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}

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
                                            <Text style={[styles.slotDuration, { color: slot.available ? theme.tint : theme.icon }]}>
                                                {slot.available ? '1 Hour' : 'Booked'}
                                            </Text>
                                            {slot.available && (
                                                <Text style={[styles.slotAttendees, { color: theme.icon, fontSize: 13, marginLeft: 10 }]}>
                                                    {slot.attendees} / 4 Booked
                                                </Text>
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
        fontWeight: '700',
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 15,
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
        backgroundColor: 'rgba(0,0,0,0.02)',
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
    slotChevron: {
        width: 20,
        alignItems: 'flex-end',
    },
    separator: {
        height: StyleSheet.hairlineWidth,
        marginLeft: 16,
    },
    noSlotsText: {
        textAlign: 'center',
        fontSize: 16,
        marginTop: 50,
    },
    noPtText: {
        fontSize: 18,
        fontWeight: '600',
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    noPtSubText: {
        fontSize: 14,
        marginTop: 10,
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    ptCodeCard: {
        paddingVertical: 30,
        paddingHorizontal: 40,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: Radii.xl,
        alignItems: 'center',
        justifyContent: 'center',
        // Make it look like a pass
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
        elevation: 10,
    },
    ptCodeText: {
        fontSize: 48,
        fontWeight: '700',
        letterSpacing: 8,
    },
    codeInput: {
        width: '100%',
        maxWidth: 300,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: Radii.md,
        textAlign: 'center',
        letterSpacing: 6,
        fontWeight: 'bold',
        marginBottom: 20,
    },
    assignButton: {
        paddingVertical: 15,
        paddingHorizontal: 30,
        borderRadius: Radii.pill,
        width: '100%',
        maxWidth: 300,
        alignItems: 'center',
    },
    assignButtonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '600',
    },
    clientsSection: {
        paddingHorizontal: 20,
        marginTop: 10,
    },
    clientsTitle: {
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 15,
        borderBottomWidth: StyleSheet.hairlineWidth,
        paddingBottom: 10,
    },
    groupedList: {
        borderRadius: Radii.lg,
        borderWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden',
    },
    clientRow: {
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    clientName: {
        fontSize: 17,
        fontWeight: '600',
    },
    clientEmail: {
        fontSize: 15,
        marginTop: 4,
    },
    noClientsText: {
        fontSize: 15,
        textAlign: 'center',
        marginTop: 20,
    },
    bookClientButton: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: Radii.pill,
    },
    bookClientButtonText: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '600',
    },
    backButton: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: Radii.sm,
    },
    backButtonText: {
        fontSize: 14,
        fontWeight: '600',
    },
    frequencyContainer: {
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    frequencyLabel: {
        fontSize: 15,
        fontWeight: '600',
        paddingHorizontal: 20,
        marginBottom: 8,
    },
    frequencyScroll: {
        paddingHorizontal: 15,
        gap: 8,
    },
    freqButton: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: Radii.pill,
        borderWidth: StyleSheet.hairlineWidth,
    },
    freqButtonText: {
        fontSize: 14,
        fontWeight: '500',
    }
});
