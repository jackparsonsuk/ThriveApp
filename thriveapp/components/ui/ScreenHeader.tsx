import React from 'react';
import { View, Text, Image, StyleSheet, ImageSourcePropType, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Typography } from '@/constants/theme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  logo?: ImageSourcePropType;
  right?: React.ReactNode;
  /** Shows a back link above the title. */
  onBack?: () => void;
  backLabel?: string;
}

/** Large title header used at the top of each screen, with optional back link, logo, subtitle and action slot. */
export default function ScreenHeader({ title, subtitle, logo, right, onBack, backLabel = 'Back' }: ScreenHeaderProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  return (
    <View style={styles.container}>
      {onBack && (
        <TouchableOpacity
          onPress={onBack}
          style={styles.back}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 20 }}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
        >
          <Ionicons name="chevron-back" size={22} color={theme.tint} />
          <Text style={[styles.backText, { color: theme.tint }]}>{backLabel}</Text>
        </TouchableOpacity>
      )}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          {logo && (
            <Image
              source={logo}
              style={[styles.logo, colorScheme === 'light' && { tintColor: '#000' }]}
              resizeMode="contain"
            />
          )}
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>{title}</Text>
          {subtitle && <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text>}
        </View>
        {right && <View style={styles.right}>{right}</View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginLeft: -Spacing.xs - 2,
    marginBottom: Spacing.xs,
  },
  backText: {
    ...Typography.body,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  right: {
    paddingBottom: Spacing.xs,
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
    ...Typography.subhead,
    fontWeight: '400',
    marginTop: Spacing.xs,
  },
});
