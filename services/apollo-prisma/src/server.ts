import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { PrismaClient } from '@prisma/client';

// Cambio en BASE con otra frase nueva

const prisma = new PrismaClient();

const typeDefs = `#graphql
  type Query {
    hello: String
  }
`;

const resolvers = {
  Query: {
    hello: () => 'Hello World from apollo-prisma Apollo Server!',
  },
};

async function bootstrap() {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
  });

  const { url } = await startStandaloneServer(server, {
    context: async () => ({ prisma }),
    listen: { port: parseInt(process.env.PORT || '4000') }
  });

  console.log(`🚀 Server ready at ${url}`);
  console.log(`Try your first query: { hello }`);
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
