import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, TextInput, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/auth';
import { getUserProfile, getPTBookingsForDate, createBooking, UserProfile, Booking, getAllPTs, assignClientToPt, getClientsForPt, getUserBookingsForDate, createRecurringSession, getGymBookingsForDate, checkSlotAvailability, getPendingPTRequestsForPT, updateBookingStatus, getUserPendingBookings, cancelBooking, getPersonAllBookingsForDate, updateWorkingHours, updateUserProfile, isUserActive, WorkingHours } from '../../services/bookingService';
import { getPtDayAvailability, PtSlot, formatWorkingDay, DAY_LABELS, DAY_ORDER, TIME_OPTIONS, effectiveWorkingHours, LEGACY_WORKING_DAY } from '../../services/availabilityService';
import { format, addDays, startOfDay, addMinutes, setHours, setMinutes, isBefore } from 'date-fns';
import { useRouter, useFocusEffect } from 'expo-router';
import CustomAlert from '../../components/CustomAlert';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Shadows, Spacing, Typography, bookingTypeColor } from '@/constants/theme';
import { BOOKING_WINDOW_DAYS, PT_AVAILABILITY_WINDOW_DAYS } from '@/constants/config';
import * as Clipboard from 'expo-clipboard';
import { ScreenHeader, SectionHeader, EmptyState, Badge, Button, ListContainer, ListRow, Card, Avatar, Chip, ChipGroup, DateStrip, IconButton, SegmentedControl, SlotList, SlotItem, TextField, Toggle } from '@/components/ui';

