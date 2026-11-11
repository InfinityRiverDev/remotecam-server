const express = require("express");
const http = require("http");
const crypto = require("crypto");
const { WebSocketServer, WebSocket } = require("ws");

const app = express();
const server = http.createServer(app);

const wss = new WebSocketServer({
  server,
  path: "/ws",
  maxPayload: 256 * 1024
});

const ACCESS_KEY = process.env.ACCESS_KEY;

if (!ACCESS_KEY || ACCESS_KEY.length < 24) {
  console.error(
    "Ошибка: задайте ACCESS_KEY длиной не менее 24 символов."
  );
  process.exit(1);
}

let phone = null;
let viewer = null;

app.get("/test", (req, res) => {
  res.send("Сервер работает");
});

function keysMatch(value) {
  if (typeof value !== "string") return false;

  const received = Buffer.from(value, "utf8");
  const expected = Buffer.from(ACCESS_KEY, "utf8");

  return received.length === expected.length &&
    crypto.timingSafeEqual(received, expected);
}

function sendJson(client, message) {
  if (client && client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(message));
  }
}

function sendStatus() {
  const status = {
    type: "status",
    phoneConnected: phone?.readyState === WebSocket.OPEN,
    viewerConnected: viewer?.readyState === WebSocket.OPEN
  };

  sendJson(phone, status);
  sendJson(viewer, status);
}

wss.on("connection", (socket) => {
  console.log("Новое WebSocket-подключение, ожидаем авторизацию");

  let role = null;

  const authTimeout = setTimeout(() => {
    if (!role) {
      socket.close(1008, "Authentication timeout");
    }
  }, 10000);

  socket.on("error", (error) => {
    console.error("Ошибка WebSocket:", error.message);
  });

  socket.on("message", (data, isBinary) => {
    if (isBinary) {
      socket.close(1003, "Text messages only");
      return;
    }

    let message;

    try {
      message = JSON.parse(data.toString());
    } catch {
      socket.close(1007, "Invalid JSON");
      return;
    }

    if (!role) {
      if (
        message.type !== "auth" ||
        !["phone", "viewer"].includes(message.role) ||
        !keysMatch(message.key)
      ) {
        socket.close(1008, "Authentication failed");
        return;
      }

      if (
        (message.role === "phone" && phone) ||
        (message.role === "viewer" && viewer)
      ) {
        socket.close(1008, "Role already connected");
        return;
      }

      clearTimeout(authTimeout);
      role = message.role;

      if (role === "phone") {
        phone = socket;
      } else {
        viewer = socket;
      }

      console.log(`[${role}] подключён`);

      sendJson(socket, {
        type: "auth_ok",
        role
      });

      sendStatus();
      return;
    }

    const allowedTypes =
      role === "viewer"
        ? ["offer", "candidate", "switch_camera"]
        : ["answer", "candidate"];

    if (!allowedTypes.includes(message.type)) {
      return;
    }

    const recipient = role === "phone" ? viewer : phone;

    if (!recipient || recipient.readyState !== WebSocket.OPEN) {
      sendJson(socket, {
        type: "peer_unavailable"
      });
      return;
    }

    sendJson(recipient, message);
  });

socket.on("close", (code, reason) => {
    console.log(
        "Соединение закрыто:",
        code,
        reason.toString()
    );
    clearTimeout(authTimeout);

    if (phone === socket) phone = null;
    if (viewer === socket) viewer = null;

    if (role) {
      console.log(`[${role}] отключён`);
    }

    sendStatus();
  });
});

const port = Number(process.env.PORT) || 8080;

server.listen(port, "0.0.0.0", () => {
  console.log(`Сервер запущен на порту ${port}`);
});