import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/auth';
import { getAllBookingsForDate, blockOutSlot, cancelBooking, Booking, UserProfile, getAllUsers, getUserProfile, updateUserProfile, getBookingsForDateRange, getPTBookingsForInstructor, getUserBookings, getAllPTs, isUserActive } from '../../services/bookingService';
import { getGlobalSettings, updateGlobalSettings, GlobalSettings } from '../../services/settingsService';
import { format, addDays, startOfDay, addMinutes, setHours, setMinutes, isToday, isBefore, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import CustomAlert from '../../components/CustomAlert';
import RescheduleSheet, { RescheduleTarget } from '../../components/RescheduleSheet';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Spacing, Typography, bookingTypeColor } from '@/constants/theme';
import { BOOKING_WINDOW_DAYS } from '@/constants/config';
import { ScreenHeader, EmptyState, Badge, Button, Card, Avatar, ChipGroup, DateStrip, IconButton, ListContainer, ListRow, SectionHeader, SegmentedControl, StatBox, TextField, Toggle } from '@/components/ui';

type BookingTypeBadgeProps = { type: string };
const BookingTypeBadge = ({ type }: BookingTypeBadgeProps) => {
    if (type === 'pt') return <Badge label="PT" tone="tint" />;
    if (type === 'group') return <Badge label="Group" tone="info" />;
    return <Badge label={type === 'gym' ? 'Gym' : type} tone="neutral" />;
};

// How many rows a "by client" breakdown shows before "Show all"
const BREAKDOWN_PREVIEW = 5;

// Operating hours
const OPEN_HOUR = 7;
const CLOSE_HOUR = 20;

type AdminTab = 'schedule' | 'history' | 'members' | 'settings';

