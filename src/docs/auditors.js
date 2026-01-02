
export const auditorsDocs = {
  tags: [
    {
      name: "Auditors",
      description: "APIs for fetching auditors in the system (TODO)",
    },
  ],
  paths: {
    "/api/auditor/profile/create": {
      post: {
        summary: "Create a auditor profile",
        tags: ["Auditors"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AuditorProfile" },
            },
          },
        },
        responses: {
          201: { description: "Profile created successfully" },
          400: { description: "Validation error" },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/auditor/profile/update": {
      put: {
        summary: "Update auditor profile",
        tags: ["Auditors"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AuditorProfile" },
            },
          },
        },
        responses: {
          200: { description: "Profile updated successfully" },
          404: { description: "Profile not found" },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/template-questions/questions/{tempid}": {
      get: {
        summary: "Get a paginated list of template questions",
        tags: ["Template Questions"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "tempid",
            in: "path",
            required: true,
            schema: { type: "number" },
            description: "Template Id",
          },
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1, example: 1 },
            description: "Page number",
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 10, example: 10 },
            description: "Number of records per page",
          },
        ],
        responses: {
          200: {
            description: "List of template questions retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    auditors: {
                      type: "array",
                      items: { $ref: "#/components/schemas/User" },
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
    "/api/auditor/create-draft-questions": {
      post: {
        summary: "Create or update draft audit questions",
        tags: ["Template Questions"],
        security: [
          {
            "bearerAuth": []
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  auditRequestId: {
                    "type": "string",
                    "description": "ID of the audit request",
                    "example": "60d5f99b8a4b2c001c8e4f0a"
                  },
                  questions: {
                    "type": "array",
                    "description": "List of audit questions to create or update",
                    "items": {
                      "type": "object",
                      "properties": {
                        question_id: {
                          "type": "string",
                          "description": "Unique identifier for the question",
                          "example": "q123"
                        },
                        question: {
                          "type": "string",
                          "description": "Text of the audit question",
                          "example": "Is the equipment calibrated?"
                        },
                        categoryName: {
                          "type": "string",
                          "description": "Category name of the question",
                          "example": "Equipment"
                        },
                        categoryId: {
                          "type": "string",
                          "description": "ID of the question's category",
                          "example": "c456"
                        },
                        templateId: {
                          "type": "number",
                          "description": "Template ID to which the question belongs",
                          "example": 1
                        }
                      }
                    }
                  }
                },
                "required": ["auditRequestId", "questions"]
              }
            }
          }
        },
        responses: {
          200: {
            "description": "Audit questions processed successfully",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string",
                      "example": "Audit questions processed successfully."
                    },
                    "bulkResult": {
                      "type": "object",
                      "description": "MongoDB bulk operation result"
                    }
                  }
                }
              }
            }
          },
          403: {
            "description": "Audit request does not exist",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "Audit request does not exist."
                    }
                  }
                }
              }
            }
          },
          500: {
            "description": "Internal server error",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "Internal server error"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },

    "/api/auditor/audit-questionsId": {
      get: {
        summary: "Get Audit Questions",
        tags: ["Template Questions"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "auditRequestId",
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
            description:
              "Audit Template Questions retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    mappings: {
                      type: "array",
                      items: {
                        $ref: "#/components/schemas/ProductSiteMapping",
                      },
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

    "/api/auditor/audit-question/update-data/{auditRequestId}": {
      "put": {
        "summary": "Update draft audit questions",
        "tags": ["Template Questions"],
        "security": [
          {
            "bearerAuth": []
          }
        ],
        parameters: [
          {
            name: "auditRequestId",
            in: "path",
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
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["auditRequestId", "responses", "status"],
                "properties": {
                  responses: {
                    "type": "object",
                    "description": "Map of question responses",
                    "additionalProperties": {
                      "type": "object",
                      "properties": {
                        YesNoAnswers: {
                          "type": "string",
                          "enum": ["Yes", "No", "NA"],
                          "example": "Yes"
                        },
                        textResponse: {
                          "type": "string",
                          "example": "Good process"
                        },
                        docUrls: {
                          "type": "string",
                          "format": "binary",
                          "description": "Optional file attachment"
                        }
                      }
                    },
                    "example": {
                      "680dc023d4d2681d60a2daca": {
                        YesNoAnswers: "Yes",
                        textResponse: "Good process",
                        docUrls: ""
                      },
                      "680dc023d4d2681d60a2dacb": {
                        YesNoAnswers: "NA",
                        textResponse: "Pending verification",
                        docUrls: ""
                      }
                    }
                  },
                  "status": {
                    "type": "string",
                    "enum": [
                      "supplier_draft",
                      "supplier_submitted",
                      "auditor_draft",
                      "auditor_submitted"
                    ],
                    "example": "supplier_draft"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": { "description": "Audit responses updated successfully" },
          "403": { "description": "Audit request not found" },
          "500": { "description": "Internal server error" }
        }
      }
    }
  },

};
