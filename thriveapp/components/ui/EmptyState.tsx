import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  compact?: boolean;
  /** Optional call to action shown under the text. */
  action?: React.ReactNode;
}

export default function EmptyState({ icon, title, subtitle, compact = false, action }: EmptyStateProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  if (compact) {
    // A one-line placeholder: an empty section shouldn't outweigh the heading above it
    return (
      <View style={[styles.compact, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Ionicons name={icon} size={20} color={theme.textTertiary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.compactTitle, { color: theme.textSecondary }]}>{title}</Text>
          {subtitle && <Text style={[styles.compactSubtitle, { color: theme.textTertiary }]}>{subtitle}</Text>}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={[styles.iconWrap, { backgroundColor: theme.fill }]}>
        <Ionicons name={icon} size={26} color={theme.textSecondary} />
      </View>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      {subtitle && <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text>}
      {action && <View style={styles.action}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radii.lg,
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.headline,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: Spacing.xs,
    ...Typography.subhead,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 21,
  },
  action: {
    marginTop: Spacing.lg,
    alignSelf: 'stretch',
  },
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing.lg,
  },
  compactTitle: {
    ...Typography.subhead,
    fontWeight: '400',
  },
  compactSubtitle: {
    ...Typography.footnote,
    fontWeight: '400',
    marginTop: 2,
  },
});
