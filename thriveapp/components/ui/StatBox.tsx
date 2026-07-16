import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

interface StatBoxProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  value: string | number;
  label: string;
}

export default function StatBox({ icon, iconColor, value, label }: StatBoxProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  return (
    <View style={[styles.box, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Ionicons name={icon} size={20} color={iconColor ?? theme.tint} />
      <Text style={[styles.value, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  value: {
    ...Typography.title2,
    marginVertical: Spacing.xs + 2,
  },
  label: {
    ...Typography.caption2,
    textAlign: 'center',
  },
});
