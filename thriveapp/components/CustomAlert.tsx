import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

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

    return (
        <Modal
            transparent={true}
            animationType="fade"
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
                <View style={[styles.alertBox, { backgroundColor: theme.card }]}>
                    <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
                    <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text>

                    <View style={styles.actionsWrapper}>
                        {onConfirm ? (
                            onSecondaryConfirm && secondaryConfirmText ? (
                                // 3 Options - Stacked Vertically
                                <View style={styles.buttonContainerVertical}>
                                    <TouchableOpacity
                                        style={[styles.button, styles.buttonVertical, { backgroundColor: actionColor }]}
                                        onPress={() => {
                                            onClose();
                                            onConfirm();
                                        }}
                                    >
                                        <Text style={styles.confirmText}>{confirmText}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.button, styles.buttonVertical, { backgroundColor: actionColor }]}
                                        onPress={() => {
                                            onClose();
                                            onSecondaryConfirm();
                                        }}
                                    >
                                        <Text style={styles.confirmText}>{secondaryConfirmText}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.button, styles.buttonVertical, { backgroundColor: theme.cardAlt, borderColor: theme.border, borderWidth: StyleSheet.hairlineWidth }]}
                                        onPress={onClose}
                                    >
                                        <Text style={[styles.cancelText, { color: theme.textSecondary }]}>{cancelText}</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                // 2 Options - Side by Side
                                <View style={styles.buttonContainerHorizontal}>
                                    <TouchableOpacity
                                        style={[styles.button, { backgroundColor: theme.cardAlt, borderColor: theme.border, borderWidth: StyleSheet.hairlineWidth }]}
                                        onPress={onClose}
                                    >
                                        <Text style={[styles.cancelText, { color: theme.textSecondary }]}>{cancelText}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.button, { backgroundColor: actionColor }]}
                                        onPress={() => {
                                            onClose();
                                            onConfirm();
                                        }}
                                    >
                                        <Text style={styles.confirmText}>{confirmText}</Text>
                                    </TouchableOpacity>
                                </View>
                            )
                        ) : (
                            // 1 Option
                            <View style={styles.buttonContainerHorizontal}>
                                <TouchableOpacity style={[styles.button, { backgroundColor: theme.tint }]} onPress={onClose}>
                                    <Text style={styles.confirmText}>OK</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
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
        // Add padding to handle web rendering correctly
        padding: Spacing.xl,
    },
    alertBox: {
        width: Platform.OS === 'web' ? 400 : '90%',
        maxWidth: '100%',
        borderRadius: Radii.xl,
        padding: Spacing.xl,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 8,
    },
    title: {
        ...Typography.title2,
        marginBottom: Spacing.sm,
        textAlign: 'center',
    },
    message: {
        ...Typography.body,
        textAlign: 'center',
        marginBottom: Spacing.xxl,
        lineHeight: 22,
    },
    actionsWrapper: {
        width: '100%',
    },
    buttonContainerHorizontal: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: Spacing.md,
    },
    buttonContainerVertical: {
        flexDirection: 'column',
        justifyContent: 'center',
        gap: Spacing.md,
    },
    button: {
        flex: 1,
        paddingVertical: Spacing.md + 2,
        paddingHorizontal: Spacing.lg,
        borderRadius: Radii.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonVertical: {
        flex: 0,
        width: '100%',
    },
    cancelText: {
        ...Typography.headline,
    },
    confirmText: {
        ...Typography.headline,
        color: '#fff',
    },
});
