import express from "express";
import dotenv from "dotenv";
import { connectDatabase } from "./config/database.js";
import authRoutes from "./routes/authRoutes.js";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger.js";
import supplierSiteRoutes from "./routes/supplierSiteRoutes.js";
import supplierProfileRoutes from "./routes/supplierProfileRoutes.js";
import supplierProfileUserRoutes from "./routes/supplierUserProfileRoutes.js";
import supplierProductRoutes from "./routes/supplierProductRoutes.js";
import buyerRoutes from "./routes/buyerRoutes.js";
import auditRequestRoutes from "./routes/auditRequestRoutes.js";
import auditorRoutes from "./routes/auditorRoutes.js";
import commonRoutes from "./routes/commonRoutes.js";
import questionaireRoutes from "./routes/questionaireRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import ingestRoutes from "./routes/ingestRoutes.js";
import extractRoutes from "./routes/extractRoutes.js";




dotenv.config();
import cors from "cors";

// ...
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use("/api/auth", authRoutes);
app.use("/api/supplier-sites", supplierSiteRoutes);
app.use("/api/profile", supplierProfileRoutes);
app.use("/api/supplier-products", supplierProductRoutes);
app.use("/api/profile/supplier-user", supplierProfileUserRoutes);
app.use("/api/buyer", buyerRoutes);
app.use("/api/auditor", auditorRoutes);
app.use("/api/audit-requests/", auditRequestRoutes);
app.use("/api", commonRoutes);
app.use("/api/template-questions", questionaireRoutes);
app.use("/api/notifications", notificationRoutes)
app.use("/api/extract", extractRoutes);

app.get("/", (req, res) => {
  res.send(`Server is Up 🚀`);
});

connectDatabase();

export default app;
