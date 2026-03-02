import { Alert, Platform } from 'react-native';

export const confirmAlert = (
    title: string,
    message: string,
    onConfirm: () => void,
    onCancel?: () => void
) => {
    if (Platform.OS === 'web') {
        const result = window.confirm(`${title}\n\n${message}`);
        if (result) {
            onConfirm();
        } else if (onCancel) {
            onCancel();
        }
    } else {
        Alert.alert(title, message, [
            { text: 'Cancel', style: 'cancel', onPress: onCancel },
            { text: 'Confirm', onPress: onConfirm }
        ]);
    }
};

export const successAlert = (
    title: string,
    message: string,
    onOk?: () => void
) => {
    if (Platform.OS === 'web') {
        window.alert(`${title}\n\n${message}`);
        if (onOk) onOk();
    } else {
        Alert.alert(title, message, [
            { text: 'OK', onPress: onOk }
        ]);
    }
};

export const infoAlert = (
    title: string,
    message: string,
    onOk?: () => void
) => {
    if (Platform.OS === 'web') {
        window.alert(`${title}\n\n${message}`);
        if (onOk) onOk();
    } else {
        Alert.alert(title, message, [
            { text: 'OK', onPress: onOk }
        ]);
    }
};

export const errorAlert = (
    title: string,
    message: string
) => {
    if (Platform.OS === 'web') {
        window.alert(`Error: ${title}\n\n${message}`);
    } else {
        Alert.alert(title, message);
    }
};
