import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  compact?: boolean;
}

export default function EmptyState({ icon, title, subtitle, compact = false }: EmptyStateProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.card, borderColor: theme.border, padding: compact ? Spacing.xxl : Spacing.huge },
      ]}
    >
      <Ionicons name={icon} size={compact ? 32 : 48} color={theme.textTertiary} />
      <Text style={[styles.text, { color: theme.text, fontSize: compact ? 14 : 16 }]}>{title}</Text>
      {subtitle && (
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  text: {
    marginTop: Spacing.md,
    ...Typography.bodyMedium,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: Spacing.xs,
    ...Typography.subhead,
    textAlign: 'center',
    lineHeight: 22,
  },
});
