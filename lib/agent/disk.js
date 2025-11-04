const fs = require("fs");
const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

class DiskIOMonitor {
  constructor() {
    this.prevStats = {};
    this.platform = process.platform;
    this.initialized = false;
  }

  /**
   * 获取磁盘 IO 统计信息
   */
  async getDiskIO() {
    switch (this.platform) {
      case "linux":
        return await this._getLinuxDiskIO();
      case "darwin":
        return await this._getMacDiskIO();
      case "win32":
        return await this._getWindowsDiskIO();
      default:
        console.warn(`Unsupported platform: ${this.platform}`);
        return { read: 0, write: 0 };
    }
  }

  /**
   * Linux: 通过 /proc/diskstats 获取磁盘 IO
   */
  async _getLinuxDiskIO() {
    return new Promise((resolve) => {
      fs.readFile("/proc/diskstats", "utf8", (err, data) => {
        if (err) {
          console.error("读取 /proc/diskstats 失败:", err.message);
          // 降级方案：尝试使用 iostat（如果可用）
          this._getLinuxDiskIOFallback()
            .then(resolve)
            .catch(() => resolve({ read: 0, write: 0 }));
          return;
        }

        const stats = this._parseDiskStats(data);
        const result = this._calculateDiskIORate(stats);
        resolve(result);
      });
    });
  }

  /**
   * 解析 /proc/diskstats 文件内容
   */
  _parseDiskStats(data) {
    const stats = {};
    const lines = data.split("\n");

    for (const line of lines) {
      const columns = line.trim().split(/\s+/);

      // /proc/diskstats 格式：至少14列
      // 列说明：0-主设备号, 1-次设备号, 2-设备名, 3-读完成次数, 4-合并读次数, 5-读扇区数,
      //         6-读耗时, 7-写完成次数, 8-合并写次数, 9-写扇区数, 10-写耗时, 11-IO当前进度,
      //         12-IO耗时, 13-加权IO耗时
      if (columns.length >= 14) {
        const device = columns[2];

        // 跳过虚拟设备、分区和回环设备
        if (this._shouldSkipDevice(device)) {
          continue;
        }

        // 读取的扇区数（第5列），写入的扇区数（第9列）
        // 1扇区 = 512字节
        const sectorsRead = parseInt(columns[5]) || 0;
        const sectorsWritten = parseInt(columns[9]) || 0;

        stats[device] = {
          sectorsRead: sectorsRead,
          sectorsWritten: sectorsWritten,
          bytesRead: sectorsRead * 512, // 转换为字节
          bytesWritten: sectorsWritten * 512
        };
      }
    }

    return stats;
  }

  /**
   * 判断是否应该跳过该设备
   */
  _shouldSkipDevice(device) {
    // 跳过虚拟设备、分区、回环设备等
    const skipPatterns = [
      /^loop/, // 回环设备
      /^ram/, // RAM磁盘
      /^fd/, // 软盘
      /^sr/, // CD-ROM
      /^dm-/, // 设备映射器（LVM）
      /^nvme\d+n\d+p\d+$/, // NVMe分区
      /^sd[a-z]\d+$/, // SCSI/SATA分区
      /^hd[a-z]\d+$/, // IDE分区
      /^md\d+p\d+$/ // RAID分区
    ];

    return skipPatterns.some((pattern) => pattern.test(device));
  }

  /**
   * 计算磁盘 IO 速率
   */
  _calculateDiskIORate(currentStats) {
    const currentTime = Date.now();

    // 第一次调用，只记录数据
    if (!this.initialized) {
      this.prevStats = currentStats;
      this.prevTime = currentTime;
      this.initialized = true;
      return { read: 0, write: 0 };
    }

    const timeDiff = (currentTime - this.prevTime) / 1000; // 转换为秒

    // 时间间隔不合理，重置
    if (timeDiff < 0.1 || timeDiff > 60) {
      this.prevStats = currentStats;
      this.prevTime = currentTime;
      return { read: 0, write: 0 };
    }

    let totalRead = 0;
    let totalWrite = 0;

    // 计算所有设备的 IO 差值
    for (const [device, current] of Object.entries(currentStats)) {
      const previous = this.prevStats[device];

      if (
        previous &&
        current.bytesRead !== undefined &&
        previous.bytesRead !== undefined
      ) {
        totalRead += Math.max(0, current.bytesRead - previous.bytesRead);
      }

      if (
        previous &&
        current.bytesWritten !== undefined &&
        previous.bytesWritten !== undefined
      ) {
        totalWrite += Math.max(0, current.bytesWritten - previous.bytesWritten);
      }
    }

    // 更新上一次的统计数据
    this.prevStats = currentStats;
    this.prevTime = currentTime;

    // 转换为 KB/s
    return {
      read: Math.round(totalRead / timeDiff / 1024),
      write: Math.round(totalWrite / timeDiff / 1024)
    };
  }

  /**
   * Linux 降级方案：尝试使用 iostat
   */
  async _getLinuxDiskIOFallback() {
    try {
      const { stdout } = await execAsync("iostat -d -k 1 1", { timeout: 3000 });
      return this._parseIostatOutput(stdout);
    } catch (error) {
      console.log("iostat 命令不可用:", error.message);
      return { read: 0, write: 0 };
    }
  }

  /**
   * 解析 iostat 输出
   */
  _parseIostatOutput(output) {
    const lines = output.split("\n");
    let totalRead = 0;
    let totalWrite = 0;
    let dataSection = false;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // 找到数据部分
      if (trimmedLine.startsWith("Device")) {
        dataSection = true;
        continue;
      }

      if (dataSection && trimmedLine) {
        const columns = trimmedLine.split(/\s+/);

        // 跳过虚拟设备和分区
        if (columns.length >= 3 && !this._shouldSkipDevice(columns[0])) {
          const kbRead = parseFloat(columns[2]) || 0; // kB_read/s
          const kbWrite = parseFloat(columns[3]) || 0; // kB_wrtn/s

          totalRead += kbRead;
          totalWrite += kbWrite;
        }
      }
    }

