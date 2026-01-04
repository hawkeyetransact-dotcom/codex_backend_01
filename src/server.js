import app from "./app.js";
import http from "http";
import { Server } from "socket.io";
import { initNotificationSocket } from "./modules/notifications/services/socket.js";

const PORT = process.env.PORT || 8000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [/^http:\/\/localhost:3000$/, /^http:\/\/localhost:3001$/, /\.hawkeyesmart\.com$/],
    credentials: true,
  },
});

initNotificationSocket(io);

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
