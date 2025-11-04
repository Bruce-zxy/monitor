const { exec } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const execAsync = promisify(exec);

class NetworkMonitor {
  constructor() {
    this.prevStats = {};
    this.platform = process.platform;
    this.initialized = false;
  }

  /**
   * 获取网络统计信息
   */
  async getNetworkStats() {
    switch (this.platform) {
      case "linux":
        return await this._getLinuxNetworkStats();
      case "win32":
        return await this._getWindowsNetworkStats();
      case "darwin":
        return await this._getMacNetworkStats();
      default:
        console.warn(`Unsupported platform: ${this.platform}`);
        return {};
    }
  }

  /**
   * Linux: 通过/proc/net/dev获取网络统计
   */
  async _getLinuxNetworkStats() {
    return new Promise((resolve) => {
      fs.readFile("/proc/net/dev", "utf8", (err, data) => {
        if (err) {
          console.error("读取/proc/net/dev失败:", err.message);
          resolve({});
          return;
        }

        const stats = {};
        const lines = data.split("\n");

        for (let i = 2; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          const parts = line.split(/\s+/);
          const interfaceName = parts[0].replace(":", "");

          stats[interfaceName] = {
            receiveBytes: parseInt(parts[1]) || 0,
            transmitBytes: parseInt(parts[9]) || 0
          };
        }

        resolve(stats);
      });
    });
  }

  /**
   * Windows: 通过netstat -e获取网络统计
   */
  async _getWindowsNetworkStats() {
    try {
      const { stdout } = await execAsync("netstat -e", { timeout: 5000 });
      const stats = {};

      const lines = stdout.split("\n");
      let foundStart = false;

      for (const line of lines) {
        const trimmedLine = line.trim();

        if (trimmedLine.includes("Interface Statistics")) {
          foundStart = true;
          continue;
        }

        if (foundStart) {
          const receiveMatch = trimmedLine.match(
            /Bytes Received[^\d]*([\d,]+)/i
          );
          const transmitMatch = trimmedLine.match(/Bytes Sent[^\d]*([\d,]+)/i);

          if (receiveMatch) {
            stats["total"] = stats["total"] || {};
            stats["total"].receiveBytes =
              parseInt(receiveMatch[1].replace(/,/g, "")) || 0;
          }

          if (transmitMatch) {
            stats["total"] = stats["total"] || {};
            stats["total"].transmitBytes =
              parseInt(transmitMatch[1].replace(/,/g, "")) || 0;
          }
        }
      }

      return stats;
    } catch (error) {
      console.error("Windows网络统计获取失败:", error.message);
      return {};
    }
  }

  /**
   * macOS: 使用netstat获取网络统计（更可靠的方法）
   */
  async _getMacNetworkStats() {
    try {
      // 使用 netstat -I <interface> -b 获取特定接口的字节统计
      // 首先获取所有网络接口
      const { stdout: ifconfigOutput } = await execAsync("ifconfig -l", {
        timeout: 3000
      });
      const interfaces = ifconfigOutput.trim().split(" ");

      const stats = {};

      // 对每个接口获取统计信息
      for (const iface of interfaces) {
        if (
          iface === "lo0" ||
          iface.startsWith("bridge") ||
          iface.startsWith("p2p")
        ) {
          continue; // 跳过回环和虚拟接口
        }

        try {
          const { stdout: netstatOutput } = await execAsync(
            `netstat -I ${iface} -b 2>/dev/null | grep ${iface} | head -1`,
            { timeout: 3000, shell: true }
          );

          if (netstatOutput.trim()) {
            const columns = netstatOutput.trim().split(/\s+/);
            if (columns.length >= 10) {
              // netstat -I <interface> -b 输出格式:
              // Name  Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll
              stats[iface] = {
                receiveBytes: parseInt(columns[6]) || 0, // Ibytes
                transmitBytes: parseInt(columns[9]) || 0 // Obytes
              };
            }
          }
        } catch (interfaceError) {
          // 忽略单个接口的错误
          console.log(
            `无法获取接口 ${iface} 的统计: ${interfaceError.message}`
          );
        }
      }

      // 如果上述方法失败，尝试使用 nstat 命令（如果可用）
      if (Object.keys(stats).length === 0) {
        try {
          const { stdout: nstatOutput } = await execAsync("nstat -a", {
            timeout: 3000
          });
          return this._parseMacNstat(nstatOutput);
        } catch (nstatError) {
          console.log("nstat 命令不可用:", nstatError.message);
        }
      }

      return stats;
    } catch (error) {
      console.error("macOS网络统计获取失败:", error.message);
      return {};
    }
  }

