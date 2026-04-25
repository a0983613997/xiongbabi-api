const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

let orders = [];

app.get("/", (req, res) => {
  res.send("熊芭比 API 已上線");
});

app.get("/api/orders", (req, res) => {
  res.json(orders);
});

app.post("/api/orders", (req, res) => {
  orders.unshift(req.body);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("server running");
});
