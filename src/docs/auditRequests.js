export const auditRequestsDocs = {
  tags: [
    {
      name: "Audit Requests",
      description: "APIs for fetching audit requests by role",
    },
  ],
  paths: {
    "/api/audit-requests/buyer": {
      get: {
        summary: "Get audit requests created by the current buyer",
        tags: ["Audit Requests"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
            description: "Page number",
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 10 },
            description: "Number of records per page",
          },
        ],
        responses: {
          200: {
            description: "Audit requests retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    requests: {
                      type: "array",
                      items: { $ref: "#/components/schemas/AuditRequestMaster" },
                    },
                    totalRecords: { type: "integer", example: 50 },
                    totalPages: { type: "integer", example: 5 },
                    currentPage: { type: "integer", example: 1 },
                  },
                },
              },
            },
          },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/audit-requests/auditor": {
      get: {
        summary: "Get audit requests assigned to the current auditor",
        tags: ["Audit Requests"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
            description: "Page number",
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 10 },
            description: "Number of records per page",
          },
        ],
        responses: {
          200: {
            description: "Audit requests retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    requests: {
                      type: "array",
                      items: { $ref: "#/components/schemas/AuditRequestMaster" },
                    },
                    totalRecords: { type: "integer", example: 30 },
                    totalPages: { type: "integer", example: 3 },
                    currentPage: { type: "integer", example: 1 },
                  },
                },
              },
            },
          },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/audit-requests/supplier": {
      get: {
        summary: "Get audit requests for which the current supplier is responsible",
        tags: ["Audit Requests"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
            description: "Page number",
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 10 },
            description: "Number of records per page",
          },
        ],
        responses: {
          200: {
            description: "Audit requests retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    requests: {
                      type: "array",
                      items: { $ref: "#/components/schemas/AuditRequestMaster" },
                    },
                    totalRecords: { type: "integer", example: 20 },
                    totalPages: { type: "integer", example: 2 },
                    currentPage: { type: "integer", example: 1 },
                  },
                },
              },
            },
          },
          500: { description: "Internal server error" },
        },
      },
    },

    "/api/audit-requests/requestSingleAudit": {
      get: {
        summary: "Get Request Details for which the current request is responsible",
        tags: ["Audit Requests"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "request_id",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Request ID",
          },
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
            description: "Page number",
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 10 },
            description: "Number of records per page",
          },
        ],
        responses: {
          200: {
            description: "Audit requests details retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    requests: {
                      type: "array",
                      items: { $ref: "#/components/schemas/AuditRequestMaster" },
                    },
                    totalRecords: { type: "integer", example: 20 },
                    totalPages: { type: "integer", example: 2 },
                    currentPage: { type: "integer", example: 1 },
                  },
                },
              },
            },
          },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/audit-requests/upload-pastaudit": {
      post: {
        summary: "Upload a PDF file for audit",
        tags: ["Audit Upload"],
        security: [
          {
            bearerAuth: []
          }
        ],
        requestBody: {
          "required": true,
          "content": {
            "multipart/form-data": {
              "schema": {
                "type": "object",
                "properties": {
                  "file": {
                    "type": "string",
                    "format": "binary",
                    "description": "PDF file to upload"
                  }
                },
                "required": ["file"]
              }
            }
          }
        },
        responses: {
          "200": {
            "description": "File uploaded successfully",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "boolean",
                      "example": true
                    },
                    "message": {
                      "type": "string",
                      "example": "File uploaded successfully"
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "No file uploaded",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "boolean",
                      "example": false
                    },
                    "message": {
                      "type": "string",
                      "example": "No file uploaded"
                    }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Internal server error"
          }
        }
      }
    },

    "/api/audit-requests/get-pastaudit": {
      get: {
        summary: "Get Past Questions Details for which the current request is responsible",
        tags: ["Audit Requests"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "supplier_id",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Supplier ID",
          },
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
            description: "Page number",
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 10 },
            description: "Number of records per page",
          },
        ],
        responses: {
          200: {
            description: "Past Audit requests questions retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    requests: {
                      type: "array",
                      items: { $ref: "#/components/schemas/AuditRequestMaster" },
                    },
                    totalRecords: { type: "integer", example: 20 },
                    totalPages: { type: "integer", example: 2 },
                    currentPage: { type: "integer", example: 1 },
                  },
                },
              },
            },
          },
          500: { description: "Internal server error" },
        },
      },
    },

  },
};