  /**
   * 解析macOS的nstat输出（备选方案）
   */
  _parseMacNstat(output) {
    const stats = {};
    const lines = output.split("\n");

    let totalReceive = 0;
    let totalTransmit = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // 查找网络接口的统计
      if (trimmedLine.startsWith("IpExtInOctets")) {
        const match = trimmedLine.match(/IpExtInOctets\s+(\d+)/);
        if (match) totalReceive = parseInt(match[1]);
      }

      if (trimmedLine.startsWith("IpExtOutOctets")) {
        const match = trimmedLine.match(/IpExtOutOctets\s+(\d+)/);
        if (match) totalTransmit = parseInt(match[1]);
      }
    }

    if (totalReceive > 0 || totalTransmit > 0) {
      stats["total"] = {
        receiveBytes: totalReceive,
        transmitBytes: totalTransmit
      };
    }

    return stats;
  }

  /**
   * 获取网络IO速率 (KB/s)
   */
  async getNetworkIO() {
    try {
      const currentStats = await this.getNetworkStats();

      // 如果是第一次调用，只记录数据不计算速率
      if (!this.initialized) {
        this.prevStats = currentStats;
        this.initialized = true;
        this.lastTimestamp = Date.now();
        return { in: 0, out: 0 };
      }

      const currentTimestamp = Date.now();
      const timeDiff = (currentTimestamp - this.lastTimestamp) / 1000; // 转换为秒

      // 确保时间差合理（避免除零或过大）
      if (timeDiff < 0.1 || timeDiff > 60) {
        this.prevStats = currentStats;
        this.lastTimestamp = currentTimestamp;
        return { in: 0, out: 0 };
      }

      let totalIn = 0;
      let totalOut = 0;

      // 计算所有接口的流量差值
      for (const [iface, current] of Object.entries(currentStats)) {
        // 跳过回环接口和虚拟接口
        if (
          iface === "lo" ||
          iface === "lo0" ||
          iface.startsWith("loop") ||
          iface.startsWith("bridge")
        ) {
          continue;
        }

        const previous = this.prevStats[iface];

        if (
          previous &&
          current.receiveBytes !== undefined &&
          previous.receiveBytes !== undefined
        ) {
          const bytesIn = Math.max(
            0,
            current.receiveBytes - previous.receiveBytes
          );
          totalIn += bytesIn;
        }

        if (
          previous &&
          current.transmitBytes !== undefined &&
          previous.transmitBytes !== undefined
        ) {
          const bytesOut = Math.max(
            0,
            current.transmitBytes - previous.transmitBytes
          );
          totalOut += bytesOut;
        }
      }

      // 更新上一次的统计数据
      this.prevStats = currentStats;
      this.lastTimestamp = currentTimestamp;

      // 转换为KB/s
      const result = {
        in: Math.round(totalIn / timeDiff / 1024),
        out: Math.round(totalOut / timeDiff / 1024),
        platform: this.platform
      };

      // 调试信息
      if (this.platform === "darwin") {
        console.log(
          `macOS网络统计 - 时间间隔: ${timeDiff.toFixed(2)}s, 输入: ${
            result.in
          } KB/s, 输出: ${result.out} KB/s`
        );
        console.log(`当前统计:`, JSON.stringify(currentStats, null, 2));
      }

      return result;
    } catch (error) {
      console.error("获取网络IO失败:", error);
      return { in: 0, out: 0, platform: this.platform };
    }
  }

  /**
   * 重置统计（用于重新开始计算）
   */
  reset() {
    this.prevStats = {};
    this.initialized = false;
  }
}

module.exports = NetworkMonitor;
