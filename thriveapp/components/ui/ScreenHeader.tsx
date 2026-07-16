import React from 'react';
import { View, Text, Image, StyleSheet, ImageSourcePropType } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Typography } from '@/constants/theme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  logo?: ImageSourcePropType;
  right?: React.ReactNode;
}

/** Large title header used at the top of each tab screen, with an optional logo/subtitle/action slot. */
export default function ScreenHeader({ title, subtitle, logo, right }: ScreenHeaderProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          {logo && (
            <Image
              source={logo}
              style={[styles.logo, colorScheme === 'light' && { tintColor: '#000' }]}
              resizeMode="contain"
            />
          )}
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          {subtitle && <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text>}
        </View>
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.xxl,
    paddingVertical: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  logo: {
    width: 44,
    height: 44,
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.largeTitle,
  },
  subtitle: {
    ...Typography.body,
    marginTop: Spacing.xs,
  },
});
