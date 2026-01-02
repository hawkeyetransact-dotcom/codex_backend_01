export const notificationsDocs = {
  tags: [
    {
      name: "Notifications",
      description: "APIs for managing and retrieving user notifications",
    },
  ],
  paths: {
    "/api/notifications/getdata": {
      get: {
        summary: "Get a paginated list of notifications",
        tags: ["Notifications"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "userId",
            in: "query",
            required: true,
            schema: { type: "string", example: "64a8d52f72f5d8202ad23b1e" },
            description: "The ID of the user to fetch notifications for",
          },
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1, example: 1 },
            description: "Page number for pagination",
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 10, example: 10 },
            description: "Number of notifications per page",
          },
        ],
        responses: {
          200: {
            description: "List of notifications retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    notifications: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          _id: { type: "string", example: "6632a982fc13ae2e4c000001" },
                          senderId: { type: "string" },
                          receiverId: { type: "string" },
                          senderRole: { type: "string", enum: ["buyer", "auditor", "supplier"] },
                          receiverRole: { type: "string", enum: ["buyer", "auditor", "supplier"] },
                          message: { type: "string", example: "You have a new audit request." },
                          link: { type: "string", example: "/auditor/audit-requests/abc123" },
                          read: { type: "boolean", example: false },
                          createdAt: { type: "string", format: "date-time" },
                        },
                      },
                    },
                    totalRecords: { type: "integer", example: 50 },
                    totalPages: { type: "integer", example: 5 },
                    currentPage: { type: "integer", example: 1 },
                  },
                },
              },
            },
          },
          400: {
            description: "Missing or invalid userId",
          },
          500: {
            description: "Internal server error",
          },
        },
      },
    },
  },
};
