const os = require("os");
const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);
const NetworkMonitor = require("./network");

class SystemMonitor {
  constructor(agentId) {
    this.agentId = agentId;
    this.networkMonitor = new NetworkMonitor();
    this.prevCpu = os.cpus();
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
        "df -k | grep -E '^/dev/' | awk '{print $2,$3,$4}'"
      );
      const lines = stdout.trim().split("\n");

      let total = 0;
      let used = 0;
      let free = 0;

      lines.forEach((line) => {
        const [blockTotal, blockUsed, blockFree] = line
          .trim()
          .split(" ")
          .map(Number);
        total += blockTotal;
        used += blockUsed;
        free += blockFree;
      });

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

  async getNetworkIO() {
    return await this.networkMonitor.getNetworkIO(5000); // 使用5秒间隔
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
      // 获取容器总数
      const { stdout: totalStdout } = await execAsync("docker ps -aq | wc -l");
      const total = parseInt(totalStdout.trim());

      // 获取运行中的容器数量
      const { stdout: runningStdout } = await execAsync("docker ps -q | wc -l");
      const running = parseInt(runningStdout.trim());

      // 获取暂停的容器数量
      const { stdout: pausedStdout } = await execAsync(
        "docker ps -q --filter status=paused | wc -l"
      );
      const paused = parseInt(pausedStdout.trim());

      // 计算停止的容器数量
      const stopped = total - running - paused;

      return {
        containers: total,
        running: running,
        paused: paused,
        stopped: stopped
      };
    } catch (error) {
      // Docker 未安装或未运行
      if (this.config.verbose) {
        console.log("Docker not available:", error.message);
      }
      return null;
    }
  }

  // 收集所有指标
  async collectAllMetrics() {
    const [cpu, memory, disk, diskIO, processes, docker, networkIO] =
      await Promise.all([
        this.getCpuUsage(),
        this.getMemoryUsage(),
        this.getDiskUsage(),
        this.getDiskIO(),
        this.getProcessInfo(),
        this.getDockerStats(),
        this.getNetworkIO()
      ]);

    return {
      agentId: this.agentId,
      timestamp: new Date(),
      cpu,
      memory,
      disk: { ...disk, ...diskIO },
      network: networkIO,
      processes,
      docker,
      uptime: os.uptime()
    };
  }
}

module.exports = SystemMonitor;
