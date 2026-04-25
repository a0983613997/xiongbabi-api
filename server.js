const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

let orders = [];

app.get("/", (req, res) => {
  res.send("熊芭比 API 已上線");
});

app.get("/api/orders", (req, res) => {
  res.json(orders);
});

app.post("/api/orders", (req, res) => {
  const order = {
    ...req.body,
    id: req.body.id || Date.now().toString(),
    status: req.body.status || "new",
    createdAt: req.body.createdAt || new Date().toISOString()
  };

  orders.unshift(order);
  res.json({ success: true, order });
});

app.patch("/api/orders/:id/status", (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const order = orders.find(o => String(o.id) === String(id));

  if (!order) {
    return res.status(404).json({
      success: false,
      message: "找不到訂單"
    });
  }

  order.status = status;
  order.updatedAt = new Date().toISOString();

  res.json({ success: true, order });
});

app.delete("/api/orders/:id", (req, res) => {
  const { id } = req.params;
  orders = orders.filter(o => String(o.id) !== String(id));
  res.json({ success: true });
});

app.delete("/api/orders", (req, res) => {
  orders = [];
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`熊芭比 API running on port ${PORT}`);
});
