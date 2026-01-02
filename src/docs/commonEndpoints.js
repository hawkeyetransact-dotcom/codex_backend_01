export const commonEndpointsDocs = {
    tags: [
      {
        name: "Common End Points",
        description: "APIs for common use",
      },
    ], 
    paths: {
      "/api/upload-file": {
        post: {
          summary: "Upload file to S3 bucket",
          tags: ["Common End Points"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": { 
                schema: {
                  type: "object",
                  properties: {
                    file: {
                      type: "string",
                      format: "binary",
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "File uploaded successfully" },
            400: { description: "Validation error" },
            500: { description: "Internal server error" },
          },
        },
      },
      
    },
  };
  