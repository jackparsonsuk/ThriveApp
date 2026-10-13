import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ViewToken } from 'react-native';
import { format, isToday } from 'date-fns';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { useMouseDragScroll } from '@/hooks/useMouseDragScroll';

// Every item is exactly this wide (no gap), so getItemLayout is always right and
// scrolling to a date lands on that date instead of drifting.
const ITEM_WIDTH = 52;
const SIDE_PADDING = Spacing.md;

interface DateStripProps {
  dates: Date[];
  selectedDate: Date;
  onSelect: (date: Date) => void;
  /** Extra controls shown under the dates, inside the same bar (e.g. duration chips). */
  footer?: React.ReactNode;
}

/** Horizontal day picker with a month label, shared by every booking and schedule screen. */
export default function DateStrip({ dates, selectedDate, onSelect, footer }: DateStripProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const listRef = useRef<FlatList<Date>>(null);
  const { onScroll: onMouseDragScroll, dragProps } = useMouseDragScroll(listRef);
  const [visibleMonth, setVisibleMonth] = useState(format(selectedDate, 'MMMM yyyy'));

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) {
      const middleItem = viewableItems[Math.floor(viewableItems.length / 2)];
      if (middleItem?.item) setVisibleMonth(format(middleItem.item as Date, 'MMMM yyyy'));
    }
  }, []);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  const selectedIndex = dates.findIndex(d => d.getTime() === selectedDate.getTime());
  const [listWidth, setListWidth] = useState(0);
  const hasPositioned = useRef(false);

  // Centre the selected day. Waits for the strip's width so it also works on first
  // render, when the selected day (e.g. today in the admin schedule) isn't the first date.
  useEffect(() => {
    if (!listWidth || selectedIndex < 0) return;
    const offset = Math.max(0, SIDE_PADDING + ITEM_WIDTH * selectedIndex - (listWidth - ITEM_WIDTH) / 2);
    listRef.current?.scrollToOffset({ offset, animated: hasPositioned.current });
    hasPositioned.current = true;
  }, [selectedIndex, listWidth]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background, borderBottomColor: theme.border }]} {...dragProps}>
      <Text style={[styles.monthLabel, { color: theme.textSecondary }]}>{visibleMonth}</Text>
      <FlatList
        ref={listRef}
        horizontal
        onLayout={e => setListWidth(e.nativeEvent.layout.width)}
        data={dates}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        keyExtractor={d => d.toISOString()}
        onScroll={onMouseDragScroll}
        scrollEventThrottle={16}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        initialNumToRender={14}
        getItemLayout={(_, index) => ({ length: ITEM_WIDTH, offset: SIDE_PADDING + ITEM_WIDTH * index, index })}
        renderItem={({ item: date }) => {
          const isSelected = date.getTime() === selectedDate.getTime();
          const today = isToday(date);
          return (
            <TouchableOpacity
              style={styles.item}
              onPress={() => onSelect(date)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={format(date, 'EEEE d MMMM')}
            >
              <Text style={[styles.dayText, { color: isSelected || today ? theme.tint : theme.textSecondary }]}>
                {today ? 'Today' : format(date, 'EEE')}
              </Text>
              <View style={[styles.dateCircle, isSelected && { backgroundColor: theme.tint }]}>
                <Text
                  style={[
                    styles.dateText,
                    { color: isSelected ? theme.onTint : today ? theme.tint : theme.text },
                    isSelected && styles.dateTextSelected,
                  ]}
                >
                  {format(date, 'd')}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
      {footer && <View style={styles.footer}>{footer}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  monthLabel: {
    ...Typography.footnote,
    fontWeight: '600',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xs,
  },
  list: {
    paddingHorizontal: SIDE_PADDING,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  item: {
    width: ITEM_WIDTH,
    alignItems: 'center',
  },
  dayText: {
    ...Typography.caption2,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  dateCircle: {
    width: 38,
    height: 38,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateText: {
    fontSize: 18,
    fontWeight: '500',
  },
  dateTextSelected: {
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
  },
});
