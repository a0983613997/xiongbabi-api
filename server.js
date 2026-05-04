const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_PUSH_TO_ID = process.env.LINE_PUSH_TO_ID; // 店家/老闆 LINE userId，可選

function getOrderText(order = {}) {
  const items = Array.isArray(order.items) ? order.items : [];
  const itemText = items.length
    ? items.map((item, index) => {
        const qty = item.qty || 1;
        const extras = [];
        if (item.flavors?.length) extras.push(`口味：${item.flavors.join("、")}`);
        if (item.addonScoops?.length) extras.push(`加購綿綿冰：${item.addonScoops.join("、")}`);
        if (item.toppings?.length) extras.push(`加料：${item.toppings.join("、")}`);
        const extraText = extras.length ? `\n   ${extras.join("\n   ")}` : "";
        return `${index + 1}. ${item.name || "商品"} × ${qty}${extraText}`;
      }).join("\n")
    : "未提供商品明細";

  const customer = order.customer || {};
  return `🍧 熊芭比新訂單\n\n訂單編號：${order.orderNo || "未提供"}\n取餐方式：${order.mode || "未提供"}\n姓名：${customer.name || "未填"}\n電話：${customer.phone || "未填"}\n地址：${customer.address || "無"}\n\n商品：\n${itemText}\n\n總金額：${order.total || 0} 元\n備註：${customer.note || order.note || "無"}`;
}

async function pushLineText(to, text) {
  if (!LINE_TOKEN) {
    throw new Error("Render 尚未設定 LINE_CHANNEL_ACCESS_TOKEN");
  }
  if (!to) {
    throw new Error("缺少 LINE userId / LINE_PUSH_TO_ID");
  }

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_TOKEN}`
    },
    body: JSON.stringify({
      to,
      messages: [{ type: "text", text }]
    })
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`LINE push 失敗：${response.status} ${body}`);
  }
  return body;
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "熊芭比 LINE 通知 API",
    version: "v17-ready-notify",
    endpoints: ["POST /api/order", "POST /api/order-ready", "POST /api/line/push-order", "POST /webhook"]
  });
});

app.post("/webhook", (req, res) => {
  console.log("LINE事件：", JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

// 顧客下單後：通知顧客已收到，也可通知店家
app.post("/api/order", async (req, res) => {
  try {
    const order = req.body || {};
    const userId = order.userId || order.lineUserId || order.line?.userId;

    const result = { success: true, customerNotified: false, storeNotified: false };

    if (userId) {
      await pushLineText(
        userId,
        `🍧 熊芭比已收到您的訂單！\n\n訂單編號：${order.orderNo || "未提供"}\n總金額：${order.total || 0} 元\n\n我們正在為您準備中，完成後會再通知您 ❤️`
      );
      result.customerNotified = true;
    }

    if (LINE_PUSH_TO_ID) {
      await pushLineText(LINE_PUSH_TO_ID, getOrderText(order));
      result.storeNotified = true;
    }

    res.json(result);
  } catch (err) {
    console.error("/api/order 失敗：", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 後台按「已完成 / 可取餐」後：通知顧客可以取餐
app.post("/api/order-ready", async (req, res) => {
  try {
    const { userId, lineUserId, orderNo, mode } = req.body || {};
    const to = userId || lineUserId;

    if (!to) {
      return res.status(400).json({ success: false, message: "缺少顧客 LINE userId" });
    }

    const text = `🍧 熊芭比通知您\n\n您的訂單已完成，可以${mode === "外送" ? "準備收餐囉" : "取餐囉"}！\n\n訂單編號：${orderNo || "未提供"}\n\n謝謝您的等待 ❤️`;

    await pushLineText(to, text);
    res.json({ success: true });
  } catch (err) {
    console.error("/api/order-ready 失敗：", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 兼容你目前 HTML 後台 LINE 通知面板的 API
app.post("/api/line/push-order", async (req, res) => {
  try {
    const order = req.body?.order || req.body || {};
    const to = req.body?.to || LINE_PUSH_TO_ID;
    await pushLineText(to, getOrderText(order));
    res.json({ success: true });
  } catch (err) {
    console.error("/api/line/push-order 失敗：", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`熊芭比 LINE API running on port ${PORT}`);
});
