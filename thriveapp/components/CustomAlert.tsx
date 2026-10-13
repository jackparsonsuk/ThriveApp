import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Shadows, Spacing, Typography } from '@/constants/theme';

interface ActionAlertProps {
    visible: boolean;
    title: string;
    message: string;
    onClose: () => void;
    onConfirm?: () => void;
    confirmText?: string;
    onSecondaryConfirm?: () => void;
    secondaryConfirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
}

export default function CustomAlert({
    visible,
    title,
    message,
    onClose,
    onConfirm,
    confirmText = 'Confirm',
    onSecondaryConfirm,
    secondaryConfirmText,
    cancelText = 'Cancel',
    isDestructive = false
}: ActionAlertProps) {
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];

    if (!visible) return null;

    const actionColor = isDestructive ? theme.danger : theme.tint;
    // Callers pass 'Confirm' as a fallback even for info-only alerts, so only a
    // deliberate label (e.g. "Great") replaces the plain OK on a single-button alert.
    const dismissLabel = confirmText && confirmText !== 'Confirm' ? confirmText : 'OK';

    const neutralButton = (label: string, onPress: () => void) => (
        <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.fill }]}
            onPress={onPress}
            accessibilityRole="button"
        >
            <Text style={[styles.buttonText, { color: theme.text }]}>{label}</Text>
        </TouchableOpacity>
    );

    return (
        <Modal
            transparent={true}
            animationType="fade"
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
                <View style={[styles.alertBox, { backgroundColor: theme.card }]} accessibilityRole="alert">
                    <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
                    <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text>

                    {onConfirm ? (
                        onSecondaryConfirm && secondaryConfirmText ? (
                            // 3 options, stacked. The secondary action is the bigger one
                            // (e.g. cancel the whole series), so it gets the solid colour
                            // and the first action is the softer, tinted version.
                            <View style={styles.buttonColumn}>
                                <TouchableOpacity
                                    style={[styles.button, { backgroundColor: isDestructive ? theme.dangerMuted : theme.tintMuted }]}
                                    onPress={() => { onClose(); onConfirm(); }}
                                    accessibilityRole="button"
                                >
                                    <Text style={[styles.buttonText, { color: actionColor }]}>{confirmText}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.button, { backgroundColor: actionColor }]}
                                    onPress={() => { onClose(); onSecondaryConfirm(); }}
                                    accessibilityRole="button"
                                >
                                    <Text style={[styles.buttonText, { color: theme.onTint }]}>{secondaryConfirmText}</Text>
                                </TouchableOpacity>
                                {neutralButton(cancelText, onClose)}
                            </View>
                        ) : (
                            <View style={styles.buttonRow}>
                                {neutralButton(cancelText, onClose)}
                                <TouchableOpacity
                                    style={[styles.button, styles.buttonFlex, { backgroundColor: actionColor }]}
                                    onPress={() => { onClose(); onConfirm(); }}
                                    accessibilityRole="button"
                                >
                                    <Text style={[styles.buttonText, { color: theme.onTint }]} numberOfLines={1}>{confirmText}</Text>
                                </TouchableOpacity>
                            </View>
                        )
                    ) : (
                        <TouchableOpacity
                            style={[styles.button, { backgroundColor: theme.tint }]}
                            onPress={onClose}
                            accessibilityRole="button"
                        >
                            <Text style={[styles.buttonText, { color: theme.onTint }]}>{dismissLabel}</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.xl,
    },
    alertBox: {
        width: '100%',
        maxWidth: 360,
        borderRadius: Radii.xl,
        padding: Spacing.xl,
        ...Shadows.lg,
    },
    title: {
        ...Typography.title3,
        marginBottom: Spacing.sm,
        textAlign: 'center',
    },
    message: {
        ...Typography.body,
        textAlign: 'center',
        marginBottom: Spacing.xl,
        lineHeight: 22,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: Spacing.sm,
    },
    buttonColumn: {
        gap: Spacing.sm,
    },
    button: {
        flex: 1,
        minHeight: 48,
        paddingHorizontal: Spacing.lg,
        borderRadius: Radii.pill,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonFlex: {
        flex: 1,
    },
    buttonText: {
        ...Typography.headline,
    },
});
