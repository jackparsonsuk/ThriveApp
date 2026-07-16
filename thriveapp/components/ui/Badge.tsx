import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

type BadgeTone = 'neutral' | 'tint' | 'success' | 'danger' | 'warning' | 'info';

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  uppercase?: boolean;
}

export default function Badge({ label, tone = 'neutral', uppercase = false }: BadgeProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const toneColors: Record<BadgeTone, { bg: string; fg: string }> = {
    neutral: { bg: theme.cardAlt, fg: theme.textSecondary },
    tint: { bg: theme.tintMuted, fg: theme.tint },
    success: { bg: theme.success + '20', fg: theme.success },
    danger: { bg: theme.dangerMuted, fg: theme.danger },
    warning: { bg: theme.warning + '20', fg: theme.warning },
    info: { bg: theme.info + '20', fg: theme.info },
  };
  const { bg, fg } = toneColors[tone];

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }, uppercase && styles.uppercase]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.pill,
  },
  text: {
    ...Typography.caption,
  },
  uppercase: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