    return {
      read: Math.round(totalRead),
      write: Math.round(totalWrite)
    };
  }

  /**
   * macOS: 使用 iostat 获取磁盘 IO
   */
  async _getMacDiskIO() {
    try {
      const { stdout } = await execAsync("iostat -d -c 2 -w 1", {
        timeout: 3000
      });
      return this._parseMacIostat(stdout);
    } catch (error) {
      console.log("macOS iostat 失败:", error.message);

      // 降级方案：尝试使用 system_profiler
      try {
        const { stdout } = await execAsync(
          "system_profiler SPStorageDataType",
          { timeout: 5000 }
        );
        return this._parseMacSystemProfiler(stdout);
      } catch (fallbackError) {
        console.log("macOS system_profiler 失败:", fallbackError.message);
        return { read: 0, write: 0 };
      }
    }
  }

  /**
   * 解析 macOS 的 iostat 输出
   */
  _parseMacIostat(output) {
    const lines = output.split("\n");
    let kbRead = 0;
    let kbWrite = 0;
    let dataSection = false;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // macOS iostat 输出格式不同
      if (trimmedLine.startsWith("disk")) {
        dataSection = true;
        continue;
      }

      if (dataSection && trimmedLine) {
        const columns = trimmedLine.split(/\s+/);

        if (columns.length >= 4) {
          // macOS iostat 列：disk0, KB/t, tps, MB/s
          const mbPerSec = parseFloat(columns[3]) || 0;
          // 这里简化处理，将 MB/s 转换为 KB/s（实际应该区分读写）
          kbRead += (mbPerSec * 1024) / 2; // 假设读写各一半
          kbWrite += (mbPerSec * 1024) / 2;
        }
      }
    }

    return {
      read: Math.round(kbRead),
      write: Math.round(kbWrite)
    };
  }

  /**
   * 解析 macOS 的 system_profiler 输出（基本信息，不包含实时 IO）
   */
  _parseMacSystemProfiler(output) {
    // system_profiler 主要提供存储设备信息，不提供实时 IO
    // 这里返回 0，或者可以尝试其他方法
    console.log("macOS: 使用 system_profiler 无法获取实时磁盘 IO");
    return { read: 0, write: 0 };
  }

  /**
   * Windows: 使用 typeperf 获取磁盘 IO
   */
  async _getWindowsDiskIO() {
    try {
      // 使用 typeperf 计数器获取磁盘 IO
      const { stdout } = await execAsync(
        'typeperf "\\PhysicalDisk(*)\\Disk Read Bytes/sec" "\\PhysicalDisk(*)\\Disk Write Bytes/sec" -sc 1',
        { timeout: 5000, shell: true }
      );

      return this._parseWindowsTypeperf(stdout);
    } catch (error) {
      console.log("Windows typeperf 失败:", error.message);

      // 降级方案：尝试使用 wmic
      try {
        const { stdout } = await execAsync(
          "wmic path Win32_PerfFormattedData_PerfDisk_PhysicalDisk Get Name,DiskReadBytesPersec,DiskWriteBytesPersec /Format:CSV",
          { timeout: 5000, shell: true }
        );

        return this._parseWindowsWmic(stdout);
      } catch (fallbackError) {
        console.log("Windows wmic 失败:", fallbackError.message);
        return { read: 0, write: 0 };
      }
    }
  }

  /**
   * 解析 Windows typeperf 输出
   */
  _parseWindowsTypeperf(output) {
    const lines = output.split("\n");
    let totalRead = 0;
    let totalWrite = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (
        trimmedLine.includes("\\PhysicalDisk") &&
        !trimmedLine.includes('"\\\\"')
      ) {
        const values = trimmedLine.split(",");

        if (values.length >= 3) {
          // 提取数值（去除引号）
          const value = parseFloat(values[2].replace(/"/g, "")) || 0;

          if (trimmedLine.includes("Disk Read Bytes")) {
            totalRead += value / 1024; // 转换为 KB/s
          } else if (trimmedLine.includes("Disk Write Bytes")) {
            totalWrite += value / 1024; // 转换为 KB/s
          }
        }
      }
    }

    return {
      read: Math.round(totalRead),
      write: Math.round(totalWrite)
    };
  }

  /**
   * 解析 Windows wmic 输出
   */
  _parseWindowsWmic(output) {
    const lines = output.split("\n");
    let totalRead = 0;
    let totalWrite = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (
        trimmedLine &&
        !trimmedLine.startsWith("Node") &&
        trimmedLine.includes(",")
      ) {
        const values = trimmedLine.split(",");

        if (values.length >= 4) {
          const readBytes = parseFloat(values[2]) || 0;
          const writeBytes = parseFloat(values[3]) || 0;

          totalRead += readBytes / 1024; // 转换为 KB/s
          totalWrite += writeBytes / 1024;
        }
      }
    }

    return {
      read: Math.round(totalRead),
      write: Math.round(totalWrite)
    };
  }

  /**
   * 获取磁盘使用情况（与 IO 分开，这是原有的功能）
   */
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
      console.error("获取磁盘使用情况失败:", error);
      return null;
    }
  }

  /**
   * 重置监控器
   */
  reset() {
    this.prevStats = {};
    this.initialized = false;
  }
}

module.exports = DiskIOMonitor;
