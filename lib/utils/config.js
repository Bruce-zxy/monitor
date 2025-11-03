const config = require("config");

class ConfigManager {
  static getAgentConfig(customConfig = {}) {
    try {
      const defaults = config.has("agent") ? config.get("agent") : {};
      return { ...defaults, ...customConfig };
    } catch (error) {
      console.warn("Using default agent config due to error:", error.message);
      return {
        defaultInterval: 10000,
        maxRetries: 3,
        retryDelay: 2000,
        ...customConfig
      };
    }
  }

  static getServerConfig(customConfig = {}) {
    try {
      const defaults = config.has("server") ? config.get("server") : {};
      return { ...defaults, ...customConfig };
    } catch (error) {
      console.warn("Using default server config due to error:", error.message);
      return {
        httpPort: 3000,
        udpPort: 41234,
        dashboardPort: 4000,
        ...customConfig
      };
    }
  }

  static getDatabaseConfig(customConfig = {}) {
    try {
      const defaults = config.has("database") ? config.get("database") : {};
      return { ...defaults, ...customConfig };
    } catch (error) {
      console.warn(
        "Using default database config due to error:",
        error.message
      );
      return {
        mongoUri: "mongodb://localhost:27017/monitoring",
        collection: "metrics",
        dataRetentionDays: 30,
        ...customConfig
      };
    }
  }

  static getDashboardConfig(customConfig = {}) {
    try {
      const defaults = config.has("dashboard") ? config.get("dashboard") : {};
      return { ...defaults, ...customConfig };
    } catch (error) {
      console.warn(
        "Using default dashboard config due to error:",
        error.message
      );
      return {
        port: 4000,
        refreshInterval: 30000,
        ...customConfig
      };
    }
  }

  // 检查配置是否完整
  static validateConfig() {
    const requiredSections = ["agent", "server", "database", "dashboard"];
    const missingSections = [];

    for (const section of requiredSections) {
      if (!config.has(section)) {
        missingSections.push(section);
      }
    }

    if (missingSections.length > 0) {
      console.warn(
        `Missing config sections: ${missingSections.join(
          ", "
        )}. Using defaults.`
      );
      return false;
    }

    return true;
  }
}

module.exports = ConfigManager;
