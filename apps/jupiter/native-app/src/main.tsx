// src/main.tsx
import React from 'react';
import { ApolloClient, InMemoryCache, ApolloProvider } from '@apollo/client';
import { AppRegistry } from 'react-native';
import App from './App';

// Configurar cliente Apollo
const client = new ApolloClient({
  uri: 'http://localhost:4000/graphql', // En ambiente real, usar configuración adecuada para desarrollo vs producción
  cache: new InMemoryCache(),
});

// Componente raíz con Apollo
const Root = () => (
  <ApolloProvider client={client}>
    <App />
  </ApolloProvider>
);

// Registrar la aplicación
AppRegistry.registerComponent('NativeApp', () => Root);
