import axios from 'axios';

const isProd = import.meta.env.PROD;
const baseURL = import.meta.env.VITE_API_URL || (isProd ? 'https://inari-80s3.onrender.com' : 'http://127.0.0.1:8001');
export const apiClient = axios.create({
  baseURL,
  timeout: 5000,
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
