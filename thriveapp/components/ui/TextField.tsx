import React, { forwardRef } from 'react';
import { View, Text, TextInput, TextInputProps, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

interface TextFieldProps extends TextInputProps {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  containerStyle?: StyleProp<ViewStyle>;
}

/** The one text input style used across the app (forms, search bars, modals). */
const TextField = forwardRef<TextInput, TextFieldProps>(({ label, icon, containerStyle, style, multiline, ...rest }, ref) => {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  return (
    <View style={containerStyle}>
      {label && <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>}
      <View style={styles.inputWrap}>
        {icon && <Ionicons name={icon} size={18} color={theme.textTertiary} style={styles.icon} />}
        <TextInput
          ref={ref}
          placeholderTextColor={theme.textTertiary}
          multiline={multiline}
          style={[
            styles.input,
            { backgroundColor: theme.card, borderColor: theme.border, color: theme.text },
            icon && { paddingLeft: 40 },
            multiline && styles.multiline,
            style,
          ]}
          {...rest}
        />
      </View>
    </View>
  );
});

TextField.displayName = 'TextField';
export default TextField;

const styles = StyleSheet.create({
  label: {
    ...Typography.footnote,
    marginBottom: Spacing.xs + 2,
  },
  inputWrap: {
    justifyContent: 'center',
  },
  icon: {
    position: 'absolute',
    left: Spacing.md + 2,
    zIndex: 1,
  },
  input: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.lg,
    ...Typography.body,
  },
  multiline: {
    minHeight: 96,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    textAlignVertical: 'top',
  },
});
