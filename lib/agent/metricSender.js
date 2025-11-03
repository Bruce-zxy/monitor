// agent/metricSender.js - 修复 UDP 发送逻辑
const dgram = require("dgram");
const WebSocket = require("ws");

class MetricSender {
  constructor(serverConfig) {
    this.serverConfig = serverConfig;
    this.retryQueue = [];
    this.maxRetries = 3;
  }

  // UDP 发送 - 修复版本（UDP 不需要等待响应）
  async sendViaUDP(metrics) {
    return new Promise((resolve) => {
      const socket = dgram.createSocket("udp4");
      const message = Buffer.from(JSON.stringify(metrics));

      console.log(
        `UDP: Sending to ${this.serverConfig.host}:${this.serverConfig.udpPort}`
      );

      socket.on("error", (err) => {
        console.error(`UDP error: ${err.message}`);
        socket.close();
        resolve(false);
      });

      // UDP 发送完成后立即认为成功（不需要等待响应）
      socket.send(
        message,
        this.serverConfig.udpPort,
        this.serverConfig.host,
        (err) => {
          socket.close(); // 发送完成后立即关闭 socket

          if (err) {
            console.error(`UDP send error: ${err.message}`);
            resolve(false);
          } else {
            console.log(
              `UDP: Successfully sent to ${this.serverConfig.host}:${this.serverConfig.udpPort}`
            );
            resolve(true);
          }
        }
      );
    });
  }

  // HTTP 发送
  async sendViaHTTP(metrics) {
    try {
      const response = await fetch(
        `http://${this.serverConfig.host}:${this.serverConfig.httpPort}/api/metrics`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(metrics),
          timeout: 5000
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      console.log(
        `HTTP: Successfully sent to ${this.serverConfig.host}:${this.serverConfig.httpPort}`
      );
      return true;
    } catch (error) {
      console.error("❌ HTTP send failed:", error.message);
      return false;
    }
  }

  // WebSocket 发送
  async sendViaWebSocket(metrics) {
    return new Promise((resolve) => {
      const ws = new WebSocket(
        `ws://${this.serverConfig.host}:${this.serverConfig.httpPort}`
      );
      let resolved = false;

      const resolveOnce = (result) => {
        if (!resolved) {
          resolved = true;
          resolve(result);
        }
      };

      const timeout = setTimeout(() => {
        try {
          ws.close();
        } catch (e) {
          // 忽略关闭错误
        }
        resolveOnce(false);
      }, 5000);

      ws.on("open", () => {
        ws.send(
          JSON.stringify({
            type: "metrics",
            metrics: metrics
          })
        );
      });

      ws.on("message", (data) => {
        try {
          const message = JSON.parse(data);
          if (message.type === "ack") {
            clearTimeout(timeout);
            ws.close();
            console.log(
              `WebSocket: Successfully sent to ${this.serverConfig.host}:${this.serverConfig.httpPort}`
            );
            resolveOnce(true);
          }
        } catch (e) {
          // 忽略解析错误
        }
      });

      ws.on("error", (error) => {
        clearTimeout(timeout);
        console.error("❌ WebSocket send failed:", error.message);
        resolveOnce(false);
      });

      ws.on("close", () => {
        clearTimeout(timeout);
        resolveOnce(false);
      });
    });
  }

  // 尝试多种协议发送
  async sendMetrics(metrics, retryCount = 0) {
    console.log(`Sending metrics (attempt ${retryCount + 1})...`);

    // 按优先级尝试不同协议
    const protocols = [
      { name: "HTTP", method: this.sendViaHTTP.bind(this) },
      { name: "WebSocket", method: this.sendViaWebSocket.bind(this) },
      { name: "UDP", method: this.sendViaUDP.bind(this) },
    ];

    for (const protocol of protocols) {
      try {
        const success = await protocol.method(metrics);
        if (success) {
          console.log(`✅ Metrics sent successfully via ${protocol.name}`);
          return true;
        }
      } catch (error) {
        console.error(`❌ ${protocol.name} send error:`, error.message);
      }
    }

    // 所有方法都失败，加入重试队列
    if (retryCount < this.maxRetries) {
      console.log(
        `All protocols failed, adding to retry queue (${
          this.retryQueue.length + 1
        } items)`
      );
      this.retryQueue.push({ metrics, retryCount: retryCount + 1 });
    } else {
      console.log(
        `❌ All send attempts failed after ${this.maxRetries} retries`
      );
    }

    return false;
  }

  // 处理重试队列
  processRetryQueue() {
    if (this.retryQueue.length > 0) {
      const item = this.retryQueue.shift();
      console.log(
        `Processing retry queue item (${this.retryQueue.length} remaining)`
      );
      setTimeout(() => {
        this.sendMetrics(item.metrics, item.retryCount);
      }, 2000);
    }
  }

  // 启动重试处理器
  startRetryProcessor() {
    setInterval(() => {
      this.processRetryQueue();
    }, 10000);
  }
}

module.exports = MetricSender;
