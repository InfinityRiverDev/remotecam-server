const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);

// Создаем WebSocket сервер на пути /ws
const wss = new WebSocketServer({ server, path: '/ws' });

// Хранилище для подключенных клиентов (телефонов и браузеров)
const clients = new Set();

wss.on('connection', (ws, req) => {
  // Получаем роль клиента из URL (phone или web)
  const urlParams = new URL(req.url, 'http://localhost').searchParams;
  const role = urlParams.get('role') || 'unknown';
  
  ws.role = role;
  clients.add(ws);
  console.log(`[${role}] connected. Total: ${clients.size}`);

  // Обработка входящих сообщений
  ws.on('message', (data) => {
    // Пересылаем сообщение всем остальным клиентам
    for (const client of clients) {
      if (client !== ws && client.readyState === 1) { // 1 означает OPEN
        client.send(data.toString());
      }
    }
  });

  // Обработка отключения
  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[${role}] disconnected. Total: ${clients.size}`);
  });
});

// Render автоматически передает порт через переменную окружения PORT
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
