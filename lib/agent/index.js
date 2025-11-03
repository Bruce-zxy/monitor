const SystemMonitor = require("./systemMonitor");
const MetricSender = require("./metricSender");
const ConfigManager = require("../utils/config");

class MonitorAgent {
  constructor(config = {}) {
    this.config = ConfigManager.getAgentConfig(config);
    this.monitor = new SystemMonitor(this.config.agentId);
    this.sender = new MetricSender(this.config.server);
    this.isRunning = false;
  }

  async start() {
    if (this.isRunning) {
      throw new Error("Agent is already running");
    }

    this.isRunning = true;
    this.sender.startRetryProcessor();

    if (this.config.verbose) {
      console.log(`Starting monitor agent: ${this.config.agentId}`);
      console.log(
        `Target server: ${this.config.server.host}:${this.config.server.httpPort} (HTTP), ${this.config.server.udpPort} (UDP)`
      );
    }

    // 立即收集一次数据
    await this.collectAndSend();

    // 设置定时收集
    this.interval = setInterval(() => {
      this.collectAndSend();
    }, this.config.interval);

    return this;
  }

  async collectAndSend() {
    try {
      const metrics = await this.monitor.collectAllMetrics();
      const success = await this.sender.sendMetrics(metrics);

      if (this.config.verbose) {
        if (success) {
          console.log(
            `Metrics sent successfully at ${new Date().toISOString()}`
          );
        } else {
          console.log(`All send methods failed, added to retry queue`);
        }
      }
    } catch (error) {
      console.error("Error collecting/sending metrics:", error);
    }
  }

  async stop() {
    if (this.isRunning) {
      this.isRunning = false;
      if (this.interval) {
        clearInterval(this.interval);
      }
      if (this.sender && this.sender.destroy) {
        this.sender.destroy();
      }
      if (this.config.verbose) {
        console.log("Monitor agent stopped");
      }
    }
    return this;
  }
}

module.exports = MonitorAgent;
