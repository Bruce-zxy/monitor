const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

class NetworkMonitor {
  constructor() {
    this.prevStats = {};
    this.platform = process.platform;
  }

  /**
   * 执行与平台对应的netstat命令并返回原始输出
   */
  async _fetchNetstatOutput() {
    let command;

    if (this.platform === "win32") {
      // Windows: 使用 netstat -e 获取接口统计
      command = "netstat -e";
    } else {
      // Linux 和 macOS
      if (this.platform === "darwin") {
        // macOS: -b 选项可能需要sudo权限，-i 提供基础接口信息
        command = "netstat -i";
      } else {
        // linux
        command = "netstat -i";
      }
    }

    try {
      const { stdout } = await execAsync(command, { timeout: 5000 });
      return stdout;
    } catch (error) {
      console.error(`执行 netstat 命令失败: ${error.message}`);
      // 可以考虑在这里实现降级方案，例如尝试读取 /proc/net/dev (Linux)
      return null;
    }
  }

  /**
   * 解析netstat输出，提取各接口的收发字节数
   */
  _parseNetstatOutput(output) {
    const stats = {};
    if (!output) return stats;

    const lines = output.split("\n");
    let foundStart = false;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Windows 解析逻辑
      if (this.platform === "win32") {
        // 在Windows中，netstat -e 的输出包含 "Interface Statistics"
        if (trimmedLine.includes("Interface Statistics")) {
          foundStart = true;
          continue;
        }
        if (foundStart) {
          // 匹配例如："  Bytes Received: 1234567890" 这样的行
          const receiveMatch = trimmedLine.match(
            /Bytes Received[^\d]*([\d,]+)/i
          );
          const transmitMatch = trimmedLine.match(/Bytes Sent[^\d]*([\d,]+)/i);
          if (receiveMatch) {
            // Windows netstat -e 只提供一个总的字节数，我们将其归属于一个虚拟接口
            stats["total"] = stats["total"] || {};
            stats["total"].receiveBytes = parseInt(
              receiveMatch[1].replace(/,/g, "")
            );
          }
          if (transmitMatch) {
            stats["total"] = stats["total"] || {};
            stats["total"].transmitBytes = parseInt(
              transmitMatch[1].replace(/,/g, "")
            );
          }
        }
      } else {
        // Linux/macOS 解析逻辑: netstat -i
        // 跳过表头，找到数据行。通常表头行包含 "Name" 或 "Iface"
        if (
          !foundStart &&
          (trimmedLine.includes("Iface") || trimmedLine.includes("Name"))
        ) {
          foundStart = true;
          continue;
        }
        if (foundStart && trimmedLine) {
          // 数据行示例: "eth0  1500 0   123456  0    0      0      987654  0    0      0"
          // 列分别为: Iface, MTU, Met, RX-OK, RX-ERR, RX-DRP, RX-OVR, TX-OK, TX-ERR, TX-DRP, TX-OVR
          // 注意：某些系统可能列数不同。RX-OK 和 TX-OK 是数据包数，不是字节数。
          // 重点：标准的 `netstat -i` 不直接提供字节数。在macOS上，`netstat -ib` 可以，但需要sudo。
          const columns = trimmedLine.split(/\s+/);
          const iface = columns[0];

          // 由于标准 netstat -i 不提供字节数，这里我们无法直接获取。
          // 这是一个已知限制。作为替代，我们记录数据包数。
          if (columns.length >= 11) {
            stats[iface] = {
              // 注意：这里记录的是数据包数量，不是字节数。
              receivePackets: parseInt(columns[3]) || 0,
              transmitPackets: parseInt(columns[7]) || 0
            };
          }
        }
      }
    }
    return stats;
  }

  /**
   * 获取当前网络IO速率 (KB/s)
   * @param {number} intervalMs 计算速率的时间间隔（毫秒），默认1000ms
   */
  async getNetworkIO(intervalMs = 1000) {
    const currentStats = await this._fetchNetstatOutput().then(
      this._parseNetstatOutput.bind(this)
    );

    // 如果是第一次调用，或者没有上一次的数据，则无法计算速率，返回0。
    if (!this.prevStats.timestamp || Object.keys(this.prevStats).length === 0) {
      this.prevStats = { ...currentStats, timestamp: Date.now() };
      return { in: 0, out: 0 };
    }

    const timeDiff = (Date.now() - this.prevStats.timestamp) / 1000; // 转换为秒
    let totalIn = 0;
    let totalOut = 0;

    // 计算所有接口（除lo回环）的总流量差值
    for (const [iface, current] of Object.entries(currentStats)) {
      if (iface === "lo" || iface.startsWith("loop")) continue; // 忽略回环接口

      const previous = this.prevStats[iface];
      if (previous && previous.receiveBytes && current.receiveBytes) {
        totalIn += Math.max(0, current.receiveBytes - previous.receiveBytes);
      }
      if (previous && previous.transmitBytes && current.transmitBytes) {
        totalOut += Math.max(0, current.transmitBytes - previous.transmitBytes);
      }
    }

    // 更新上一次的统计数据
    this.prevStats = { ...currentStats, timestamp: Date.now() };

    // 计算速率并转换为KB/s
    return {
      in: Math.round(totalIn / timeDiff / 1024),
      out: Math.round(totalOut / timeDiff / 1024)
    };
  }
}

module.exports = NetworkMonitor;
