const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
const LINE_PUSH_TO_ID = process.env.LINE_PUSH_TO_ID || "";

function requireLineToken(res) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    res.status(500).json({
      ok: false,
      success: false,
      message: "缺少 LINE_CHANNEL_ACCESS_TOKEN，請到 Render Environment 設定"
    });
    return false;
  }
  return true;
}

async function pushLineMessage(to, text) {
  if (!to) return { skipped: true, reason: "empty to" };

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
          text: String(text || "")
        }
      ]
    })
  });

  const bodyText = await resp.text();

  if (!resp.ok) {
    throw new Error(`LINE push failed ${resp.status}: ${bodyText}`);
  }

  return { ok: true };
}

function formatOrderItems(items = []) {
  if (!Array.isArray(items) || items.length === 0) return "無商品資料";

  return items
    .map((item, index) => {
      const name = item.name || "未命名商品";
      const qty = item.qty || item.quantity || 1;
      const price = item.price || 0;
      const subtotal = item.subtotal || price * qty;

      const extras = [];

      if (item.flavors?.length) {
        extras.push(`口味：${item.flavors.join("、")}`);
      }

      if (item.addonScoops?.length) {
        extras.push(`加購綿綿冰：${item.addonScoops.join("、")}`);
      }

      if (item.toppingsText) {
        extras.push(`加料：${item.toppingsText}`);
      }

      if (item.toppings && typeof item.toppings === "object") {
        const toppingText = Object.entries(item.toppings)
          .filter(([_, count]) => Number(count) > 0)
          .map(([name, count]) => `${name}×${count}`)
          .join("、");

        if (toppingText) extras.push(`加料：${toppingText}`);
      }

      return [
        `${index + 1}. ${name} × ${qty}`,
        `   小計：${subtotal} 元`,
        extras.length ? `   ${extras.join("\n   ")}` : ""
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

function buildOwnerOrderMessage(order = {}) {
  const customer = order.customer || {};
  const items = order.items || [];

  return [
    "🍧 熊芭比新訂單來囉！",
    "",
    `訂單編號：${order.orderNo || order.id || "未提供"}`,
    `取餐方式：${order.mode || "未提供"}`,
    order.tableLabel ? `桌號：${order.tableLabel}` : "",
    order.isPreorder ? "類型：預約單" : "類型：立即單",
    order.appointmentText ? `預約時間：${order.appointmentText}` : "",
    "",
    "👤 顧客資料",
    `姓名：${customer.name || "未填"}`,
    `電話：${customer.phone || "未填"}`,
    customer.address ? `地址：${customer.address}` : "",
    "",
    "🧾 訂單內容",
    formatOrderItems(items),
    "",
    `💰 總金額：${order.total || 0} 元`,
    order.note || customer.note ? "",
    order.note || customer.note ? `備註：${order.note || customer.note}` : ""
  ]
    .filter(line => line !== "")
    .join("\n");
}

function buildCustomerOrderMessage(order = {}) {
  const items = order.items || [];

  return [
    "🍧 熊芭比已收到您的訂單！",
    "",
    `訂單編號：${order.orderNo || order.id || "未提供"}`,
    `取餐方式：${order.mode || "未提供"}`,
    order.isPreorder ? "類型：預約單" : "類型：立即單",
    order.appointmentText ? `預約時間：${order.appointmentText}` : "",
    "",
    "🧾 訂單內容",
    formatOrderItems(items),
    "",
    `💰 總金額：${order.total || 0} 元`,
    "",
    "我們會盡快為您準備，完成後會再通知您～"
  ]
    .filter(line => line !== "")
    .join("\n");
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    name: "熊芭比 LINE 訂單通知 API",
    version: "v16.4 full-server-ready",
    routes: [
      "GET /",
      "GET /health",
      "POST /api/order",
      "POST /api/line/push-order",
      "POST /api/line/order-ready"
    ]
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString()
  });
});

/**
 * 給你 Console / 測試頁使用的簡易測試路由
 */
app.post("/api/order", async (req, res) => {
  try {
    if (!requireLineToken(res)) return;

    const body = req.body || {};
    const userId = body.userId || body.customerLineUserId || "";
    const items = body.items || [];

    const order = {
      id: body.id || `TEST-${Date.now()}`,
      orderNo: body.orderNo || `TEST-${Date.now()}`,
      mode: body.mode || "測試",
      customer: body.customer || {
        name: body.name || "測試顧客",
        phone: body.phone || ""
      },
      items,
      total:
        body.total ||
        items.reduce((sum, item) => {
          const qty = item.qty || item.quantity || 1;
          return sum + Number(item.price || 0) * Number(qty || 1);
        }, 0),
      note: body.note || "這是 /api/order 測試通知"
    };

    const results = {};

    if (LINE_PUSH_TO_ID) {
      results.owner = await pushLineMessage(
        LINE_PUSH_TO_ID,
        buildOwnerOrderMessage(order)
      );
    } else {
      results.owner = {
        skipped: true,
        reason: "LINE_PUSH_TO_ID not set"
      };
    }

    if (userId) {
      results.customer = await pushLineMessage(
        userId,
        buildCustomerOrderMessage(order)
      );
    } else {
      results.customer = {
        skipped: true,
        reason: "沒有 userId / customerLineUserId"
      };
    }

    res.json({
      ok: true,
      success: true,
      route: "/api/order",
      results
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      ok: false,
      success: false,
      message: err.message || "LINE 測試訂單推播失敗"
    });
  }
});

/**
 * 前端正式送單使用
 */
app.post("/api/line/push-order", async (req, res) => {
  try {
    if (!requireLineToken(res)) return;

    const {
      message,
      customerLineUserId,
      customerMessage,
      order,
      test
    } = req.body || {};

    const results = {};

    const ownerText =
      message ||
      (order ? buildOwnerOrderMessage(order) : "🍧 熊芭比測試通知");

    if (LINE_PUSH_TO_ID) {
      results.owner = await pushLineMessage(LINE_PUSH_TO_ID, ownerText);
    } else {
      results.owner = {
        skipped: true,
        reason: "LINE_PUSH_TO_ID not set"
      };
    }

    if (customerLineUserId) {
      const customerText =
        customerMessage ||
        (order
          ? buildCustomerOrderMessage(order)
          : "🍧 熊芭比已收到您的訂單！");

      results.customer = await pushLineMessage(
        customerLineUserId,
        customerText
      );
    } else {
      results.customer = {
        skipped: true,
        reason: "沒有 customerLineUserId，客人需從 LINE LIFF 點餐頁進入"
      };
    }

    res.json({
      ok: true,
      success: true,
      test: !!test,
      route: "/api/line/push-order",
      results
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      ok: false,
      success: false,
      message: err.message || "LINE 推播失敗"
    });
  }
});

/**
 * 後台按「已完成 / 可取餐」使用
 */
app.post("/api/line/order-ready", async (req, res) => {
  try {
    if (!requireLineToken(res)) return;

    const { customerLineUserId, customerMessage, order } = req.body || {};

    const fallbackMessage = [
      "🍧 熊芭比通知您",
      "",
      "您的訂單已完成 ✅",
      "可以前來取餐囉～",
      "",
      order?.orderNo ? `訂單編號：${order.orderNo}` : "",
      order?.total ? `金額：${order.total} 元` : ""
    ]
      .filter(Boolean)
      .join("\n");

    if (!customerLineUserId) {
      return res.json({
        ok: true,
        success: true,
        skipped: true,
        reason: "沒有 customerLineUserId"
      });
    }

    const result = await pushLineMessage(
      customerLineUserId,
      customerMessage || fallbackMessage
    );

    res.json({
      ok: true,
      success: true,
      route: "/api/line/order-ready",
      result
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      ok: false,
      success: false,
      message: err.message || "LINE 可取餐通知失敗"
    });
  }
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`熊芭比 LINE API running on port ${port}`);
});
