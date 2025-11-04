class Dashboard {
  constructor() {
    this.charts = {};
    this.currentAgent = "";
    this.data = [];
    this.init();
  }

  init() {
    this.createCharts();
    this.createInfoCards();
    this.loadAgents();
    this.startAutoRefresh();
    this.updateCurrentTime();
  }
  // 创建系统信息卡片
  createInfoCards() {
    const infoGrid = document.getElementById("systemInfo");
    const infoCards = [
      {
        id: "uptime",
        title: "运行时间",
        value: "0小时",
        label: "系统运行时间"
      },
      {
        id: "dockerStatus",
        title: "Docker 状态",
        value: "未运行",
        label: "Docker 服务状态"
      },
      { id: "containers", title: "容器总数", value: "0", label: "Docker 容器" },
      {
        id: "runningContainers",
        title: "运行中",
        value: "0",
        label: "运行中的容器"
      },
      { id: "processes", title: "进程数", value: "0", label: "系统进程" },
      { id: "load", title: "系统负载", value: "0.00", label: "最近1分钟" }
    ];

    infoCards.forEach((card) => {
      const cardElement = document.createElement("div");
      cardElement.className = "info-card";
      cardElement.id = `card-${card.id}`;
      cardElement.innerHTML = `
                <h4>${card.title}</h4>
                <div class="info-value">${card.value}</div>
                <div class="info-label">${card.label}</div>
            `;
      infoGrid.appendChild(cardElement);
    });
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
      },
      dockerContainersChart: {
        type: "doughnut",
        labels: ["运行中", "已暂停", "已停止"],
        colors: [
          "rgba(75, 192, 192, 1)",
          "rgba(255, 205, 86, 1)",
          "rgba(255, 99, 132, 1)"
        ]
      },
      processesChart: {
        type: "bar",
        labels: ["运行中", "睡眠中", "总计"],
        colors: [
          "rgba(75, 192, 192, 1)",
          "rgba(54, 162, 235, 1)",
          "rgba(255, 206, 86, 1)"
        ]
      }
    };

    Object.keys(chartConfigs).forEach((chartId) => {
      const ctx = document.getElementById(chartId).getContext("2d");
      const config = chartConfigs[chartId];

      if (chartId === "dockerContainersChart") {
        this.charts[chartId] = new Chart(ctx, {
          type: "doughnut",
          data: {
            labels: config.labels,
            datasets: [
              {
                data: [0, 0, 0],
                backgroundColor: config.colors,
                borderColor: config.colors.map((color) =>
                  color.replace("1)", "1)")
                ),
                borderWidth: 1
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: "bottom"
              },
              tooltip: {
                callbacks: {
                  label: function (context) {
                    const label = context.label || "";
                    const value = context.raw || 0;
                    const total = context.dataset.data.reduce(
                      (a, b) => a + b,
                      0
                    );
                    const percentage =
                      total > 0 ? Math.round((value / total) * 100) : 0;
                    return `${label}: ${value} (${percentage}%)`;
                  }
                }
              }
            }
          }
        });
      } else if (chartId === "processesChart") {
        this.charts[chartId] = new Chart(ctx, {
          type: "bar",
          data: {
            labels: config.labels,
            datasets: [
              {
                label: "进程数量",
                data: [0, 0, 0],
                backgroundColor: config.colors,
                borderColor: config.colors.map((color) =>
                  color.replace("1)", "1)")
                ),
                borderWidth: 1
              }
            ]
          },
          options: this.getChartOptions("数量")
        });
      } else if (chartId === "loadChart") {
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
      this.updateInfoCards();
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

    // Docker 容器状态图表（使用最新数据）
    this.updateDockerChart();

    // 进程状态图表（使用最新数据）
    this.updateProcessesChart();
  }

  updateChart(chartId, labels, data) {
    if (this.charts[chartId]) {
      this.charts[chartId].data.labels = labels;
      this.charts[chartId].data.datasets[0].data = data;
      this.charts[chartId].update();
    }
  }

  // 更新 Docker 图表（使用最新数据点）
  updateDockerChart() {
    if (this.data.length === 0 || !this.charts.dockerContainersChart) return;

    const latest = this.data[this.data.length - 1];

    if (latest.docker) {
      const dockerData = latest.docker;
      this.charts.dockerContainersChart.data.datasets[0].data = [
        dockerData.running || 0,
        dockerData.paused || 0,
        dockerData.stopped || 0
      ];
      this.charts.dockerContainersChart.update();

      // 显示 Docker 图表
      document.getElementById(
        "dockerContainersChart"
      ).parentElement.style.display = "block";
    } else {
      // 隐藏 Docker 图表（如果没有 Docker 数据）
      document.getElementById(
        "dockerContainersChart"
      ).parentElement.style.display = "none";
    }
  }

  // 更新进程状态图表（使用最新数据点）
  updateProcessesChart() {
    if (this.data.length === 0 || !this.charts.processesChart) return;

    const latest = this.data[this.data.length - 1];

    if (latest.processes) {
      const processesData = latest.processes;
      this.charts.processesChart.data.datasets[0].data = [
        processesData.running || 0,
        processesData.sleeping || 0,
        processesData.total || 0
      ];
      this.charts.processesChart.update();
    }
  }

  // 更新系统信息卡片
  updateInfoCards() {
    if (this.data.length === 0) return;

    const latest = this.data[this.data.length - 1];

    // 运行时间
    if (latest.uptime) {
      const hours = Math.round(latest.uptime / 3600);
      this.updateInfoCard("uptime", `${hours}小时`);
    }

    // Docker 状态和容器信息
    if (latest.docker) {
      this.updateInfoCard("dockerStatus", "运行中");
      this.updateInfoCard(
        "containers",
        latest.docker.containers?.toString() || "0"
      );
      this.updateInfoCard(
        "runningContainers",
        latest.docker.running?.toString() || "0"
      );
    } else {
      this.updateInfoCard("dockerStatus", "未运行");
      this.updateInfoCard("containers", "0");
      this.updateInfoCard("runningContainers", "0");
    }

    // 进程信息
    if (latest.processes) {
      this.updateInfoCard(
        "processes",
        latest.processes.total?.toString() || "0"
      );
    }

    // 系统负载
    if (latest.cpu && latest.cpu.load1) {
      this.updateInfoCard("load", latest.cpu.load1.toFixed(2));
    }
  }

  updateInfoCard(cardId, value) {
    const cardElement = document.getElementById(`card-${cardId}`);
    if (cardElement) {
      const valueElement = cardElement.querySelector(".info-value");
      if (valueElement) {
        valueElement.textContent = value;
      }
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
