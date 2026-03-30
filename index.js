import WebSocket from "ws";
import admin from "firebase-admin";

// ===============================
// FIREBASE INIT
// ===============================
let serviceAccount;

try {
  serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, "base64").toString("utf8")
  );
  console.log("✅ Firebase initialized");
} catch (err) {
  console.error("❌ Firebase init error", err);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.database();
const API_KEY = process.env.TWELVE_DATA_KEY;

const symbols = ["XAU/USD", "BTC/USD", "EUR/USD"];

// ===============================
// LIVE PRICE (WEBSOCKET)
// ===============================
function connectWS() {
  const ws = new WebSocket(
    "wss://ws.twelvedata.com/v1/quotes/price?apikey=" + API_KEY
  );

  ws.on("open", () => {
    console.log("✅ WS Connected");

    ws.send(
      JSON.stringify({
        action: "subscribe",
        params: {
          symbols: symbols.join(","),
        },
      })
    );
  });

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (!data.symbol || !data.price) return;

      const symbol = data.symbol.replace("/", "");

      await db.ref(`prices/${symbol}`).set({
        price: Number(data.price),
        timestamp: Date.now(),
      });

      console.log(`📈 ${symbol} → ${data.price}`);
    } catch (e) {
      console.error("WS error", e);
    }
  });

  ws.on("close", () => setTimeout(connectWS, 3000));
}

connectWS();

// ===============================
// CANDLE FETCH
// ===============================
async function fetchCandles(symbol, interval) {
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${interval}&outputsize=200&timezone=Asia/Kolkata&apikey=${API_KEY}`;

    const res = await fetch(url);
    const json = await res.json();

    if (!json.values) return;

    const cleanSymbol = symbol.replace("/", "");

    const candles = json.values.reverse().map((c) => ({
      time: Math.floor(new Date(c.datetime).getTime() / 1000),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
    }));

    await db.ref(`candles/${cleanSymbol}/${interval}`).set(candles);

    console.log(`📊 ${cleanSymbol} ${interval} updated`);
  } catch (err) {
    console.error("Candle error:", err.message);
  }
}

// ===============================
// SCHEDULERS
// ===============================
setInterval(() => {
  symbols.forEach((s) => fetchCandles(s, "5min"));
}, 5 * 60 * 1000);

setInterval(() => {
  symbols.forEach((s) => fetchCandles(s, "15min"));
}, 15 * 60 * 1000);

setInterval(() => {
  symbols.forEach((s) => fetchCandles(s, "30min"));
}, 30 * 60 * 1000);

// ===============================
// INITIAL LOAD
// ===============================
(async () => {
  console.log("🚀 Initial load");

  for (let s of symbols) {
    await fetchCandles(s, "5min");
    await fetchCandles(s, "15min");
    await fetchCandles(s, "30min");
  }
})();
