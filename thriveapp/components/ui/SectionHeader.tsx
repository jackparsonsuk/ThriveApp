import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Typography } from '@/constants/theme';

interface SectionHeaderProps {
  title: string;
  action?: React.ReactNode;
}

/** Section title used to divide a screen into groups (e.g. "Next Session", "Your Stats"). */
export default function SectionHeader({ title, action }: SectionHeaderProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  return (
    <View style={styles.row}>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.title3,
  },
});
