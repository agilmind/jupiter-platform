import { GeneratorOptions } from '../../types';

export function srcStyleCss(options: GeneratorOptions): string {
  return `body {
  font-family: Arial, sans-serif;
  margin: 0;
  padding: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: #f5f5f5;
}

.container {
  text-align: center;
  max-width: 800px;
  width: 100%;
  padding: 2rem;
}

.card {
  background-color: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  margin-bottom: 2rem;
  text-align: left;
}

.message {
  margin: 1rem 0;
  padding: 1rem;
  background-color: #f0f0f0;
  border-radius: 4px;
}

.input-group {
  margin-bottom: 1rem;
}

.input-group label {
  display: block;
  margin-bottom: 0.5rem;
}

.input-group input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1rem;
}

button {
  background-color: #4CAF50;
  color: white;
  border: none;
  padding: 10px 15px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  margin: 0.5rem 0;
}

button:hover {
  background-color: #45a049;
}

button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

h1, h2, h3 {
  color: #333;
}

.result-container {
  margin-top: 1.5rem;
}

.result {
  background-color: #f0f0f0;
  padding: 1rem;
  border-radius: 4px;
  white-space: pre-wrap;
  font-family: monospace;
  max-height: 200px;
  overflow-y: auto;
  font-size: 0.9rem;
}`;
}
