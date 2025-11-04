/*
 * @Author: HadesZ
 * @Date: 2025-11-03 12:15:35
 * @LastEditors: HadesZ
 * @LastEditTime: 2025-11-04 14:41:10
 * @Description:
 */
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const Metric = require("../models/metric");

const app = express();

// 静态文件服务
app.use(express.static(path.join(__dirname, "public")));

// API: 获取服务器列表
app.get("/api/agents", async (req, res) => {
  try {
    const agents = await Metric.distinct("agentId", {
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    res.json(agents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: 获取监控数据
app.get("/api/metrics/:agentId", async (req, res) => {
  try {
    const { agentId } = req.params;
    const { hours = 1 } = req.query;

    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);

    const metrics = await Metric.find({
      agentId,
      timestamp: { $gte: startTime }
    })
      .sort({ timestamp: -1 })
      .select("timestamp cpu memory disk network processes uptime docker") // 确保包含 docker 字段
      .lean();

    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 新增 API：获取最新系统状态（用于信息卡片）
app.get("/api/status/:agentId", async (req, res) => {
  try {
    const { agentId } = req.params;

    const latest = await Metric.findOne({
      agentId
    })
      .sort({ timestamp: -1 })
      .select("timestamp cpu memory disk network processes uptime docker")
      .lean();

    if (!latest) {
      return res.status(404).json({ error: "No data found for this agent" });
    }

    res.json(latest);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 首页
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

module.exports = app;
