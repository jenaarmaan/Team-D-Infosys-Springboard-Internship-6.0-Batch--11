
import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light' | 'system';

interface SettingsContextType {
    // Voice Settings
    continuousListening: boolean;
    setContinuousListening: (v: boolean) => void;
    wakeWordSensitivity: number;
    setWakeWordSensitivity: (v: number) => void;
    voiceFeedback: boolean;
    setVoiceFeedback: (v: boolean) => void;

    // Audio Settings
    speechVolume: number;
    setSpeechVolume: (v: number) => void;
    speechRate: number;
    setSpeechRate: (v: number) => void;

    // Theme Settings
    theme: Theme;
    setTheme: (t: Theme) => void;

    // Notification Settings
    emailNotifications: boolean;
    setEmailNotifications: (v: boolean) => void;
    messageAlerts: boolean;
    setMessageAlerts: (v: boolean) => void;

    // Accessibility
    highContrast: boolean;
    setHighContrast: (v: boolean) => void;
    screenReader: boolean;
    setScreenReader: (v: boolean) => void;

    // Extra Features
    autoSummarize: boolean;
    setAutoSummarize: (v: boolean) => void;
    privacyMasking: boolean;
    setPrivacyMasking: (v: boolean) => void;
    experimentalFeatures: boolean;
    setExperimentalFeatures: (v: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Load from localStorage or defaults
    const [continuousListening, setContinuousListening] = useState(() => JSON.parse(localStorage.getItem('govind_continuousListening') || 'true'));
    const [wakeWordSensitivity, setWakeWordSensitivity] = useState(() => JSON.parse(localStorage.getItem('govind_wakeWordSensitivity') || '50'));
    const [voiceFeedback, setVoiceFeedback] = useState(() => JSON.parse(localStorage.getItem('govind_voiceFeedback') || 'true'));
    const [speechVolume, setSpeechVolume] = useState(() => JSON.parse(localStorage.getItem('govind_speechVolume') || '80'));
    const [speechRate, setSpeechRate] = useState(() => JSON.parse(localStorage.getItem('govind_speechRate') || '50'));
    const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('govind_theme') as Theme) || 'dark');
    const [emailNotifications, setEmailNotifications] = useState(() => JSON.parse(localStorage.getItem('govind_emailNotifications') || 'true'));
    const [messageAlerts, setMessageAlerts] = useState(() => JSON.parse(localStorage.getItem('govind_messageAlerts') || 'true'));
    const [highContrast, setHighContrast] = useState(() => JSON.parse(localStorage.getItem('govind_highContrast') || 'false'));
    const [screenReader, setScreenReader] = useState(() => JSON.parse(localStorage.getItem('govind_screenReader') || 'true'));

    // Extra Features
    const [autoSummarize, setAutoSummarize] = useState(() => JSON.parse(localStorage.getItem('govind_autoSummarize') || 'false'));
    const [privacyMasking, setPrivacyMasking] = useState(() => JSON.parse(localStorage.getItem('govind_privacyMasking') || 'true'));
    const [experimentalFeatures, setExperimentalFeatures] = useState(() => JSON.parse(localStorage.getItem('govind_experimentalFeatures') || 'false'));

    // Persist to localStorage
    useEffect(() => {
        localStorage.setItem('govind_continuousListening', JSON.stringify(continuousListening));
        localStorage.setItem('govind_wakeWordSensitivity', JSON.stringify(wakeWordSensitivity));
        localStorage.setItem('govind_voiceFeedback', JSON.stringify(voiceFeedback));
        localStorage.setItem('govind_speechVolume', JSON.stringify(speechVolume));
        localStorage.setItem('govind_speechRate', JSON.stringify(speechRate));
        localStorage.setItem('govind_theme', theme);
        localStorage.setItem('govind_emailNotifications', JSON.stringify(emailNotifications));
        localStorage.setItem('govind_messageAlerts', JSON.stringify(messageAlerts));
        localStorage.setItem('govind_highContrast', JSON.stringify(highContrast));
        localStorage.setItem('govind_screenReader', JSON.stringify(screenReader));
        localStorage.setItem('govind_autoSummarize', JSON.stringify(autoSummarize));
        localStorage.setItem('govind_privacyMasking', JSON.stringify(privacyMasking));
        localStorage.setItem('govind_experimentalFeatures', JSON.stringify(experimentalFeatures));
    }, [
        continuousListening, wakeWordSensitivity, voiceFeedback, speechVolume, speechRate,
        theme, emailNotifications, messageAlerts, highContrast, screenReader,
        autoSummarize, privacyMasking, experimentalFeatures
    ]);

    // Apply Theme
    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');

        if (theme === 'system') {
            const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            root.classList.add(systemTheme);
        } else {
            root.classList.add(theme);
        }
    }, [theme]);

    // Apply High Contrast
    useEffect(() => {
        const root = window.document.documentElement;
        if (highContrast) {
            root.classList.add('high-contrast');
        } else {
            root.classList.remove('high-contrast');
        }
    }, [highContrast]);

    return (
        <SettingsContext.Provider value={{
            continuousListening, setContinuousListening,
            wakeWordSensitivity, setWakeWordSensitivity,
            voiceFeedback, setVoiceFeedback,
            speechVolume, setSpeechVolume,
            speechRate, setSpeechRate,
            theme, setTheme,
            emailNotifications, setEmailNotifications,
            messageAlerts, setMessageAlerts,
            highContrast, setHighContrast,
            screenReader, setScreenReader,
            autoSummarize, setAutoSummarize,
            privacyMasking, setPrivacyMasking,
            experimentalFeatures, setExperimentalFeatures
        }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};
