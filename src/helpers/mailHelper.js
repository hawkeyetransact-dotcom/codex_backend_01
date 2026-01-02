import transporter from "../config/sesTransporter.js";

/**
 * Sends a mail using AWS SES transporter
 * @param {string} to - The intended recipient of the email
 * @param {string} subject - The subject of the email
 * @param {string} message - The body of the email
 * @example
 * sendMail("harshits@instaacoders.com", "Welcome!", "Thanks for registering!")
 */
export const sendMail = async (to, subject, message) => {
  const receiver = "harshits@instaacoders.com";
  const mailOptions = {
    from: "Hawkeye Smart <no-reply@mail.hawkeyesmart.com>",
    to,
    subject,
    text: message,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", info.response);
  } catch (error) {
    console.error("Email failed to send:", error.message);
  }
};
