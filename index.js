import WebSocket from "ws";
import admin from "firebase-admin";

// 🧪 HARD LOGGING (VERY IMPORTANT)
console.log("🚀 Worker booting...");
console.log("ENV CHECK:", {
  TWELVE: !!process.env.TWELVE_DATA_KEY,
  DB: !!process.env.FIREBASE_DATABASE_URL,
  SA: !!process.env.FIREBASE_SERVICE_ACCOUNT,
});

let serviceAccount;

try {
  serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, "base64").toString("utf8")
  );
  console.log("✅ Firebase service account parsed");
} catch (e) {
  console.error("❌ Firebase service account parse failed", e);
  process.exit(1);
}

// 🔐 Firebase init
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.database();
const TWELVE_KEY = process.env.TWELVE_DATA_KEY;

function startWS() {
  console.log("🔌 Connecting to TwelveData WS...");

  const ws = new WebSocket("wss://ws.twelvedata.com/v1/quotes/price");

  ws.on("open", () => {
    console.log("✅ TwelveData WS Connected");

    ws.send(JSON.stringify({
      action: "auth",
      params: TWELVE_KEY,
    }));

    ws.send(JSON.stringify({
      action: "subscribe",
      params: {
        symbols: "XAUUSD,BTC/USD,EUR/USD",
      },
    }));
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
      console.error("❌ Message error", e);
    }
  });

  ws.on("close", () => {
    console.warn("⚠️ WS closed. Reconnecting in 3s...");
    setTimeout(startWS, 3000);
  });

  ws.on("error", (err) => {
    console.error("❌ WS error", err.message);
    ws.close();
  });
}

// 🔁 START WORKER
startWS();

// 🟢 KEEP PROCESS ALIVE (CRITICAL)
setInterval(() => {
  console.log("🫀 Worker heartbeat");
}, 30000);
