const axios = require('axios');

async function tiktokCommand(sock, from, msg, q) {
    if (!q) return await sock.sendMessage(from, { text: "❌ Please provide a TikTok URL." }, { quoted: msg });

    try {
        try { await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }); } catch (e) {}

        // Using TikWM API as it's generally reliable
        const res = await axios.get(`https://tikwm.com/api/?url=${encodeURIComponent(q.trim())}`, { timeout: 60000 });

        if (res.data && res.data.data && res.data.data.play) {
            const videoData = res.data.data;
            const videoUrl = videoData.play; // Direct MP4 URL
            const author = videoData.author?.nickname || 'Unknown';
            const title = videoData.title || "TikTok Video";

            const caption = `*\u{1F3A5} TikTok Downloader*\n\n` +
                `📝 *Title:* ${title}\n` +
                `👤 *Author:* ${author}\n\n` +
                `> © POWERED BY SHADOW MD BOT`;

            await sock.sendMessage(from, {
                video: { url: videoUrl },
                caption,
                mimetype: 'video/mp4'
            }, { quoted: msg });

            try { await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }); } catch (e) {}
        } else {
            throw new Error('Failed to fetch TikTok video.');
        }
    } catch (e) {
        console.error('TikTok Error:', e);
        await sock.sendMessage(from, { text: "❌ Error downloading TikTok: " + e.message }, { quoted: msg });
        try { await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }); } catch (err) {}
    }
}

module.exports = tiktokCommand;
