import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Shadows, Spacing, Typography } from '@/constants/theme';

interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}

/** iOS-style segmented control for switching between a few views of the same content. */
export default function SegmentedControl<T extends string>({ options, value, onChange, style }: SegmentedControlProps<T>) {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const selectedBg = colorScheme === 'dark' ? '#4A4A4E' : theme.card;

  return (
    <View style={[styles.track, { backgroundColor: theme.fill }, style]} accessibilityRole="tablist">
      {options.map(option => {
        const isSelected = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            onPress={() => onChange(option.value)}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            style={[styles.segment, isSelected && [{ backgroundColor: selectedBg }, Shadows.sm]]}
          >
            <Text
              style={[styles.text, { color: isSelected ? theme.text : theme.textSecondary }, isSelected && styles.textSelected]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: Radii.md,
    padding: 3,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radii.sm,
  },
  text: {
    ...Typography.footnote,
    fontWeight: '500',
  },
  textSelected: {
    fontWeight: '600',
  },
});
