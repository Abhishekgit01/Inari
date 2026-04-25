import axios from 'axios';

const isProd = import.meta.env.PROD;
const baseURL = import.meta.env.VITE_API_URL || (isProd ? '/api' : 'http://127.0.0.1:8001');
export const apiClient = axios.create({
  baseURL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const getWebSocketUrl = (simulationId: string) => {
  const currentBase = String(apiClient.defaults.baseURL || baseURL).replace(/\/$/, '');
  const protocol = currentBase.startsWith('https') ? 'wss' : 'ws';
  const host = currentBase.replace(/^https?:\/\//, '');
  return `${protocol}://${host}/ws/simulation/${simulationId}`;
};
