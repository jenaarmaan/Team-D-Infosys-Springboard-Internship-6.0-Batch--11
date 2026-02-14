// src/test/registration_flow.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { completeRegistration } from '../services/registrationFlow';
import * as authLib from '../lib/firebase/auth';
import * as usersLib from '../lib/firebase/users';
import * as storageLib from '../lib/firebase/storage';

// Mock the Firebase libraries
vi.mock('../lib/firebase/auth');
vi.mock('../lib/firebase/users');
vi.mock('../lib/firebase/storage');

describe('Registration Flow Pipeline (SP1)', () => {
    const mockUser = { uid: 'test-uid' };
    const mockFile = new File([''], 'face.jpg', { type: 'image/jpeg' });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should complete registration successfully when all steps pass', async () => {
        // Stage 1: Auth
        (authLib.registerWithEmail as any).mockResolvedValue(mockUser);

        // Stage 2: Profile
        (usersLib.createUserProfile as any).mockResolvedValue(undefined);

        // Stage 3: Face Upload
        (storageLib.uploadFaceImage as any).mockResolvedValue(undefined);

        // Stage 4: Mark Face
        (usersLib.markFaceRegistered as any).mockResolvedValue(undefined);

        // Stage 5: Voice PIN
        (usersLib.updateVoicePinHash as any).mockResolvedValue(undefined);

        const result = await completeRegistration({
            email: 'test@example.com',
            password: 'password123',
            voicePinHash: 'hashed-pin',
            faceImage: mockFile
        });

        expect(result.status).toBe('OK');
        expect(authLib.registerWithEmail).toHaveBeenCalledWith('test@example.com', 'password123');
        expect(usersLib.createUserProfile).toHaveBeenCalledWith('test-uid', 'test@example.com');
    });

    it('should fail and return error details if a step fails', async () => {
        // Simulate failing at Step 3 (Upload Face)
        (authLib.registerWithEmail as any).mockResolvedValue(mockUser);
        (usersLib.createUserProfile as any).mockResolvedValue(undefined);
        (storageLib.uploadFaceImage as any).mockRejectedValue(new Error('Upload failed'));

        const result = await completeRegistration({
            email: 'test@example.com',
            password: 'password123',
            voicePinHash: 'hashed-pin',
            faceImage: mockFile
        });

        expect(result.status).toBe('FAIL');
        if (result.status === 'FAIL') {
            expect(result.code).toBe('FACE_UPLOAD_FAILED');
            expect(result.failedStep).toBe('UPLOAD_FACE');
        }
    });
});
