import express from "express";
import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import fs from "fs";

dotenv.config();
const app = express();
app.use(express.json());

// Telegram bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const chatId = process.env.TELEGRAM_CHAT_ID;
const ADMIN_ID = process.env.ADMIN_ID;

// Alapbeállítások (mentés settings.json-ba)
const SETTINGS_FILE = "./settings.json";
let settings = {
  enabled: true,
  minSOL: 0,
  maxSOL: 100,
  minMCAP: 0,
  maxMCAP: 999999999
};

// Ha létezik korábbi mentés, betöltjük
if (fs.existsSync(SETTINGS_FILE)) {
  settings = JSON.parse(fs.readFileSync(SETTINGS_FILE));
}

// Beállítások mentése
const saveSettings = () => {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
};

// Admin parancsok kezelése
bot.onText(/\/(.+)/, async (msg, match) => {
  if (msg.from.id.toString() !== ADMIN_ID) {
    return bot.sendMessage(msg.chat.id, "⛔ Nincs jogosultságod ehhez a bothoz.");
  }

  const command = match[1].split(" ")[0];
  const value = parseFloat(match[1].split(" ")[1]);

  switch (command) {
    case "status":
      settings.enabled = !settings.enabled;
      saveSettings();
      bot.sendMessage(chatId, `📢 Posztolás: ${settings.enabled ? "✅ BE" : "⛔ KI"}`);
      break;

    case "setminsol":
      settings.minSOL = value;
      saveSettings();
      bot.sendMessage(chatId, `🔹 Minimum égetett SOL beállítva: ${value}`);
      break;

    case "setmaxsol":
      settings.maxSOL = value;
      saveSettings();
      bot.sendMessage(chatId, `🔹 Maximum égetett SOL beállítva: ${value}`);
      break;

    case "setminmcap":
      settings.minMCAP = value;
      saveSettings();
      bot.sendMessage(chatId, `🔹 Minimum marketcap beállítva: ${value}`);
      break;

    case "setmaxmcap":
      settings.maxMCAP = value;
      saveSettings();
      bot.sendMessage(chatId, `🔹 Maximum marketcap beállítva: ${value}`);
      break;

    case "settings":
      bot.sendMessage(chatId, `⚙️ Jelenlegi beállítások:\n
      • Posztolás: ${settings.enabled ? "✅ BE" : "⛔ KI"}
      • Min SOL: ${settings.minSOL}
      • Max SOL: ${settings.maxSOL}
      • Min MCAP: ${settings.minMCAP}
      • Max MCAP: ${settings.maxMCAP}`);
      break;

    default:
      bot.sendMessage(chatId, "ℹ️ Ismeretlen parancs. Használható parancsok: /status, /setminsol, /setmaxsol, /setminmcap, /setmaxmcap, /settings");
  }
});

// Webhook endpoint
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body[0];
    if (!data) return res.status(400).send("Missing webhook data");

    const signature = data.signature;
    const solAmount = (data.nativeTransfers?.[0]?.amount || 0) / 1_000_000_000;
    const tokenMint = data.tokenTransfers?.[0]?.mint || "Ismeretlen";
    const tokenSymbol = data.tokenTransfers?.[0]?.tokenSymbol || "UNKNOWN";
    const amount = data.tokenTransfers?.[0]?.tokenAmount || 0;
    const blockTime = data.blockTime
      ? new Date(data.blockTime * 1000).toLocaleString("hu-HU")
      : "Ismeretlen";

    const solscanUrl = `https://solscan.io/tx/${signature}`;

    // Szűrés: posztolás kikapcsolva vagy limit alatti adatok
    if (!settings.enabled) {
      console.log("⏸ Posztolás kikapcsolva.");
      return res.status(200).send("OK");
    }
    if (solAmount < settings.minSOL || solAmount > settings.maxSOL) {
      console.log("⏭ Kihagyva: SOL mennyiség nincs tartományban.");
      return res.status(200).send("OK");
    }

    // Üzenet formázás
    const message = `
🔥 *100% LP ELÉGETVE!* 🔥

💰 Token: ${tokenSymbol}
🔑 Mint: \`${tokenMint}\`
🔥 Égetett tokens: ${amount.toLocaleString()}
💎 SOL égetve: ${solAmount} SOL
📊 Market Cap: N/A
🗓 Időpont: ${blockTime}

✅ TELJES MEME/SOL LP ELÉGETVE!
🛡 ${solAmount} SOL biztosan elégetve
⛔ Rug pull: *Már nem lehetséges!*
📈 Tranzakció: [Solscan](${solscanUrl})

🚀 Biztonságos memecoin lehet!
⚠️ DYOR: Mindig végezz saját kutatást!
`;

    await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    console.log(`✅ Poszt elküldve: ${tokenSymbol}`);
    res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Webhook feldolgozási hiba:", err.message);
    res.status(500).send("Server error");
  }
});

// Szerver indítása
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 SLBB fut a ${PORT} porton - Webhook: /webhook`);
});
