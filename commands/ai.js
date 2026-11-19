const axios = require('axios');

const API_BASE = 'https://api.nexoracle.com/ai/llama2?apikey=d0dbeb860362981c53&prompt=';

// Pulls the answer text out of whatever shape the API returns
function extractText(data) {
    if (data == null) return null;
    if (typeof data === 'string') return data.trim() || null;
    if (Array.isArray(data)) {
        for (const v of data) {
            const t = extractText(v);
            if (t) return t;
        }
        return null;
    }
    if (typeof data === 'object') {
        for (const k of ['result', 'response', 'answer', 'text', 'content', 'reply', 'output', 'message', 'data']) {
            if (k in data) {
                const t = extractText(data[k]);
                if (t) return t;
            }
        }
    }
    return null;
}

async function getAIResponse(prompt) {
    const res = await axios.get(`${API_BASE}${encodeURIComponent(prompt)}`, {
        timeout: 60000,
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json, text/plain, */*' }
    });
    const data = res?.data;
    if (data && typeof data === 'object' && data.success === false) {
        throw new Error('AI API returned an error.');
    }
    const text = extractText(data);
    if (!text) throw new Error('AI API returned an empty response.');
    return text;
}

async function aiCommand(sock, from, msg, isAdmin, session, args) {
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ Only owner can use this command." }, { quoted: msg });

    const action = args[0]?.toLowerCase();
    if (action === 'on') {
        session.aiEnabled = true;
        await sock.sendMessage(from, { text: "✅ AI Auto-Reply Enabled!" }, { quoted: msg });
    } else if (action === 'off') {
        session.aiEnabled = false;
        await sock.sendMessage(from, { text: "❌ AI Auto-Reply Disabled!" }, { quoted: msg });
    } else if (args.length > 0) {
        // Direct query to AI
        const query = args.join(' ');
        try {
            try { await sock.sendMessage(from, { react: { text: '🤖', key: msg.key } }); } catch (e) {}
            const response = await getAIResponse(query);
            await sock.sendMessage(from, { text: response }, { quoted: msg });
        } catch (e) {
            await sock.sendMessage(from, { text: "❌ AI Error: " + e.message }, { quoted: msg });
        }
    } else {
        await sock.sendMessage(from, { text: "❌ Usage:\n.ai [on/off] - Toggle Auto-Reply\n.ai [query] - Ask AI something" }, { quoted: msg });
    }
}

module.exports = aiCommand;
// Exported so your auto-reply code can use the same API: require('./ai').getAIResponse(text)
module.exports.getAIResponse = getAIResponse;