export default function AdminScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const [activeTab, setActiveTab] = useState<AdminTab>('schedule');
    const scheduleRef = useRef<ScrollView>(null);
    // y position of each timeline row, recorded as they lay out, so we can scroll to "now"
    const rowOffsets = useRef<Record<number, number>>({});
    const timelineTop = useRef(0);
    const [timelineLaidOut, setTimelineLaidOut] = useState(false);
    const [userRole, setUserRole] = useState<string>('');
    
    // History Tab State
    const [historyDate, setHistoryDate] = useState<Date>(startOfMonth(new Date()));
    const [historyBookings, setHistoryBookings] = useState<Booking[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyPtFilter, setHistoryPtFilter] = useState<string>('all');
    const [historySearchQuery, setHistorySearchQuery] = useState<string>('');
    const [ptsList, setPtsList] = useState<UserProfile[]>([]);

    // Member Detail Engagement State
    const [memberBookings, setMemberBookings] = useState<Booking[]>([]);
    const [memberHistoryLoading, setMemberHistoryLoading] = useState(false);
    
    // Schedule State
    const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
    const [dailyBookings, setDailyBookings] = useState<(Booking & { user?: UserProfile })[]>([]);
    const [loading, setLoading] = useState(false);
    const [adminBlockDuration, setAdminBlockDuration] = useState<15 | 30 | 60>(15);

    const [historyBreakdownExpanded, setHistoryBreakdownExpanded] = useState(false);
    const [memberBreakdownExpanded, setMemberBreakdownExpanded] = useState(false);

    // Members State
    const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
    const [membersLoading, setMembersLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState<'all' | 'client' | 'pt' | 'admin'>('all');
    // Current members are the default view; the ones who have left or paused sit behind their own tab
    const [statusFilter, setStatusFilter] = useState<'active' | 'inactive'>('active');
    const [selectedMember, setSelectedMember] = useState<UserProfile | null>(null);

    // Settings State
    const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null);
    const [signupCode, setSignupCode] = useState('');
    const [savingCode, setSavingCode] = useState(false);
    const [isEditingSignupCode, setIsEditingSignupCode] = useState(false);

    const [announcementText, setAnnouncementText] = useState('');
    const [showAnnouncement, setShowAnnouncement] = useState(false);
    const [savingAnnouncement, setSavingAnnouncement] = useState(false);

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
    const [rescheduleTarget, setRescheduleTarget] = useState<RescheduleTarget | null>(null);

    const dates = useMemo(() => Array.from({ length: 7 + BOOKING_WINDOW_DAYS }).map((_, i) => addDays(startOfDay(new Date()), i - 7)), []);

    useEffect(() => {
        if (activeTab === 'schedule') {
            fetchSchedule();
        } else if (activeTab === 'history') {
            fetchHistory();
        } else if (activeTab === 'members') {
            fetchMembers();
        } else if (activeTab === 'settings') {
            fetchSettings();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate, activeTab, historyDate]);

    const scheduleBlocks = useMemo(() => {
        const blocks = [];
        let currentTime = setMinutes(setHours(selectedDate, OPEN_HOUR), 0);
        const endTime = setMinutes(setHours(selectedDate, CLOSE_HOUR), 0);

        while (currentTime < endTime) {
            const blockEnd = addMinutes(currentTime, 15);
            const overlapping = dailyBookings.filter(b => b.startTime < blockEnd && b.endTime > currentTime);
            blocks.push({ time: currentTime, bookings: overlapping });
            currentTime = addMinutes(currentTime, 15);
        }
        return blocks;
    }, [selectedDate, dailyBookings]);

    useEffect(() => {
        // Wait for the list to mount (it's replaced by a spinner while loading)
        if (activeTab === 'schedule' && !loading && timelineLaidOut && isToday(selectedDate) && scheduleBlocks.length > 0) {
            const now = new Date();
            const totalMinutesFromStart = (now.getHours() - OPEN_HOUR) * 60 + now.getMinutes();
            let blockIndex = Math.floor(totalMinutesFromStart / 15);
            
            // Boundary checks
            if (blockIndex < 0) blockIndex = 0;
            if (blockIndex >= scheduleBlocks.length) blockIndex = scheduleBlocks.length - 1;

            // Land with the previous half hour still visible for context
            const targetIndex = Math.max(0, blockIndex - 2);
            if (blockIndex > 0) {
                // Rows report their layout after the container does, so give them a beat
                const timer = setTimeout(() => {
                    const y = rowOffsets.current[targetIndex];
                    if (y !== undefined) scheduleRef.current?.scrollTo({ y: timelineTop.current + y, animated: true });
                }, 150);
                return () => clearTimeout(timer);
            }
        }
    }, [selectedDate, activeTab, scheduleBlocks.length, loading, timelineLaidOut]);

    useEffect(() => {
        if (user) {
            getUserProfile(user.uid).then(profile => {
                if (profile) setUserRole(profile.role);
            });
        }
    }, [user]);

    const fetchSchedule = async () => {
        setLoading(true);
        setTimelineLaidOut(false);
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

    const fetchHistory = async () => {
        setHistoryLoading(true);
        try {
            const start = startOfMonth(historyDate);
            const end = endOfMonth(historyDate);
            const bookings = await getBookingsForDateRange(start, end);
            setHistoryBookings(bookings);

            // Fetch PT list and all users in parallel
            const [pts, users] = await Promise.all([
                getAllPTs(),
                getAllUsers()
            ]);
            setPtsList(pts);
            setAllUsers(users);
        } catch (error) {
            console.error('Error fetching history:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to load booking history.',
            });
        } finally {
            setHistoryLoading(false);
        }
    };

    useEffect(() => {
        if (selectedMember) {
            setMemberHistoryLoading(true);
            const fetchMemberBookings = async () => {
                try {
                    let bookings: Booking[] = [];
                    if (selectedMember.role === 'client') {
                        bookings = await getUserBookings(selectedMember.id);
                    } else if (selectedMember.role === 'pt' || selectedMember.role === 'admin') {
                        bookings = await getPTBookingsForInstructor(selectedMember.id);
                    }
                    setMemberBookings(bookings.sort((a, b) => b.startTime.getTime() - a.startTime.getTime()));
                } catch (error) {
                    console.error('Error fetching member bookings:', error);
                } finally {
                    setMemberHistoryLoading(false);
                }
            };
            fetchMemberBookings();
        } else {
            setMemberBookings([]);
        }
    }, [selectedMember]);

    const fetchMembers = async () => {
        setMembersLoading(true);
        try {
            const users = await getAllUsers();
            setAllUsers(users);
        } catch (error) {
            console.error('Error fetching members:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to load members.',
            });
        } finally {
            setMembersLoading(false);
        }
    };

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const settings = await getGlobalSettings();
            setGlobalSettings(settings);
            setSignupCode(settings?.signupCode || '');
            setAnnouncementText(settings?.announcementText || '');
            setShowAnnouncement(settings?.showAnnouncement || false);
        } catch (error) {
            console.error('Error fetching settings:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to load settings.',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleSaveSignupCode = async () => {
        if (!signupCode.trim()) {
            // Alert.alert does nothing on web, so use the in-app alert
            setAlertConfig({ visible: true, title: 'Code Needed', message: 'The sign-up code cannot be empty.' });
            return false;
        }

        setSavingCode(true);
        try {
            await updateGlobalSettings({ signupCode: signupCode.trim() });
            setAlertConfig({
                visible: true,
                title: 'Success',
                message: 'Signup code updated successfully.',
                isDestructive: false
            });
            return true;
        } catch (error) {
            console.error('Error saving signup code:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to update signup code. Check permissions.',
                isDestructive: false
            });
            return false;
        } finally {
            setSavingCode(false);
        }
    };

    const handleSaveAnnouncement = async () => {
        setSavingAnnouncement(true);
        try {
            await updateGlobalSettings({ 
                announcementText: announcementText.trim()
            });
            setAlertConfig({
                visible: true,
                title: 'Success',
                message: 'Announcement settings updated.',
                isDestructive: false
            });
        } catch (error) {
            console.error('Error saving announcement:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to update announcement. Check permissions.',
                isDestructive: false
            });
        } finally {
            setSavingAnnouncement(false);
            fetchSettings(); // Refresh to catch any other changes
        }
    };

    const handleToggleAnnouncement = async (val: boolean) => {
        setShowAnnouncement(val);
        try {
            await updateGlobalSettings({ showAnnouncement: val });
        } catch (error) {
            console.error('Error saving announcement toggle:', error);
            // Revert state if it fails
            setShowAnnouncement(!val);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to update toggle.',
                isDestructive: false
            });
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
                } catch {
                    setAlertConfig({ visible: true, title: 'Error', message: 'Failed to cancel booking.' });
                    setLoading(false);
                }
            }
        });
    };

    // Admins can move any PT session; a PT only the ones they lead
    const canReschedule = (b: Booking) =>
        b.type === 'pt' && b.status === 'confirmed' && !!b.ptId && (userRole === 'admin' || b.ptId === user?.uid);

    const openReschedule = (b: Booking & { user?: UserProfile }) => {
        if (!b.id || !b.ptId) return;
        // A paired session is two bookings in the same slot with the same PT; they move together
        const partner = dailyBookings.find(o =>
            o.id !== b.id && o.type === 'pt' && o.status === 'confirmed' && o.ptId === b.ptId &&
            o.startTime.getTime() === b.startTime.getTime()
        ) as (Booking & { user?: UserProfile }) | undefined;
        setRescheduleTarget({
            bookingId: b.id,
            clientId: b.userId,
            clientName: b.user?.name || 'Client',
            ptId: b.ptId,
            startTime: b.startTime,
            endTime: b.endTime,
            partner: partner?.id
                ? { bookingId: partner.id, clientId: partner.userId, name: partner.user?.name || 'Partner' }
                : undefined,
        });
    };

    const handleRescheduled = (newStart: Date, newEnd: Date) => {
        const target = rescheduleTarget;
        setRescheduleTarget(null);
        fetchSchedule();
        const who = target?.partner ? `${target.clientName} and ${target.partner.name}` : target?.clientName;
        setAlertConfig({
            visible: true,
            title: 'Session Moved',
            message: `${who}'s session is now ${format(newStart, 'EEE d MMM')}, ${format(newStart, 'HH:mm')}–${format(newEnd, 'HH:mm')}.`,
            confirmText: 'Great',
        });
    };

    const handleBlockSlot = (time: Date) => {
        const durationLabel = adminBlockDuration === 60 ? '1 hour' : `${adminBlockDuration} minutes`;
        setAlertConfig({
            visible: true,
            title: 'Block Out Slot',
            message: `Prevent clients from booking ${durationLabel} at ${format(time, 'HH:mm')}?`,
            isDestructive: true,
            confirmText: 'Block Slot',
            onConfirm: async () => {
                if (!user) return;
                setLoading(true);
                try {
                    await blockOutSlot(user.uid, time, addMinutes(time, adminBlockDuration), 'Admin block out');
                    fetchSchedule();
                } catch {
                    setAlertConfig({ visible: true, title: 'Error', message: 'Failed to block slot.' });
                    setLoading(false);
                }
            }
        });
    };

    const filteredUsers = useMemo(() => {
        return allUsers.filter(u => {
            const matchesSearch = u.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                u.email?.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesRole = roleFilter === 'all' || u.role === roleFilter;
            const matchesStatus = isUserActive(u) === (statusFilter === 'active');
            return matchesSearch && matchesRole && matchesStatus;
        }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [allUsers, searchQuery, roleFilter, statusFilter]);

    const roleTone = (role: string) => (role === 'admin' ? 'info' : role === 'pt' ? 'tint' : 'neutral') as 'info' | 'tint' | 'neutral';
    const roleLabel = (role: string) => (role === 'pt' ? 'PT' : role.charAt(0).toUpperCase() + role.slice(1));

    // Rounded top on the first row and bottom on the last, so a FlatList of rows reads as one grouped card
    const groupedRowStyle = (index: number, count: number) => [
        styles.groupedRow,
        { backgroundColor: theme.card, borderColor: theme.border },
        index === 0 && styles.groupedRowFirst,
        index === count - 1 && styles.groupedRowLast,
    ];

    const renderSchedule = () => {
        const now = new Date();
        const viewingToday = isToday(selectedDate);
        const isPastDate = isBefore(selectedDate, startOfDay(now));
        const bookedCount = dailyBookings.filter(b => b.type !== 'block').length;
        const blockedCount = scheduleBlocks.filter(block => block.bookings.some((b: Booking) => b.type === 'block')).length;

        return (
            <View style={{ flex: 1 }}>
                {loading ? (
                    <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 50 }} />
                ) : (
                    <ScrollView
                        ref={scheduleRef}
                        contentContainerStyle={styles.scheduleContainer}
                    >
                            <View style={styles.scheduleHeader}>
                                <Text style={[styles.scheduleSummary, { color: theme.textSecondary }]}>
                                    {bookedCount === 0 ? 'Nothing booked' : `${bookedCount} booking${bookedCount === 1 ? '' : 's'}`}
                                    {blockedCount > 0 ? ` · ${blockedCount} slot${blockedCount === 1 ? '' : 's'} blocked` : ''}
                                </Text>
                                {!isPastDate && (
                                    <ChipGroup
                                        options={[
                                            { value: 15 as const, label: '15m' },
                                            { value: 30 as const, label: '30m' },
                                            { value: 60 as const, label: '1h' },
                                        ]}
                                        value={adminBlockDuration}
                                        onChange={setAdminBlockDuration}
                                    />
                                )}
                            </View>
                        <View
                            onLayout={e => {
                                timelineTop.current = e.nativeEvent.layout.y;
                                setTimelineLaidOut(true);
                            }}
                        >
                        {scheduleBlocks.map((block, index) => {
                            const blockBooking = block.bookings.find((b: Booking) => b.type === 'block');
                            const blockEnd = addMinutes(block.time, 15);
                            const isPastSlot = isPastDate || (viewingToday && blockEnd <= now);
                            const isNow = viewingToday && block.time <= now && blockEnd > now;
                            const isHour = block.time.getMinutes() === 0;
                            const people = block.bookings.filter((b: Booking) => b.type !== 'block') as (Booking & { user?: UserProfile; instructorName?: string })[];
                            // A booking is listed in full on the slot it starts in; later slots it
                            // runs through just carry a muted "still here" line instead of repeating it.
                            const starting = people.filter(b => b.startTime >= block.time);
                            const continuing = people.filter(b => b.startTime < block.time);
                            const groupName = blockBooking?.reason?.startsWith('Group Session')
                                ? blockBooking.reason.replace('Group Session: ', '')
                                : null;

                            return (
                                <View
                                    key={block.time.toISOString()}
                                    onLayout={e => { rowOffsets.current[index] = e.nativeEvent.layout.y; }}
                                    style={[
                                        ...groupedRowStyle(index, scheduleBlocks.length),
                                        styles.timelineRow,
                                        isHour && index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth },
                                        isNow && { backgroundColor: theme.tintMuted },
                                    ]}
                                >
                                    {isNow && <View style={[styles.nowBar, { backgroundColor: theme.tint }]} />}
                                    <View style={styles.timelineTime}>
                                        <Text
                                            style={[
                                                isHour ? styles.timeHour : styles.timeQuarter,
                                                { color: isNow ? theme.tint : isHour ? theme.text : theme.textTertiary },
                                                isPastSlot && !isNow && { color: theme.textTertiary },
                                            ]}
                                        >
                                            {format(block.time, 'HH:mm')}
                                        </Text>
                                        {isNow && <Text style={[styles.nowLabel, { color: theme.tint }]}>Now</Text>}
                                    </View>

                                    <View style={[styles.timelineBody, isPastSlot && !isNow && { opacity: 0.55 }]}>
                                        {blockBooking && (
                                            <View style={[styles.blockedPill, { backgroundColor: theme.dangerMuted }]}>
                                                <Ionicons name="lock-closed" size={12} color={theme.danger} />
                                                <Text style={[styles.blockedText, { color: theme.danger }]} numberOfLines={1}>
                                                    {groupName ? `Group: ${groupName}` : 'Blocked'}
                                                </Text>
                                            </View>
                                        )}
                                        {starting.map(b => {
                                            const userName = b.user?.name || b.user?.email || 'Unknown Client';
                                            const typeLabel = b.type === 'pt'
                                                ? (b.instructorName ? `PT with ${b.instructorName}` : 'PT')
                                                : b.type === 'group' ? 'Group' : 'Gym';
                                            return (
                                                <View key={b.id} style={styles.personRow}>
                                                    <View style={[styles.typeDot, { backgroundColor: bookingTypeColor(theme, b.type) }]} />
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={[styles.personName, { color: theme.text }]} numberOfLines={1}>{userName}</Text>
                                                        <Text style={[styles.personMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                                                            {typeLabel} · until {format(b.endTime, 'HH:mm')}
                                                        </Text>
                                                    </View>
                                                    {!isPastSlot && canReschedule(b) && (
                                                        <IconButton
                                                            icon="calendar-outline"
                                                            size={30}
                                                            accessibilityLabel={`Reschedule session for ${userName}`}
                                                            onPress={() => openReschedule(b)}
                                                        />
                                                    )}
                                                    {!isPastSlot && (
                                                        <IconButton
                                                            icon="close"
                                                            size={30}
                                                            accessibilityLabel={`Cancel booking for ${userName}`}
                                                            onPress={() => handleCancelBooking(b.id!, userName)}
                                                        />
                                                    )}
                                                </View>
                                            );
                                        })}
                                        {continuing.length > 0 && (
                                            <Text style={[styles.personMeta, { color: theme.textTertiary }]} numberOfLines={1}>
                                                Still in: {continuing.map(b => b.user?.name?.split(' ')[0] || 'Client').join(', ')}
                                            </Text>
                                        )}
                                    </View>

                                    {!isPastSlot && (
                                        blockBooking ? (
                                            <IconButton
                                                icon="lock-open-outline"
                                                tone="danger"
                                                size={32}
                                                accessibilityLabel={`Unblock ${format(block.time, 'HH:mm')}`}
                                                onPress={() => blockBooking.id && handleCancelBooking(blockBooking.id, groupName ?? 'this blocked slot')}
                                            />
                                        ) : (
                                            <IconButton
                                                icon="lock-closed-outline"
                                                tone="subtle"
                                                size={32}
                                                accessibilityLabel={`Block ${format(block.time, 'HH:mm')}`}
                                                onPress={() => handleBlockSlot(block.time)}
                                            />
                                        )
                                    )}
                                </View>
                            );
                        })}
                        </View>
                    </ScrollView>
                )}
            </View>
        );
    };

    // Marking a member inactive only files them under the Inactive tab: their history,
    // login and existing bookings are all untouched, and switching back restores the row.
    const handleToggleActiveStatus = async (member: UserProfile, newVal: boolean) => {
        setSelectedMember(prev => prev ? { ...prev, isActive: newVal } : null);
        setAllUsers(prev => prev.map(u => u.id === member.id ? { ...u, isActive: newVal } : u));
        try {
            await updateUserProfile(member.id, { isActive: newVal });
        } catch (error) {
            console.error('Error updating member status:', error);
            setSelectedMember(prev => prev ? { ...prev, isActive: !newVal } : null);
            setAllUsers(prev => prev.map(u => u.id === member.id ? { ...u, isActive: !newVal } : u));
            setAlertConfig({ visible: true, title: 'Error', message: 'Failed to update membership status.' });
        }
    };

    const handleToggleGymAccess = async (member: UserProfile, newVal: boolean) => {
        setSelectedMember(prev => prev ? { ...prev, canBookGym: newVal } : null);
        setAllUsers(prev => prev.map(u => u.id === member.id ? { ...u, canBookGym: newVal } : u));
        try {
            await updateUserProfile(member.id, { canBookGym: newVal });
        } catch (error) {
            console.error('Error updating gym access:', error);
            setSelectedMember(prev => prev ? { ...prev, canBookGym: !newVal } : null);
            setAllUsers(prev => prev.map(u => u.id === member.id ? { ...u, canBookGym: !newVal } : u));
            setAlertConfig({ visible: true, title: 'Error', message: 'Failed to update gym access.' });
        }
    };

    // "Mark Flynn — 43 sessions" style list, trimmed to the top few until asked for more
    const renderBreakdown = (rows: [string, number][], expanded: boolean, onToggle: () => void) => {
        const visible = expanded ? rows : rows.slice(0, BREAKDOWN_PREVIEW);
        return (
            <>
                <View style={[styles.divider, { backgroundColor: theme.border }]} />
                <Text style={[styles.breakdownHeading, { color: theme.textSecondary }]}>By client</Text>
                <View style={{ gap: Spacing.sm }}>
                    {visible.map(([name, count]) => (
                        <View key={name} style={styles.breakdownRow}>
                            <Text style={[styles.breakdownName, { color: theme.text }]} numberOfLines={1}>{name}</Text>
                            <Text style={[styles.breakdownCount, { color: theme.textSecondary }]}>{count}</Text>
                        </View>
                    ))}
                </View>
                {rows.length > BREAKDOWN_PREVIEW && (
                    <Button
                        variant="ghost"
                        size="sm"
                        label={expanded ? 'Show fewer' : `Show all ${rows.length} clients`}
                        onPress={onToggle}
                        style={{ alignSelf: 'flex-start', marginTop: Spacing.sm, paddingHorizontal: 0 }}
                    />
                )}
            </>
        );
    };

    const renderMemberDetail = () => {
        if (!selectedMember) return null;

        const now = new Date();
        const completed = memberBookings.filter(b => b.status === 'confirmed' && b.startTime < now);
        const upcoming = memberBookings.filter(b => b.status === 'confirmed' && b.startTime >= now).sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

        const ptCount = completed.filter(b => b.type === 'pt').length;
        const gymCount = completed.filter(b => b.type === 'gym').length;
        const groupCount = completed.filter(b => b.type === 'group').length;

        const clientBreakdown = new Map<string, number>();
        if (selectedMember.role === 'pt' || selectedMember.role === 'admin') {
            completed.forEach(b => {
                const clientProfile = allUsers.find(u => u.id === b.userId);
                const clientName = clientProfile?.name || clientProfile?.email || 'Unknown Client';
                clientBreakdown.set(clientName, (clientBreakdown.get(clientName) ?? 0) + 1);
            });
        }
        const ptClientBreakdownList = Array.from(clientBreakdown.entries()).sort((a, b) => b[1] - a[1]);

        return (
            <ScrollView contentContainerStyle={styles.tabPage}>
                <TouchableOpacity onPress={() => setSelectedMember(null)} style={styles.backRow} accessibilityRole="button">
                    <Ionicons name="chevron-back" size={20} color={theme.tint} />
                    <Text style={[styles.backText, { color: theme.tint }]}>Members</Text>
                </TouchableOpacity>

                <Card style={styles.memberDetailCard}>
                    <Avatar name={selectedMember.name || selectedMember.email} size={56} />
                    <Text style={[styles.memberDetailName, { color: theme.text }]}>{selectedMember.name || 'No name'}</Text>
                    <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]}>{selectedMember.email}</Text>
                    <View style={styles.badgeRow}>
                        <Badge label={roleLabel(selectedMember.role)} tone={roleTone(selectedMember.role)} />
                        {!isUserActive(selectedMember) && <Badge label="Inactive" tone="neutral" />}
                    </View>
                </Card>

                <ListContainer style={{ marginTop: Spacing.lg }}>
                    {selectedMember.id !== user?.uid && (
                        <ListRow isLast={selectedMember.role !== 'client'} style={styles.settingRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.settingLabel, { color: theme.text }]}>Active member</Text>
                                <Text style={[styles.settingDescription, { color: theme.textSecondary }]}>
                                    Turn off to file them under Inactive. History, login and bookings stay as they are.
                                </Text>
                            </View>
                            <Toggle value={isUserActive(selectedMember)} onValueChange={(val) => handleToggleActiveStatus(selectedMember, val)} accessibilityLabel="Active member" />
                        </ListRow>
                    )}
                    {selectedMember.role === 'client' && (
                        <ListRow isLast style={styles.settingRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.settingLabel, { color: theme.text }]}>Gym access</Text>
                                <Text style={[styles.settingDescription, { color: theme.textSecondary }]}>Let this client book gym sessions on their own.</Text>
                            </View>
                            <Toggle value={selectedMember.canBookGym ?? true} onValueChange={(val) => handleToggleGymAccess(selectedMember, val)} accessibilityLabel="Gym access" />
                        </ListRow>
                    )}
                </ListContainer>

                <SectionHeader title="Activity" style={{ marginTop: Spacing.xxl }} />

                {memberHistoryLoading ? (
                    <ActivityIndicator size="small" color={theme.tint} />
                ) : (
                    <View style={{ gap: Spacing.lg }}>
                        {selectedMember.role === 'client' && (
                            <View style={styles.statsRow}>
                                <StatBox icon="body-outline" value={ptCount} label="PT sessions" />
                                <StatBox icon="people-outline" value={groupCount} label="Group classes" />
                                <StatBox icon="barbell-outline" value={gymCount} label="Gym sessions" />
                            </View>
                        )}

                        {(selectedMember.role === 'pt' || selectedMember.role === 'admin') && (
                            <Card>
                                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Sessions run</Text>
                                <Text style={[styles.summaryValue, { color: theme.text }]}>{completed.length}</Text>
                                {ptClientBreakdownList.length > 0 && renderBreakdown(ptClientBreakdownList, memberBreakdownExpanded, () => setMemberBreakdownExpanded(v => !v))}
                            </Card>
                        )}

                        {selectedMember.role === 'client' && upcoming.length > 0 && (
                            <Card style={styles.nextCard}>
                                <View style={[styles.nextIcon, { backgroundColor: theme.tintMuted }]}>
                                    <Ionicons name="calendar-outline" size={18} color={theme.tint} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Next booking</Text>
                                    <Text style={[styles.rowTitle, { color: theme.text }]}>{format(upcoming[0].startTime, 'EEEE d MMMM')}</Text>
                                    <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]}>
                                        {format(upcoming[0].startTime, 'HH:mm')}–{format(upcoming[0].endTime, 'HH:mm')}
                                    </Text>
                                </View>
                            </Card>
                        )}

                        <View>
                            <Text style={[styles.breakdownHeading, { color: theme.textSecondary }]}>Recent sessions</Text>
                            {completed.length === 0 ? (
                                <EmptyState icon="time-outline" title="No completed sessions yet." compact />
                            ) : (
                                <ListContainer>
                                    {completed.slice(0, 10).map((b, i, arr) => {
                                        let nameLabel = '';
                                        if (selectedMember.role === 'client') {
                                            const ptProfile = b.ptId ? allUsers.find(u => u.id === b.ptId) : undefined;
                                            nameLabel = ptProfile ? `With ${ptProfile.name}` : 'Gym session';
                                        } else {
                                            const clientProfile = allUsers.find(u => u.id === b.userId);
                                            nameLabel = clientProfile ? `With ${clientProfile.name}` : 'Unknown client';
                                        }
                                        return (
                                            <ListRow key={b.id} isLast={i === arr.length - 1} style={styles.listRow}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[styles.rowTitle, { color: theme.text }]}>{nameLabel}</Text>
                                                    <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]}>
                                                        {format(b.startTime, 'EEE d MMM')} · {format(b.startTime, 'HH:mm')}
                                                    </Text>
                                                </View>
                                                <BookingTypeBadge type={b.type} />
                                            </ListRow>
                                        );
                                    })}
                                </ListContainer>
                            )}
                            {completed.length > 10 && (
                                <Text style={[styles.footnote, { color: theme.textTertiary }]}>Showing the last 10 sessions.</Text>
                            )}
                        </View>
                    </View>
                )}
            </ScrollView>
        );
    };

    const renderMembers = () => {
        if (selectedMember) return renderMemberDetail();
        const activeCount = allUsers.filter(isUserActive).length;
        return (
            <View style={styles.membersContainer}>
                <View style={styles.membersControls}>
                    <TextField
                        icon="search"
                        placeholder="Search by name or email"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    <SegmentedControl
                        options={[
                            { value: 'active', label: `Active (${activeCount})` },
                            { value: 'inactive', label: `Inactive (${allUsers.length - activeCount})` },
                        ]}
                        value={statusFilter}
                        onChange={setStatusFilter}
                    />
                    <ChipGroup
                        options={[
                            { value: 'all', label: 'Everyone' },
                            { value: 'client', label: 'Clients' },
                            { value: 'pt', label: 'PTs' },
                            { value: 'admin', label: 'Admins' },
                        ]}
                        value={roleFilter}
                        onChange={setRoleFilter}
                    />
                </View>

                {membersLoading ? (
                    <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 40 }} />
                ) : (
                    <FlatList
                        data={filteredUsers}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.listContent}
                        keyboardShouldPersistTaps="handled"
                        renderItem={({ item, index }) => (
                            <TouchableOpacity
                                style={[...groupedRowStyle(index, filteredUsers.length), styles.memberRow]}
                                onPress={() => setSelectedMember(item)}
                                activeOpacity={0.6}
                                accessibilityRole="button"
                            >
                                <Avatar name={item.name || item.email} size={36} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>{item.name || 'No name'}</Text>
                                    <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>{item.email}</Text>
                                </View>
                                {item.role !== 'client' && <Badge label={roleLabel(item.role)} tone={roleTone(item.role)} />}
                                <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
                            </TouchableOpacity>
                        )}
                        ListEmptyComponent={<EmptyState icon="people-outline" title={searchQuery ? 'No one matches that search.' : statusFilter === 'active' ? 'No active members.' : 'No inactive members.'} compact />}
                    />
                )}
            </View>
        );
    };

    const renderSettings = () => (
        <ScrollView contentContainerStyle={styles.tabPage} keyboardShouldPersistTaps="handled">
            {loading ? (
                <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 50 }} />
            ) : (
                <>
                    <SectionHeader title="Sign-up Code" />
                    <Card>
                        <Text style={[styles.settingDescription, { color: theme.textSecondary }]}>
                            New clients need this code to create an account.
                        </Text>
                        {isEditingSignupCode ? (
                            <>
                                <TextField
                                    value={signupCode}
                                    onChangeText={setSignupCode}
                                    placeholder="Enter a sign-up code"
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    containerStyle={{ marginTop: Spacing.md }}
                                />
                                <View style={styles.buttonRow}>
                                    <Button
                                        variant="secondary"
                                        label="Cancel"
                                        onPress={() => {
                                            setIsEditingSignupCode(false);
                                            setSignupCode(globalSettings?.signupCode || '');
                                        }}
                                        disabled={savingCode}
                                        style={{ flex: 1 }}
                                    />
                                    <Button
                                        variant="primary"
                                        label="Save"
                                        onPress={async () => {
                                            const saved = await handleSaveSignupCode();
                                            if (saved) setIsEditingSignupCode(false);
                                        }}
                                        disabled={savingCode || signupCode === globalSettings?.signupCode}
                                        loading={savingCode}
                                        style={{ flex: 1 }}
                                    />
                                </View>
                            </>
                        ) : (
                            <View style={[styles.codeDisplay, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                                <Text style={[styles.codeText, { color: theme.text }]} selectable numberOfLines={1}>
                                    {globalSettings?.signupCode || 'No code set'}
                                </Text>
                                <Button variant="secondary" size="sm" icon="pencil" label="Change" onPress={() => setIsEditingSignupCode(true)} />
                            </View>
                        )}
                    </Card>

                    <SectionHeader title="Announcement" style={{ marginTop: Spacing.xxl }} />
                    <Card>
                        <View style={styles.settingRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.settingLabel, { color: theme.text }]}>Show on dashboard</Text>
                                <Text style={[styles.settingDescription, { color: theme.textSecondary }]}>
                                    Everyone sees this message at the top of their dashboard.
                                </Text>
                            </View>
                            <Toggle value={showAnnouncement} onValueChange={handleToggleAnnouncement} accessibilityLabel="Show announcement" />
                        </View>
                        <TextField
                            value={announcementText}
                            onChangeText={setAnnouncementText}
                            placeholder="E.g. The gym is closed for maintenance this Friday."
                            multiline
                            containerStyle={{ marginTop: Spacing.md }}
                        />
                        <Button
                            variant="primary"
                            label="Save Message"
                            onPress={handleSaveAnnouncement}
                            disabled={savingAnnouncement || announcementText === (globalSettings?.announcementText || '')}
                            loading={savingAnnouncement}
                            style={{ marginTop: Spacing.md }}
                        />
                    </Card>
                </>
            )}
        </ScrollView>
    );

    const renderHistory = () => {
        const now = new Date();

        // 1. Lock to the PT's own sessions, or the chosen trainer for admins
        let activeBookings = historyBookings.filter(b => b.status === 'confirmed' && b.startTime < now);
        if (userRole === 'pt') {
            activeBookings = activeBookings.filter(b => b.ptId === user?.uid);
        } else if (userRole === 'admin' && historyPtFilter !== 'all') {
            activeBookings = activeBookings.filter(b => b.ptId === historyPtFilter);
        }

        // 2. Search by client
        const mappedBookings = activeBookings.map(b => {
            const clientProfile = allUsers.find(u => u.id === b.userId);
            const ptProfile = b.ptId ? allUsers.find(u => u.id === b.ptId) : undefined;
            return {
                ...b,
                clientName: clientProfile?.name || clientProfile?.email || 'Unknown Client',
                clientEmail: clientProfile?.email,
                instructorName: ptProfile?.name || 'Unknown Trainer'
            };
        });

        const query = historySearchQuery.toLowerCase();
        const filtered = mappedBookings
            .filter(b => b.clientName.toLowerCase().includes(query) || (b.clientEmail && b.clientEmail.toLowerCase().includes(query)))
            .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

        // 3. Totals
        const ptCount = filtered.filter(b => b.type === 'pt').length;
        const groupCount = filtered.filter(b => b.type === 'group').length;
        const gymCount = filtered.filter(b => b.type === 'gym').length;

        const clientCounts = new Map<string, number>();
        filtered.forEach(b => clientCounts.set(b.clientName, (clientCounts.get(b.clientName) ?? 0) + 1));
        const clientBreakdownList = Array.from(clientCounts.entries()).sort((a, b) => b[1] - a[1]);

        return (
            <FlatList
                data={historyLoading ? [] : filtered}
                keyExtractor={(item, i) => item.id || String(i)}
                contentContainerStyle={styles.tabPage}
                keyboardShouldPersistTaps="handled"
                ListHeaderComponent={
                    <View style={{ gap: Spacing.md, marginBottom: Spacing.lg }}>
                        <View style={[styles.monthSelector, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            <IconButton icon="chevron-back" size={34} accessibilityLabel="Previous month" onPress={() => setHistoryDate(prev => subMonths(prev, 1))} />
                            <Text style={[styles.monthText, { color: theme.text }]}>{format(historyDate, 'MMMM yyyy')}</Text>
                            <IconButton icon="chevron-forward" size={34} accessibilityLabel="Next month" onPress={() => setHistoryDate(prev => addMonths(prev, 1))} />
                        </View>

                        {userRole === 'admin' && (
                            <ChipGroup
                                scroll
                                options={[{ value: 'all', label: 'All trainers' }, ...ptsList.map(pt => ({ value: pt.id, label: pt.name || pt.email }))]}
                                value={historyPtFilter}
                                onChange={setHistoryPtFilter}
                            />
                        )}

                        <TextField
                            icon="search"
                            placeholder="Filter by client"
                            value={historySearchQuery}
                            onChangeText={setHistorySearchQuery}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />

                        {historyLoading ? (
                            <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 30 }} />
                        ) : (
                            <Card>
                                <View style={styles.summaryTop}>
                                    <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Completed sessions</Text>
                                    <Text style={[styles.summaryValue, { color: theme.text }]}>{filtered.length}</Text>
                                </View>
                                <View style={styles.summaryTypes}>
                                    {[
                                        { label: 'PT', count: ptCount, type: 'pt' },
                                        { label: 'Group', count: groupCount, type: 'group' },
                                        { label: 'Gym', count: gymCount, type: 'gym' },
                                    ].map(t => (
                                        <View key={t.type} style={styles.summaryType}>
                                            <View style={[styles.typeDot, { backgroundColor: bookingTypeColor(theme, t.type) }]} />
                                            <Text style={[styles.summaryTypeText, { color: theme.textSecondary }]}>
                                                {t.label} <Text style={{ color: theme.text, fontWeight: '700' }}>{t.count}</Text>
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                                {clientBreakdownList.length > 0 && renderBreakdown(clientBreakdownList, historyBreakdownExpanded, () => setHistoryBreakdownExpanded(v => !v))}
                            </Card>
                        )}

                        {!historyLoading && filtered.length > 0 && (
                            <Text style={[styles.breakdownHeading, { color: theme.textSecondary, marginTop: Spacing.sm, marginBottom: 0 }]}>Sessions</Text>
                        )}
                    </View>
                }
                renderItem={({ item, index }) => (
                    <View style={[...groupedRowStyle(index, filtered.length), styles.memberRow]}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>{item.clientName}</Text>
                            <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]}>
                                {format(item.startTime, 'EEE d MMM')} · {format(item.startTime, 'HH:mm')}–{format(item.endTime, 'HH:mm')}
                                {userRole === 'admin' && item.type === 'pt' ? ` · ${item.instructorName}` : ''}
                            </Text>
                        </View>
                        <BookingTypeBadge type={item.type} />
                    </View>
                )}
                ListEmptyComponent={historyLoading ? null : <EmptyState icon="calendar-outline" title="No completed sessions this month." compact />}
            />
        );
    };

    const tabs: { value: AdminTab; label: string }[] = [
        { value: 'schedule', label: 'Schedule' },
        { value: 'history', label: 'History' },
        ...(userRole === 'admin'
            ? [{ value: 'members' as const, label: 'Members' }, { value: 'settings' as const, label: 'Settings' }]
            : []),
    ];

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={styles.header}>
                <ScreenHeader
                    title="Admin"
                    right={userRole === 'admin' ? (
                        <Button variant="tint" size="sm" icon="stats-chart" label="Analytics" onPress={() => router.push('/analytics')} />
                    ) : undefined}
                />
                <SegmentedControl options={tabs} value={activeTab} onChange={setActiveTab} />
            </View>

            {activeTab === 'schedule' && (
                <DateStrip dates={dates} selectedDate={selectedDate} onSelect={setSelectedDate} />
            )}

            {activeTab === 'schedule' && renderSchedule()}
            {activeTab === 'history' && renderHistory()}
            {activeTab === 'members' && renderMembers()}
            {activeTab === 'settings' && renderSettings()}

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

            {user && (
                <RescheduleSheet
                    target={rescheduleTarget}
                    viewerId={user.uid}
                    onClose={() => setRescheduleTarget(null)}
                    onRescheduled={handleRescheduled}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        paddingHorizontal: Spacing.xl,
        paddingBottom: Spacing.md,
    },
    tabPage: {
        padding: Spacing.xl,
        paddingBottom: Spacing.huge,
    },
    listContent: {
        paddingHorizontal: Spacing.xl,
        paddingBottom: Spacing.huge,
    },

    // Shared row bits
    rowTitle: { ...Typography.headline },
    rowSubtitle: { ...Typography.footnote, fontWeight: '400', marginTop: 2 },
    footnote: { ...Typography.footnote, fontWeight: '400', textAlign: 'center', marginTop: Spacing.sm },
    groupedRow: {
        borderLeftWidth: StyleSheet.hairlineWidth,
        borderRightWidth: StyleSheet.hairlineWidth,
    },
    groupedRowFirst: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopLeftRadius: Radii.lg,
        borderTopRightRadius: Radii.lg,
    },
    groupedRowLast: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomLeftRadius: Radii.lg,
        borderBottomRightRadius: Radii.lg,
    },
    listRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    typeDot: { width: 8, height: 8, borderRadius: Radii.pill },
    divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.md },
    buttonRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },

    // Schedule timeline
    scheduleContainer: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.huge },
    scheduleHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: Spacing.sm,
        paddingVertical: Spacing.md,
    },
    scheduleSummary: { ...Typography.footnote },
    timelineRow: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 44,
        paddingVertical: Spacing.xs + 2,
        paddingLeft: Spacing.lg,
        paddingRight: Spacing.md,
        gap: Spacing.md,
    },
    nowBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
    timelineTime: { width: 48 },
    timeHour: { ...Typography.subhead, fontWeight: '700', fontVariant: ['tabular-nums'] },
    timeQuarter: { ...Typography.footnote, fontWeight: '400', fontVariant: ['tabular-nums'] },
    nowLabel: { ...Typography.caption2, textTransform: 'uppercase' },
    timelineBody: { flex: 1, gap: Spacing.xs + 2 },
    blockedPill: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: Spacing.xs,
        paddingHorizontal: Spacing.sm + 2,
        paddingVertical: 3,
        borderRadius: Radii.pill,
    },
    blockedText: { ...Typography.caption },
    personRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    personName: { ...Typography.subhead, fontWeight: '600' },
    personMeta: { ...Typography.footnote, fontWeight: '400' },

    // Members
    membersContainer: { flex: 1 },
    membersControls: { padding: Spacing.xl, paddingBottom: Spacing.lg, gap: Spacing.md },
    memberRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
    },
    backRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginBottom: Spacing.md, marginLeft: -Spacing.xs },
    backText: { ...Typography.body },
    memberDetailCard: { alignItems: 'center', gap: Spacing.xs },
    memberDetailName: { ...Typography.title3, marginTop: Spacing.sm },
    badgeRow: { flexDirection: 'row', gap: Spacing.xs + 2, marginTop: Spacing.sm },
    statsRow: { flexDirection: 'row', gap: Spacing.sm },
    nextCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    nextIcon: { width: 40, height: 40, borderRadius: Radii.pill, alignItems: 'center', justifyContent: 'center' },

    // Settings
    settingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    settingLabel: { ...Typography.headline, marginBottom: 2 },
    settingDescription: { ...Typography.footnote, fontWeight: '400', lineHeight: 18 },
    codeDisplay: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        marginTop: Spacing.md,
        paddingLeft: Spacing.lg,
        paddingRight: Spacing.sm,
        paddingVertical: Spacing.sm,
        borderRadius: Radii.md,
        borderWidth: StyleSheet.hairlineWidth,
    },
    codeText: { ...Typography.headline, flex: 1, letterSpacing: 0.5 },

    // History
    monthSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: Spacing.sm,
        borderRadius: Radii.lg,
        borderWidth: StyleSheet.hairlineWidth,
    },
    monthText: { ...Typography.headline },
    summaryTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    summaryLabel: { ...Typography.footnote },
    summaryValue: { ...Typography.title1, fontVariant: ['tabular-nums'] },
    summaryTypes: { flexDirection: 'row', gap: Spacing.lg, marginTop: Spacing.sm },
    summaryType: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs + 2 },
    summaryTypeText: { ...Typography.footnote, fontWeight: '400' },
    breakdownHeading: {
        ...Typography.caption,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: Spacing.sm,
    },
    breakdownRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
    breakdownName: { ...Typography.subhead, fontWeight: '400', flex: 1 },
    breakdownCount: { ...Typography.subhead, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
