import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii } from '@/constants/theme';

interface ListContainerProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Wraps a set of ListRow children in a single rounded, bordered surface (iOS grouped-list style). */
export function ListContainer({ children, style }: ListContainerProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  return (
    <View style={[styles.list, { backgroundColor: theme.card, borderColor: theme.border }, style]}>
      {children}
    </View>
  );
}

interface ListRowProps {
  children: React.ReactNode;
  isLast?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ListRow({ children, isLast = false, style }: ListRowProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  return (
    <View>
      <View style={[styles.row, style]}>{children}</View>
      {!isLast && <View style={[styles.separator, { backgroundColor: theme.border }]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    borderRadius: Radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    padding: 16,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
});
