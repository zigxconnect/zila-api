import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';
import { env } from './env';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Zila API - Zigex Agent',
      version: '1.0.0',
      description: 'API documentation for the Zigex Terminal Agent.',
      contact: {
        name: 'Zigex Team',
        url: 'https://zigexconnect.com',
      },
    },
    servers: [
      ...(env.RENDER_EXTERNAL_URL ? [{
        url: env.RENDER_EXTERNAL_URL,
        description: 'Production server',
      }] : []),
      {
        url: `http://localhost:${env.PORT}`,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token obtained from Zigex Auth. Format: Bearer <token>',
        },
      },
      schemas: {
        Cohort: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'cmui7022b00001q8kvt07u5f6' },
            name: { type: 'string', example: 'SEED Summer Internship Program 2026 - Machine Learning/AI' },
            department: { type: 'string', example: 'Machine Learning/AI' },
            programId: { type: 'string' },
            programType: { type: 'string', example: 'internship' },
            level: { type: 'string', example: 'intermediate' },
            supervisorId: { type: 'string' },
            supervisorName: { type: 'string', example: 'Leonhard Hopeful' },
            supervisorEmail: { type: 'string', example: 'leonhardkwahle@gmail.com' },
            githubRepoUrl: { type: 'string', example: 'https://github.com/zigxconnect/course-ai-materials' },
            isActive: { type: 'boolean', example: true },
          },
        },
        PeerMember: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            studentId: { type: 'string' },
            studentName: { type: 'string', example: 'Awa MEZOH' },
            studentEmail: { type: 'string', example: 'jenniferpackinson@gmail.com' },
            role: { type: 'string', example: 'intern' },
            status: { type: 'string', example: 'active' },
            totalPoints: { type: 'number', example: 150 },
          },
        },
        SupervisorAdmin: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string', example: 'Leonhard Hopeful' },
            email: { type: 'string', example: 'leonhardkwahle@gmail.com' },
            role: { type: 'string', example: 'supervisor' },
            isAdmin: { type: 'boolean', example: true },
          },
        },
        BluetoothChatContext: {
          type: 'object',
          properties: {
            chatRoomId: { type: 'string', example: 'zigex-cohort-cmui7022b00001q8kvt07u5f6' },
            cohortId: { type: 'string' },
            cohortName: { type: 'string' },
            department: { type: 'string' },
            supervisorAdmin: { $ref: '#/components/schemas/SupervisorAdmin' },
            members: {
              type: 'array',
              items: { $ref: '#/components/schemas/PeerMember' },
            },
            totalMembers: { type: 'number', example: 16 },
          },
        },
      },
    },
  },
  apis: [
    './src/routes/*.ts',
    './src/index.ts',
    './dist/routes/*.js',
    './dist/index.js',
  ],
};

const swaggerSpec = swaggerJsdoc(options);

export const setupSwagger = (app: Express) => {
  // Swagger Page
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: "Zila API Docs"
  }));

  // Docs in JSON format
  app.get('/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  console.log(`📝 Swagger docs available at http://localhost:${env.PORT}/docs`);
};
