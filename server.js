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

// ====== 發送 LINE 訊息 ======
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
      messages: [
        {
          type: "text",
          text: text
        }
      ]
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
    version: "v16.4 full-server-ready"
  });
});

// ====== 健康檢查 ======
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// ====== 🧪 測試用 API（你現在要用這個） ======
app.post("/api/order", async (req, res) => {
  try {
    if (!requireLineToken(res)) return;

    const { userId, items } = req.body;

    const itemText = (items || [])
      .map(i => `${i.name} $${i.price}`)
      .join("\n");

    const text = `🍧 熊芭比收到新訂單！

${itemText}

謝謝您的訂購 ❤️`;

    const results = {};

    // 店家通知
    if (LINE_PUSH_TO_ID) {
      results.owner = await pushLineMessage(LINE_PUSH_TO_ID, text);
    }

    // 客人通知
    if (userId) {
      results.customer = await pushLineMessage(userId, text);
    }

    res.json({
      ok: true,
      success: true,
      results
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      ok: false,
      message: err.message
    });
  }
});

// ====== 正式送單（進階版） ======
app.post("/api/line/push-order", async (req, res) => {
  try {
    if (!requireLineToken(res)) return;

    const { message, customerLineUserId } = req.body;

    const results = {};

    if (LINE_PUSH_TO_ID) {
      results.owner = await pushLineMessage(
        LINE_PUSH_TO_ID,
        message || "🍧 熊芭比收到新訂單"
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

// ====== 啟動 ======
const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log("熊芭比 API 啟動：" + port);
});
