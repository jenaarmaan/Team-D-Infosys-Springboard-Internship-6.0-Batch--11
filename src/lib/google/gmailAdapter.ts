import { PlatformAdapter, ExecutionResult } from "@/lib/platforms/platformTypes";
import { ResolvedIntent } from "@/lib/govind/intentMap";
import { fetchInbox, readEmail } from "./gmailReader";
import { sendEmail, replyToEmail } from "./gmailSender";
import { summarizeEmail } from "@/services/gmailSummarizer";

export const GmailAdapter: PlatformAdapter = {
    id: "gmail",
    name: "Google Gmail",

    execute: async (intent: ResolvedIntent): Promise<ExecutionResult> => {
        const text = intent.text.toLowerCase();

        try {
            switch (intent.action) {
                case "READ": {
                    // 1. 🔍 RESOLVE INDEX (Digits or Words)
                    const wordMap: Record<string, number> = {
                        "first": 1, "1st": 1, "one": 1,
                        "second": 2, "2nd": 2, "two": 2,
                        "third": 3, "3rd": 3, "three": 3,
                        "fourth": 4, "4th": 4, "four": 4,
                        "fifth": 5, "5th": 5, "five": 5,
                        "sixth": 6, "6th": 6, "six": 6,
                        "seventh": 7, "7th": 7, "seven": 7,
                        "eighth": 8, "8th": 8, "eight": 8,
                        "ninth": 9, "9th": 9, "nine": 9,
                        "tenth": 10, "10th": 10, "ten": 10,
                        "eleventh": 11, "twelfth": 12, "thirteenth": 13, "fourteenth": 14, "fifteenth": 15,
                        "sixteenth": 16, "seventeenth": 17, "eighteenth": 18, "nineteenth": 19, "twentieth": 20,
                        "twenty first": 21, "twenty second": 22, "twenty third": 23, "twenty fourth": 24, "twenty fifth": 25,
                        "twenty sixth": 26, "twenty seventh": 27, "twenty eighth": 28, "twenty ninth": 29, "thirtieth": 30,
                        "thirty first": 31, "thirty second": 32, "thirty third": 33, "fortieth": 40, "fiftieth": 50,
                        "last": 1
                    };

                    let targetIndex = -1;

                    // Regex for "read email 3", "open 3rd", "read third mail"
                    const digitMatch = text.match(/(?:read|open).*(?:number|email)?\s*(\d+)/i);
                    const wordEntries = Object.keys(wordMap).sort((a, b) => b.length - a.length).join("|");
                    const wordMatch = text.match(new RegExp(`\\b(${wordEntries})\\b`, "i"));

                    if (digitMatch) {
                        targetIndex = parseInt(digitMatch[1]);
                    } else if (wordMatch) {
                        targetIndex = wordMap[wordMatch[1].toLowerCase()];
                    }

                    // 2. 🔍 FILTERING ("from google", "about jobs")
                    const fromMatch = text.match(/from\s+([a-z0-9\s]+)/i);
                    const aboutMatch = text.match(/about\s+([a-z0-9\s]+)/i);

                    // Fetch enough emails to search/index (50 max as per request)
                    let emails = await fetchInbox(50);

                    // Apply Filters
                    if (fromMatch) {
                        const term = fromMatch[1].trim();
                        emails = emails.filter((e: any) => e.from.toLowerCase().includes(term));
                    }
                    if (aboutMatch) {
                        const term = aboutMatch[1].trim();
                        emails = emails.filter((e: any) => e.subject.toLowerCase().includes(term));
                    }

                    // 3. 🎯 EXECUTE MATCH
                    if (targetIndex !== -1) {
                        if (emails.length < targetIndex) {
                            return { success: false, message: "I couldn't find that email." };
                        }

                        const target = emails[targetIndex - 1]; // 1-based to 0-based
                        const full = await readEmail(target.id);

                        // Auto-Summarize
                        let spokenContent = full.body.slice(0, 150) + "...";
                        try {
                            const summaryData = await summarizeEmail(full.body);
                            spokenContent = summaryData.summary;
                        } catch (e) {
                            console.warn("Auto-summary failed");
                        }

                        return {
                            success: true,
                            message: `Email ${targetIndex} from ${full.from}. Subject: ${full.subject}. Here is the summary: ${spokenContent}. Say 'reply' to respond.`,
                            data: { ...full, summary: spokenContent, type: "OPEN_EMAIL_ID" }
                        };
                    }

                    if (fromMatch || aboutMatch) {
                        if (emails.length === 0) return { success: true, message: "No emails found matching your search." };
                        if (emails.length === 1) {
                            const target = emails[0];
                            const full = await readEmail(target.id);
                            const summaryData = await summarizeEmail(full.body);
                            return {
                                success: true,
                                message: `Found one email from ${target.from}. Subject: ${target.subject}. Summary: ${summaryData.summary}`,
                                data: { ...full, summary: summaryData.summary, type: "OPEN_EMAIL_ID" }
                            };
                        }

                        const summary = emails.slice(0, 5).map((e: any, i: number) =>
                            `Email ${i + 1}: ${e.subject}`
                        ).join(". ");
                        return { success: true, message: `Found ${emails.length} emails. ${summary}. Say 'read the first one' to open.` };
                    }

                    if (emails.length === 0) {
                        return { success: true, message: "Your inbox is empty.", data: [] };
                    }

                    const top5 = emails.slice(0, 5);
                    const summary = top5.map((e: any, i: number) =>
                        `Email ${i + 1} from ${e.from.split('<')[0].trim()} about ${e.subject}`
                    ).join(". ");

                    return {
                        success: true,
                        message: `You have ${emails.length} unread emails. ${summary}. Say 'read email 1' to open one.`,
                        data: top5
                    };
                }

                case "SUMMARIZE": {
                    const emails = await fetchInbox(1);
                    if (emails.length === 0) return { success: false, message: "No emails to summarize." };

                    const latest = emails[0];
                    const fullEmail = await readEmail(latest.id);
                    const summary = await summarizeEmail(fullEmail.body);

                    return {
                        success: true,
                        message: `Summary of email from ${latest.from}: ${summary.summary}`,
                        data: summary
                    };
                }

                case "REPLY": {
                    const match = text.match(/reply saying (.+)/i) || text.match(/reply (.+)/i);
                    const isDraftRequest = text.includes("draft");
                    const targetId = intent.entities?.messageId;
                    let full;

                    if (targetId) {
                        full = await readEmail(targetId);
                    } else {
                        const emails = await fetchInbox(1);
                        if (emails.length === 0) return { success: false, message: "No email to reply to." };
                        full = await readEmail(emails[0].id);
                    }

                    if (!match || isDraftRequest) {
                        return {
                            success: true,
                            message: "Opening reply draft.",
                            data: {
                                type: "OPEN_COMPOSE_REPLY",
                                to: full.from,
                                subject: `Re: ${full.subject}`,
                                body: ""
                            }
                        };
                    }

                    const replyMessage = match[1];
                    await replyToEmail(full.threadId, full.from, full.subject, replyMessage);

                    return {
                        success: true,
                        message: `Replied to ${full.from} saying: ${replyMessage}`
                    };
                }

                case "SEND": {
                    if (text.includes("compose") || text.includes("draft") || text === "send email") {
                        return {
                            success: true,
                            message: "Opening compose window. Who do you want to email?",
                            data: { type: "OPEN_COMPOSE" }
                        };
                    }

                    const toMatch = text.match(/to\s+([a-zA-Z0-9@._-]+)/i);
                    const msgMatch = text.match(/saying\s+(.+)/i);

                    if (!toMatch || !msgMatch) {
                        return {
                            success: true,
                            message: "Opening compose window. Who do you want to email?",
                            data: { type: "OPEN_COMPOSE" }
                        };
                    }

                    const to = toMatch[1];
                    const body = msgMatch[1];
                    const subject = "Voice Message from Govind";

                    await sendEmail(to, subject, body);
                    return { success: true, message: `Email sent to ${to}.` };
                }

                case "OPEN_PLATFORM": {
                    return { success: true, message: "Opening Gmail interface." };
                }

                default:
                    return {
                        success: false,
                        message: `Action ${intent.action} not supported on Gmail yet.`,
                        error: "UNSUPPORTED_ACTION"
                    };
            }
        } catch (err: any) {
            console.error("[GMAIL ADAPTER]", err);
            return {
                success: false,
                message: "I couldn't access your Gmail. Please say 'Open Gmail' to authenticate first.",
                error: err?.message || "GMAIL_ERROR"
            };
        }
    }
};
