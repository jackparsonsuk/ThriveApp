import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, TextInput, Dimensions, FlatList, ViewToken } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/auth';
import { getUserProfile, getPTBookingsForDate, createBooking, UserProfile, Booking, getAllPTs, assignClientToPt, getClientsForPt, getUserBookingsForDate, createRecurringSession, getGymBookingsForDate, checkSlotAvailability, getPendingPTRequestsForPT, updateBookingStatus, getUserPendingBookings, cancelBooking, getPersonAllBookingsForDate } from '../../services/bookingService';
import { format, addDays, startOfDay, addMinutes, setHours, setMinutes, isBefore } from 'date-fns';
import { useRouter } from 'expo-router';
import CustomAlert from '../../components/CustomAlert';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii } from '@/constants/theme';
import { BOOKING_WINDOW_DAYS, PT_AVAILABILITY_WINDOW_DAYS } from '@/constants/config';
import { useMouseDragScroll } from '@/hooks/useMouseDragScroll';
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
    const [availableSlots, setAvailableSlots] = useState<{ time: Date; endTime?: Date; available: boolean; attendees: number; bookedPtCount: number; conflictReason?: string; isBlockedByMe?: boolean; blockBookingId?: string; conflictBookingId?: string; conflictBookingType?: string; }[]>([]);
    const [loading, setLoading] = useState(true);
    const [bookingLoading, setBookingLoading] = useState(false);
    const [recurringFrequency, setRecurringFrequency] = useState<'none' | 'weekly' | 'bi-weekly' | 'monthly'>('none');
    const [blockDuration, setBlockDuration] = useState<number>(1);
    const [isManagingAvailability, setIsManagingAvailability] = useState(false);

    // PT Assignment State
    const [ptCodeInput, setPtCodeInput] = useState('');
    const [assigningLoading, setAssigningLoading] = useState(false);
    const ptCodeInputRef = useRef<TextInput>(null);

    // PT's Clients State
    const [clients, setClients] = useState<UserProfile[]>([]);
    const [clientsLoading, setClientsLoading] = useState(false);
    const [selectedClientForBooking, setSelectedClientForBooking] = useState<UserProfile | null>(null);

    // Pending Requests State (PT role)
    const [pendingRequests, setPendingRequests] = useState<Array<Booking & { clientName: string }>>([]);
    const [pendingLoading, setPendingLoading] = useState(false);

    // Client's pending PT session requests
    const [clientPendingSessions, setClientPendingSessions] = useState<Booking[]>([]);
    const [clientPendingLoading, setClientPendingLoading] = useState(false);
    const [cancellingSessionId, setCancellingSessionId] = useState<string | null>(null);
    const flatListRef = useRef<FlatList>(null);
    const [hasInitialScrolled, setHasInitialScrolled] = useState(false);
    const { onScroll: onMouseDragScroll, dragProps } = useMouseDragScroll(flatListRef);
    const [visibleMonth, setVisibleMonth] = useState(format(new Date(), 'MMMM yyyy'));

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

    // Generate date array: 6 months for availability management, 6 weeks for booking
    const dates = useMemo(() => {
        const windowDays = isManagingAvailability ? PT_AVAILABILITY_WINDOW_DAYS : BOOKING_WINDOW_DAYS;
        return Array.from({ length: windowDays }).map((_, i) => addDays(startOfDay(new Date()), i));
    }, [isManagingAvailability]);

    const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
        if (viewableItems.length > 0) {
            const middleItem = viewableItems[Math.floor(viewableItems.length / 2)];
            if (middleItem?.item) {
                setVisibleMonth(format(middleItem.item as Date, 'MMMM yyyy'));
            }
        }
    }, []);
    const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

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

        if ((userProfile?.role === 'pt' || userProfile?.role === 'admin') && user?.uid) {
            fetchClients(user.uid);
            fetchPendingRequests(user.uid);
            if (selectedClientForBooking || isManagingAvailability) {
                // If PT is booking for a client or managing availability, check the PT's own availability
                fetchAvailability(user.uid);
            }
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate, userProfile, user, selectedClientForBooking, isManagingAvailability]);

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

    useEffect(() => {
        if (userProfile?.role === 'client' && user?.uid) {
            fetchClientPendingSessions(user.uid);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userProfile, user]);

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

    const fetchPendingRequests = async (ptId: string) => {
        setPendingLoading(true);
        try {
            const requests = await getPendingPTRequestsForPT(ptId);
            const hydrated = await Promise.all(requests.map(async (req) => {
                const clientProfile = await getUserProfile(req.userId);
                return { ...req, clientName: clientProfile?.name || 'Unknown Client' };
            }));
            hydrated.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
            setPendingRequests(hydrated);
        } catch (error) {
            console.error('Error fetching pending requests:', error);
        } finally {
            setPendingLoading(false);
        }
    };

    const handleApproveRequest = (requestId: string, clientName: string) => {
        setAlertConfig({
            visible: true,
            title: 'Approve Request',
            message: `Confirm PT session for ${clientName}?`,
            onConfirm: async () => {
                try {
                    await updateBookingStatus(requestId, 'confirmed');
                    if (user?.uid) {
                        fetchPendingRequests(user.uid);
                        fetchAvailability(user.uid);
                    }
                } catch (error) {
                    console.error('Error approving request:', error);
                    setAlertConfig({ visible: true, title: 'Error', message: 'Failed to approve request.', isError: true });
                }
            }
        });
    };

    const handleDeclineRequest = (requestId: string, clientName: string) => {
        setAlertConfig({
            visible: true,
            title: 'Decline Request',
            message: `Decline PT session request from ${clientName}?`,
            isError: true,
            onConfirm: async () => {
                try {
                    await updateBookingStatus(requestId, 'cancelled');
                    if (user?.uid) {
                        fetchPendingRequests(user.uid);
                        fetchAvailability(user.uid);
                    }
                } catch (error) {
                    console.error('Error declining request:', error);
                    setAlertConfig({ visible: true, title: 'Error', message: 'Failed to decline request.', isError: true });
                }
            }
        });
    };

    const fetchClientPendingSessions = async (userId: string) => {
        setClientPendingLoading(true);
        try {
            const sessions = await getUserPendingBookings(userId);
            const upcoming = sessions
                .filter(s => s.endTime > new Date())
                .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
            setClientPendingSessions(upcoming);
        } catch (error) {
            console.error('Error fetching pending sessions:', error);
        } finally {
            setClientPendingLoading(false);
        }
    };

    const handleCancelPendingSession = (session: Booking) => {
        setAlertConfig({
            visible: true,
            title: 'Cancel Request',
            message: `Cancel your PT session request for ${format(session.startTime, 'EEE, MMM d')} at ${format(session.startTime, 'HH:mm')}?`,
            isError: true,
            onConfirm: async () => {
                if (!session.id) return;
                setCancellingSessionId(session.id);
                try {
                    await cancelBooking(session.id, 'client');
                    if (user?.uid) fetchClientPendingSessions(user.uid);
                } catch (error) {
                    console.error('Error cancelling pending session:', error);
                    setAlertConfig({ visible: true, title: 'Error', message: 'Failed to cancel the request.', isError: true });
                } finally {
                    setCancellingSessionId(null);
                }
            }
        });
    };

    const fetchAssignedPt = async (ptId: string) => {
        setLoading(true);
        try {
            const ptProfile = await getUserProfile(ptId);
            if (ptProfile) {
                setAssignedPtData(ptProfile);
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
            const isPtBookingForClient = (userProfile?.role === 'pt' || userProfile?.role === 'admin') && !!selectedClientForBooking;
            const targetPtId = isManagingAvailability ? user?.uid : ptId;
            if (!targetPtId) return;

            // Fetch each source separately so we can generate contextual conflict reasons
            const [ptSessionBookings, ptPersonal, gymBookingsForDay] = await Promise.all([
                getPTBookingsForDate(selectedDate, targetPtId),
                getPersonAllBookingsForDate(targetPtId, selectedDate),
                getGymBookingsForDate(selectedDate),
            ]);

            let selfInstructorBookings: Booking[] = [];
            let selfBookings: Booking[] = [];
            if (user?.uid && targetPtId !== user.uid) {
                [selfInstructorBookings, selfBookings] = await Promise.all([
                    getPTBookingsForDate(selectedDate, user.uid),
                    getPersonAllBookingsForDate(user.uid, selectedDate),
                ]);
            }

            let clientBookings: Booking[] = [];
            if (isPtBookingForClient && selectedClientForBooking) {
                clientBookings = await getPersonAllBookingsForDate(selectedClientForBooking.id, selectedDate);
            }

            const slots = [];
            let currentTime = setMinutes(setHours(selectedDate, PT_OPEN_HOUR), 0);
            const endTime = setMinutes(setHours(selectedDate, PT_CLOSE_HOUR), 0);
            const now = new Date();

            while (currentTime < endTime) {
                if (isBefore(currentTime, now)) {
                    currentTime = addMinutes(currentTime, 15);
                    continue;
                }

                const targetEnd = addMinutes(currentTime, 60);
                const overlaps = (b: Booking) => b.startTime < targetEnd && b.endTime > currentTime;

                const ptSessions = ptSessionBookings.filter(b => overlaps(b) && b.type === 'pt');
                const ptBlocks = ptSessionBookings.filter(b => overlaps(b) && b.type === 'block');
                const ptOwnBlocks = ptSessionBookings.filter(b => overlaps(b) && b.type === 'pt_block');
                const ptPersonalConflicts = ptPersonal.filter(overlaps);
                const clientConflicts = clientBookings.filter(overlaps);
                const selfInstructorConflicts = selfInstructorBookings.filter(overlaps);
                const selfConflicts = selfBookings.filter(overlaps);
                const gymBlocks = gymBookingsForDay.filter(b => overlaps(b) && b.type === 'block');

                let isAvailable = true;
                let conflictReason: string | undefined;
                let isBlockedByMe = false;
                let blockBookingId: string | undefined;
                let conflictBookingId: string | undefined;
                let conflictBookingType: string | undefined;

                if (ptOwnBlocks.length > 0) {
                    if (isManagingAvailability) {
                        isAvailable = true;
                        isBlockedByMe = true;
                        blockBookingId = ptOwnBlocks[0].id;
                        conflictBookingId = ptOwnBlocks[0].id;
                        conflictBookingType = 'pt_block';
                        conflictReason = 'Unblock';
                    } else {
                        isAvailable = false;
                        conflictReason = 'Unavailable';
                        conflictBookingId = ptOwnBlocks[0].id;
                        conflictBookingType = 'pt_block';
                    }
                } else if (!isManagingAvailability) {
                    // Only check for other conflicts if we are NOT managing our own availability
                    if (ptBlocks.length > 0) {
                        isAvailable = false;
                        conflictReason = 'Blocked';
                        conflictBookingId = ptBlocks[0].id;
                        conflictBookingType = 'block';
                    } else if (gymBlocks.length > 0) {
                        isAvailable = false;
                        conflictReason = gymBlocks[0].reason || 'Gym Closed';
                        conflictBookingId = 'admin-block';
                        conflictBookingType = 'block';
                    } else if (ptPersonalConflicts.length > 0) {
                        isAvailable = false;
                        const c = ptPersonalConflicts[0];
                        conflictBookingId = c.id;
                        conflictBookingType = c.type;
                        if (isPtBookingForClient) {
                            if (c.type === 'gym') conflictReason = 'You are in the gym';
                            else if (c.type === 'group') conflictReason = 'You have a class';
                            else conflictReason = 'You have a booking';
                        } else {
                            if (c.type === 'gym') conflictReason = 'PT is in the gym';
                            else if (c.type === 'group') conflictReason = 'PT has a class';
                            else conflictReason = 'PT is unavailable';
                        }
                    } else if (clientConflicts.length > 0) {
                        isAvailable = false;
                        const c = clientConflicts[0];
                        conflictBookingId = c.id;
                        conflictBookingType = c.type;
                        const firstName = selectedClientForBooking?.name?.split(' ')[0] || 'Client';
                        if (c.type === 'gym') conflictReason = `${firstName} is in the gym`;
                        else if (c.type === 'group') conflictReason = `${firstName} has a class`;
                        else if (c.type === 'pt') conflictReason = `${firstName} has a PT session`;
                        else conflictReason = `${firstName} is busy`;
                    } else if (selfInstructorConflicts.length > 0) {
                        isAvailable = false;
                        conflictBookingId = selfInstructorConflicts[0].id;
                        conflictBookingType = 'pt';
                        conflictReason = 'You are leading a session';
                    } else if (selfConflicts.length > 0) {
                        isAvailable = false;
                        const c = selfConflicts[0];
                        conflictBookingId = c.id;
                        conflictBookingType = c.type;
                        if (c.type === 'gym') conflictReason = 'You have a gym session';
                        else if (c.type === 'group') conflictReason = 'You have a class';
                        else if (c.type === 'pt') conflictReason = 'You have a PT session';
                        else conflictReason = 'You are busy';
                    } else if (ptSessions.length >= 2) {
                        isAvailable = false;
                        conflictReason = 'Fully Booked';
                        conflictBookingId = ptSessions[0].id;
                        conflictBookingType = 'pt';
                    } else if (ptSessions.length === 1) {
                        conflictBookingId = ptSessions[0].id;
                        conflictBookingType = 'pt';
                    }
                }

                slots.push({
                    time: currentTime,
                    available: isAvailable,
                    attendees: checkSlotAvailability(currentTime, gymBookingsForDay).count,
                    bookedPtCount: ptSessions.length,
                    conflictReason,
                    isBlockedByMe,
                    blockBookingId,
                    conflictBookingId,
                    conflictBookingType
                });

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

    const handleBookSlot = async (slot: { time: Date; endTime?: Date; available: boolean; isBlockedByMe?: boolean; blockBookingId?: string }) => {
        if (isManagingAvailability) {
            if (slot.isBlockedByMe && slot.blockBookingId) {
                setAlertConfig({
                    visible: true,
                    title: 'Unblock Time',
                    message: `Do you want to unblock ${format(slot.time, 'HH:mm')}${slot.endTime ? ' to ' + format(slot.endTime, 'HH:mm') : ''}?`,
                    onConfirm: async () => {
                        try {
                            setBookingLoading(true);
                            await cancelBooking(slot.blockBookingId!, 'pt');
                            if (user?.uid) fetchAvailability(user.uid);
                            setAlertConfig({ visible: true, title: 'Success!', message: 'Time unblocked successfully.', isSuccess: true });
                        } catch (e) {
                            setAlertConfig({ visible: true, title: 'Error', message: 'Failed to unblock.', isError: true });
                        } finally {
                            setBookingLoading(false);
                        }
                    }
                });
            } else {
                const endTimeStr = format(addMinutes(slot.time, blockDuration * 60), 'HH:mm');
                setAlertConfig({
                    visible: true,
                    title: 'Block Time',
                    message: `Block out ${blockDuration} hour(s) from ${format(slot.time, 'HH:mm')} to ${endTimeStr}${recurringFrequency !== 'none' ? ' (' + recurringFrequency + ')' : ''}?`,
                    onConfirm: () => confirmBooking(slot.time, user!.uid, 'pt_block', blockDuration * 60)
                });
            }
            return;
        }

        const isPtBookingForClient = (userProfile?.role === 'pt' || userProfile?.role === 'admin') && selectedClientForBooking;
        const targetPtId = isPtBookingForClient ? user?.uid : userProfile?.assignedPtId;
        const targetClientName = isPtBookingForClient ? selectedClientForBooking.name : 'you';

        if (!user || !targetPtId) return;

        setAlertConfig({
            visible: true,
            title: 'Confirm PT Booking',
            message: `Book ${recurringFrequency !== 'none' ? recurringFrequency + ' ' : ''}PT session for ${targetClientName} at ${format(slot.time, 'HH:mm')}?`,
            onConfirm: () => confirmBooking(slot.time, targetPtId as string, 'pt')
        });
    };

    const confirmBooking = async (startTime: Date, ptId: string, bookingType: 'pt' | 'pt_block' = 'pt', durationMinutes: number = 60) => {
        if (!user) return;
        setBookingLoading(true);

        const isPtBookingForClient = (userProfile?.role === 'pt' || userProfile?.role === 'admin') && selectedClientForBooking;
        const targetUserId = isManagingAvailability ? user.uid : (isPtBookingForClient ? selectedClientForBooking.id : user.uid);

        try {
            const endTime = addMinutes(startTime, durationMinutes);

            if (recurringFrequency === 'none') {
                await createBooking({
                    userId: targetUserId,
                    startTime,
                    endTime,
                    type: bookingType,
                    ptId: ptId,
                    status: 'confirmed'
                });
            } else {
                await createRecurringSession({
                    userId: targetUserId,
                    ptId: ptId,
                    type: bookingType as any,
                    frequency: recurringFrequency as any,
                    startTime: startTime,
                    endTime: endTime,
                    status: 'active'
                });
            }

            setAlertConfig({
                visible: true,
                title: 'Success!',
                message: isManagingAvailability ? `Time block${recurringFrequency !== 'none' ? 's' : ''} added.` : (isPtBookingForClient ? `Session${recurringFrequency !== 'none' ? 's' : ''} booked for ${selectedClientForBooking.name}.` : 'Your PT session has been booked.'),
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

    if ((userProfile?.role === 'pt' || userProfile?.role === 'admin') && !selectedClientForBooking && !isManagingAvailability) {
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
                        <Text style={[styles.clientsTitle, { color: theme.text, borderBottomColor: theme.border }]}>Pending Requests</Text>
                        {pendingLoading ? (
                            <ActivityIndicator size="small" color={theme.tint} style={{ marginTop: 20 }} />
                        ) : pendingRequests.length === 0 ? (
                            <Text style={[styles.noClientsText, { color: theme.icon }]}>No pending requests.</Text>
                        ) : (
                            <View style={[styles.groupedList, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                {pendingRequests.map((req, index) => {
                                    const isLast = index === pendingRequests.length - 1;
                                    return (
                                        <View key={req.id}>
                                            <View style={[styles.clientRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 10 }]}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[styles.clientName, { color: theme.text }]}>{req.clientName}</Text>
                                                    <Text style={[styles.clientEmail, { color: theme.icon }]}>
                                                        {format(req.startTime, 'EEE, MMM d')} • {format(req.startTime, 'HH:mm')} - {format(req.endTime, 'HH:mm')}
                                                    </Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                                    <TouchableOpacity
                                                        style={[styles.bookClientButton, { backgroundColor: theme.tint }]}
                                                        onPress={() => handleApproveRequest(req.id!, req.clientName)}
                                                    >
                                                        <Text style={styles.bookClientButtonText}>Approve</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={[styles.bookClientButton, { backgroundColor: '#ef4444' }]}
                                                        onPress={() => handleDeclineRequest(req.id!, req.clientName)}
                                                    >
                                                        <Text style={styles.bookClientButtonText}>Decline</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                            {!isLast && <View style={[styles.separator, { backgroundColor: theme.border }]} />}
                                        </View>
                                    );
                                })}
                            </View>
                        )}
                    </View>

                    <SectionDivider theme={theme} />

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
                        <TouchableOpacity
                            style={[styles.bookClientButton, { backgroundColor: theme.icon, alignSelf: 'center', marginTop: 25, paddingHorizontal: 24, paddingVertical: 12 }]}
                            onPress={() => setIsManagingAvailability(true)}
                        >
                            <Text style={[styles.bookClientButtonText, { fontSize: 16 }]}>Manage My Availability</Text>
                        </TouchableOpacity>
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
                        onConfirm={alertConfig.onConfirm}
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
                            <View style={[styles.ptConnectContainer, { minHeight: Dimensions.get('window').height * 0.75 }]}>
                                {/* Icon */}
                                <View style={[styles.ptConnectIconWrap, { backgroundColor: theme.tint + '20' }]}>
                                    <Ionicons name="person-add-outline" size={40} color={theme.tint} />
                                </View>

                                <Text style={[styles.ptConnectTitle, { color: theme.text }]}>Connect with a PT</Text>
                                <Text style={[styles.ptConnectSubtitle, { color: theme.icon }]}>
                                    Enter the 6-character code provided by your Thrive Coach.
                                </Text>

                                {/* OTP-style character boxes */}
                                <TouchableOpacity
                                    activeOpacity={1}
                                    onPress={() => ptCodeInputRef.current?.focus()}
                                    style={styles.otpRow}
                                >
                                    {Array.from({ length: 6 }).map((_, i) => {
                                        const char = ptCodeInput[i] || '';
                                        const isFilled = !!char;
                                        return (
                                            <View
                                                key={i}
                                                style={[
                                                    styles.otpBox,
                                                    { backgroundColor: theme.card, borderColor: isFilled ? theme.tint : theme.border },
                                                    isFilled && { shadowColor: theme.tint, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 3 }
                                                ]}
                                            >
                                                <Text style={[styles.otpChar, { color: theme.text }]}>{char}</Text>
                                            </View>
                                        );
                                    })}
                                    <TextInput
                                        ref={ptCodeInputRef}
                                        style={styles.otpHiddenInput}
                                        value={ptCodeInput}
                                        onChangeText={(text) => setPtCodeInput(text.toUpperCase())}
                                        maxLength={6}
                                        autoCapitalize="characters"
                                        autoFocus
                                    />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[
                                        styles.ptConnectButton,
                                        { backgroundColor: theme.tint, shadowColor: theme.tint },
                                        (!ptCodeInput || ptCodeInput.length < 6) && { opacity: 0.45 }
                                    ]}
                                    onPress={handleAssignPT}
                                    disabled={!ptCodeInput || ptCodeInput.length < 6 || assigningLoading}
                                >
                                    {assigningLoading
                                        ? <ActivityIndicator color="#ffffff" />
                                        : <Text style={styles.ptConnectButtonText}>Connect to Trainer</Text>
                                    }
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

                            {/* Pending session requests */}
                            <View style={styles.clientsSection}>
                                <Text style={[styles.clientsTitle, { color: theme.text, borderBottomColor: theme.border }]}>Pending Requests</Text>
                                {clientPendingLoading ? (
                                    <ActivityIndicator size="small" color={theme.tint} style={{ marginTop: 20 }} />
                                ) : clientPendingSessions.length === 0 ? (
                                    <Text style={[styles.noClientsText, { color: theme.icon }]}>No pending session requests.</Text>
                                ) : (
                                    <View style={[styles.groupedList, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                        {clientPendingSessions.map((session, index) => {
                                            const isLast = index === clientPendingSessions.length - 1;
                                            return (
                                                <View key={session.id}>
                                                    <View style={[styles.clientRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 10 }]}>
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={[styles.clientName, { color: theme.text }]}>PT Session Request</Text>
                                                            <Text style={[styles.clientEmail, { color: theme.icon }]}>
                                                                {format(session.startTime, 'EEE, MMM d')} • {format(session.startTime, 'HH:mm')} - {format(session.endTime, 'HH:mm')}
                                                            </Text>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B', marginRight: 6 }} />
                                                                <Text style={{ color: '#F59E0B', fontSize: 12, fontWeight: '600' }}>Awaiting approval</Text>
                                                            </View>
                                                        </View>
                                                        <TouchableOpacity
                                                            style={[styles.bookClientButton, { backgroundColor: '#ef4444' }]}
                                                            onPress={() => handleCancelPendingSession(session)}
                                                            disabled={cancellingSessionId === session.id}
                                                        >
                                                            {cancellingSessionId === session.id
                                                                ? <ActivityIndicator size="small" color="#ffffff" />
                                                                : <Text style={styles.bookClientButtonText}>Cancel Request</Text>
                                                            }
                                                        </TouchableOpacity>
                                                    </View>
                                                    {!isLast && <View style={[styles.separator, { backgroundColor: theme.border }]} />}
                                                </View>
                                            );
                                        })}
                                    </View>
                                )}
                            </View>
                        </View>
                    )}
                </ScrollView>
                <CustomAlert visible={alertConfig.visible} title={alertConfig.title} message={alertConfig.message} onClose={closeAlert} onConfirm={alertConfig.onConfirm} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                {(userProfile?.role === 'pt' || userProfile?.role === 'admin') && selectedClientForBooking ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View>
                            <Text style={[styles.title, { color: theme.text }]}>Book for {selectedClientForBooking.name.split(' ')[0]}</Text>
                            <Text style={[styles.subtitle, { color: theme.icon }]}>Select a date and time</Text>
                        </View>
                        <TouchableOpacity onPress={() => setSelectedClientForBooking(null)} style={[styles.backButton, { backgroundColor: theme.border }]}>
                            <Text style={[styles.backButtonText, { color: theme.text }]}>Back</Text>
                        </TouchableOpacity>
                    </View>
                ) : isManagingAvailability ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={[styles.titleCompact, { color: theme.text }]}>Availability</Text>
                        <TouchableOpacity onPress={() => setIsManagingAvailability(false)} style={[styles.backButton, { backgroundColor: theme.border }]}>
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

            <View 
                style={[styles.dateSelectorContainer, { backgroundColor: theme.background, borderBottomColor: theme.border }]}
                {...dragProps}
            >
                <Text style={[styles.monthLabel, { color: theme.text }]}>{visibleMonth}</Text>
                <FlatList
                    ref={flatListRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.dateSelector}
                    data={dates}
                    keyExtractor={(_, index) => index.toString()}
                    onScroll={onMouseDragScroll}
                    scrollEventThrottle={16}
                    onViewableItemsChanged={onViewableItemsChanged}
                    viewabilityConfig={viewabilityConfig}
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
                    }}
                />
            </View>

            {((userProfile?.role === 'pt' || userProfile?.role === 'admin') && selectedClientForBooking && !isManagingAvailability) && (
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

            {isManagingAvailability && (
                <View style={[styles.availabilityControls, { borderBottomColor: theme.border }]}>
                    <View style={styles.controlRow}>
                        <Text style={[styles.controlLabel, { color: theme.icon }]}>Repeat:</Text>
                        {['none', 'weekly', 'bi-weekly', 'monthly'].map((freq) => (
                            <TouchableOpacity
                                key={freq}
                                style={[
                                    styles.controlChip,
                                    { borderColor: theme.border },
                                    recurringFrequency === freq && { backgroundColor: theme.tint, borderColor: theme.tint }
                                ]}
                                onPress={() => setRecurringFrequency(freq as any)}
                            >
                                <Text style={[
                                    styles.controlChipText,
                                    { color: recurringFrequency === freq ? '#fff' : theme.icon }
                                ]}>
                                    {freq === 'none' ? 'None' : freq === 'bi-weekly' ? 'Bi-Wk' : freq.charAt(0).toUpperCase() + freq.slice(1)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <View style={styles.controlRow}>
                        <Text style={[styles.controlLabel, { color: theme.icon }]}>Duration:</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((hours) => (
                                <TouchableOpacity
                                    key={hours}
                                    style={[
                                        styles.controlChip,
                                        { borderColor: theme.border },
                                        blockDuration === hours && { backgroundColor: theme.tint, borderColor: theme.tint }
                                    ]}
                                    onPress={() => setBlockDuration(hours)}
                                >
                                    <Text style={[
                                        styles.controlChipText,
                                        { color: blockDuration === hours ? '#fff' : theme.icon }
                                    ]}>
                                        {hours}h
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <TouchableOpacity
                            style={[styles.controlChip, { borderColor: theme.tint, backgroundColor: theme.tint + '15', marginLeft: 4 }]}
                            onPress={() => {
                                const dayStart = setMinutes(setHours(selectedDate, PT_OPEN_HOUR), 0);
                                const dayEnd = setMinutes(setHours(selectedDate, PT_CLOSE_HOUR), 0);
                                const durationHours = PT_CLOSE_HOUR - PT_OPEN_HOUR;
                                setAlertConfig({
                                    visible: true,
                                    title: 'Block Entire Day',
                                    message: `Block off the entire day (${format(dayStart, 'HH:mm')} \u2013 ${format(dayEnd, 'HH:mm')}) on ${format(selectedDate, 'EEE, MMM d')}${recurringFrequency !== 'none' ? ' (' + recurringFrequency + ')' : ''}?`,
                                    onConfirm: () => confirmBooking(dayStart, user!.uid, 'pt_block', durationHours * 60)
                                });
                            }}
                        >
                            <Ionicons name="calendar" size={12} color={theme.tint} style={{ marginRight: 3 }} />
                            <Text style={[styles.controlChipText, { color: theme.tint, fontWeight: '700' }]}>All Day</Text>
                        </TouchableOpacity>
                    </View>
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
                                            <Text style={[styles.slotDuration, { color: slot.available ? theme.tint : theme.icon }]}>
                                                {slot.available ? (
                                                    // @ts-ignore
                                                    slot.isBlockedByMe ? 'Blocked (Tap to unblock)' : (slot.bookedPtCount === 1 ? '1/2 Booked' : '1 Hour')
                                                ) : (slot.conflictReason ?? 'Booked')}
                                            </Text>
                                            {slot.available && !((slot as any).isBlockedByMe) && (
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
    monthLabel: {
        fontSize: 13,
        fontWeight: '600',
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: 0,
    },
    dateSelector: {
        paddingHorizontal: 15,
        paddingVertical: 8,
        gap: 6,
    },
    dateCard: {
        paddingVertical: 8,
        paddingHorizontal: 6,
        borderRadius: Radii.pill,
        alignItems: 'center',
        minWidth: 48,
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
    ptConnectContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        paddingVertical: 40,
    },
    ptConnectIconWrap: {
        width: 88,
        height: 88,
        borderRadius: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 28,
    },
    ptConnectTitle: {
        fontSize: 30,
        fontWeight: '700',
        letterSpacing: -0.5,
        textAlign: 'center',
        marginBottom: 10,
    },
    ptConnectSubtitle: {
        fontSize: 16,
        textAlign: 'center',
        lineHeight: 23,
        marginBottom: 44,
        paddingHorizontal: 8,
    },
    otpRow: {
        flexDirection: 'row',
        gap: 10,
        justifyContent: 'center',
        marginBottom: 36,
    },
    otpBox: {
        width: 48,
        height: 62,
        borderRadius: 12,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    otpChar: {
        fontSize: 26,
        fontWeight: '700',
    },
    otpHiddenInput: {
        position: 'absolute',
        width: 1,
        height: 1,
        opacity: 0,
    },
    ptConnectButton: {
        width: '100%',
        paddingVertical: 17,
        borderRadius: Radii.pill,
        alignItems: 'center',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 4,
    },
    ptConnectButtonText: {
        color: '#ffffff',
        fontSize: 17,
        fontWeight: '600',
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
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderRadius: Radii.pill,
        borderWidth: StyleSheet.hairlineWidth,
    },
    availabilityControls: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        gap: 6,
    },
    controlRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    controlLabel: {
        fontSize: 12,
        fontWeight: '700',
        width: 58,
    },
    controlChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: Radii.pill,
        borderWidth: 1,
    },
    controlChipText: {
        fontSize: 12,
        fontWeight: '600',
    },
    titleCompact: {
        fontSize: 24,
        fontWeight: '700',
        letterSpacing: -0.3,
    },

    freqButtonText: {
        fontSize: 14,
        fontWeight: '500',
    }
});
