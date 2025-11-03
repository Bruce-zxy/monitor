const express = require("express");
// 不再在这里引入模型，而是在主文件中设置

const app = express();
app.use(express.json({ limit: "10mb" }));

// 我们将通过依赖注入设置 Metric 模型
let Metric;

// 设置模型的函数
function setMetricModel(metricModel) {
  Metric = metricModel;
}

// 接收监控数据
app.post("/api/metrics", async (req, res) => {
  try {
    const metrics = req.body;

    // 验证必要字段
    if (!metrics.agentId || !metrics.timestamp) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 保存到数据库
    const metric = new Metric(metrics);
    await metric.save();

    console.log(
      `Received metrics from ${metrics.agentId} at ${new Date(
        metrics.timestamp
      ).toISOString()}`
    );

    res.json({ success: true, received: true });
  } catch (error) {
    console.error("Error saving metrics:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 获取服务器列表
app.get("/api/agents", async (req, res) => {
  try {
    const agents = await Metric.distinct("agentId", {
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    res.json(agents);
  } catch (error) {
    console.error("Error fetching agents:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 获取指定服务器的监控数据
app.get("/api/metrics/:agentId", async (req, res) => {
  try {
    const { agentId } = req.params;
    const { start, end, limit = 1000 } = req.query;

    let query = { agentId };

    // 时间范围过滤
    if (start && end) {
      query.timestamp = {
        $gte: new Date(start),
        $lte: new Date(end)
      };
    }

    const metrics = await Metric.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .select("-__v -_id")
      .lean();

    res.json(metrics.reverse()); // 返回时间顺序的数据
  } catch (error) {
    console.error("Error fetching metrics:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 健康检查
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

module.exports = { app, setMetricModel };
