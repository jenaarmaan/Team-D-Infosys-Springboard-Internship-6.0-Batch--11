// src/privacy/sanitizer.ts

import { EntitySpan, SanitizedResult } from "./entities";

export function sanitize(text: string, spans: EntitySpan[]): SanitizedResult {
    let sanitizedText = text;
    const localMap: Record<string, string> = {};

    // Replace from back to front to maintain index offsets
    const sortedSpans = [...spans].sort((a, b) => b.start - a.start);

    for (const span of sortedSpans) {
        const placeholder = `<${span.type}_MASKED>`;

        // Store in local map if we ever need to re-identify (though Gemini won't see it)
        localMap[placeholder] = span.value;

        const before = sanitizedText.slice(0, span.start);
        const after = sanitizedText.slice(span.end);

        sanitizedText = before + placeholder + after;
    }

    if (spans.length > 0) {
        console.log(`[PRIVACY] Sanitized ${spans.length} sensitive entities from input.`);
        console.log(`[PRIVACY] Entities masked: ${spans.map(s => s.type).join(", ")}`);
    }

    return {
        originalText: text,
        sanitizedText,
        localMap,
        entities: spans
    };
}
