const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors({ origin: '*'}));
app.use(express.json({ limit: '2mb' }));

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_PUSH_TO_ID = process.env.LINE_PUSH_TO_ID;

function safeText(v, fallback = '未填') {
  if (v === undefined || v === null || v === '') return fallback;
  return String(v);
}

function money(n) {
  const num = Number(n || 0);
  return Number.isFinite(num) ? `${num.toLocaleString('zh-TW')} 元` : `${safeText(n, '0')} 元`;
}

function normalizeItems(body) {
  const raw = body.items || body.orderItems || body.order_data?.items || body.orderData?.items || [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function itemLine(item) {
  if (typeof item === 'string') return `🍧 ${item}`;
  const name = item.name || item.title || item.productName || item.item_name || '商品';
  const qty = item.qty || item.quantity || item.count || 1;
  const price = item.price || item.total || item.subtotal;
  const parts = [`🍧 ${name} × ${qty}`];
  if (price !== undefined && price !== null && price !== '') parts.push(`｜${money(price)}`);

  const extras = [];
  if (item.flavors) extras.push(`口味：${Array.isArray(item.flavors) ? item.flavors.join('、') : item.flavors}`);
  if (item.toppings) extras.push(`加料：${Array.isArray(item.toppings) ? item.toppings.join('、') : item.toppings}`);
  if (item.addons) extras.push(`加購：${Array.isArray(item.addons) ? item.addons.join('、') : item.addons}`);
  if (item.note) extras.push(`備註：${item.note}`);

  return parts.join('') + (extras.length ? `\n   ${extras.join('\n   ')}` : '');
}

function buildMessage(body) {
  const order = body.order || body.order_data || body.orderData || body;
  const customer = order.customer || order.customer_name || order.name || order.userName || '顧客';
  const phone = order.phone || order.tel || order.customer_phone || '';
  const mode = order.mode || order.order_type || order.pickupType || order.type || '訂單';
  const address = order.address || order.delivery_address || '';
  const note = order.note || order.memo || order.remark || '';
  const total = order.total || order.total_amount || order.amount || body.total || 0;
  const orderNo = order.order_no || order.orderNo || order.id || body.id || '';
  const reserveTime = order.reserve_time || order.pickup_time || order.delivery_time || order.scheduleTime || order.scheduled_time || '';
  const isPreorder = !!reserveTime && !String(reserveTime).includes('立即');
  const items = normalizeItems(order).length ? normalizeItems(order) : normalizeItems(body);
  const itemsText = items.length ? items.map(itemLine).join('\n') : '🍧 商品內容請至後台查看';

  const lines = [];
  lines.push('🧸 熊芭比來單囉！');
  lines.push('━━━━━━━━━━━━━━');
  if (orderNo) lines.push(`🧾 訂單編號：${orderNo}`);
  lines.push(`👤 顧客：${safeText(customer)}`);
  if (phone) lines.push(`📞 電話：${phone}`);
  lines.push(`🛍 方式：${safeText(mode)}`);
  if (address) lines.push(`📍 地址：${address}`);
  lines.push(`🕒 出單：${isPreorder ? '⏰ 預約單 ' + reserveTime : '🔥 立即製作'}`);
  lines.push('');
  lines.push('【訂購內容】');
  lines.push(itemsText);
  lines.push('');
  lines.push(`💰 總金額：${money(total)}`);
  if (note) {
    lines.push('');
    lines.push(`📝 備註：${note}`);
  }
  lines.push('━━━━━━━━━━━━━━');
  lines.push('請記得確認後台訂單狀態 🍧');
  return lines.join('\n');
}

async function pushLineText(text) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !LINE_PUSH_TO_ID) {
    throw new Error('LINE env missing: LINE_CHANNEL_ACCESS_TOKEN or LINE_PUSH_TO_ID');
  }

  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: LINE_PUSH_TO_ID,
      messages: [{ type: 'text', text }],
    }),
  });

  const resultText = await res.text();
  if (!res.ok) {
    throw new Error(`LINE push failed ${res.status}: ${resultText}`);
  }
  return resultText || 'ok';
}

app.get('/', (req, res) => {
  res.json({
    ok: true,
    name: '熊芭比 Render API',
    version: 'v3 LINE notify beauty',
    routes: ['/webhook', '/api/line/push-order', '/api/line/test'],
    lineTokenReady: !!LINE_CHANNEL_ACCESS_TOKEN,
    linePushTargetReady: !!LINE_PUSH_TO_ID,
  });
});

app.post('/webhook', (req, res) => {
  console.log('LINE webhook received:', JSON.stringify(req.body));
  try {
    const events = req.body?.events || [];
    for (const event of events) {
      const userId = event?.source?.userId;
      const groupId = event?.source?.groupId;
      const roomId = event?.source?.roomId;
      if (userId) console.log('LINE USER ID:', userId);
      if (groupId) console.log('LINE GROUP ID:', groupId);
      if (roomId) console.log('LINE ROOM ID:', roomId);
    }
  } catch (err) {
    console.error('Webhook parse error:', err);
  }
  res.status(200).send('OK');
});

app.get('/api/line/test', async (req, res) => {
  try {
    const text = '🧸 熊芭比 LINE 通知測試成功！\n\n你的訂單通知系統已經可以正常推播囉 🍧';
    const result = await pushLineText(text);
    res.json({ ok: true, message: 'LINE test sent', result });
  } catch (err) {
    console.error('LINE test failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/line/test', async (req, res) => {
  try {
    const text = req.body?.text || '🧸 熊芭比 LINE 通知測試成功！\n\n你的訂單通知系統已經可以正常推播囉 🍧';
    const result = await pushLineText(text);
    res.json({ ok: true, message: 'LINE test sent', result });
  } catch (err) {
    console.error('LINE test failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/line/push-order', async (req, res) => {
  try {
    const text = buildMessage(req.body || {});
    console.log('美化訂單通知內容:\n' + text);
    const result = await pushLineText(text);
    res.json({ ok: true, message: 'LINE order notification sent', result });
  } catch (err) {
    console.error('LINE order push failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`熊芭比 API v3 running on port ${PORT}`);
  console.log('Webhook route ready: POST /webhook');
  console.log('LINE push route ready: POST /api/line/push-order');
  console.log('LINE test route ready: GET/POST /api/line/test');
  console.log('LINE token ready:', !!LINE_CHANNEL_ACCESS_TOKEN);
  console.log('LINE push target ready:', !!LINE_PUSH_TO_ID);
});
