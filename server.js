const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors({ origin: '*'}));
app.use(express.json({ limit: '2mb' }));

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_PUSH_TO_ID = process.env.LINE_PUSH_TO_ID;

function formatOrderMessage(order = {}) {
  const orderNo = order.orderNo || order.order_no || order.id || '未提供';
  const mode = order.mode || order.orderMode || order.pickupType || order.pickup_type || '未提供';
  const name = order.customerName || order.customer_name || order.name || '未填';
  const phone = order.phone || order.customerPhone || order.customer_phone || '未填';
  const address = order.address || order.deliveryAddress || order.delivery_address || '';
  const note = order.note || order.memo || '';
  const total = order.total || order.totalAmount || order.total_amount || 0;
  const reservationText = order.reservationText || order.reservation_time || order.pickupTime || order.pickup_time || order.scheduleText || '';

  let itemsText = '未提供商品明細';
  const rawItems = order.items || order.orderItems || order.order_data?.items || [];
  if (Array.isArray(rawItems) && rawItems.length) {
    itemsText = rawItems.map((item, index) => {
      if (typeof item === 'string') return `${index + 1}. ${item}`;
      const itemName = item.name || item.title || item.productName || '商品';
      const qty = item.qty || item.quantity || 1;
      const price = item.price || item.subtotal || '';
      const meta = item.meta || item.detail || item.desc || item.description || '';
      return `${index + 1}. ${itemName} × ${qty}${price !== '' ? `｜$${price}` : ''}${meta ? `\n   ${meta}` : ''}`;
    }).join('\n');
  }

  return [
    '🍧 熊芭比新訂單通知',
    `訂單編號：${orderNo}`,
    `取餐方式：${mode}`,
    reservationText ? `時間：${reservationText}` : '時間：立即製作',
    '',
    '【顧客資料】',
    `姓名：${name}`,
    `電話：${phone}`,
    address ? `地址：${address}` : '',
    '',
    '【商品明細】',
    itemsText,
    '',
    `總金額：${total} 元`,
    note ? `備註：${note}` : ''
  ].filter(Boolean).join('\n');
}

async function pushLineText(text, to = LINE_PUSH_TO_ID) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    throw new Error('缺少 LINE_CHANNEL_ACCESS_TOKEN');
  }
  if (!to) {
    throw new Error('缺少 LINE_PUSH_TO_ID');
  }

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      to,
      messages: [{ type: 'text', text }]
    })
  });

  const responseText = await response.text();
  if (!response.ok) {
    const err = new Error(`LINE push failed: ${response.status} ${responseText}`);
    err.status = response.status;
    err.detail = responseText;
    throw err;
  }

  return responseText;
}

app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: '熊芭比 API',
    version: '2.0.0',
    routes: ['GET /health', 'POST /webhook', 'POST /api/line/push-order', 'GET /api/line/test']
  });
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    message: '熊芭比 API 運作中',
    lineTokenReady: Boolean(LINE_CHANNEL_ACCESS_TOKEN),
    linePushToReady: Boolean(LINE_PUSH_TO_ID)
  });
});

// LINE Developers Verify 會 POST 到這裡。必須回 200，不能 404。
app.post('/webhook', (req, res) => {
  try {
    const events = req.body?.events || [];
    console.log('LINE webhook received:', JSON.stringify(req.body));

    for (const event of events) {
      const userId = event?.source?.userId;
      const groupId = event?.source?.groupId;
      const roomId = event?.source?.roomId;

      if (userId) console.log('LINE USER ID:', userId);
      if (groupId) console.log('LINE GROUP ID:', groupId);
      if (roomId) console.log('LINE ROOM ID:', roomId);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(200).json({ ok: true });
  }
});

app.get('/api/line/test', async (req, res) => {
  try {
    await pushLineText('🍧 熊芭比 LINE 測試成功！新訂單通知已連線。');
    res.json({ ok: true, message: 'LINE 測試成功' });
  } catch (error) {
    console.error('LINE test error:', error.message, error.detail || '');
    res.status(500).json({ ok: false, message: error.message, detail: error.detail || null });
  }
});

app.post('/api/line/push-order', async (req, res) => {
  try {
    const order = req.body || {};
    const message = order.message || order.text || formatOrderMessage(order);
    await pushLineText(message, order.to || LINE_PUSH_TO_ID);
    res.json({ ok: true, message: 'LINE 訂單通知已送出' });
  } catch (error) {
    console.error('LINE push-order error:', error.message, error.detail || '');
    res.status(500).json({ ok: false, message: error.message, detail: error.detail || null });
  }
});

app.listen(PORT, () => {
  console.log(`熊芭比 API v2.0 running on port ${PORT}`);
  console.log('Webhook route ready: POST /webhook');
  console.log('LINE push route ready: POST /api/line/push-order');
  console.log('LINE token ready:', Boolean(LINE_CHANNEL_ACCESS_TOKEN));
  console.log('LINE push target ready:', Boolean(LINE_PUSH_TO_ID));
});
