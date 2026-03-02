import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';

interface ActionAlertProps {
    visible: boolean;
    title: string;
    message: string;
    onClose: () => void;
    onConfirm?: () => void;
    confirmText?: string;
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
    cancelText = 'Cancel',
    isDestructive = false
}: ActionAlertProps) {
    if (!visible) return null;

    return (
        <Modal
            transparent={true}
            animationType="fade"
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.alertBox}>
                    <Text style={styles.title}>{title}</Text>
                    <Text style={styles.message}>{message}</Text>

                    <View style={styles.buttonContainer}>
                        {onConfirm ? (
                            <>
                                <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onClose}>
                                    <Text style={styles.cancelText}>{cancelText}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.button, isDestructive ? styles.destructiveButton : styles.confirmButton]}
                                    onPress={() => {
                                        onClose();
                                        onConfirm();
                                    }}
                                >
                                    <Text style={styles.confirmText}>{confirmText}</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <TouchableOpacity style={[styles.button, styles.confirmButton]} onPress={onClose}>
                                <Text style={styles.confirmText}>OK</Text>
                            </TouchableOpacity>
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
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        // Add padding to handle web rendering correctly
        padding: 20
    },
    alertBox: {
        width: Platform.OS === 'web' ? 400 : '90%',
        maxWidth: '100%',
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 10,
        textAlign: 'center',
    },
    message: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
        marginBottom: 25,
        lineHeight: 22,
    },
    buttonContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 15, // Supported in newer RN, fallback via margins if needed
    },
    button: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 15,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelButton: {
        backgroundColor: '#f5f5f5',
        borderWidth: 1,
        borderColor: '#ddd',
    },
    confirmButton: {
        backgroundColor: '#F26122', // Thrive Orange
    },
    destructiveButton: {
        backgroundColor: '#e53935', // Red
    },
    cancelText: {
        color: '#666',
        fontSize: 16,
        fontWeight: 'bold',
    },
    confirmText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
