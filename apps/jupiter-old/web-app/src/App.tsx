import React, { useState, useEffect } from 'react';
import { GraphQLClient } from 'graphql-request';
import './App.css';

// Definir tipos para nuestros datos
interface Process {
  id: string;
  content: string;
  completed: boolean;
  result?: string;
}

interface CreateProcessResponse {
  createProcess: Process;
}

interface GetProcessResponse {
  getProcess: Process;
}

interface HealthCheckResponse {
  healthCheck: string;
}

// Definir las consultas GraphQL
const CREATE_PROCESS_MUTATION = `
  mutation CreateProcess($content: String!) {
    createProcess(content: $content) {
      id
      content
      completed
    }
  }
`;

const GET_PROCESS_QUERY = `
  query GetProcess($id: ID!) {
    getProcess(id: $id) {
      id
      content
      completed
      result
    }
  }
`;

const HEALTH_CHECK_QUERY = `
  query HealthCheck {
    healthCheck
  }
`;

// Crear cliente GraphQL
const graphqlEndpoint = window.location.origin + '/graphql';
const client = new GraphQLClient(graphqlEndpoint);

function App() {
  const [input, setInput] = useState('');
  const [processId, setProcessId] = useState('');
  const [processData, setProcessData] = useState<Process | null>(null);
  const [healthData, setHealthData] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [processLoading, setProcessLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Verificar estado del servidor
  useEffect(() => {
    const checkHealth = async () => {
      console.log('Intentando conectar a:', graphqlEndpoint);
      try {
        const data = await client.request<HealthCheckResponse>(HEALTH_CHECK_QUERY);
        console.log('Respuesta exitosa:', data);
        setHealthData(data.healthCheck);
      } catch (err) {
        console.error('Error completo:', err);
        // Mostrar error más detallado
        let errorMessage = 'No se pudo conectar al servidor';
        if (err instanceof Error) {
          errorMessage += `: ${err.message}`;
        }
        setError(errorMessage);
      }
    };

    checkHealth();
  }, []);

  // Consultar estado del proceso
  useEffect(() => {
    if (!processId) return;

    const fetchProcess = async () => {
      setProcessLoading(true);
      try {
        const data = await client.request<GetProcessResponse>(GET_PROCESS_QUERY, { id: processId });
        setProcessData(data.getProcess);
      } catch (err) {
        console.error('Error al obtener proceso:', err);
        setError('Error al obtener el estado del proceso');
      } finally {
        setProcessLoading(false);
      }
    };

    fetchProcess();

    // Configurar intervalo para actualizar el estado
    const interval = setInterval(fetchProcess, 1000);
    return () => clearInterval(interval);
  }, [processId]);

  // Enviar mensaje
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setCreateLoading(true);
    setError(null);

    try {
      const data = await client.request<CreateProcessResponse>(CREATE_PROCESS_MUTATION, {
        content: input,
      });
      setProcessId(data.createProcess.id);
      setInput('');
    } catch (err) {
      console.error('Error al crear proceso:', err);
      setError('Error al enviar el mensaje');
    } finally {
      setCreateLoading(false);
    }
  };

  // Refrescar estado manualmente
  const refetch = async () => {
    if (!processId) return;

    setProcessLoading(true);
    try {
      const data = await client.request<GetProcessResponse>(GET_PROCESS_QUERY, { id: processId });
      setProcessData(data.getProcess);
    } catch (err) {
      console.error('Error al actualizar proceso:', err);
    } finally {
      setProcessLoading(false);
    }
  };

  return (
    <div className="container">
      <header>
        <h1>Sistema de Procesamiento</h1>
        {healthData && <p className="health-status">Estado: {healthData}</p>}
        {error && (
          <p className="error-status">
            Error: {error}
            <button
              onClick={() => console.log('Intentando nuevamente...')}
              style={{ marginLeft: '10px' }}
            >
              Reintentar
            </button>
          </p>
        )}
      </header>

      <section className="card">
        <h2>Enviar mensaje al procesador</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe un mensaje para procesar"
          />
          <button type="submit" disabled={createLoading}>
            {createLoading ? 'Enviando...' : 'Enviar'}
          </button>
        </form>
      </section>

      {processId && (
        <section className="card result-card">
          <h2>Estado del Proceso</h2>
          <p>ID del proceso: {processId}</p>

          {processLoading ? (
            <p>Cargando estado...</p>
          ) : processData ? (
            <div>
              <p>Mensaje original: {processData.content}</p>
              <p>Estado: {processData.completed ? 'Completado' : 'En proceso'}</p>
              {processData.completed && processData.result && (
                <p>Resultado: {processData.result}</p>
              )}
              <button onClick={refetch}>Actualizar</button>
            </div>
          ) : (
            <p>No se encontró información del proceso</p>
          )}
        </section>
      )}
    </div>
  );
}

export default App;
