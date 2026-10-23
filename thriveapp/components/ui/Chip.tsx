import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ScrollView, View, ViewStyle, StyleProp } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}

/** A single selectable pill, used for filters and quick options. */
export function Chip({ label, selected = false, onPress, icon, style }: ChipProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const fg = selected ? theme.onTint : theme.text;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, { backgroundColor: selected ? theme.tint : theme.fill }, style]}
    >
      {icon && <Ionicons name={icon} size={14} color={fg} style={{ marginRight: Spacing.xs }} />}
      <Text style={[styles.text, { color: fg }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

interface ChipGroupProps<T extends string | number> {
  options: { value: T; label: string; icon?: keyof typeof Ionicons.glyphMap }[];
  value: T;
  onChange: (value: T) => void;
  /** Optional label shown before the chips, e.g. "Repeat". */
  label?: string;
  /** Lay the chips out in a horizontal scroller instead of wrapping. */
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** A single-select row of chips. Wraps onto new lines by default so no option is ever hidden off-screen. */
export function ChipGroup<T extends string | number>({ options, value, onChange, label, scroll = false, style }: ChipGroupProps<T>) {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const chips = options.map(option => (
    <Chip
      key={String(option.value)}
      label={option.label}
      icon={option.icon}
      selected={option.value === value}
      onPress={() => onChange(option.value)}
    />
  ));

  return (
    <View style={style}>
      {label && <Text style={[styles.groupLabel, { color: theme.textSecondary }]}>{label}</Text>}
      {scroll ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {chips}
        </ScrollView>
      ) : (
        <View style={[styles.row, styles.wrap]}>{chips}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: Spacing.md + 2,
    borderRadius: Radii.pill,
  },
  text: {
    ...Typography.footnote,
    fontWeight: '600',
  },
  groupLabel: {
    ...Typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  wrap: {
    flexWrap: 'wrap',
  },
});
