import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Modal, ActivityIndicator } from 'react-native';
import { addDays, differenceInCalendarDays, differenceInMinutes, format, startOfDay } from 'date-fns';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { BOOKING_WINDOW_DAYS } from '@/constants/config';
import { Button, DateStrip, EmptyState, IconButton, SlotList, SlotItem } from '@/components/ui';
import { getUserProfile, rescheduleBooking, UserProfile } from '../services/bookingService';
import { getPtDayAvailability, PtDayAvailability } from '../services/availabilityService';

/** The PT session being moved, plus the second client's booking when it's a paired session. */
export interface RescheduleTarget {
  bookingId: string;
  clientId: string;
  clientName: string;
  ptId: string;
  startTime: Date;
  endTime: Date;
  partner?: { bookingId: string; clientId: string; name: string };
}

interface RescheduleSheetProps {
  target: RescheduleTarget | null;
  /** Who is looking: the PT themself, or an admin moving someone else's session. */
  viewerId: string;
  onClose: () => void;
  onRescheduled: (newStart: Date, newEnd: Date) => void;
}

const firstNameOf = (name: string) => name.split(' ')[0] || name;

/** Bottom sheet for moving a PT session to a new time, using the same checks as booking one. */
export default function RescheduleSheet({ target, viewerId, onClose, onRescheduled }: RescheduleSheetProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  // undefined while loading; working hours and names come from it, so slots wait for it
  const [ptProfile, setPtProfile] = useState<UserProfile | null | undefined>(undefined);
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [availability, setAvailability] = useState<PtDayAvailability | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedTime, setSelectedTime] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const durationMinutes = target ? differenceInMinutes(target.endTime, target.startTime) : 60;
  const ptIsViewer = target?.ptId === viewerId;
  const ptFirstName = ptProfile?.name ? firstNameOf(ptProfile.name) : 'The PT';

  // Long enough to reach the session itself, which can sit beyond the usual booking
  // window when it's a recurring instance generated months ahead.
  const dates = useMemo(() => {
    const today = startOfDay(new Date());
    const daysToSession = target ? differenceInCalendarDays(target.startTime, today) : 0;
    const length = Math.max(BOOKING_WINDOW_DAYS, daysToSession + 14);
    return Array.from({ length }).map((_, i) => addDays(today, i));
  }, [target]);

  // Fresh state each time a session is opened, starting on its own day
  useEffect(() => {
    if (!target) return;
    const today = startOfDay(new Date());
    const sessionDay = startOfDay(target.startTime);
    setSelectedDate(sessionDay < today ? today : sessionDay);
    setSelectedTime(null);
    setError(null);
    setPtProfile(undefined);
    getUserProfile(target.ptId).then(setPtProfile).catch(() => setPtProfile(null));
  }, [target]);

  useEffect(() => {
    if (!target || ptProfile === undefined) return;
    let cancelled = false;
    setLoading(true);
    setSelectedTime(null);
    getPtDayAvailability({
      ptId: target.ptId,
      clientId: target.clientId,
      date: selectedDate,
      workingHours: ptProfile?.workingHours,
      ptFirstName,
      ptIsViewer,
      clientFirstName: firstNameOf(target.clientName),
      partner: target.partner ? { id: target.partner.clientId, firstName: firstNameOf(target.partner.name) } : undefined,
      durationMinutes,
      ignoreBookingIds: [target.bookingId, ...(target.partner ? [target.partner.bookingId] : [])],
    })
      .then(result => { if (!cancelled) setAvailability(result); })
      .catch(e => {
        console.error('Error loading reschedule availability:', e);
        if (!cancelled) setError('Failed to load available times.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [target, selectedDate, ptProfile, ptFirstName, ptIsViewer, durationMinutes]);

  const slotItems: SlotItem[] = (availability?.slots ?? []).map(slot => {
    const isCurrent = !!target && slot.time.getTime() === target.startTime.getTime();
    const isSelected = selectedTime?.getTime() === slot.time.getTime();
    return {
      key: slot.time.toISOString(),
      time: slot.time,
      title: isCurrent ? 'Current time' : isSelected ? `Selected · until ${format(slot.endTime, 'HH:mm')}` : slot.available ? `Until ${format(slot.endTime, 'HH:mm')}` : (slot.reason ?? 'Unavailable'),
      available: slot.available && !isCurrent,
      tone: isSelected ? 'tint' : isCurrent ? 'muted' : slot.available ? 'default' : 'muted',
    };
  });

  const handleConfirm = async () => {
    if (!target || !selectedTime) return;
    setSaving(true);
    setError(null);
    try {
      await rescheduleBooking(
        [target.bookingId, ...(target.partner ? [target.partner.bookingId] : [])],
        selectedTime
      );
      onRescheduled(selectedTime, new Date(selectedTime.getTime() + durationMinutes * 60000));
    } catch (e) {
      console.error('Error rescheduling booking:', e);
      setError('Failed to move the session. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const sessionLabel = target
    ? target.partner ? `${target.clientName} and ${target.partner.name}` : target.clientName
    : '';
  const windowLabel = availability?.window
    ? `${ptIsViewer ? 'You work' : `${ptFirstName} works`} ${format(availability.window.start, 'HH:mm')}–${format(availability.window.end, 'HH:mm')}`
    : '';

  return (
    <Modal visible={!!target} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
        <View style={[styles.sheet, { backgroundColor: theme.card }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Reschedule</Text>
            <IconButton icon="close" accessibilityLabel="Close" size={34} onPress={onClose} />
          </View>
          {target && (
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              PT Session with {sessionLabel} · now {format(target.startTime, 'EEE d MMM, HH:mm')}–{format(target.endTime, 'HH:mm')}
            </Text>
          )}

          <DateStrip dates={dates} selectedDate={selectedDate} onSelect={setSelectedDate} />

          <ScrollView style={styles.slots} contentContainerStyle={styles.slotsContent}>
            {loading || ptProfile === undefined ? (
              <ActivityIndicator size="large" color={theme.tint} style={{ marginVertical: 40 }} />
            ) : !availability?.window ? (
              <EmptyState
                icon="moon-outline"
                title={`${ptIsViewer ? "You don't" : `${ptFirstName} doesn't`} work ${format(selectedDate, 'EEEE')}s`}
                subtitle="Try another day."
                compact
              />
            ) : slotItems.length === 0 ? (
              <EmptyState icon="time-outline" title="No more times left today" subtitle={windowLabel} compact />
            ) : (
              <>
                <Text style={[styles.hint, { color: theme.textSecondary }]}>{windowLabel}</Text>
                <SlotList slots={slotItems} disabled={saving} onPress={item => setSelectedTime(item.time)} />
              </>
            )}
          </ScrollView>

          {error && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}
          <Button
            label={selectedTime ? `Move to ${format(selectedTime, 'EEE d MMM, HH:mm')}` : 'Pick a new time'}
            icon="calendar-outline"
            onPress={handleConfirm}
            disabled={!selectedTime}
            loading={saving}
            style={styles.confirm}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xl,
    height: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xxl,
  },
  title: {
    ...Typography.title2,
  },
  subtitle: {
    ...Typography.subhead,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.xxl,
  },
  slots: {
    flex: 1,
  },
  slotsContent: {
    padding: Spacing.xl,
  },
  hint: {
    ...Typography.footnote,
    marginBottom: Spacing.md,
  },
  error: {
    ...Typography.footnote,
    textAlign: 'center',
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  confirm: {
    marginHorizontal: Spacing.xl,
  },
});
