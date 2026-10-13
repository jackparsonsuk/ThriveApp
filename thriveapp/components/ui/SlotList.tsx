import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

export type SlotTone = 'default' | 'tint' | 'warning' | 'danger' | 'muted';

export interface SlotItem {
  key: string;
  time: Date;
  /** Main line, e.g. "Until 17:15" or "Fully booked". */
  title: string;
  /** Small right-aligned detail, e.g. "2/4 booked". */
  meta?: string;
  available: boolean;
  tone?: SlotTone;
  /** Consecutive slots sharing a groupId get a coloured bar down their left edge (e.g. one booking spanning several slots). */
  groupId?: string;
  groupColor?: string;
}

interface SlotListProps {
  slots: SlotItem[];
  onPress: (slot: SlotItem) => void;
  disabled?: boolean;
  /** Split the day into Morning / Afternoon / Evening so long lists are easier to scan. */
  groupByPeriod?: boolean;
}

const periodOf = (date: Date) => {
  const h = date.getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
};

/** The list of bookable times used by the gym, PT and group booking screens. */
export default function SlotList({ slots, onPress, disabled = false, groupByPeriod = true }: SlotListProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const sections: { title: string; slots: SlotItem[] }[] = [];
  slots.forEach(slot => {
    const title = groupByPeriod ? periodOf(slot.time) : '';
    const last = sections[sections.length - 1];
    if (last && last.title === title) last.slots.push(slot);
    else sections.push({ title, slots: [slot] });
  });

  const toneColor = (tone: SlotTone | undefined, available: boolean) => {
    switch (tone) {
      case 'tint': return theme.tint;
      case 'warning': return theme.warning;
      case 'danger': return theme.danger;
      case 'muted': return theme.textSecondary;
      default: return theme.textSecondary;
    }
  };

  return (
    <View style={{ gap: Spacing.xl }}>
      {sections.map(section => (
        <View key={section.title || 'all'}>
          {groupByPeriod && (
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{section.title}</Text>
          )}
          <View style={[styles.list, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {section.slots.map((slot, index) => {
              const prev = section.slots[index - 1];
              const next = section.slots[index + 1];
              const inGroup = !!slot.groupId;
              const groupStart = inGroup && prev?.groupId !== slot.groupId;
              const groupEnd = inGroup && next?.groupId !== slot.groupId;
              const isLast = index === section.slots.length - 1;
              // Rows inside one booking read as a single block, so they lose the divider between them
              const showSeparator = !isLast && !(inGroup && !groupEnd);

              return (
                <View key={slot.key}>
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => onPress(slot)}
                    disabled={!slot.available || disabled}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !slot.available || disabled }}
                    accessibilityLabel={`${format(slot.time, 'HH:mm')}, ${slot.title}${slot.meta ? `, ${slot.meta}` : ''}`}
                  >
                    {inGroup && (
                      <View
                        style={[
                          styles.groupBar,
                          { backgroundColor: slot.groupColor ?? theme.tint },
                          groupStart && styles.groupBarStart,
                          groupEnd && styles.groupBarEnd,
                        ]}
                      />
                    )}
                    <Text style={[styles.time, { color: slot.available ? theme.text : theme.textTertiary }]}>
                      {format(slot.time, 'HH:mm')}
                    </Text>
                    <Text style={[styles.title, { color: toneColor(slot.tone, slot.available) }]} numberOfLines={2}>
                      {slot.title}
                    </Text>
                    {slot.meta ? (
                      <Text style={[styles.meta, { color: theme.textSecondary }]}>{slot.meta}</Text>
                    ) : null}
                    <View style={styles.chevron}>
                      {slot.available && <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />}
                    </View>
                  </TouchableOpacity>
                  {showSeparator && <View style={[styles.separator, { backgroundColor: theme.border }]} />}
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    ...Typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  list: {
    borderRadius: Radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: Spacing.sm,
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.md,
    gap: Spacing.md,
  },
  groupBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  groupBarStart: {
    top: Spacing.sm,
    borderTopRightRadius: 2,
  },
  groupBarEnd: {
    bottom: Spacing.sm,
    borderBottomRightRadius: 2,
  },
  time: {
    ...Typography.headline,
    width: 52,
    fontVariant: ['tabular-nums'],
  },
  title: {
    ...Typography.subhead,
    fontWeight: '400',
    flex: 1,
  },
  meta: {
    ...Typography.footnote,
    fontWeight: '400',
  },
  chevron: {
    width: 18,
    alignItems: 'flex-end',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.lg,
  },
});
