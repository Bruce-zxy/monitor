#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

console.log("🚀 Server Monitor System - Post Install Setup");

// 检查是否全局安装
const isGlobal =
  process.argv.includes("-g") || process.argv.includes("--global");

if (isGlobal) {
  console.log("📦 Global installation detected");
  console.log("✅ CLI commands are now available:");
  console.log("   server-monitor-agent    - Start monitoring agent");
  console.log("   server-monitor-server   - Start monitoring server");
} else {
  console.log("📦 Local installation detected");
  console.log("✅ You can use the commands via npx:");
  console.log("   npx server-monitor-agent");
  console.log("   npx server-monitor-server");
}

console.log("\n📚 Usage examples:");
console.log(
  "   server-monitor-agent --host monitor.example.com --interval 15000"
);
console.log(
  '   server-monitor-server --mongo-uri "mongodb://localhost:27017/monitoring"'
);
