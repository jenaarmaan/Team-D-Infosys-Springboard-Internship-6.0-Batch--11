import axios from 'axios';

/**
 * Telegram Webhook Setup Script
 * Automates the one-time registration of the Vercel production URL with Telegram.
 */
async function setWebhook() {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const SECRET_TOKEN = process.env.TELEGRAM_WEBHOOK_SECRET;
    const VERCEL_URL = process.env.VERCEL_URL;

    if (!BOT_TOKEN || !SECRET_TOKEN || !VERCEL_URL) {
        console.error('❌ Missing environment variables (TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, or VERCEL_URL)');
        process.exit(1);
    }

    const webhookUrl = `${VERCEL_URL}/api/v1/telegram?action=webhook`;
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`;

    try {
        const response = await axios.post(url, {
            url: webhookUrl,
            secret_token: SECRET_TOKEN,
            allowed_updates: ['message', 'edited_message']
        });

        if (response.data.ok) {
            console.log(`✅ Webhook successfully set to: ${webhookUrl}`);
        } else {
            console.error('❌ Failed to set webhook:', response.data.description);
        }
    } catch (error: any) {
        console.error('❌ Error hitting Telegram API:', error.message);
    }
}

setWebhook();
