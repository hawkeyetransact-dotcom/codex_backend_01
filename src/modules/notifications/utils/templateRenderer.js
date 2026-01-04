import fs from "fs";
import path from "path";
import handlebars from "handlebars";
import he from "he";

const templatesDir = path.join(process.cwd(), "src", "modules", "notifications", "templates");

// Register partial for layout
const layoutPath = path.join(templatesDir, "layout.hbs");
handlebars.registerPartial("layout", fs.readFileSync(layoutPath, "utf8"));

export const renderTemplate = (templateName, data) => {
  const filePath = path.join(templatesDir, `${templateName}.hbs`);
  const source = fs.readFileSync(filePath, "utf8");
  const tpl = handlebars.compile(source);
  const safeMessage = he.escape(data.message || "");
  const html = tpl({
    ...data,
    messageHtml: safeMessage.replace(/\n/g, "<br/>"),
    actionLabel: data.action?.label || "View",
    actionUrl: data.action?.url,
  });
  const text = `${data.header || data.subject}\n\n${data.message || ""}\n${data.action?.url ? `\n${data.action.label}: ${data.action.url}` : ""}`;
  return { html, text };
};
