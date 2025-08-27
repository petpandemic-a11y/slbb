import express from "express";
import axios from "axios";
import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ADMIN_ID = process.env.ADMIN_ID;
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ---- Alap beállítások ----
let postingEnabled = true;
let minSol = 0.01;
let maxSol = 100;
let minMcap = 0;
let maxMcap = 1_000_000_000;

// ---- BirdEye API ----
async function getTokenData(mint) {
  try {
    const url = `https://public-api.birdeye.so/public/token?address=${mint}&chain=solana`;
    const response = await axios.get(url, {
      headers: { "X-API-KEY": process.env.BIRDEYE_API_KEY },
    });
    return response.data.data;
  } catch (e) {
    console.error("❌ BirdEye API error:", e.message);
    return null;
  }
}

// ---- Webhook feldolgozása ----
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body[0];

    // Token adatok
    const mint = data?.tokenTransfers?.[0]?.mint || null;
    const solAmount = Number(data?.nativeTransfers?.[0]?.amount || 0) / 1e9;

    if (!mint) {
      console.log("⚠️ Nincs token mint a tranzakcióban");
      return res.sendStatus(200);
    }

    // BirdEye adatlekérés
    const tokenData = await getTokenData(mint);

    const tokenSymbol = tokenData?.symbol || "UNKNOWN";
    const decimals = tokenData?.decimals || 9;
    const marketCap = tokenData?.market_cap || null;

    const amount =
      (data?.tokenTransfers?.[0]?.tokenAmount || 0) /
      Math.pow(10, decimals);

    // Szűrés a beállítások alapján
    if (
      solAmount < minSol ||
      solAmount > maxSol ||
      (marketCap && (marketCap < minMcap || marketCap > maxMcap))
    ) {
      console.log("⏩ Tranzakció kiszűrve a beállítások alapján");
      return res.sendStatus(200);
    }

    // Telegram üzenet küldése
    if (postingEnabled) {
      const msg = `
🔥 100% LP ELÉGETVE! 🔥
💎 Token: ${tokenSymbol}
🔑 Mint: ${mint}
🔥 Égetett mennyiség: ${amount} ${tokenSymbol}
💰 Market Cap: ${marketCap ? `$${marketCap.toLocaleString()}` : "N/A"}
💎 SOL égetve: ${solAmount} SOL
📊 Tranzakció: [Solscan](https://solscan.io/tx/${data.signature})
      `;

      await bot.sendMessage(CHAT_ID, msg, { parse_mode: "Markdown" });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook feldolgozási hiba:", err.message);
    res.sendStatus(500);
  }
});

// ---- Admin parancsok privátban ----
bot.onText(/\/status/, (msg) => {
  if (msg.chat.id.toString() !== ADMIN_ID) return;
  postingEnabled = !postingEnabled;
  bot.sendMessage(ADMIN_ID, `🔄 Posztolás: ${postingEnabled ? "✅ BE" : "⛔ KI"}`);
});

bot.onText(/\/setminsol (.+)/, (msg, match) => {
  if (msg.chat.id.toString() !== ADMIN_ID) return;
  minSol = parseFloat(match[1]);
  bot.sendMessage(ADMIN_ID, `🔹 Minimum SOL beállítva: ${minSol}`);
});

bot.onText(/\/setmaxsol (.+)/, (msg, match) => {
  if (msg.chat.id.toString() !== ADMIN_ID) return;
  maxSol = parseFloat(match[1]);
  bot.sendMessage(ADMIN_ID, `🔹 Maximum SOL beállítva: ${maxSol}`);
});

bot.onText(/\/setminmcap (.+)/, (msg, match) => {
  if (msg.chat.id.toString() !== ADMIN_ID) return;
  minMcap = parseFloat(match[1]);
  bot.sendMessage(ADMIN_ID, `🔹 Minimum MarketCap beállítva: ${minMcap}`);
});

bot.onText(/\/setmaxmcap (.+)/, (msg, match) => {
  if (msg.chat.id.toString() !== ADMIN_ID) return;
  maxMcap = parseFloat(match[1]);
  bot.sendMessage(ADMIN_ID, `🔹 Maximum MarketCap beállítva: ${maxMcap}`);
});

bot.onText(/\/settings/, (msg) => {
  if (msg.chat.id.toString() !== ADMIN_ID) return;
  const message = `
⚙️ **SLBB Bot Beállítások**
🔄 Posztolás: ${postingEnabled ? "✅ BE" : "⛔ KI"}
💎 Min SOL: ${minSol}
💎 Max SOL: ${maxSol}
💰 Min MarketCap: ${minMcap}
💰 Max MarketCap: ${maxMcap}
  `;
  bot.sendMessage(ADMIN_ID, message, { parse_mode: "Markdown" });
});

// ---- Render port figyelés ----
const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`🚀 SLBB fut a ${PORT} porton - Webhook aktív: /webhook`)
);
