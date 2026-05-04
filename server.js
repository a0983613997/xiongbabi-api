const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ====== 環境變數 ======
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
const LINE_PUSH_TO_ID = process.env.LINE_PUSH_TO_ID || "";

// ====== 驗證 ======
function requireLineToken(res) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    res.status(500).json({
      ok: false,
      message: "缺少 LINE_CHANNEL_ACCESS_TOKEN"
    });
    return false;
  }
  return true;
}

// ====== 發送 LINE ======
async function pushLineMessage(to, text) {
  if (!to) return { skipped: true };

  const resp = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      to,
      messages: [{ type: "text", text }]
    })
  });

  const txt = await resp.text();
  if (!resp.ok) throw new Error(txt);

  return { ok: true };
}

// ====== 首頁 ======
app.get("/", (req, res) => {
  res.json({
    ok: true,
    name: "熊芭比 LINE API",
    version: "v16.5 webhook-ready"
  });
});

// ====== 健康檢查 ======
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// ====== 測試訂單（你現在用這個）=====
app.post("/api/order", async (req, res) => {
  try {
    if (!requireLineToken(res)) return;

    const { userId, items } = req.body;

    const text = `🍧 熊芭比收到訂單！
${(items || []).map(i => `${i.name} $${i.price}`).join("\n")}`;

    const results = {};

    // 店家
    if (LINE_PUSH_TO_ID) {
      results.owner = await pushLineMessage(LINE_PUSH_TO_ID, text);
    }

    // 客人
    if (userId) {
      results.customer = await pushLineMessage(userId, text);
    }

    res.json({ ok: true, results });

  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

// ====== 正式送單 ======
app.post("/api/line/push-order", async (req, res) => {
  try {
    if (!requireLineToken(res)) return;

    const { message, customerLineUserId } = req.body;

    const results = {};

    if (LINE_PUSH_TO_ID) {
      results.owner = await pushLineMessage(
        LINE_PUSH_TO_ID,
        message || "🍧 新訂單"
      );
    }

    if (customerLineUserId) {
      results.customer = await pushLineMessage(
        customerLineUserId,
        "🍧 熊芭比已收到您的訂單！"
      );
    }

    res.json({ ok: true, results });

  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

// ====== 可取餐通知 ======
app.post("/api/line/order-ready", async (req, res) => {
  try {
    if (!requireLineToken(res)) return;

    const { customerLineUserId } = req.body;

    if (!customerLineUserId) {
      return res.json({ ok: true, skipped: true });
    }

    const result = await pushLineMessage(
      customerLineUserId,
      "🍧 您的訂單已完成，可以來取餐囉！"
    );

    res.json({ ok: true, result });

  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

// ====== 🔥 Webhook（抓 userId 用）=====
app.post("/webhook", (req, res) => {
  console.log("📩 LINE事件：", JSON.stringify(req.body, null, 2));

  const events = req.body.events || [];

  events.forEach(event => {
    if (event.source && event.source.userId) {
      console.log("👉 使用者ID：", event.source.userId);
    }
  });

  res.sendStatus(200);
});

// ====== 啟動（一定最後）=====
const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log("熊芭比 API 啟動：" + port);
});
