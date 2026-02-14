// src/test/auth_controller.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleRegisterSpeech, RegistrationSession } from '../auth/authController';
import { RegisterStep } from '../auth/authTypes';

describe('Auth Controller Speech Logic (SP1)', () => {
    let session: RegistrationSession;
    let currentStep: RegisterStep;
    const speak = vi.fn();
    const setSession = (updater: any) => {
        if (typeof updater === 'function') {
            session = updater(session);
        } else {
            session = updater;
        }
    };
    const setStep = (step: RegisterStep) => {
        currentStep = step;
    };

    beforeEach(() => {
        session = { email: '' }; // Start with basic email session
        currentStep = 'EMAIL';
        vi.clearAllMocks();
    });

    it('should advance from EMAIL to PASSWORD', () => {
        handleRegisterSpeech('test@example.com', session, setSession, 'EMAIL', setStep, speak);
        expect(session.email).toBe('test@example.com');
        expect(currentStep).toBe('PASSWORD');
        expect(speak).toHaveBeenCalledWith(expect.stringContaining('Email set to test@example.com'));
    });

    it('should advance from PASSWORD to APP_PASSWORD', () => {
        currentStep = 'PASSWORD';
        handleRegisterSpeech('mypassword123', session, setSession, 'PASSWORD', setStep, speak);
        expect(session.password).toBe('mypassword123');
        expect(currentStep).toBe('APP_PASSWORD');
        expect(speak).toHaveBeenCalledWith(expect.stringContaining('Password received'));
    });

    it('should advance from VOICE_PIN to COMPLETE', () => {
        currentStep = 'VOICE_PIN';
        // parseVoicePin handles mapping text digits to numbers
        // Assuming 'one two three four' works
        handleRegisterSpeech('one two three four', session, setSession, 'VOICE_PIN', setStep, speak);
        expect(session.voicePin).toBe('1234');
        expect(currentStep).toBe('COMPLETE');
        expect(speak).toHaveBeenCalledWith(expect.stringContaining('Voice PIN received'));
    });
});
