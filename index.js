import express from "express";
import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import fs from "fs";

dotenv.config();
const app = express();
app.use(express.json());

// Telegram bot inicializálása
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const channelId = process.env.TELEGRAM_CHAT_ID; // Csatorna ID
const ADMIN_ID = process.env.ADMIN_ID; // Privát admin ID

// Beállítások mentési fájl
const SETTINGS_FILE = "./settings.json";
let settings = {
  enabled: true,
  minSOL: 0,
  maxSOL: 100,
  minMCAP: 0,
  maxMCAP: 999999999
};

// Ha létezik mentés, betöltjük
if (fs.existsSync(SETTINGS_FILE)) {
  settings = JSON.parse(fs.readFileSync(SETTINGS_FILE));
}

// Beállítások mentése
const saveSettings = () => {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
};

// Admin parancsok kezelése (csak privátban)
bot.onText(/\/(.+)/, async (msg, match) => {
  const userId = msg.from.id.toString();
  const chatType = msg.chat.type; // "private" vagy "channel"

  // Csak admin vezérelheti a botot
  if (userId !== ADMIN_ID) {
    if (chatType === "private") {
      await bot.sendMessage(msg.chat.id, "⛔ Nincs jogosultságod ehhez a bothoz.");
    }
    return;
  }

  const command = match[1].split(" ")[0];
  const value = parseFloat(match[1].split(" ")[1]);

  switch (command) {
    case "status":
      settings.enabled = !settings.enabled;
      saveSettings();
      await bot.sendMessage(ADMIN_ID, `📢 Posztolás: ${settings.enabled ? "✅ BE" : "⛔ KI"}`);
      break;

    case "setminsol":
      settings.minSOL = value;
      saveSettings();
      await bot.sendMessage(ADMIN_ID, `🔹 Minimum égetett SOL beállítva: ${value}`);
      break;

    case "setmaxsol":
      settings.maxSOL = value;
      saveSettings();
      await bot.sendMessage(ADMIN_ID, `🔹 Maximum égetett SOL beállítva: ${value}`);
      break;

    case "setminmcap":
      settings.minMCAP = value;
      saveSettings();
      await bot.sendMessage(ADMIN_ID, `🔹 Minimum marketcap beállítva: ${value}`);
      break;

    case "setmaxmcap":
      settings.maxMCAP = value;
      saveSettings();
      await bot.sendMessage(ADMIN_ID, `🔹 Maximum marketcap beállítva: ${value}`);
      break;

    case "settings":
      await bot.sendMessage(
        ADMIN_ID,
        `⚙️ Jelenlegi beállítások:\n\n` +
          `• Posztolás: ${settings.enabled ? "✅ BE" : "⛔ KI"}\n` +
          `• Min SOL: ${settings.minSOL}\n` +
          `• Max SOL: ${settings.maxSOL}\n` +
          `• Min MCAP: ${settings.minMCAP}\n` +
          `• Max MCAP: ${settings.maxMCAP}`
      );
      break;

    default:
      await bot.sendMessage(
        ADMIN_ID,
        "ℹ️ Ismeretlen parancs.\nHasználható parancsok:\n" +
          "/status\n/setminsol <érték>\n/setmaxsol <érték>\n/setminmcap <érték>\n/setmaxmcap <érték>\n/settings"
      );
  }
});

// Webhook végpont - Helius adatokat fogadja
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body[0];
    if (!data) return res.status(400).send("Missing webhook data");

    // Alap adatok
    const signature = data.signature;
    const solAmount = (data.nativeTransfers?.[0]?.amount || 0) / 1_000_000_000;
    const tokenMint = data.tokenTransfers?.[0]?.mint || "Ismeretlen";
    const tokenSymbol = data.tokenTransfers?.[0]?.tokenSymbol || tokenMint.slice(0, 6);
    const decimals = data.tokenTransfers?.[0]?.tokenDecimals || 9;
    const rawAmount = data.tokenTransfers?.[0]?.tokenAmount || 0;
    const tokenAmount = rawAmount / Math.pow(10, decimals);
    const blockTime = data.blockTime
      ? new Date(data.blockTime * 1000).toLocaleString("hu-HU")
      : "Ismeretlen";

    const solscanUrl = `https://solscan.io/tx/${signature}`;

    // Szűrés: posztolás kikapcsolva vagy tartományon kívül
    if (!settings.enabled) return res.status(200).send("Posztolás kikapcsolva");
    if (solAmount < settings.minSOL || solAmount > settings.maxSOL) {
      console.log("⏭ Kihagyva: SOL mennyiség nincs tartományban.");
      return res.status(200).send("OK");
    }

    // Telegram értesítés - csak csatornára
    const message = `
🔥 *100% LP ELÉGETVE!* 🔥

💰 Token: ${tokenSymbol}
🔑 Mint: \`${tokenMint}\`
🔥 Égetett tokens: ${tokenAmount.toLocaleString()}
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

    await bot.sendMessage(channelId, message, { parse_mode: "Markdown" });
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
