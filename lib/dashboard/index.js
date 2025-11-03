/*
 * @Author: HadesZ
 * @Date: 2025-11-03 12:16:30
 * @LastEditors: HadesZ
 * @LastEditTime: 2025-11-03 16:30:53
 * @Description: 
 */
const DashboardServer = require("./server");
const ConfigManager = require("../utils/config");

class Dashboard {
  constructor(config = {}) {
    this.config = ConfigManager.getDashboardConfig(config);
    this.server = null;
  }

  async start() {
    if (this.server) {
      throw new Error("Dashboard is already running");
    }

    this.server = DashboardServer;
    await new Promise((resolve, reject) => {
      this.server.listen(this.config.port, (err) => {
        if (err) {
          reject(err);
        } else {
          if (this.config.verbose) {
            console.log(
              `✅ Dashboard server running on port ${this.config.port}`
            );
          }
          resolve();
        }
      });
    });

    return this;
  }

  async stop() {
    if (this.server) {
      if (this.config.verbose) {
        console.log("Dashboard server stopped");
      }
    }
    return this;
  }
}

module.exports = Dashboard;