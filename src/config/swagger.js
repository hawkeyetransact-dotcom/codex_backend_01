import swaggerJSDoc from "swagger-jsdoc";
import { swaggerDocs } from "../docs/index.js";

const options = {
  swaggerDefinition: swaggerDocs,
  apis: [],
};

export const swaggerSpec = swaggerJSDoc(options);