// Assuming PT operating hours
const PT_OPEN_HOUR = 7;
const PT_CLOSE_HOUR = 20;

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

    // Client's Assigned PT State
    const [assignedPtData, setAssignedPtData] = useState<UserProfile | null>(null);

    // Client-facing view of their PT's day
    const [ptSlots, setPtSlots] = useState<PtSlot[]>([]);
    const [ptSlotsLoading, setPtSlotsLoading] = useState(false);
    const [ptDayWindow, setPtDayWindow] = useState<{ start: Date; end: Date } | null>(null);

    // A PT/admin who has their own trainer, booking their own session
    const [isBookingOwnPt, setIsBookingOwnPt] = useState(false);

    // Active clients are the working list; inactive ones are parked out of the way
    // but stay one tap from coming back.
    const [clientListTab, setClientListTab] = useState<'active' | 'inactive'>('active');

    // The PT home is split into tabs so requests and clients aren't buried under setup
    const [ptTab, setPtTab] = useState<'clients' | 'schedule' | 'training'>('clients');

    // Working hours editor (PT role)
    const [isEditingHours, setIsEditingHours] = useState(false);
    const [hoursDraft, setHoursDraft] = useState<WorkingHours>({});
    const [savingHours, setSavingHours] = useState(false);
    const [timePicker, setTimePicker] = useState<{ day: string; field: 'start' | 'end' } | null>(null);

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
        // Anyone with a trainer can have their own pending requests — PTs included
        if (userProfile?.assignedPtId && user?.uid) {
            fetchClientPendingSessions(user.uid);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userProfile, user]);

    // Anyone with a trainer sees that trainer's day — wait for the PT profile so we know their working hours
    useEffect(() => {
        if (userProfile?.assignedPtId && assignedPtData) {
            fetchClientAvailability();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate, userProfile, assignedPtData]);

    // Tab screens stay mounted, so without this a request made elsewhere never
    // appears until a full reload — incoming requests most of all.
    useFocusEffect(useCallback(() => {
        if (!user?.uid || !userProfile) return;

        if (userProfile.role === 'pt' || userProfile.role === 'admin') {
            fetchPendingRequests(user.uid);
            fetchClients(user.uid);
        }
        if (userProfile.assignedPtId) {
            fetchClientPendingSessions(user.uid);
            if (assignedPtData) fetchClientAvailability();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, userProfile, assignedPtData, selectedDate]));

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

    const activeClients = useMemo(() => clients.filter(isUserActive), [clients]);
    const inactiveClients = useMemo(() => clients.filter(c => !isUserActive(c)), [clients]);
    const visibleClients = clientListTab === 'active' ? activeClients : inactiveClients;

    // Purely a filing change: an inactive client keeps their history, their login and
    // their existing bookings, they just stop cluttering the working list.
    const handleSetClientActive = async (client: UserProfile, isActive: boolean) => {
        setClients(prev => prev.map(c => (c.id === client.id ? { ...c, isActive } : c)));
        try {
            await updateUserProfile(client.id, { isActive });
        } catch (error) {
            console.error('Error updating client status:', error);
            setClients(prev => prev.map(c => (c.id === client.id ? { ...c, isActive: !isActive } : c)));
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: `Could not move ${client.name?.split(' ')[0] || 'this client'} to ${isActive ? 'Active' : 'Inactive'}.`,
                isError: true
            });
        }
    };

    const fetchPendingRequests = async (ptId: string) => {
        setPendingLoading(true);
        try {
            const requests = await getPendingPTRequestsForPT(ptId);
            // Look up each requester's name, but never let one unreadable profile
            // reject the whole batch and leave the PT staring at an empty list
            const hydrated = await Promise.all(requests.map(async (req) => {
                try {
                    const clientProfile = await getUserProfile(req.userId);
                    return { ...req, clientName: clientProfile?.name || 'Unknown Client' };
                } catch (e) {
                    console.warn('Could not load requester profile', req.userId, e);
                    return { ...req, clientName: 'Unknown Client' };
                }
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
                    // The freed hour has to reappear in the slot list too
                    if (user?.uid) await Promise.all([fetchClientPendingSessions(user.uid), fetchClientAvailability()]);
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

    const ptFirstName = assignedPtData?.name?.split(' ')[0] || 'Your PT';

    const openHoursEditor = () => {
        setHoursDraft(effectiveWorkingHours(userProfile?.workingHours));
        setIsEditingHours(true);
    };

    const toggleWorkingDay = (day: string, enabled: boolean) => {
        setHoursDraft(prev => {
            const next = { ...prev } as WorkingHours;
            if (enabled) next[day as keyof WorkingHours] = prev[day as keyof WorkingHours] ?? LEGACY_WORKING_DAY;
            else delete next[day as keyof WorkingHours];
            return next;
        });
    };

    const setWorkingTime = (day: string, field: 'start' | 'end', value: string) => {
        setHoursDraft(prev => {
            const existing = prev[day as keyof WorkingHours] ?? LEGACY_WORKING_DAY;
            return { ...prev, [day]: { ...existing, [field]: value } };
        });
    };

    const handleSaveWorkingHours = async () => {
        if (!user?.uid) return;

        const invalidDay = DAY_ORDER.find(day => {
            const hours = hoursDraft[day];
            return hours && hours.end <= hours.start;
        });
        if (invalidDay) {
            setAlertConfig({
                visible: true,
                title: 'Check Your Hours',
                message: `${DAY_LABELS[Number(invalidDay)]} finishes before it starts. Adjust the times and try again.`,
                isError: true
            });
            return;
        }

        setSavingHours(true);
        try {
            await updateWorkingHours(user.uid, hoursDraft);
            setUserProfile(prev => prev ? { ...prev, workingHours: hoursDraft } : prev);
            setIsEditingHours(false);
            setAlertConfig({
                visible: true,
                title: 'Hours Saved',
                message: 'Your clients can now only request sessions inside these hours.',
                isSuccess: true
            });
        } catch (error) {
            console.error('Error saving working hours:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to save your working hours. Please try again.',
                isError: true
            });
        } finally {
            setSavingHours(false);
        }
    };

    // Client view: what hours can I actually request with my PT on this date?
    const fetchClientAvailability = async () => {
        if (!user?.uid || !userProfile?.assignedPtId) return;
        setPtSlotsLoading(true);
        try {
            const { slots, window } = await getPtDayAvailability({
                ptId: userProfile.assignedPtId,
                clientId: user.uid,
                date: selectedDate,
                workingHours: assignedPtData?.workingHours,
                ptFirstName,
            });
            setPtSlots(slots);
            setPtDayWindow(window);
        } catch (error) {
            console.error('Error fetching PT availability for client:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: "Failed to load your PT's availability.",
                isError: true
            });
        } finally {
            setPtSlotsLoading(false);
        }
    };

    const handleRequestPtSession = (slot: PtSlot) => {
        setAlertConfig({
            visible: true,
            title: 'Request Session',
            message: `Request a PT session with ${ptFirstName} on ${format(slot.time, 'EEE, MMM d')} at ${format(slot.time, 'HH:mm')}?`,
            onConfirm: () => confirmPtRequest(slot)
        });
    };

    const confirmPtRequest = async (slot: PtSlot) => {
        if (!user?.uid || !userProfile?.assignedPtId) return;
        setBookingLoading(true);
        try {
            await createBooking({
                userId: user.uid,
                startTime: slot.time,
                endTime: slot.endTime,
                type: 'pt',
                ptId: userProfile.assignedPtId,
                status: 'pending'
            });
            setAlertConfig({
                visible: true,
                title: 'Request Sent!',
                message: `${ptFirstName} will confirm your session shortly.`,
                isSuccess: true,
                onConfirm: undefined
            });
            await Promise.all([fetchClientAvailability(), fetchClientPendingSessions(user.uid)]);
        } catch (error) {
            console.error('Error requesting PT session:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to send your request. Please try again.',
                isError: true
            });
        } finally {
            setBookingLoading(false);
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

    const isPtOrAdmin = userProfile?.role === 'pt' || userProfile?.role === 'admin';
    const goToDashboard = () => router.navigate('/');

    const alertElement = (
        <CustomAlert
            visible={alertConfig.visible}
            title={alertConfig.title}
            message={alertConfig.message}
            isDestructive={alertConfig.isError && !!alertConfig.onConfirm}
            onClose={() => {
                closeAlert();
                // Only bounce back to the dashboard after a client booking — a PT
                // blocking out several slots in a row wants to stay where they are.
                if (alertConfig.isSuccess && selectedClientForBooking) {
                    router.push('/(tabs)');
                }
            }}
            onConfirm={alertConfig.onConfirm}
        />
    );

    // ── PT / admin home: requests, clients, hours and their own training ──
    if (isPtOrAdmin && !selectedClientForBooking && !isManagingAvailability && !isBookingOwnPt) {
        const ptCode = user?.uid ? user.uid.substring(0, 6).toUpperCase() : '------';
        const now = new Date();
        // Requests whose time has already passed can't be approved any more, so they
        // sit apart and only offer a way to clear them.
        const openRequests = pendingRequests.filter(r => r.startTime > now);
        const expiredRequests = pendingRequests.filter(r => r.startTime <= now);

        const renderRequestRow = (req: Booking & { clientName: string }, isLast: boolean, expired: boolean) => (
            <ListRow key={req.id} isLast={isLast}>
                <View style={styles.requestHeader}>
                    <Avatar name={req.clientName} size={36} />
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.rowTitle, { color: theme.text }]}>{req.clientName}</Text>
                        <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]}>
                            {format(req.startTime, 'EEE d MMM')} · {format(req.startTime, 'HH:mm')}–{format(req.endTime, 'HH:mm')}
                        </Text>
                    </View>
                    {expired && <Badge label="Expired" tone="neutral" />}
                </View>
                {expired ? (
                    <Button
                        variant="secondary"
                        size="sm"
                        label="Dismiss"
                        onPress={() => handleDeclineRequest(req.id!, req.clientName)}
                        style={styles.requestActionSingle}
                    />
                ) : (
                    <View style={styles.requestActions}>
                        <Button variant="secondary" size="sm" label="Decline" onPress={() => handleDeclineRequest(req.id!, req.clientName)} style={{ flex: 1 }} />
                        <Button variant="primary" size="sm" icon="checkmark" label="Approve" onPress={() => handleApproveRequest(req.id!, req.clientName)} style={{ flex: 1 }} />
                    </View>
                )}
            </ListRow>
        );

        const clientsTab = (
            <>
                <View style={styles.section}>
                    <SectionHeader title={openRequests.length > 0 ? `Requests (${openRequests.length})` : 'Requests'} />
                    {pendingLoading && pendingRequests.length === 0 ? (
                        <ActivityIndicator size="small" color={theme.tint} />
                    ) : openRequests.length === 0 ? (
                        <EmptyState icon="checkmark-circle-outline" title="You're all caught up." compact />
                    ) : (
                        <ListContainer>
                            {openRequests.map((req, i) => renderRequestRow(req, i === openRequests.length - 1, false))}
                        </ListContainer>
                    )}
                    {expiredRequests.length > 0 && (
                        <>
                            <Text style={[styles.subheading, { color: theme.textSecondary }]}>Missed — time has passed</Text>
                            <ListContainer>
                                {expiredRequests.map((req, i) => renderRequestRow(req, i === expiredRequests.length - 1, true))}
                            </ListContainer>
                        </>
                    )}
                </View>

                <View style={styles.section}>
                    <SectionHeader title="Clients" />
                    <SegmentedControl
                        options={[
                            { value: 'active', label: `Active (${activeClients.length})` },
                            { value: 'inactive', label: `Inactive (${inactiveClients.length})` },
                        ]}
                        value={clientListTab}
                        onChange={setClientListTab}
                        style={{ marginBottom: Spacing.md }}
                    />
                    {clientsLoading && clients.length === 0 ? (
                        <ActivityIndicator size="small" color={theme.tint} />
                    ) : visibleClients.length > 0 ? (
                        <ListContainer>
                            {visibleClients.map((client, index) => {
                                const active = isUserActive(client);
                                return (
                                    <ListRow key={client.id} isLast={index === visibleClients.length - 1} style={styles.clientRow}>
                                        <Avatar name={client.name} size={36} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>{client.name}</Text>
                                            <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>{client.email}</Text>
                                        </View>
                                        {active && (
                                            <Button variant="tint" size="sm" label="Book" onPress={() => setSelectedClientForBooking(client)} />
                                        )}
                                        <IconButton
                                            icon={active ? 'archive-outline' : 'arrow-undo-outline'}
                                            size={36}
                                            accessibilityLabel={active ? `Move ${client.name} to Inactive` : `Move ${client.name} back to Active`}
                                            onPress={() => handleSetClientActive(client, !active)}
                                        />
                                    </ListRow>
                                );
                            })}
                        </ListContainer>
                    ) : (
                        <EmptyState
                            icon="people-outline"
                            title={
                                clients.length === 0
                                    ? 'No clients yet — share your code below.'
                                    : clientListTab === 'active'
                                        ? 'No active clients.'
                                        : 'No inactive clients.'
                            }
                            compact
                        />
                    )}
                    {clientListTab === 'active' && activeClients.length > 0 && (
                        <Text style={[styles.hint, { color: theme.textTertiary }]}>
                            The archive button moves a client to Inactive. Their history and bookings are kept.
                        </Text>
                    )}
                </View>

                <View style={styles.section}>
                    <SectionHeader title="Add a Client" />
                    <Card>
                        <View style={styles.codeRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.codeLabel, { color: theme.textSecondary }]}>Your PT code</Text>
                                <Text style={[styles.codeValue, { color: theme.text }]} selectable>{ptCode}</Text>
                            </View>
                            <Button
                                variant="tint"
                                size="sm"
                                icon="copy-outline"
                                label="Copy"
                                onPress={async () => {
                                    await Clipboard.setStringAsync(ptCode);
                                    setAlertConfig({ visible: true, title: 'Copied', message: 'Your PT code is on the clipboard.', isSuccess: true });
                                }}
                            />
                        </View>
                        <Text style={[styles.codeHelp, { color: theme.textSecondary }]}>
                            Clients enter this code in the app to link their account to you.
                        </Text>
                    </Card>
                </View>
            </>
        );

        const scheduleTab = (
            <>
                <View style={styles.section}>
                    <SectionHeader title="Your Week" />
                    <Card style={styles.linkCard}>
                        <View style={[styles.linkIcon, { backgroundColor: theme.tintMuted }]}>
                            <Ionicons name="grid-outline" size={20} color={theme.tint} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.rowTitle, { color: theme.text }]}>Week view (trial)</Text>
                            <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]}>Sessions, requests and blocked time at a glance</Text>
                        </View>
                        <Button variant="secondary" size="sm" label="Open" onPress={() => router.push('/week')} />
                    </Card>
                </View>

                <View style={styles.section}>
                    <SectionHeader title="Time Off" />
                    <Card style={styles.linkCard}>
                        <View style={[styles.linkIcon, { backgroundColor: theme.tintMuted }]}>
                            <Ionicons name="calendar-outline" size={20} color={theme.tint} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.rowTitle, { color: theme.text }]}>Block out time</Text>
                            <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]}>Holidays, appointments, one-off days off</Text>
                        </View>
                        <Button variant="secondary" size="sm" label="Open" onPress={() => setIsManagingAvailability(true)} />
                    </Card>
                </View>

                <View style={styles.section}>
                    <SectionHeader
                        title="Working Hours"
                        action={!isEditingHours ? <Button variant="ghost" size="sm" icon="pencil" label="Edit" onPress={openHoursEditor} /> : undefined}
                    />
                    <Text style={[styles.hint, styles.hintTop, { color: theme.textSecondary }]}>
                        Clients can only request sessions inside these hours.
                    </Text>

                    {!userProfile?.workingHours && !isEditingHours && (
                        <View style={[styles.notice, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            <Ionicons name="information-circle-outline" size={18} color={theme.tint} />
                            <Text style={[styles.noticeText, { color: theme.text }]}>
                                You haven&apos;t set your hours yet, so clients can request any day from 07:00 to 20:00.
                            </Text>
                        </View>
                    )}

                    <ListContainer>
                        {DAY_ORDER.map((day, index) => {
                            const source = isEditingHours ? hoursDraft : effectiveWorkingHours(userProfile?.workingHours);
                            const hours = source[day];
                            return (
                                <ListRow key={day} isLast={index === DAY_ORDER.length - 1} style={styles.hoursRow}>
                                    <Text style={[styles.hoursDay, { color: theme.text }]}>{DAY_LABELS[Number(day)]}</Text>
                                    {isEditingHours ? (
                                        <View style={styles.hoursControls}>
                                            {hours ? (
                                                <View style={styles.hoursChips}>
                                                    <Chip label={hours.start} onPress={() => setTimePicker({ day, field: 'start' })} />
                                                    <Text style={{ color: theme.textTertiary }}>–</Text>
                                                    <Chip label={hours.end} onPress={() => setTimePicker({ day, field: 'end' })} />
                                                </View>
                                            ) : (
                                                <Text style={[styles.hoursValue, { color: theme.textTertiary }]}>Off</Text>
                                            )}
                                            <Toggle
                                                value={!!hours}
                                                onValueChange={(enabled) => toggleWorkingDay(day, enabled)}
                                                accessibilityLabel={`Working on ${DAY_LABELS[Number(day)]}`}
                                            />
                                        </View>
                                    ) : (
                                        <Text style={[styles.hoursValue, { color: hours ? theme.textSecondary : theme.textTertiary }]}>
                                            {formatWorkingDay(hours)}
                                        </Text>
                                    )}
                                </ListRow>
                            );
                        })}
                    </ListContainer>

                    {isEditingHours && (
                        <View style={styles.buttonRow}>
                            <Button variant="secondary" label="Cancel" onPress={() => setIsEditingHours(false)} style={{ flex: 1 }} />
                            <Button variant="primary" label="Save Hours" onPress={handleSaveWorkingHours} loading={savingHours} style={{ flex: 1 }} />
                        </View>
                    )}
                </View>
            </>
        );

        const trainingTab = (
            <View style={styles.section}>
                <SectionHeader title="Your Own Training" />
                {userProfile?.assignedPtId ? (
                    assignedPtData ? (
                        <Card style={styles.linkCard}>
                            <Avatar name={assignedPtData.name} size={40} />
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.rowTitle, { color: theme.text }]}>{assignedPtData.name}</Text>
                                <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]}>Your trainer</Text>
                            </View>
                            <Button variant="primary" size="sm" label="Book" onPress={() => setIsBookingOwnPt(true)} />
                        </Card>
                    ) : (
                        <ActivityIndicator size="small" color={theme.tint} />
                    )
                ) : (
                    <Card>
                        <Text style={[styles.rowTitle, { color: theme.text }]}>Train with another PT</Text>
                        <Text style={[styles.rowSubtitle, { color: theme.textSecondary, marginBottom: Spacing.lg }]}>
                            Enter their 6-character code to book your own sessions with them.
                        </Text>
                        <TextField
                            placeholder="PT code"
                            value={ptCodeInput}
                            onChangeText={(text) => setPtCodeInput(text.toUpperCase())}
                            maxLength={6}
                            autoCapitalize="characters"
                            autoCorrect={false}
                            // Spaced-out letters suit the code but make the placeholder hard to read
                            style={[styles.codeInput, ptCodeInput.length > 0 && styles.codeInputFilled]}
                        />
                        <Button
                            variant="primary"
                            label="Link Trainer"
                            onPress={handleAssignPT}
                            disabled={ptCodeInput.length < 6}
                            loading={assigningLoading}
                            style={{ marginTop: Spacing.md }}
                        />
                    </Card>
                )}
            </View>
        );

        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
                <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
                    <ScreenHeader title="Personal Training" onBack={goToDashboard} backLabel="Dashboard" />
                    <SegmentedControl
                        options={[
                            { value: 'clients', label: openRequests.length > 0 ? `Clients · ${openRequests.length}` : 'Clients' },
                            { value: 'schedule', label: 'Schedule' },
                            { value: 'training', label: 'My Training' },
                        ]}
                        value={ptTab}
                        onChange={setPtTab}
                        style={{ marginBottom: Spacing.xxl }}
                    />
                    {ptTab === 'clients' && clientsTab}
                    {ptTab === 'schedule' && scheduleTab}
                    {ptTab === 'training' && trainingTab}
                </ScrollView>

                <Modal transparent animationType="fade" visible={!!timePicker} onRequestClose={() => setTimePicker(null)}>
                    <TouchableOpacity
                        style={[styles.pickerOverlay, { backgroundColor: theme.overlay }]}
                        activeOpacity={1}
                        onPress={() => setTimePicker(null)}
                    >
                        <View style={[styles.pickerBox, { backgroundColor: theme.card }]}>
                            <Text style={[styles.pickerTitle, { color: theme.text }]}>
                                {timePicker ? `${DAY_LABELS[Number(timePicker.day)]} ${timePicker.field === 'start' ? 'start' : 'finish'}` : ''}
                            </Text>
                            <ScrollView style={{ maxHeight: 320 }}>
                                {TIME_OPTIONS.map(option => {
                                    const current = timePicker ? hoursDraft[timePicker.day as keyof WorkingHours]?.[timePicker.field] : undefined;
                                    const isSelected = current === option;
                                    return (
                                        <TouchableOpacity
                                            key={option}
                                            style={[styles.pickerOption, isSelected && { backgroundColor: theme.tintMuted }]}
                                            onPress={() => {
                                                if (timePicker) setWorkingTime(timePicker.day, timePicker.field, option);
                                                setTimePicker(null);
                                            }}
                                        >
                                            <Text style={[styles.pickerOptionText, { color: isSelected ? theme.tint : theme.text }]}>{option}</Text>
                                            {isSelected && <Ionicons name="checkmark" size={18} color={theme.tint} />}
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </View>
                    </TouchableOpacity>
                </Modal>

                {alertElement}
            </SafeAreaView>
        );
    }

    // ── Client without a trainer: link one with their code ──
    if (userProfile?.role === 'client' && !userProfile.assignedPtId) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
                        <ScreenHeader title="Personal Training" onBack={goToDashboard} backLabel="Dashboard" />
                        <View style={styles.connect}>
                            <View style={[styles.connectIcon, { backgroundColor: theme.tintMuted }]}>
                                <Ionicons name="person-add-outline" size={32} color={theme.tint} />
                            </View>
                            <Text style={[styles.connectTitle, { color: theme.text }]}>Connect with your PT</Text>
                            <Text style={[styles.connectSubtitle, { color: theme.textSecondary }]}>
                                Enter the 6-character code your Thrive coach gave you.
                            </Text>

                            {/* OTP-style character boxes over a hidden input */}
                            <TouchableOpacity
                                activeOpacity={1}
                                onPress={() => ptCodeInputRef.current?.focus()}
                                style={styles.otpRow}
                                accessibilityLabel="PT code"
                            >
                                {Array.from({ length: 6 }).map((_, i) => {
                                    const char = ptCodeInput[i] || '';
                                    const isCurrent = i === Math.min(ptCodeInput.length, 5);
                                    return (
                                        <View
                                            key={i}
                                            style={[
                                                styles.otpBox,
                                                { backgroundColor: theme.card, borderColor: char || isCurrent ? theme.tint : theme.border },
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
                                    autoCorrect={false}
                                    autoFocus
                                />
                            </TouchableOpacity>

                            <Button
                                variant="primary"
                                label="Connect"
                                onPress={handleAssignPT}
                                disabled={ptCodeInput.length < 6}
                                loading={assigningLoading}
                                style={{ alignSelf: 'stretch' }}
                            />
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
                {alertElement}
            </SafeAreaView>
        );
    }

    // ── Client (or PT with their own trainer) requesting a session ──
    if (userProfile?.role === 'client' || isBookingOwnPt) {
        const bookableCount = ptSlots.filter(s => s.available).length;
        const slotItems: SlotItem[] = ptSlots.map(slot => ({
            key: slot.time.toISOString(),
            time: slot.time,
            title: slot.available ? `Until ${format(slot.endTime, 'HH:mm')}` : (slot.reason ?? 'Unavailable'),
            available: slot.available,
            tone: slot.available ? 'default' : 'muted',
        }));

        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
                <View style={styles.headerContainer}>
                    <ScreenHeader
                        title={assignedPtData ? `Book with ${ptFirstName}` : 'Your PT'}
                        subtitle="Pick a time to send a request"
                        onBack={isBookingOwnPt ? () => setIsBookingOwnPt(false) : goToDashboard}
                        backLabel={isBookingOwnPt ? 'PT' : 'Dashboard'}
                    />
                </View>

                <DateStrip dates={dates} selectedDate={selectedDate} onSelect={setSelectedDate} />

                <ScrollView contentContainerStyle={styles.slotsContainer}>
                    {loading || ptSlotsLoading ? (
                        <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 50 }} />
                    ) : !assignedPtData ? (
                        <EmptyState icon="alert-circle-outline" title="Couldn't load your PT's details" subtitle="Pull down or come back in a moment." />
                    ) : !ptDayWindow ? (
                        <EmptyState
                            icon="moon-outline"
                            title={`${ptFirstName} doesn't work ${format(selectedDate, 'EEEE')}s`}
                            subtitle="Try another day."
                        />
                    ) : ptSlots.length === 0 ? (
                        <EmptyState
                            icon="time-outline"
                            title="No more times left today"
                            subtitle={`${ptFirstName} works ${format(ptDayWindow.start, 'HH:mm')}–${format(ptDayWindow.end, 'HH:mm')} on ${format(selectedDate, 'EEEE')}s.`}
                        />
                    ) : (
                        <>
                            <Text style={[styles.hint, styles.hintTop, { color: theme.textSecondary }]}>
                                {bookableCount > 0
                                    ? `${bookableCount} time${bookableCount === 1 ? '' : 's'} free · ${ptFirstName} works ${format(ptDayWindow.start, 'HH:mm')}–${format(ptDayWindow.end, 'HH:mm')}`
                                    : `Fully booked · ${ptFirstName} works ${format(ptDayWindow.start, 'HH:mm')}–${format(ptDayWindow.end, 'HH:mm')}`}
                            </Text>
                            <SlotList
                                slots={slotItems}
                                disabled={bookingLoading}
                                onPress={item => {
                                    const slot = ptSlots.find(s => s.time.getTime() === item.time.getTime());
                                    if (slot) handleRequestPtSession(slot);
                                }}
                            />
                        </>
                    )}

                    <View style={{ marginTop: Spacing.xxxl }}>
                        <SectionHeader title="Your Requests" />
                        {clientPendingLoading && clientPendingSessions.length === 0 ? (
                            <ActivityIndicator size="small" color={theme.tint} />
                        ) : clientPendingSessions.length === 0 ? (
                            <EmptyState icon="hourglass-outline" title="No requests waiting for approval." compact />
                        ) : (
                            <ListContainer>
                                {clientPendingSessions.map((session, index) => (
                                    <ListRow key={session.id} isLast={index === clientPendingSessions.length - 1} style={styles.clientRow}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.rowTitle, { color: theme.text }]}>
                                                {format(session.startTime, 'EEE d MMM')} · {format(session.startTime, 'HH:mm')}
                                            </Text>
                                            <View style={{ marginTop: Spacing.xs }}>
                                                <Badge label="Awaiting approval" tone="warning" />
                                            </View>
                                        </View>
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            label="Withdraw"
                                            onPress={() => handleCancelPendingSession(session)}
                                            loading={cancellingSessionId === session.id}
                                        />
                                    </ListRow>
                                ))}
                            </ListContainer>
                        )}
                    </View>

                    {assignedPtData && (
                        <Text style={[styles.hint, styles.footerHint, { color: theme.textTertiary }]}>
                            Training with {assignedPtData.name}. Requests need their approval.
                        </Text>
                    )}
                </ScrollView>
                {alertElement}
            </SafeAreaView>
        );
    }

    // ── PT booking a client, or managing their own availability ──
    const firstName = selectedClientForBooking?.name.split(' ')[0];
    const frequencyOptions = [
        { value: 'none' as const, label: 'Once' },
        { value: 'weekly' as const, label: 'Weekly' },
        { value: 'bi-weekly' as const, label: 'Fortnightly' },
        { value: 'monthly' as const, label: 'Monthly' },
    ];

    const slotItems: SlotItem[] = availableSlots.map(slot => {
        const base = {
            key: slot.time.toISOString(),
            time: slot.time,
            groupId: slot.conflictBookingId,
            groupColor: slot.conflictBookingId === 'admin-block' ? theme.textTertiary : bookingTypeColor(theme, slot.conflictBookingType),
        };
        if (isManagingAvailability) {
            return slot.isBlockedByMe
                ? { ...base, title: 'Blocked · tap to unblock', tone: 'warning' as const, available: true }
                : { ...base, title: `Block until ${format(addMinutes(slot.time, blockDuration * 60), 'HH:mm')}`, tone: 'muted' as const, available: slot.available };
        }
        if (!slot.available) {
            return { ...base, title: slot.conflictReason ?? 'Booked', tone: 'muted' as const, available: false };
        }
        return slot.bookedPtCount === 1
            ? { ...base, title: 'Shared session · 1 of 2 booked', tone: 'tint' as const, available: true }
            : { ...base, title: `Until ${format(addMinutes(slot.time, 60), 'HH:mm')}`, available: true };
    });

    const blockWholeDay = () => {
        const dayStart = setMinutes(setHours(selectedDate, PT_OPEN_HOUR), 0);
        const dayEnd = setMinutes(setHours(selectedDate, PT_CLOSE_HOUR), 0);
        const durationHours = PT_CLOSE_HOUR - PT_OPEN_HOUR;
        setAlertConfig({
            visible: true,
            title: 'Block the Whole Day',
            message: `Block ${format(dayStart, 'HH:mm')}–${format(dayEnd, 'HH:mm')} on ${format(selectedDate, 'EEE d MMM')}${recurringFrequency !== 'none' ? ` (${frequencyOptions.find(f => f.value === recurringFrequency)?.label.toLowerCase()})` : ''}?`,
            onConfirm: () => confirmBooking(dayStart, user!.uid, 'pt_block', durationHours * 60)
        });
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={styles.headerContainer}>
                {selectedClientForBooking ? (
                    <ScreenHeader
                        title={`Book ${firstName}`}
                        subtitle="Choose a day and start time"
                        onBack={() => setSelectedClientForBooking(null)}
                        backLabel="Clients"
                    />
                ) : (
                    <ScreenHeader
                        title="Block Out Time"
                        subtitle="Tap a time to block it, or a blocked time to free it"
                        onBack={() => setIsManagingAvailability(false)}
                        backLabel="Schedule"
                    />
                )}
            </View>

            <DateStrip dates={dates} selectedDate={selectedDate} onSelect={setSelectedDate} />

            <ScrollView contentContainerStyle={styles.slotsContainer}>
                <View style={styles.optionsBlock}>
                    <ChipGroup label="Repeat" options={frequencyOptions} value={recurringFrequency} onChange={setRecurringFrequency} />
                    {isManagingAvailability && (
                        <>
                            <ChipGroup
                                label="Block length"
                                options={[1, 2, 3, 4, 6, 8].map(h => ({ value: h, label: `${h}h` }))}
                                value={blockDuration}
                                onChange={setBlockDuration}
                            />
                            <Button variant="secondary" size="sm" icon="calendar-outline" label="Block the whole day" onPress={blockWholeDay} style={{ alignSelf: 'flex-start' }} />
                        </>
                    )}
                </View>
                {loading ? (
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

            {alertElement}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    page: {
        padding: Spacing.xl,
        paddingBottom: Spacing.huge,
    },
    headerContainer: {
        paddingHorizontal: Spacing.xl,
    },
    section: {
        marginBottom: Spacing.xxxl,
    },
    subheading: {
        ...Typography.caption,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginTop: Spacing.lg,
        marginBottom: Spacing.sm,
        marginLeft: Spacing.xs,
    },
    rowTitle: {
        ...Typography.headline,
    },
    rowSubtitle: {
        ...Typography.footnote,
        fontWeight: '400',
        marginTop: 2,
    },
    hint: {
        ...Typography.footnote,
        fontWeight: '400',
        lineHeight: 18,
        marginTop: Spacing.sm,
        marginHorizontal: Spacing.xs,
    },
    hintTop: {
        marginTop: 0,
        marginBottom: Spacing.md,
    },
    footerHint: {
        textAlign: 'center',
        marginTop: Spacing.xxl,
    },
    requestHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
    },
    requestActions: {
        flexDirection: 'row',
        gap: Spacing.sm,
        marginTop: Spacing.md,
    },
    requestActionSingle: {
        marginTop: Spacing.md,
        alignSelf: 'flex-start',
    },
    clientRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        paddingVertical: Spacing.md,
    },
    codeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
    },
    codeLabel: {
        ...Typography.footnote,
    },
    codeValue: {
        ...Typography.title1,
        letterSpacing: 4,
        marginTop: 2,
        fontVariant: ['tabular-nums'],
    },
    codeHelp: {
        ...Typography.footnote,
        fontWeight: '400',
        marginTop: Spacing.md,
        lineHeight: 18,
    },
    codeInput: {
        textAlign: 'center',
    },
    codeInputFilled: {
        letterSpacing: 6,
        fontWeight: '700',
        fontSize: 20,
    },
    linkCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
    },
    linkIcon: {
        width: 40,
        height: 40,
        borderRadius: Radii.pill,
        alignItems: 'center',
        justifyContent: 'center',
    },
    notice: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: Spacing.sm,
        padding: Spacing.md,
        borderRadius: Radii.md,
        borderWidth: StyleSheet.hairlineWidth,
        marginBottom: Spacing.md,
    },
    noticeText: {
        ...Typography.footnote,
        fontWeight: '400',
        flex: 1,
        lineHeight: 18,
    },
    hoursRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 52,
        paddingVertical: Spacing.sm,
    },
    hoursDay: {
        ...Typography.subhead,
        fontWeight: '600',
    },
    hoursValue: {
        ...Typography.subhead,
        fontWeight: '400',
        fontVariant: ['tabular-nums'],
    },
    hoursControls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        flexShrink: 1,
    },
    hoursChips: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: Spacing.md,
        marginTop: Spacing.lg,
    },
    pickerOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.xl,
    },
    pickerBox: {
        width: '100%',
        maxWidth: 320,
        borderRadius: Radii.xl,
        paddingVertical: Spacing.lg,
        ...Shadows.lg,
    },
    pickerTitle: {
        ...Typography.headline,
        textAlign: 'center',
        marginBottom: Spacing.md,
    },
    pickerOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.xl,
    },
    pickerOptionText: {
        ...Typography.body,
        fontVariant: ['tabular-nums'],
    },
    slotsContainer: {
        padding: Spacing.xl,
        paddingBottom: Spacing.huge,
    },
    optionsBlock: {
        gap: Spacing.lg,
        marginBottom: Spacing.xxl,
    },
    connect: {
        alignItems: 'center',
        paddingTop: Spacing.xxl,
    },
    connectIcon: {
        width: 72,
        height: 72,
        borderRadius: Radii.pill,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.xl,
    },
    connectTitle: {
        ...Typography.title1,
        textAlign: 'center',
        marginBottom: Spacing.sm,
    },
    connectSubtitle: {
        ...Typography.body,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: Spacing.xxxl,
    },
    otpRow: {
        flexDirection: 'row',
        gap: Spacing.sm,
        justifyContent: 'center',
        marginBottom: Spacing.xxxl,
    },
    otpBox: {
        width: 46,
        height: 56,
        borderRadius: Radii.md,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    otpChar: {
        ...Typography.title2,
    },
    otpHiddenInput: {
        position: 'absolute',
        width: 1,
        height: 1,
        opacity: 0,
    },
});
