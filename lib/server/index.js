const mongoose = require("mongoose");
const http = require("http");
const HTTPReceiver = require("./httpReceiver");
const UDPReceiver = require("./udpReceiver");
const WebSocketReceiver = require("./websocketReceiver");
const Dashboard = require("../dashboard");
const ConfigManager = require("../utils/config");

class MonitorServer {
  constructor(config = {}) {
    this.config = ConfigManager.getServerConfig(config);
    this.dbConfig = ConfigManager.getDatabaseConfig(config);
    this.isRunning = false;
  }

  async start() {
    if (this.isRunning) {
      throw new Error("Server is already running");
    }

    try {
      // 连接 MongoDB
      if (this.config.verbose) {
        console.log("Connecting to MongoDB...");
      }

      const mongooseOptions = {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        authSource: "admin",
        retryWrites: true,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000
      };

      await mongoose.connect(this.dbConfig.mongoUri, mongooseOptions);

      if (this.config.verbose) {
        console.log("✅ Connected to MongoDB successfully");
      }

      // 启动 HTTP 服务器
      const { app, setMetricModel } = require("./httpReceiver");
      const Metric = require("../models/metric");
      setMetricModel(Metric);

      this.httpServer = http.createServer(app);
      this.httpServer.listen(this.config.httpPort, () => {
        if (this.config.verbose) {
          console.log(`✅ HTTP Server running on port ${this.config.httpPort}`);
        }
      });

      // 启动 UDP 服务器
      this.udpReceiver = new UDPReceiver(this.config.udpPort, Metric);
      this.udpReceiver.start();

      // 启动 WebSocket 服务器
      this.wsReceiver = new WebSocketReceiver(this.httpServer, Metric);
      this.wsReceiver.start();

      // 启动 Dashboard（如果启用）
      if (this.config.enableDashboard) {
        this.dashboard = new Dashboard({
          port: this.config.dashboardPort,
          mongoUri: this.dbConfig.mongoUri,
          verbose: this.config.verbose
        });
        await this.dashboard.start();
      }

      this.isRunning = true;

      if (this.config.verbose) {
        console.log("✅ Monitor server started successfully");
      }

      return this;
    } catch (error) {
      console.error("Failed to start monitor server:", error);
      throw error;
    }
  }

  async stop() {
    if (this.isRunning) {
      if (this.udpReceiver) {
        this.udpReceiver.stop();
      }
      if (this.dashboard) {
        await this.dashboard.stop();
      }
      if (this.httpServer) {
        this.httpServer.close();
      }
      await mongoose.connection.close();
      this.isRunning = false;

      if (this.config.verbose) {
        console.log("Monitor server stopped");
      }
    }
    return this;
  }
}

module.exports = MonitorServer;
