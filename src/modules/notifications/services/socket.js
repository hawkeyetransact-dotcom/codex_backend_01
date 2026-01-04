import jwt from "jsonwebtoken";

let ioInstance = null;

const parseCookieToken = (cookieHeader = "") => {
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, v.join("=")];
    })
  );
  return cookies["authToken"] || null;
};

export const initNotificationSocket = (io) => {
  ioInstance = io;

  io.of("/").use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token ||
        parseCookieToken(socket.handshake.headers?.cookie || "");
      if (!token) return next(new Error("Unauthorized"));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.data.userId = decoded.id;
      socket.data.tenantId = decoded.tenantId || decoded.tenant_id || null;
      return next();
    } catch (err) {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const tenantId = socket.data.tenantId;
    const userId = socket.data.userId;
    if (tenantId && userId) {
      socket.join(`${tenantId}:${userId}`);
    }
    socket.on("disconnect", () => {});
  });
};

export const getIO = () => ioInstance;

export const emitNotification = (tenantId, userId, notification) => {
  if (!ioInstance || !tenantId || !userId) return;
  ioInstance.to(`${tenantId}:${userId}`).emit("notification:new", notification);
};
