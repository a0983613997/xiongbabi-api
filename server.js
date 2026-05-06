const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '2mb' }));

const PORT = process.env.PORT || 3000;
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const LINE_PUSH_TO_ID = process.env.LINE_PUSH_TO_ID || '';

function nowText() {
  return new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
}

function mask(value) {
  if (!value) return '未設定';
  if (value.length <= 10) return '已設定';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function buildOrderText(order = {}) {
  const customer = order.customer || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const itemLines = items.length
    ? items.map((item) => {
        const qty = Number(item.qty || 1);
        const price = Number(item.price || 0);
        const meta = item.meta ? `\n　${item.meta}` : '';
        return `・${item.name || '未命名商品'} × ${qty} / ${price * qty}元${meta}`;
      }).join('\n')
    : '・無商品明細';

  return [
    '🍧 熊芭比新訂單',
    `訂單編號：${order.orderNo || order.id || '未提供'}`,
    `方式：${order.mode || '未提供'}${order.preorder ? '｜預約單' : '｜立即製作'}${order.tableLabel ? '｜' + order.tableLabel : ''}`,
    order.appointmentText ? `預約時間：${order.appointmentText}` : '',
    `姓名：${customer.name || '未填'}`,
    `電話：${customer.phone || '未填'}`,
    `地址：${order.mode === '外送' ? (customer.address || '未填') : '自取免填'}`,
    order.mode === '外送' ? `距離：${order.deliveryDistanceText || '未選'}｜外送門檻：${order.deliveryMinimum ? order.deliveryMinimum + ' 元' : '未設定'}` : '',
    `備註：${customer.note || '無'}`,
    '--------------------',
    itemLines,
    '--------------------',
    `總金額：${order.total || 0} 元`,
    `下單時間：${order.createdAtText || nowText()}`,
  ].filter(Boolean).join('\n');
}

function buildCustomerReceivedText(order = {}) {
  const items = Array.isArray(order.items) ? order.items : [];
  const itemLines = items.length
    ? items.map((item) => `・${item.name || '商品'} × ${item.qty || 1}`).join('\n')
    : '・已收到訂單';

  return [
    '🍧 熊芭比已收到您的訂單！',
    `訂單編號：${order.orderNo || order.id || '未提供'}`,
    `取餐方式：${order.mode || '未提供'}${order.preorder ? '｜預約單' : '｜立即製作'}${order.tableLabel ? '｜' + order.tableLabel : ''}`,
    order.appointmentText ? `預約時間：${order.appointmentText}` : '',
    '--------------------',
    itemLines,
    '--------------------',
    `總金額：$${order.total || 0}`,
    '',
    '我們會儘快為您準備，謝謝您訂購熊芭比 💙',
  ].filter(Boolean).join('\n');
}

function buildCustomerReadyText(order = {}) {
  const isDelivery = order.mode === '外送';
  return [
    isDelivery ? '🍧 您的熊芭比訂單準備外送囉！' : '🍧 您的熊芭比訂單已完成 ✅',
    isDelivery ? '我們準備安排外送，請留意電話～' : '可以前來取餐囉～',
    `訂單編號：${order.orderNo || order.id || '未提供'}`,
    order.mode ? `取餐方式：${order.mode}${order.tableLabel ? '｜' + order.tableLabel : ''}` : '',
    '',
    '謝謝您等待，熊芭比祝您用餐愉快 🍧',
  ].filter(Boolean).join('\n');
}

async function pushLineText(to, text) {
  if (!LINE_TOKEN) {
    const error = new Error('LINE_CHANNEL_ACCESS_TOKEN 未設定');
    error.statusCode = 500;
    throw error;
  }
  if (!to) {
    const error = new Error('LINE 推播對象未設定');
    error.statusCode = 400;
    throw error;
  }

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LINE_TOKEN}`,
    },
    body: JSON.stringify({
      to,
      messages: [{ type: 'text', text: String(text || '').slice(0, 4900) }],
    }),
  });

  const bodyText = await response.text();
  let body = {};
  try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { body = { raw: bodyText }; }

  if (!response.ok) {
    const error = new Error(body.message || body.raw || `LINE API 錯誤 ${response.status}`);
    error.statusCode = response.status;
    error.lineResponse = body;
    throw error;
  }

  return body;
}

app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: '熊芭比 Render API v19.1 穩定版',
    time: nowText(),
    endpoints: ['/health', '/api/health', '/api/ping', '/api/line/push-order', '/api/order-ready', '/api/line/test'],
  });
});

app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/api/health', (req, res) => res.status(200).json({ ok: true, message: 'OK', time: nowText() }));
app.get('/api/ping', (req, res) => res.status(200).json({ ok: true, message: 'pong', time: nowText() }));

app.get('/api/debug/env', (req, res) => {
  res.json({
    ok: true,
    version: 'v19.1',
    LINE_CHANNEL_ACCESS_TOKEN: mask(LINE_TOKEN),
    LINE_PUSH_TO_ID: mask(LINE_PUSH_TO_ID),
    node: process.version,
    time: nowText(),
  });
});

app.post('/api/line/push-order', async (req, res) => {
  try {
    const payload = req.body || {};
    const order = payload.order || payload;

    const bossText = payload.message || order.lineMessage || buildOrderText(order);
    await pushLineText(LINE_PUSH_TO_ID, bossText);

    const customerUserId = payload.userId || order.userId || order.lineUserId || order.customer?.lineUserId || order.customer?.userId;
    if (customerUserId) {
      try {
        await pushLineText(customerUserId, buildCustomerReceivedText(order));
      } catch (customerErr) {
        console.warn('客人 LINE 收單通知失敗：', customerErr.message);
      }
    }

    res.json({ ok: true, success: true, message: 'LINE 新訂單推播成功', time: nowText() });
  } catch (err) {
    console.error('LINE 新訂單推播失敗：', err.message, err.lineResponse || '');
    res.status(err.statusCode || 500).json({
      ok: false,
      success: false,
      message: err.message || 'LINE 新訂單推播失敗',
      lineResponse: err.lineResponse || null,
    });
  }
});

app.post('/api/order-ready', async (req, res) => {
  try {
    const payload = req.body || {};
    const order = payload.order || payload;
    const customerUserId = payload.userId || order.userId || order.lineUserId || order.customer?.lineUserId || order.customer?.userId;

    if (!customerUserId) {
      return res.status(400).json({ ok: false, success: false, message: '缺少客人的 LINE userId，無法推播可取餐通知' });
    }

    await pushLineText(customerUserId, payload.message || buildCustomerReadyText(order));
    res.json({ ok: true, success: true, message: '客人可取餐 / 準備外送通知成功', time: nowText() });
  } catch (err) {
    console.error('客人可取餐通知失敗：', err.message, err.lineResponse || '');
    res.status(err.statusCode || 500).json({ ok: false, success: false, message: err.message || '客人通知失敗', lineResponse: err.lineResponse || null });
  }
});

app.post('/api/line/test', async (req, res) => {
  try {
    const to = req.body?.to || LINE_PUSH_TO_ID;
    await pushLineText(to, `✅ 熊芭比 LINE 測試成功\n時間：${nowText()}\nRender API v19.1 已正常運作`);
    res.json({ ok: true, success: true, message: 'LINE 測試成功', time: nowText() });
  } catch (err) {
    console.error('LINE 測試失敗：', err.message, err.lineResponse || '');
    res.status(err.statusCode || 500).json({ ok: false, success: false, message: err.message || 'LINE 測試失敗', lineResponse: err.lineResponse || null });
  }
});

// 相容舊版 API：前端若還有打 /api/order，也會轉成新訂單推播
app.post('/api/order', async (req, res) => {
  req.url = '/api/line/push-order';
  app._router.handle(req, res);
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    message: 'Not Found',
    path: req.originalUrl,
    hint: '請確認前端 API 網址是否為 /api/line/push-order，健康檢查請用 /health',
  });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ ok: false, message: err.message || 'Server error' });
});

app.listen(PORT, () => {
  console.log('====================================');
  console.log('🍧 熊芭比 Render API v19.1 已啟動');
  console.log(`PORT: ${PORT}`);
  console.log(`TIME: ${nowText()}`);
  console.log(`LINE_CHANNEL_ACCESS_TOKEN: ${mask(LINE_TOKEN)}`);
  console.log(`LINE_PUSH_TO_ID: ${mask(LINE_PUSH_TO_ID)}`);
  console.log('Health: /health');
  console.log('Push order: /api/line/push-order');
  console.log('====================================');
});
