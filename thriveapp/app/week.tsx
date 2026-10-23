import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { addDays, addMinutes, differenceInMinutes, format, isSameDay, setHours, startOfDay, startOfWeek } from 'date-fns';
import { useAuth } from '../context/auth';
import {
    Booking,
    UserProfile,
    cancelBooking,
    checkSlotAvailability,
    createBooking,
    getClientsForPt,
    getGymBookingsForDate,
    getPTBookingsForRange,
    getPersonAllBookingsForDate,
    getPersonAllBookingsForRange,
    getUserProfile,
    isUserActive,
    updateBookingStatus,
} from '../services/bookingService';
import { getPTGroups } from '../services/groupService';
import { getWorkingWindowForDate } from '../services/workingHours';
import CustomAlert from '../components/CustomAlert';
import RescheduleSheet, { RescheduleTarget } from '../components/RescheduleSheet';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Shadows, Spacing, ThemeColors, Typography } from '@/constants/theme';
import { Button, Chip, ChipGroup, EmptyState, IconButton, ScreenHeader, SegmentedControl, TextField } from '@/components/ui';

// The grid covers 06:00–22:00, a little either side of the hours PTs can set
const GRID_START_HOUR = 6;
const GRID_END_HOUR = 22;
const HOUR_HEIGHT = 56;
const TIME_COLUMN_WIDTH = 44;
const NUDGE_MINUTES = 15;
const DURATION_OPTIONS = [30, 45, 60, 90];

type EventKind = 'session' | 'request' | 'block' | 'gymBlock' | 'class' | 'own';

interface WeekEvent {
    booking: Booking;
    kind: EventKind;
    title: string;
}

interface Draft {
    start: Date;
    durationMinutes: number;
    mode: 'session' | 'block';
    clientId: string | null;
    reason: string;
}

const firstNameOf = (name: string) => name.split(' ')[0] || name;

const minutesFromGridTop = (date: Date) => (date.getHours() - GRID_START_HOUR) * 60 + date.getMinutes();

const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => aStart < bEnd && aEnd > bStart;

/** Lays overlapping events side by side, like a calendar app: each gets a lane and the lane count of its cluster. */
const layoutDay = (events: WeekEvent[]) => {
    const sorted = [...events].sort((a, b) => a.booking.startTime.getTime() - b.booking.startTime.getTime());
    const placed: { event: WeekEvent; lane: number; lanes: number }[] = [];
    let cluster: { event: WeekEvent; lane: number; lanes: number }[] = [];
    let clusterEnd = 0;
    const closeCluster = () => {
        const lanes = Math.max(1, ...cluster.map(c => c.lane + 1));
        cluster.forEach(c => { c.lanes = lanes; });
        placed.push(...cluster);
        cluster = [];
    };
    for (const event of sorted) {
        const start = event.booking.startTime.getTime();
        if (cluster.length && start >= clusterEnd) closeCluster();
        const busyLanes = cluster.filter(c => c.event.booking.endTime.getTime() > start).map(c => c.lane);
        let lane = 0;
        while (busyLanes.includes(lane)) lane++;
        cluster.push({ event, lane, lanes: 1 });
        clusterEnd = Math.max(clusterEnd, event.booking.endTime.getTime());
    }
    closeCluster();
    return placed;
};

const eventColors = (theme: ThemeColors, kind: EventKind) => {
    switch (kind) {
        case 'session': return { bg: theme.tint, fg: theme.onTint, border: theme.tint, dashed: false };
        case 'request': return { bg: theme.tintMuted, fg: theme.tint, border: theme.tint, dashed: true };
        case 'class': return { bg: theme.purple, fg: '#FFFFFF', border: theme.purple, dashed: false };
        case 'own': return { bg: theme.info, fg: '#FFFFFF', border: theme.info, dashed: false };
        case 'gymBlock': return { bg: theme.fill, fg: theme.textSecondary, border: theme.textTertiary, dashed: true };
        default: return { bg: theme.fill, fg: theme.textSecondary, border: theme.textTertiary, dashed: false };
    }
};

/**
 * Trial week view for PTs: a calendar-style grid of their sessions, requests, blocked
 * time and classes. Tapping an empty hour starts a booking or a block there, which can
 * be nudged by 15 minutes and resized before it's saved.
 */
