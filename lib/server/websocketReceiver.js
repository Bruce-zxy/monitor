const WebSocket = require("ws");

class WebSocketReceiver {
  constructor(server, metricModel) {
    this.wss = new WebSocket.Server({ server });
    this.Metric = metricModel;
  }

  start() {
    this.wss.on("connection", (ws) => {
      console.log("WebSocket client connected");

      ws.on("message", async (message) => {
        try {
          const data = JSON.parse(message);

          if (data.type === "metrics") {
            const metric = new this.Metric({
              ...data.metrics,
              receivedAt: new Date()
            });
            await metric.save();

            console.log(
              `WebSocket: Received metrics from ${data.metrics.agentId}`
            );

            // 发送确认
            ws.send(
              JSON.stringify({
                type: "ack",
                timestamp: data.metrics.timestamp
              })
            );
          }
        } catch (error) {
          console.error("WebSocket: Error processing message:", error);
        }
      });

      ws.on("close", () => {
        console.log("WebSocket client disconnected");
      });
    });
  }
}

module.exports = WebSocketReceiver;
