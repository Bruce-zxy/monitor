class Dashboard {
  constructor() {
    this.charts = {};
    this.currentAgent = "";
    this.data = [];
    this.init();
  }

  init() {
    this.createCharts();
    this.loadAgents();
    this.startAutoRefresh();
    this.updateCurrentTime();
  }

  createCharts() {
    const chartConfigs = {
      cpuChart: { label: "CPU使用率", color: "rgba(255, 99, 132, 1)" },
      memoryChart: { label: "内存使用率", color: "rgba(54, 162, 235, 1)" },
      diskChart: { label: "磁盘使用率", color: "rgba(255, 206, 86, 1)" },
      loadChart: {
        labels: ["1分钟", "5分钟", "15分钟"],
        colors: [
          "rgba(255, 99, 132, 1)",
          "rgba(54, 162, 235, 1)",
          "rgba(255, 206, 86, 1)"
        ]
      },
      diskIOChart: {
        labels: ["读取", "写入"],
        colors: ["rgba(75, 192, 192, 1)", "rgba(153, 102, 255, 1)"]
      },
      networkChart: {
        labels: ["接收", "发送"],
        colors: ["rgba(255, 159, 64, 1)", "rgba(199, 199, 199, 1)"]
      }
    };

    Object.keys(chartConfigs).forEach((chartId) => {
      const ctx = document.getElementById(chartId).getContext("2d");
      const config = chartConfigs[chartId];

      if (chartId === "loadChart") {
        this.charts[chartId] = new Chart(ctx, {
          type: "line",
          data: {
            labels: [],
            datasets: config.labels.map((label, i) => ({
              label: label,
              data: [],
              borderColor: config.colors[i],
              backgroundColor: config.colors[i].replace("1)", "0.1)"),
              tension: 0.4
            }))
          },
          options: this.getChartOptions("负载")
        });
      } else if (chartId === "diskIOChart" || chartId === "networkChart") {
        this.charts[chartId] = new Chart(ctx, {
          type: "line",
          data: {
            labels: [],
            datasets: config.labels.map((label, i) => ({
              label: label,
              data: [],
              borderColor: config.colors[i],
              backgroundColor: config.colors[i].replace("1)", "0.1)"),
              tension: 0.4
            }))
          },
          options: this.getChartOptions("KB/s")
        });
      } else {
        this.charts[chartId] = new Chart(ctx, {
          type: "line",
          data: {
            labels: [],
            datasets: [
              {
                label: config.label,
                data: [],
                borderColor: config.color,
                backgroundColor: config.color.replace("1)", "0.1)"),
                tension: 0.4
              }
            ]
          },
          options: this.getChartOptions("%")
        });
      }
    });
  }

  getChartOptions(unit) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: unit
          }
        },
        x: {
          title: {
            display: true,
            text: "时间"
          }
        }
      },
      plugins: {
        legend: {
          display: true
        }
      }
    };
  }

  async loadAgents() {
    try {
      const response = await fetch("/api/agents");
      const agents = await response.json();

      const select = document.getElementById("agentSelect");
      select.innerHTML = "";

      agents.forEach((agent) => {
        const option = document.createElement("option");
        option.value = agent;
        option.textContent = agent;
        select.appendChild(option);
      });

      if (agents.length > 0) {
        this.currentAgent = agents[0];
        this.loadData();
      }

      select.onchange = (e) => {
        this.currentAgent = e.target.value;
        this.loadData();
      };
    } catch (error) {
      console.error("Failed to load agents:", error);
    }
  }

  async loadData() {
    if (!this.currentAgent) return;

    try {
      const timeRange = document.getElementById("timeRange").value;
      const response = await fetch(
        `/api/metrics/${this.currentAgent}?hours=${timeRange}`
      );
      this.data = (await response.json())?.reverse();

      this.updateCharts();
      this.updateStatus();
    } catch (error) {
      console.error("Failed to load data:", error);
    }
  }

  updateCharts() {
    if (this.data.length === 0) return;

    const labels = this.data.map((d) =>
      new Date(d.timestamp).toLocaleTimeString()
    );

    // CPU 图表
    this.updateChart(
      "cpuChart",
      labels,
      this.data.map((d) => d.cpu?.usage?.toFixed(1))
    );

    // 内存图表
    this.updateChart(
      "memoryChart",
      labels,
      this.data.map((d) => d.memory?.usage?.toFixed(1))
    );

    // 磁盘图表
    this.updateChart(
      "diskChart",
      labels,
      this.data.map((d) => d.disk?.usage?.toFixed(1))
    );

    // 负载图表
    if (this.charts.loadChart) {
      this.charts.loadChart.data.labels = labels;
      this.charts.loadChart.data.datasets[0].data = this.data.map((d) =>
        d.cpu?.load1?.toFixed(2)
      );
      this.charts.loadChart.data.datasets[1].data = this.data.map((d) =>
        d.cpu?.load5?.toFixed(2)
      );
      this.charts.loadChart.data.datasets[2].data = this.data.map((d) =>
        d.cpu?.load15?.toFixed(2)
      );
      this.charts.loadChart.update();
    }

    // 磁盘IO图表
    if (this.charts.diskIOChart) {
      this.charts.diskIOChart.data.labels = labels;
      this.charts.diskIOChart.data.datasets[0].data = this.data.map(
        (d) => d.disk?.read || 0
      );
      this.charts.diskIOChart.data.datasets[1].data = this.data.map(
        (d) => d.disk?.write || 0
      );
      this.charts.diskIOChart.update();
    }

    // 网络图表
    if (this.charts.networkChart) {
      this.charts.networkChart.data.labels = labels;
      this.charts.networkChart.data.datasets[0].data = this.data.map(
        (d) => d.network?.in || 0
      );
      this.charts.networkChart.data.datasets[1].data = this.data.map(
        (d) => d.network?.out || 0
      );
      this.charts.networkChart.update();
    }
  }

  updateChart(chartId, labels, data) {
    if (this.charts[chartId]) {
      this.charts[chartId].data.labels = labels;
      this.charts[chartId].data.datasets[0].data = data;
      this.charts[chartId].update();
    }
  }

  updateStatus() {
    const statusElement = document.getElementById("status");
    if (this.data.length > 0) {
      const latest = this.data[this.data.length - 1];
      const timeDiff = Date.now() - new Date(latest.timestamp).getTime();
      const isOnline = timeDiff < 120000; // 2分钟内更新视为在线

      statusElement.innerHTML = `
                <span class="status-indicator ${
                  isOnline ? "status-online" : "status-offline"
                }"></span>
                状态: ${isOnline ? "在线" : "离线"} | 
                最后更新: ${new Date(latest.timestamp).toLocaleString()} |
                运行时间: ${Math.round(latest.uptime / 3600)}小时
            `;
    } else {
      statusElement.innerHTML =
        '<span class="status-indicator status-offline"></span>无数据';
    }
  }

  updateCurrentTime() {
    document.getElementById("currentTime").textContent =
      new Date().toLocaleString();
    setTimeout(() => this.updateCurrentTime(), 1000);
  }

  startAutoRefresh() {
    setInterval(() => {
      if (this.currentAgent) {
        this.loadData();
      }
    }, 10000); // 10秒自动刷新
  }
}

// 全局函数供HTML调用
function refreshData() {
  dashboard.loadData();
}

// 初始化Dashboard
const dashboard = new Dashboard();
