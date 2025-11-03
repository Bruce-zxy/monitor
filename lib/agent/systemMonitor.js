const os = require("os");
const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

class SystemMonitor {
  constructor(agentId) {
    this.agentId = agentId;
    this.prevCpu = os.cpus();
    this.prevNetwork = this.getNetworkSnapshot();
    this.prevDiskStats = null;
  }

  // 获取 CPU 使用率
  getCpuUsage() {
    const cpus = os.cpus();
    let user = 0,
      system = 0,
      idle = 0;

    cpus.forEach((cpu, i) => {
      const prev = this.prevCpu[i].times;
      const curr = cpu.times;

      const totalDiff =
        curr.user +
        curr.nice +
        curr.sys +
        curr.idle +
        curr.irq -
        (prev.user + prev.nice + prev.sys + prev.idle + prev.irq);

      if (totalDiff > 0) {
        user += (curr.user - prev.user) / totalDiff;
        system += (curr.sys - prev.sys) / totalDiff;
        idle += (curr.idle - prev.idle) / totalDiff;
      }
    });

    this.prevCpu = cpus;

    const cpuCount = cpus.length;
    return {
      usage: (1 - idle / cpuCount) * 100,
      user: (user / cpuCount) * 100,
      system: (system / cpuCount) * 100,
      idle: (idle / cpuCount) * 100,
      load1: os.loadavg()[0],
      load5: os.loadavg()[1],
      load15: os.loadavg()[2]
    };
  }

  // 获取内存使用情况
  getMemoryUsage() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;

    return {
      total: Math.round(total / 1024 / 1024), // MB
      free: Math.round(free / 1024 / 1024),
      used: Math.round(used / 1024 / 1024),
      usage: (used / total) * 100
    };
  }

  // 获取磁盘使用情况（异步）
  async getDiskUsage() {
    try {
      const { stdout } = await execAsync(
        "df -k / | awk 'NR==2{print $2,$3,$4}'"
      );
      const [total, used, free] = stdout.trim().split(" ").map(Number);

      return {
        total: Math.round(total / 1024), // MB
        used: Math.round(used / 1024),
        free: Math.round(free / 1024),
        usage: (used / total) * 100
      };
    } catch (error) {
      console.error("Error getting disk usage:", error);
      return null;
    }
  }

  // 获取磁盘 IO（需要安装 iostat）
  async getDiskIO() {
    try {
      const { stdout } = await execAsync(
        "iostat -d -k 1 1 | grep -E '^[sv]da' | awk '{print $3,$4}'"
      );
      const [read, write] = stdout.trim().split(" ").map(Number);

      return {
        read: read || 0,
        write: write || 0
      };
    } catch (error) {
      console.error("Error getting disk IO:", error);
      return { read: 0, write: 0 };
    }
  }

  // 获取网络快照数据
  getNetworkSnapshot() {
    const interfaces = os.networkInterfaces();
    const snapshot = {};

    Object.keys(interfaces).forEach((ifaceName) => {
      const iface = interfaces[ifaceName];
      iface.forEach((addr) => {
        if (!addr.internal && addr.mac) {
          snapshot[`${ifaceName}-${addr.mac}`] = {
            inBytes: addr.bytesRead || 0,
            outBytes: addr.bytesWritten || 0
          };
        }
      });
    });

    return snapshot;
  }

  // 获取网络 IO
  getNetworkIO() {
    const currentNetwork = this.getNetworkSnapshot();
    let inBytes = 0,
      outBytes = 0;

    // 计算与上次快照的差值
    Object.keys(currentNetwork).forEach((key) => {
      if (this.prevNetwork[key]) {
        const current = currentNetwork[key];
        const previous = this.prevNetwork[key];
        
        // 累加所有网络接口的流量差值
        inBytes += Math.max(0, current.inBytes - previous.inBytes);
        outBytes += Math.max(0, current.outBytes - previous.outBytes);
      }
    });

    // 更新快照
    this.prevNetwork = currentNetwork;

    return {
      in: Math.round(inBytes / 1024), // KB
      out: Math.round(outBytes / 1024)
    };
  }

  // 获取进程信息
  async getProcessInfo() {
    try {
      const { stdout } = await execAsync(
        "ps -e -o state --no-headers | sort | uniq -c"
      );
      const lines = stdout.trim().split("\n");

      const stats = {
        total: 0,
        running: 0,
        sleeping: 0
      };

      lines.forEach((line) => {
        const [count, state] = line.trim().split(" ");
        stats.total += parseInt(count);

        switch (state) {
          case "R":
            stats.running += parseInt(count);
            break;
          case "S":
          case "D":
            stats.sleeping += parseInt(count);
            break;
        }
      });

      return stats;
    } catch (error) {
      console.error("Error getting process info:", error);
      return { total: 0, running: 0, sleeping: 0 };
    }
  }

  // 获取 Docker 容器统计
  async getDockerStats() {
    try {
      const { stdout } = await execAsync("docker ps -aq | wc -l");
      const total = parseInt(stdout.trim());

      const { stdout: runningStdout } = await execAsync("docker ps -q | wc -l");
      const running = parseInt(runningStdout.trim());

      return {
        containers: total,
        running: running,
        paused: 0, // 简化处理
        stopped: total - running
      };
    } catch (error) {
      // Docker 未安装或未运行
      return null;
    }
  }

  // 收集所有指标
  async collectAllMetrics() {
    const [cpu, memory, disk, diskIO, processes, docker] = await Promise.all([
      this.getCpuUsage(),
      this.getMemoryUsage(),
      this.getDiskUsage(),
      this.getDiskIO(),
      this.getProcessInfo(),
      this.getDockerStats()
    ]);

    return {
      agentId: this.agentId,
      timestamp: new Date(),
      cpu,
      memory,
      disk: { ...disk, ...diskIO },
      network: this.getNetworkIO(),
      processes,
      docker,
      uptime: os.uptime()
    };
  }
}

module.exports = SystemMonitor;
