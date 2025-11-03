const dgram = require("dgram");
const mongoose = require("mongoose");

class UDPReceiver {
  constructor(port = 41234, metricModel) {
    this.port = port;
    this.server = dgram.createSocket("udp4");
    // 使用传入的模型，而不是重新创建
    this.Metric = metricModel;
  }

  start() {
    this.server.on("message", async (msg, rinfo) => {
      try {
        const data = JSON.parse(msg.toString());

        // 添加接收时间戳
        data.receivedAt = new Date();

        if (!data.timestamp) {
          data.timestamp = data.receivedAt;
        }

        // 保存到数据库 - 使用共享的连接
        const metric = new this.Metric(data);
        await metric.save();

        console.log(
          `UDP: Received from ${data.agentId || rinfo.address} at ${
            data.timestamp
          }`
        );
      } catch (error) {
        console.error("UDP: Error processing message:", error);
      }
    });

    this.server.on("listening", () => {
      const address = this.server.address();
      console.log(`UDP Server listening on ${address.address}:${address.port}`);
    });

    this.server.on("error", (err) => {
      console.error("UDP Server error:", err);
    });

    this.server.bind(this.port);
  }

  stop() {
    this.server.close();
  }
}

module.exports = UDPReceiver;
