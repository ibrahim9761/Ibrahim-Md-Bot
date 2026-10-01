const fs = require('fs-extra');
const path = require('path');
const settings = require('../settings');
const SPAM_FILE = path.join(__dirname, '..', 'spam.txt');

function onlyDigits(s = '') { 
    return String(s).replace(/\D/g, ''); 
}

function getOwners() {
    const raw = settings.ownerNumber;
    const owners = Array.isArray(raw) ? raw : String(raw).split ? String(raw).split(',') : [raw];
    return owners.map(o => onlyDigits(o));
}

module.exports = async function(sock, chatId, message, q) {
    try {
        const sender = onlyDigits(message.key?.participant || message.key?.remoteJid || '');
        if (!getOwners().includes(sender) && !message.key?.fromMe) {
            return await sock.sendMessage(chatId, { text: '❌ Owner only' }, { quoted: message });
        }

        if (!fs.existsSync(SPAM_FILE)) {
            return await sock.sendMessage(chatId, { text: '⚠️ spam.txt not found! Create it first.' }, { quoted: message });
        }

        const spamText = fs.readFileSync(SPAM_FILE, 'utf8').trim();
        if (!spamText) return await sock.sendMessage(chatId, { text: '⚠️ spam.txt is empty!' }, { quoted: message });

        let count = 50;
        if (q && !isNaN(parseInt(q))) count = Math.min(parseInt(q), 100);

        await sock.sendMessage(chatId, { 
            text: `🔄 SHADOW SPAMMER\n📁 spam.txt\n📊 Count: ${count}\n⚡ Speed: ULTRA FAST\n⏳ Starting...` 
        }, { quoted: message });

        let sent = 0;
        // Sequential sending to ensure correct count order
        for (let i = 0; i < count; i++) {
            try { 
                await sock.sendMessage(chatId, { 
                    text: `${spamText}\n\n🔥 ${i+1}/${count}` 
                }); 
                sent++;
            } catch(e) {}
            // Ultra small delay to prevent rate limit but keep order
            if (i % 5 === 0) await new Promise(r => setTimeout(r, 50));
        }

        await sock.sendMessage(chatId, { text: `✅ SPAMMING DONE\n📨 Sent: ${sent}/${count}\n⚡ Speed: ULTRA FAST` });
    } catch(err) { 
        await sock.sendMessage(chatId, { text: '❌ Error: ' + err.message }, { quoted: message }); 
    }
};
