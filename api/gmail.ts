import { VercelRequest, VercelResponse } from '@vercel/node';

console.log("GMAIL FUNCTION HIT");

export default async function handler(req: VercelRequest, res: VercelResponse) {
    console.log("GMAIL HANDLER EXECUTED");
    return res.status(200).json({
        success: true,
        route: "gmail working",
        method: req.method,
        query: req.query
    });
}
