import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

type ButtonVariant = 'primary' | 'secondary' | 'tint' | 'destructive' | 'ghost' | 'onTint';
type ButtonSize = 'md' | 'sm';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  style,
}: ButtonProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const variants: Record<ButtonVariant, { bg: string; fg: string }> = {
    primary: { bg: theme.tint, fg: theme.onTint },
    secondary: { bg: theme.cardAlt, fg: theme.text },
    tint: { bg: theme.tintMuted, fg: theme.tint },
    destructive: { bg: theme.dangerMuted, fg: theme.danger },
    ghost: { bg: 'transparent', fg: theme.text },
    onTint: { bg: 'rgba(255,255,255,0.2)', fg: '#ffffff' },
  };
  const { bg, fg } = variants[variant];
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      style={[
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        { backgroundColor: bg, opacity: isDisabled ? 0.5 : 1 },
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={size === 'sm' ? 14 : 18} color={fg} style={{ marginRight: Spacing.xs }} />}
          <Text style={[size === 'sm' ? styles.textSm : styles.textMd, { color: fg }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.pill,
  },
  md: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  sm: {
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.md,
  },
  textMd: {
    ...Typography.headline,
  },
  textSm: {
    ...Typography.caption,
  },
});
