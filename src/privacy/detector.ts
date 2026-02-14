// src/privacy/detector.ts

import { EntitySpan, EntityType } from "./entities";

interface DetectorPattern {
    type: EntityType;
    regex: RegExp;
    keywords?: string[];
}

const PATTERNS: DetectorPattern[] = [
    {
        type: "OTP",
        // 4-8 digit numbers, often isolated or near keywords
        regex: /\b\d{4,8}\b/g,
        keywords: ["otp", "verification", "code", "expires", "valid", "pin"]
    },
    {
        type: "EMAIL",
        regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
    },
    {
        type: "PHONE",
        // Generic phone regex, can be improved for specific countries
        regex: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g
    },
    {
        type: "AADHAAR",
        // 12 digit Aadhaar number
        regex: /\b\d{4}\s\d{4}\s\d{4}\b/g
    },
    {
        type: "PAN",
        // Indian PAN card format
        regex: /\b[A-Z]{5}\d{4}[A-Z]{1}\b/g
    },
    {
        type: "PASSWORD",
        // Look for common password patterns near assignment operators
        regex: /(?:password|passwd|pwd|secret|key)["']?\s*[:=]\s*["']?([^"'\s]{4,})/gi
    }
];

export function detectSensitiveData(text: string): EntitySpan[] {
    const spans: EntitySpan[] = [];

    for (const pattern of PATTERNS) {
        let match;
        // Reset regex index for global flags
        pattern.regex.lastIndex = 0;

        while ((match = pattern.regex.exec(text)) !== null) {
            const value = match[0];
            const start = match.index;
            const end = start + value.length;

            // Special handling for OTP to check proximity to keywords
            if (pattern.type === "OTP") {
                const windowSize = 30; // Check context around the number
                const context = text.slice(Math.max(0, start - windowSize), Math.min(text.length, end + windowSize)).toLowerCase();
                const hasKeyword = pattern.keywords?.some(kw => context.includes(kw));

                if (!hasKeyword) continue;
            }

            // Avoid overlapping spans (simple greedy approach)
            const isOverlapping = spans.some(s => (start >= s.start && start < s.end) || (end > s.start && end <= s.end));
            if (!isOverlapping) {
                spans.push({
                    type: pattern.type,
                    start,
                    end,
                    value
                });
            }
        }
    }

    // Sort by start position
    return spans.sort((a, b) => a.start - b.start);
}
