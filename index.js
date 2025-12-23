function startWS() {
  console.log("🔌 Connecting to TwelveData WS...");

  const ws = new WebSocket(
    "wss://ws.twelvedata.com/v1/quotes?apikey=" + TWELVE_KEY
  );

  ws.on("open", () => {
    console.log("✅ TwelveData WS Connected");

    ws.send(JSON.stringify({
      action: "subscribe",
      params: {
        symbols: "XAUUSD,BTC/USD,EUR/USD"
      }
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
      console.error("❌ Message parse error", e);
    }
  });

  ws.on("close", () => {
    console.warn("⚠️ WS closed. Reconnecting in 5s...");
    setTimeout(startWS, 5000);
  });

  ws.on("error", (err) => {
    console.error("❌ WS error", err.message);
    ws.close();
  });
}