export default function WeekScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const { width } = useWindowDimensions();

    // Seven narrow columns are unreadable on a phone, so show fewer days on small screens
    const dayCount = width >= 900 ? 7 : width >= 600 ? 5 : 3;

    const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined);
    const [rangeStart, setRangeStart] = useState(() => startOfDay(new Date()));
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);
    const [clients, setClients] = useState<UserProfile[]>([]);
    const [names, setNames] = useState<Record<string, string>>({});
    const [groupNames, setGroupNames] = useState<Record<string, string>>({});
    const [now, setNow] = useState(() => new Date());

    const [draft, setDraft] = useState<Draft | null>(null);
    const [draftClash, setDraftClash] = useState<string | null>(null);
    const [checkingDraft, setCheckingDraft] = useState(false);
    const [saving, setSaving] = useState(false);
    const [selected, setSelected] = useState<WeekEvent | null>(null);
    const [rescheduleTarget, setRescheduleTarget] = useState<RescheduleTarget | null>(null);

    const [alertConfig, setAlertConfig] = useState<{
        visible: boolean;
        title: string;
        message: string;
        onConfirm?: () => void;
        confirmText?: string;
        isDestructive?: boolean;
    }>({ visible: false, title: '', message: '' });
    const closeAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));

    const scrollRef = useRef<ScrollView>(null);
    const hasScrolled = useRef(false);

    const isPtOrAdmin = profile?.role === 'pt' || profile?.role === 'admin';

    // A full week starts on Monday; a narrower view starts today
    useEffect(() => {
        const today = startOfDay(new Date());
        setRangeStart(dayCount === 7 ? startOfWeek(today, { weekStartsOn: 1 }) : today);
    }, [dayCount]);

    const days = useMemo(
        () => Array.from({ length: dayCount }, (_, i) => addDays(rangeStart, i)),
        [rangeStart, dayCount]
    );
    const rangeEnd = addDays(rangeStart, dayCount);

    useEffect(() => {
        if (!user) return;
        getUserProfile(user.uid).then(setProfile).catch(() => setProfile(null));
    }, [user]);

    // Client and group names only need loading once
    useEffect(() => {
        if (!user || !isPtOrAdmin) return;
        getClientsForPt(user.uid).then(list => {
            setClients(list);
            setNames(prev => ({ ...prev, ...Object.fromEntries(list.map(c => [c.id, c.name])) }));
        }).catch(e => console.error('Error loading clients:', e));
        getPTGroups(user.uid).then(groups => {
            setGroupNames(Object.fromEntries(groups.map(g => [g.id, g.name])));
        }).catch(e => console.error('Error loading groups:', e));
    }, [user, isPtOrAdmin]);

    const loadWeek = useCallback(async () => {
        if (!user || !isPtOrAdmin) return;
        setLoading(true);
        try {
            const end = addDays(rangeStart, dayCount);
            const [ptBookings, ownBookings] = await Promise.all([
                getPTBookingsForRange(user.uid, rangeStart, end),
                getPersonAllBookingsForRange(user.uid, rangeStart, end),
            ]);
            const unique = Array.from(new Map([...ptBookings, ...ownBookings].map(b => [b.id, b])).values());
            setBookings(unique);
            setNow(new Date());
        } catch (e) {
            console.error('Error loading week:', e);
            setAlertConfig({ visible: true, title: 'Error', message: "Couldn't load your week. Please try again." });
        } finally {
            setLoading(false);
        }
    }, [user, isPtOrAdmin, rangeStart, dayCount]);

    useFocusEffect(useCallback(() => { loadWeek(); }, [loadWeek]));

    // Sessions with clients who've since left still need a name
    useEffect(() => {
        const missing = [...new Set(bookings
            .filter(b => b.type === 'pt' && b.userId !== user?.uid && !(b.userId in names))
            .map(b => b.userId))];
        if (!missing.length) return;
        Promise.all(missing.map(id => getUserProfile(id).catch(() => null))).then(profiles => {
            setNames(prev => ({
                ...prev,
                ...Object.fromEntries(missing.map((id, i) => [id, profiles[i]?.name || 'Client'])),
            }));
        });
    }, [bookings, names, user]);

    // Open on the working day rather than at 06:00
    useEffect(() => {
        if (loading || hasScrolled.current) return;
        hasScrolled.current = true;
        const hour = Math.max(GRID_START_HOUR, Math.min(new Date().getHours() - 1, 8));
        setTimeout(() => scrollRef.current?.scrollTo({ y: (hour - GRID_START_HOUR) * HOUR_HEIGHT, animated: false }), 0);
    }, [loading]);

    const events: WeekEvent[] = useMemo(() => {
        if (!user) return [];
        const me = user.uid;
        return bookings.flatMap((b): WeekEvent[] => {
            if (b.status === 'cancelled') return [];
            if (b.type === 'pt' && b.ptId === me && b.userId !== me) {
                const name = names[b.userId] ?? '…';
                return b.status === 'pending'
                    ? [{ booking: b, kind: 'request', title: `Request: ${name}` }]
                    : [{ booking: b, kind: 'session', title: name }];
            }
            if (b.type === 'pt') return [{ booking: b, kind: 'own', title: 'Your PT session' }];
            if (b.type === 'pt_block' && b.ptId === me) return [{ booking: b, kind: 'block', title: b.reason || 'Blocked' }];
            // The block a PT's own class puts on the gym would duplicate the class itself
            if (b.type === 'block') return b.userId === me ? [] : [{ booking: b, kind: 'gymBlock', title: b.reason || 'Gym closed' }];
            if (b.type === 'group' && b.userId === me) return [{ booking: b, kind: 'class', title: `Class: ${groupNames[b.groupId ?? ''] ?? 'Group'}` }];
            if (b.type === 'gym' && b.userId === me) return [{ booking: b, kind: 'own', title: 'Gym session' }];
            return [];
        });
    }, [bookings, names, groupNames, user]);

    const draftEnd = draft ? addMinutes(draft.start, draft.durationMinutes) : null;

    // The panel covers the bottom of the grid, so bring the draft up to where it can be seen
    const draftTime = draft?.start.getTime();
    useEffect(() => {
        if (draftTime === undefined) return;
        const top = (minutesFromGridTop(new Date(draftTime)) / 60) * HOUR_HEIGHT;
        scrollRef.current?.scrollTo({ y: Math.max(0, top - HOUR_HEIGHT), animated: true });
    }, [draftTime]);

    // Check the draft against everything that would stop it, as the PT moves it about
    useEffect(() => {
        if (!draft || !draftEnd) return;
        let cancelled = false;

        if (draft.start < new Date()) {
            setDraftClash('That time has already passed');
            return;
        }
        const ownClash = events.find(e => e.kind !== 'gymBlock' && overlaps(draft.start, draftEnd, e.booking.startTime, e.booking.endTime));
        if (ownClash) {
            setDraftClash(`Clashes with ${ownClash.title} at ${format(ownClash.booking.startTime, 'HH:mm')}`);
            return;
        }
        if (draft.mode === 'block') {
            setDraftClash(null);
            return;
        }

        // A session also needs the client free and a place in the gym
        setCheckingDraft(true);
        Promise.all([
            draft.clientId ? getPersonAllBookingsForDate(draft.clientId, draft.start) : Promise.resolve([] as Booking[]),
            getGymBookingsForDate(draft.start),
        ]).then(([clientBookings, gymBookings]) => {
            if (cancelled) return;
            const clientClash = clientBookings.find(b => overlaps(draft.start, draftEnd, b.startTime, b.endTime));
            if (clientClash && draft.clientId) {
                const what = clientClash.type === 'gym' ? 'a gym session' : clientClash.type === 'group' ? 'a class' : clientClash.status === 'pending' ? 'a pending request' : 'a PT session';
                setDraftClash(`${firstNameOf(names[draft.clientId] ?? 'Client')} has ${what} at ${format(clientClash.startTime, 'HH:mm')}`);
                return;
            }
            for (let t = draft.start; t < draftEnd; t = addMinutes(t, 15)) {
                const step = checkSlotAvailability(t, gymBookings);
                if (!step.available) {
                    setDraftClash(step.blockReason ? `${step.blockReason} at ${format(t, 'HH:mm')}` : `The gym is full at ${format(t, 'HH:mm')}`);
                    return;
                }
            }
            setDraftClash(null);
        }).catch(e => {
            console.error('Error checking slot:', e);
            if (!cancelled) setDraftClash("Couldn't check this time");
        }).finally(() => {
            if (!cancelled) setCheckingDraft(false);
        });
        return () => { cancelled = true; };
        // draftEnd is derived from draft
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft?.start.getTime(), draft?.durationMinutes, draft?.mode, draft?.clientId, events, names]);

    // Each hour square is its own target, so the booking starts at the top of the one tapped
    const handleHourPress = (day: Date, hour: number) => {
        if (saving) return;
        setSelected(null);
        const start = setHours(startOfDay(day), hour);
        setDraft(prev => ({
            start,
            durationMinutes: prev?.durationMinutes ?? 60,
            mode: prev?.mode ?? 'session',
            clientId: prev?.clientId ?? null,
            reason: '',
        }));
    };

    const nudgeDraft = (minutes: number) => {
        setDraft(prev => {
            if (!prev) return prev;
            const start = addMinutes(prev.start, minutes);
            const dayStart = setHours(startOfDay(prev.start), GRID_START_HOUR);
            const latest = addMinutes(setHours(startOfDay(prev.start), GRID_END_HOUR), -prev.durationMinutes);
            if (start < dayStart || start > latest) return prev;
            return { ...prev, start };
        });
    };

    const saveDraft = async () => {
        if (!user || !draft || !draftEnd || draftClash) return;
        if (draft.mode === 'session' && !draft.clientId) return;
        setSaving(true);
        try {
            if (draft.mode === 'session') {
                await createBooking({
                    userId: draft.clientId!,
                    ptId: user.uid,
                    startTime: draft.start,
                    endTime: draftEnd,
                    type: 'pt',
                    status: 'confirmed',
                });
            } else {
                await createBooking({
                    userId: user.uid,
                    ptId: user.uid,
                    startTime: draft.start,
                    endTime: draftEnd,
                    type: 'pt_block',
                    status: 'confirmed',
                    ...(draft.reason.trim() ? { reason: draft.reason.trim() } : {}),
                });
            }
            setDraft(null);
            await loadWeek();
        } catch (e) {
            console.error('Error saving from week view:', e);
            setAlertConfig({ visible: true, title: 'Error', message: 'Failed to save. Please try again.' });
        } finally {
            setSaving(false);
        }
    };

    const runAction = (title: string, message: string, confirmText: string, action: () => Promise<unknown>, isDestructive = false) => {
        setAlertConfig({
            visible: true,
            title,
            message,
            confirmText,
            isDestructive,
            onConfirm: async () => {
                try {
                    await action();
                    setSelected(null);
                    await loadWeek();
                } catch (e) {
                    console.error(`Error: ${title}`, e);
                    setAlertConfig({ visible: true, title: 'Error', message: 'Something went wrong. Please try again.' });
                }
            },
        });
    };

    const openReschedule = (event: WeekEvent) => {
        const b = event.booking;
        if (!b.id || !b.ptId) return;
        // A paired session is two bookings in the same slot with the same PT; they move together
        const partner = bookings.find(o =>
            o.id !== b.id && o.type === 'pt' && o.status === 'confirmed' && o.ptId === b.ptId &&
            o.startTime.getTime() === b.startTime.getTime()
        );
        setSelected(null);
        setRescheduleTarget({
            bookingId: b.id,
            clientId: b.userId,
            clientName: names[b.userId] ?? 'Client',
            ptId: b.ptId,
            startTime: b.startTime,
            endTime: b.endTime,
            partner: partner?.id ? { bookingId: partner.id, clientId: partner.userId, name: names[partner.userId] ?? 'Partner' } : undefined,
        });
    };

    const rangeLabel = isSameDay(rangeStart, addDays(rangeEnd, -1))
        ? format(rangeStart, 'd MMM')
        : rangeStart.getMonth() === addDays(rangeEnd, -1).getMonth()
            ? `${format(rangeStart, 'd')}–${format(addDays(rangeEnd, -1), 'd MMM')}`
            : `${format(rangeStart, 'd MMM')} – ${format(addDays(rangeEnd, -1), 'd MMM')}`;

    const activeClients = clients.filter(isUserActive).sort((a, b) => a.name.localeCompare(b.name));
    const hours = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => GRID_START_HOUR + i);

    const header = (
        <ScreenHeader title="Your Week" subtitle="Trial · tap an empty hour to book or block it" onBack={() => router.back()} />
    );

    if (profile === undefined) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
                <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 80 }} />
            </SafeAreaView>
        );
    }

    if (!isPtOrAdmin) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
                <View style={styles.padded}>
                    {header}
                    <EmptyState icon="calendar-outline" title="Only for PTs" subtitle="The week view is being trialled with PTs first." />
                </View>
            </SafeAreaView>
        );
    }

    const renderEvent = (placed: { event: WeekEvent; lane: number; lanes: number }) => {
        const { event, lane, lanes } = placed;
        const b = event.booking;
        const dayStart = setHours(startOfDay(b.startTime), GRID_START_HOUR);
        const dayEnd = setHours(startOfDay(b.startTime), GRID_END_HOUR);
        const start = b.startTime < dayStart ? dayStart : b.startTime;
        const end = b.endTime > dayEnd ? dayEnd : b.endTime;
        if (end <= start) return null;
        const top = (minutesFromGridTop(start) / 60) * HOUR_HEIGHT;
        const height = Math.max((differenceInMinutes(end, start) / 60) * HOUR_HEIGHT - 2, 18);
        const colors = eventColors(theme, event.kind);
        const isSelected = selected?.booking.id === b.id;
        return (
            <Pressable
                key={b.id}
                onPress={() => { setDraft(null); setSelected(event); }}
                accessibilityRole="button"
                accessibilityLabel={`${event.title}, ${format(b.startTime, 'EEEE HH:mm')} to ${format(b.endTime, 'HH:mm')}`}
                style={[
                    styles.event,
                    {
                        top,
                        height,
                        left: `${(lane / lanes) * 100}%`,
                        width: `${100 / lanes}%`,
                        backgroundColor: colors.bg,
                        borderColor: isSelected ? theme.text : colors.border,
                        borderStyle: colors.dashed && !isSelected ? 'dashed' : 'solid',
                    },
                ]}
            >
                <Text style={[styles.eventTitle, { color: colors.fg }]} numberOfLines={height > 36 ? 2 : 1}>{event.title}</Text>
                {height > 36 && (
                    <Text style={[styles.eventTime, { color: colors.fg }]} numberOfLines={1}>
                        {format(b.startTime, 'HH:mm')}–{format(b.endTime, 'HH:mm')}
                    </Text>
                )}
            </Pressable>
        );
    };

    const selectedActions = (() => {
        if (!selected) return null;
        const b = selected.booking;
        const name = names[b.userId] ?? 'Client';
        if (selected.kind === 'request' && b.id) {
            return (
                <View style={styles.actionRow}>
                    <Button style={styles.flex} label="Accept" icon="checkmark" onPress={() => runAction('Accept request', `Confirm the session with ${name}? They'll get an email with a calendar invite.`, 'Accept', () => updateBookingStatus(b.id!, 'confirmed'))} />
                    <Button style={styles.flex} variant="secondary" label="Decline" onPress={() => runAction('Decline request', `Decline ${name}'s request?`, 'Decline', () => updateBookingStatus(b.id!, 'cancelled'), true)} />
                </View>
            );
        }
        if (selected.kind === 'session' && b.ptId === user?.uid) {
            return <Button label="Move session" icon="swap-vertical" variant="tint" onPress={() => openReschedule(selected)} />;
        }
        if (selected.kind === 'block' && b.id) {
            return <Button label="Remove block" icon="trash-outline" variant="secondary" onPress={() => runAction('Remove block', `Free up ${format(b.startTime, 'EEE HH:mm')}–${format(b.endTime, 'HH:mm')}?`, 'Remove', () => cancelBooking(b.id!, 'pt'), true)} />;
        }
        return null;
    })();

    const workingWindowNote = (() => {
        if (!draft || !draftEnd) return null;
        const window = getWorkingWindowForDate(draft.start, profile?.workingHours);
        if (!window) return `You don't normally work ${format(draft.start, 'EEEE')}s`;
        if (draft.start < window.start || draftEnd > window.end) return `Outside your usual hours (${format(window.start, 'HH:mm')}–${format(window.end, 'HH:mm')})`;
        return null;
    })();

    const canSave = !!draft && !draftClash && !checkingDraft && !saving && (draft.mode === 'block' || !!draft.clientId);
    const draftClientName = draft?.clientId ? firstNameOf(names[draft.clientId] ?? 'client') : null;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={styles.padded}>
                {header}
                <View style={styles.toolbar}>
                    <IconButton icon="chevron-back" accessibilityLabel="Previous days" onPress={() => { setDraft(null); setSelected(null); setRangeStart(d => addDays(d, -dayCount)); }} />
                    <Text style={[styles.rangeLabel, { color: theme.text }]}>{rangeLabel}</Text>
                    <IconButton icon="chevron-forward" accessibilityLabel="Next days" onPress={() => { setDraft(null); setSelected(null); setRangeStart(d => addDays(d, dayCount)); }} />
                    <View style={styles.flex} />
                    {loading && <ActivityIndicator size="small" color={theme.tint} style={{ marginRight: Spacing.sm }} />}
                    <Chip label="Today" onPress={() => {
                        const today = startOfDay(new Date());
                        setRangeStart(dayCount === 7 ? startOfWeek(today, { weekStartsOn: 1 }) : today);
                    }} />
                </View>
                <View style={styles.legend}>
                    {([['session', 'Session'], ['request', 'Request'], ['block', 'Blocked'], ['class', 'Class']] as [EventKind, string][]).map(([kind, label]) => {
                        const c = eventColors(theme, kind);
                        return (
                            <View key={kind} style={styles.legendItem}>
                                <View style={[styles.legendSwatch, { backgroundColor: c.bg, borderColor: c.border, borderStyle: c.dashed ? 'dashed' : 'solid' }]} />
                                <Text style={[styles.legendText, { color: theme.textSecondary }]}>{label}</Text>
                            </View>
                        );
                    })}
                </View>
            </View>

            <View style={[styles.dayHeader, { borderColor: theme.border, backgroundColor: theme.background }]}>
                <View style={{ width: TIME_COLUMN_WIDTH }} />
                {days.map(day => {
                    const isToday = isSameDay(day, now);
                    return (
                        <View key={day.toISOString()} style={styles.dayHeaderCell}>
                            <Text style={[styles.dayName, { color: isToday ? theme.tint : theme.textSecondary }]}>{format(day, 'EEE')}</Text>
                            <View style={[styles.dayNumberWrap, isToday && { backgroundColor: theme.tint }]}>
                                <Text style={[styles.dayNumber, { color: isToday ? theme.onTint : theme.text }]}>{format(day, 'd')}</Text>
                            </View>
                        </View>
                    );
                })}
            </View>

            <ScrollView ref={scrollRef} style={styles.flex} contentContainerStyle={{ paddingBottom: draft || selected ? 320 : Spacing.xxl }}>
                <View style={styles.gridRow}>
                    <View style={{ width: TIME_COLUMN_WIDTH }}>
                        {hours.map(h => (
                            <View key={h} style={{ height: HOUR_HEIGHT }}>
                                <Text style={[styles.hourLabel, { color: theme.textTertiary }]}>{String(h).padStart(2, '0')}:00</Text>
                            </View>
                        ))}
                    </View>
                    {days.map(day => {
                        const window = getWorkingWindowForDate(day, profile?.workingHours);
                        const gridTop = setHours(startOfDay(day), GRID_START_HOUR);
                        const gridBottom = setHours(startOfDay(day), GRID_END_HOUR);
                        const offTop = window ? Math.max(0, (minutesFromGridTop(window.start) / 60) * HOUR_HEIGHT) : 0;
                        const offBottomStart = window ? Math.min(hours.length * HOUR_HEIGHT, (minutesFromGridTop(window.end) / 60) * HOUR_HEIGHT) : 0;
                        const pastHeight = now > gridBottom ? hours.length * HOUR_HEIGHT : now > gridTop ? (minutesFromGridTop(now) / 60) * HOUR_HEIGHT : 0;
                        const dayEvents = events.filter(e => isSameDay(e.booking.startTime, day));
                        const showDraft = draft && draftEnd && isSameDay(draft.start, day);
                        return (
                            <View
                                key={day.toISOString()}
                                style={[styles.dayColumn, { height: hours.length * HOUR_HEIGHT, borderColor: theme.border, backgroundColor: theme.card }]}
                            >
                                {/* Outside working hours, shaded */}
                                {window ? (
                                    <>
                                        {offTop > 0 && <View pointerEvents="none" style={[styles.offHours, { top: 0, height: offTop, backgroundColor: theme.cardAlt }]} />}
                                        {offBottomStart < hours.length * HOUR_HEIGHT && <View pointerEvents="none" style={[styles.offHours, { top: offBottomStart, bottom: 0, backgroundColor: theme.cardAlt }]} />}
                                    </>
                                ) : (
                                    <View pointerEvents="none" style={[styles.offHours, { top: 0, bottom: 0, backgroundColor: theme.cardAlt }]} />
                                )}
                                {hours.map((h, i) => (
                                    <Pressable
                                        key={h}
                                        onPress={() => handleHourPress(day, h)}
                                        accessibilityRole="button"
                                        accessibilityLabel={`${format(day, 'EEEE d MMMM')} at ${String(h).padStart(2, '0')}:00. Book or block this hour.`}
                                        style={[styles.hourCell, { top: i * HOUR_HEIGHT, borderColor: theme.border }]}
                                    />
                                ))}
                                {pastHeight > 0 && <View pointerEvents="none" style={[styles.past, { height: pastHeight, backgroundColor: theme.background }]} />}
                                {layoutDay(dayEvents).map(renderEvent)}
                                {showDraft && (
                                    <View
                                        pointerEvents="none"
                                        style={[
                                            styles.event,
                                            styles.draft,
                                            {
                                                top: (minutesFromGridTop(draft.start) / 60) * HOUR_HEIGHT,
                                                height: (draft.durationMinutes / 60) * HOUR_HEIGHT - 2,
                                                borderColor: draftClash ? theme.danger : theme.tint,
                                                backgroundColor: draftClash ? theme.dangerMuted : theme.tintMuted,
                                            },
                                        ]}
                                    >
                                        <Text style={[styles.eventTitle, { color: draftClash ? theme.danger : theme.tint }]} numberOfLines={1}>
                                            {draft.mode === 'block' ? 'Block' : draftClientName ?? 'New session'}
                                        </Text>
                                        <Text style={[styles.eventTime, { color: draftClash ? theme.danger : theme.tint }]} numberOfLines={1}>
                                            {format(draft.start, 'HH:mm')}–{format(draftEnd, 'HH:mm')}
                                        </Text>
                                    </View>
                                )}
                                {isSameDay(day, now) && now > gridTop && now < gridBottom && (
                                    <View pointerEvents="none" style={[styles.nowLine, { top: (minutesFromGridTop(now) / 60) * HOUR_HEIGHT, backgroundColor: theme.danger }]} />
                                )}
                            </View>
                        );
                    })}
                </View>
            </ScrollView>

            {draft && draftEnd && (
                <View style={[styles.panel, Shadows.lg, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={styles.panelHeader}>
                        <View style={styles.flex}>
                            <Text style={[styles.panelTitle, { color: theme.text }]}>
                                {format(draft.start, 'EEE d MMM')} · {format(draft.start, 'HH:mm')}–{format(draftEnd, 'HH:mm')}
                            </Text>
                        </View>
                        <IconButton icon="close" size={34} accessibilityLabel="Cancel" onPress={() => setDraft(null)} />
                    </View>

                    <View style={styles.nudgeRow}>
                        <Button size="sm" variant="secondary" icon="arrow-up" label={`${NUDGE_MINUTES} min earlier`} onPress={() => nudgeDraft(-NUDGE_MINUTES)} style={styles.flex} />
                        <Button size="sm" variant="secondary" icon="arrow-down" label={`${NUDGE_MINUTES} min later`} onPress={() => nudgeDraft(NUDGE_MINUTES)} style={styles.flex} />
                    </View>
                    <ChipGroup
                        scroll
                        options={DURATION_OPTIONS.map(m => ({ value: m, label: m === 60 ? '1 hour' : m === 90 ? '1½ hours' : `${m} min` }))}
                        value={draft.durationMinutes}
                        onChange={m => setDraft(prev => prev ? { ...prev, durationMinutes: m } : prev)}
                        style={styles.panelBlock}
                    />
                    <SegmentedControl
                        options={[{ value: 'session', label: 'Client session' }, { value: 'block', label: 'Block time' }]}
                        value={draft.mode}
                        onChange={mode => setDraft(prev => prev ? { ...prev, mode } : prev)}
                        style={styles.panelBlock}
                    />
                    {draft.mode === 'session' ? (
                        activeClients.length ? (
                            <ChipGroup
                                scroll
                                options={activeClients.map(c => ({ value: c.id, label: c.name }))}
                                value={draft.clientId ?? ''}
                                onChange={clientId => setDraft(prev => prev ? { ...prev, clientId } : prev)}
                                style={styles.panelBlock}
                            />
                        ) : (
                            <Text style={[styles.note, { color: theme.textSecondary }]}>You don&apos;t have any active clients yet.</Text>
                        )
                    ) : (
                        <TextField
                            placeholder="Reason (optional), e.g. Dentist"
                            value={draft.reason}
                            onChangeText={reason => setDraft(prev => prev ? { ...prev, reason } : prev)}
                            containerStyle={styles.panelBlock}
                        />
                    )}

                    {draftClash ? (
                        <Text style={[styles.note, { color: theme.danger }]}>{draftClash}</Text>
                    ) : workingWindowNote ? (
                        <Text style={[styles.note, { color: theme.warning }]}>{workingWindowNote}</Text>
                    ) : null}

                    <Button
                        label={draft.mode === 'block'
                            ? `Block ${format(draft.start, 'HH:mm')}–${format(draftEnd, 'HH:mm')}`
                            : draftClientName ? `Book ${draftClientName} ${format(draft.start, 'HH:mm')}–${format(draftEnd, 'HH:mm')}` : 'Pick a client'}
                        icon={draft.mode === 'block' ? 'remove-circle-outline' : 'calendar-outline'}
                        onPress={saveDraft}
                        disabled={!canSave}
                        loading={saving || checkingDraft}
                    />
                </View>
            )}

            {selected && !draft && (
                <View style={[styles.panel, Shadows.lg, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={styles.panelHeader}>
                        <View style={styles.flex}>
                            <Text style={[styles.panelTitle, { color: theme.text }]}>{selected.title}</Text>
                            <Text style={[styles.note, { color: theme.textSecondary, marginBottom: 0 }]}>
                                {format(selected.booking.startTime, 'EEEE d MMM')} · {format(selected.booking.startTime, 'HH:mm')}–{format(selected.booking.endTime, 'HH:mm')}
                                {selected.kind === 'request' ? ' · waiting for you to accept' : ''}
                                {selected.booking.recurringTemplateId ? ' · repeats' : ''}
                            </Text>
                        </View>
                        <IconButton icon="close" size={34} accessibilityLabel="Close" onPress={() => setSelected(null)} />
                    </View>
                    {selectedActions}
                </View>
            )}

            <RescheduleSheet
                target={rescheduleTarget}
                viewerId={user?.uid ?? ''}
                onClose={() => setRescheduleTarget(null)}
                onRescheduled={() => { setRescheduleTarget(null); loadWeek(); }}
            />

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                onClose={closeAlert}
                onConfirm={alertConfig.onConfirm}
                confirmText={alertConfig.confirmText}
                isDestructive={alertConfig.isDestructive}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    flex: {
        flex: 1,
    },
    padded: {
        paddingHorizontal: Spacing.lg,
    },
    toolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginBottom: Spacing.sm,
    },
    rangeLabel: {
        ...Typography.headline,
        minWidth: 110,
        textAlign: 'center',
    },
    legend: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.md,
        marginBottom: Spacing.sm,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
    legendSwatch: {
        width: 12,
        height: 12,
        borderRadius: 3,
        borderWidth: 1,
    },
    legendText: {
        ...Typography.caption,
    },
    dayHeader: {
        flexDirection: 'row',
        borderBottomWidth: StyleSheet.hairlineWidth,
        paddingBottom: Spacing.xs,
        paddingRight: Spacing.sm,
    },
    dayHeaderCell: {
        flex: 1,
        alignItems: 'center',
    },
    dayName: {
        ...Typography.caption,
        textTransform: 'uppercase',
    },
    dayNumberWrap: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    dayNumber: {
        ...Typography.headline,
    },
    gridRow: {
        flexDirection: 'row',
        paddingRight: Spacing.sm,
        paddingTop: Spacing.sm,
    },
    hourLabel: {
        ...Typography.caption2,
        textAlign: 'right',
        paddingRight: 6,
        marginTop: -6,
    },
    dayColumn: {
        flex: 1,
        borderLeftWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden',
    },
    offHours: {
        position: 'absolute',
        left: 0,
        right: 0,
    },
    past: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        opacity: 0.35,
    },
    hourCell: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: HOUR_HEIGHT,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    nowLine: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 2,
    },
    event: {
        position: 'absolute',
        borderRadius: Radii.sm,
        borderWidth: 1,
        paddingHorizontal: 4,
        paddingVertical: 2,
        overflow: 'hidden',
    },
    draft: {
        left: 0,
        right: 0,
        borderWidth: 2,
        borderStyle: 'dashed',
    },
    eventTitle: {
        ...Typography.caption,
        fontWeight: '600',
    },
    eventTime: {
        ...Typography.caption2,
    },
    panel: {
        position: 'absolute',
        left: Spacing.sm,
        right: Spacing.sm,
        bottom: Spacing.sm,
        borderRadius: Radii.xl,
        borderWidth: StyleSheet.hairlineWidth,
        padding: Spacing.lg,
        maxWidth: 560,
        marginHorizontal: 'auto',
    },
    panelHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: Spacing.sm,
        marginBottom: Spacing.md,
    },
    panelTitle: {
        ...Typography.headline,
    },
    panelBlock: {
        marginBottom: Spacing.md,
    },
    nudgeRow: {
        flexDirection: 'row',
        gap: Spacing.sm,
        marginBottom: Spacing.md,
    },
    actionRow: {
        flexDirection: 'row',
        gap: Spacing.sm,
    },
    note: {
        ...Typography.footnote,
        marginBottom: Spacing.md,
    },
});
