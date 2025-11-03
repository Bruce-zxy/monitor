/*
 * @Author: HadesZ
 * @Date: 2025-11-03 12:11:12
 * @LastEditors: HadesZ
 * @LastEditTime: 2025-11-03 12:11:18
 * @Description: 
 */
const mongoose = require("mongoose");

const metricSchema = new mongoose.Schema(
  {
    agentId: {
      type: String,
      required: true,
      index: true
    },
    timestamp: {
      type: Date,
      required: true,
      index: true
    },
    // CPU 相关
    cpu: {
      usage: Number,
      user: Number,
      system: Number,
      idle: Number,
      load1: Number,
      load5: Number,
      load15: Number
    },
    // 内存相关
    memory: {
      total: Number,
      free: Number,
      used: Number,
      usage: Number,
      cached: Number,
      buffered: Number
    },
    // 磁盘相关
    disk: {
      total: Number,
      free: Number,
      used: Number,
      usage: Number,
      read: Number, // 读取速率 KB/s
      write: Number // 写入速率 KB/s
    },
    // 网络相关
    network: {
      in: Number, // 接收速率 KB/s
      out: Number // 发送速率 KB/s
    },
    // 进程相关
    processes: {
      total: Number,
      running: Number,
      sleeping: Number
    },
    // 系统状态
    uptime: Number,
    // Docker 容器统计（如果运行在容器中）
    docker: {
      containers: Number,
      running: Number,
      paused: Number,
      stopped: Number
    }
  },
  {
    timestamps: true
  }
);

// 创建复合索引提高查询性能
metricSchema.index({ agentId: 1, timestamp: -1 });
metricSchema.index({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }); // 30天自动过期

module.exports = mongoose.model("Metric", metricSchema);
