import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const typeDefs = `#graphql
  type Person {
    id: Int!
    name: String!
  }

  type Query {
    hello: String
    getPerson(id: Int!): Person
    getAllPersons: [Person!]!
  }

  type Mutation {
    updatePersonName(id: Int!, name: String!): Person
    createPerson(name: String!): Person
  }
`;

const resolvers = {
  Query: {
    hello: () => 'Hello World from apollo-prisma Apollo Server!',
    getPerson: async (_, { id }, { prisma }) => {
      return prisma.person.findUnique({
        where: { id },
      });
    },
    getAllPersons: async (_, __, { prisma }) => {
      return prisma.person.findMany();
    },
  },
  Mutation: {
    updatePersonName: async (_, { id, name }, { prisma }) => {
      return prisma.person.update({
        where: { id },
        data: { name },
      });
    },
    createPerson: async (_, { name }, { prisma }) => {
      return prisma.person.create({
        data: { name },
      });
    },
  },
};

async function bootstrap() {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
  });

  const { url } = await startStandaloneServer(server, {
    context: async () => ({ prisma }),
    listen: { port: parseInt(process.env.PORT || '4000') },
  });

  console.log(`🚀 Server ready at ${url}`);
  console.log(`Try your first query: { hello }`);
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
