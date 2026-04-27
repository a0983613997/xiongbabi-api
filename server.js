const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
const LINE_PUSH_TO_ID = process.env.LINE_PUSH_TO_ID || "";

function requireLineToken(res){
  if(!LINE_CHANNEL_ACCESS_TOKEN){
    res.status(500).json({ ok:false, success:false, message:"缺少 LINE_CHANNEL_ACCESS_TOKEN，請到 Render Environment 設定" });
    return false;
  }
  return true;
}

async function pushLineMessage(to, text){
  if(!to) return { skipped:true, reason:"empty to" };
  const resp = await fetch("https://api.line.me/v2/bot/message/push", {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization":`Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body:JSON.stringify({
      to,
      messages:[{ type:"text", text:String(text || "") }]
    })
  });
  const bodyText = await resp.text();
  if(!resp.ok){
    throw new Error(`LINE push failed ${resp.status}: ${bodyText}`);
  }
  return { ok:true };
}

app.get("/", (req,res) => {
  res.json({ ok:true, name:"熊芭比 LINE 客戶回傳 API", version:"v10.9 ready-notify" });
});

app.get("/health", (req,res) => {
  res.json({ ok:true, time:new Date().toISOString() });
});

app.post("/api/line/push-order", async (req,res) => {
  try{
    if(!requireLineToken(res)) return;
    const { message, customerLineUserId, customerMessage, test } = req.body || {};

    const results = {};
    if(LINE_PUSH_TO_ID){
      results.owner = await pushLineMessage(LINE_PUSH_TO_ID, message || "🍧 熊芭比測試通知");
    }else{
      results.owner = { skipped:true, reason:"LINE_PUSH_TO_ID not set" };
    }

    if(customerLineUserId && customerMessage){
      results.customer = await pushLineMessage(customerLineUserId, customerMessage);
    }else{
      results.customer = { skipped:true, reason:"沒有 customerLineUserId，客人需從 LINE LIFF 點餐頁進入" };
    }

    res.json({ ok:true, success:true, test:!!test, results });
  }catch(err){
    console.error(err);
    res.status(500).json({ ok:false, success:false, message:err.message || "LINE 推播失敗" });
  }
});

app.post("/api/line/order-ready", async (req,res) => {
  try{
    if(!requireLineToken(res)) return;
    const { customerLineUserId, customerMessage, order } = req.body || {};
    const fallbackMessage = [
      "您的熊芭比訂單已完成 ✅",
      "可前來取餐囉～",
      order?.orderNo ? `訂單編號：${order.orderNo}` : ""
    ].filter(Boolean).join("\n");

    if(!customerLineUserId){
      return res.json({ ok:true, success:true, skipped:true, reason:"沒有 customerLineUserId" });
    }
    const result = await pushLineMessage(customerLineUserId, customerMessage || fallbackMessage);
    res.json({ ok:true, success:true, result });
  }catch(err){
    console.error(err);
    res.status(500).json({ ok:false, success:false, message:err.message || "LINE 可取餐通知失敗" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`熊芭比 LINE API running on port ${port}`));
