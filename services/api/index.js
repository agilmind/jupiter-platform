const express = require('express');
const { ApolloServer, gql } = require('apollo-server-express');
const jwt = require('jsonwebtoken');
const rabbitmq = require('./rabbitmq');

// Definición del esquema GraphQL
const typeDefs = gql`
  type Query {
    hello: String
    status: ServerStatus
  }

  type Mutation {
    sendMessage(message: String!, priority: String): MessageResponse
    createTask(taskType: String!, parameters: JSON): MessageResponse
  }

  type ServerStatus {
    status: String
    timestamp: String
    message: String
  }

  type MessageResponse {
    success: Boolean!
    message: String
  }

  scalar JSON
`;

// Resolvers para las consultas
const resolvers = {
  Query: {
    hello: () => 'Bienvenido a la API de Jupiter!',
    status: () => ({
      status: 'online',
      timestamp: new Date().toISOString(),
      message: 'El servidor está funcionando correctamente'
    })
  },
  Mutation: {
    sendMessage: async (_, { message, priority = 'normal' }) => {
      try {
        // Enviar mensaje simple
        const success = await rabbitmq.sendMessage({
          type: 'message',
          data: {
            content: message,
            priority,
            timestamp: new Date().toISOString()
          }
        });

        return {
          success,
          message: success ? 'Mensaje enviado correctamente' : 'Error al enviar mensaje'
        };
      } catch (error) {
        console.error(`Error en mutación sendMessage: ${error.message}`);
        return {
          success: false,
          message: `Error: ${error.message}`
        };
      }
    },
    createTask: async (_, { taskType, parameters = {} }) => {
      try {
        // Crear una tarea más compleja
        const taskId = Date.now().toString();
        const success = await rabbitmq.sendMessage({
          type: 'task',
          data: {
            task_id: taskId,
            task_type: taskType,
            parameters,
            created_at: new Date().toISOString()
          }
        });

        return {
          success,
          message: success ? `Tarea creada con ID: ${taskId}` : 'Error al crear tarea'
        };
      } catch (error) {
        console.error(`Error en mutación createTask: ${error.message}`);
        return {
          success: false,
          message: `Error: ${error.message}`
        };
      }
    }
  }
};

// Función principal asíncrona para iniciar el servidor
async function startServer() {
  // Crear app Express
  const app = express();

  // Crear servidor Apollo
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: ({ req }) => {
      // Ejemplo básico de autenticación con JWT
      const token = req.headers.authorization || '';

      // Aquí se podría implementar la validación del token
      // y devolver el usuario autenticado

      return { token };
    }
  });

  // Iniciar Apollo Server
  await server.start();

  // Aplicar middleware de Apollo a Express
  server.applyMiddleware({ app });

  // Ruta básica para verificar que la API está funcionando
  app.get('/', (req, res) => {
    res.send('API de Jupiter funcionando. Accede a /graphql para usar el playground de GraphQL.');
  });

  // Iniciar el servidor
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
    console.log(`🚀 GraphQL disponible en http://localhost:${PORT}${server.graphqlPath}`);
  });
}

// Iniciar el servidor
startServer().catch(error => {
  console.error('Error al iniciar el servidor:', error);
});