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
}

.card {
  background-color: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  margin-bottom: 2rem;
}

.message {
  margin: 1rem 0;
  padding: 1rem;
  background-color: #f0f0f0;
  border-radius: 4px;
}

button {
  background-color: #4CAF50;
  color: white;
  border: none;
  padding: 10px 15px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  margin: 0.5rem;
}

button:hover {
  background-color: #45a049;
}

button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

h1, h2 {
  color: #333;
}`;
}
