
// src/utils/apiClient.ts

import { logger } from '../services/logger';

export class ApiError extends Error {
  public status: number;
  public statusText: string;
  public isOperational: boolean;

  constructor(message: string, status: number, statusText: string, isOperational = true) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
    this.isOperational = isOperational;
  }
}

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';

type FetchOptions = RequestInit & {
  headers?: Record<string, string>;
};

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = `API Error: ${response.status} ${response.statusText}`;
    try {
      // Try to parse the AppError JSON format from backend
      const errorData = await response.json();
      if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch (e) {
      // If text or other format, stick to default
      const text = await response.text();
      if (text) errorMessage = text;
    }

    const error = new ApiError(errorMessage, response.status, response.statusText);
    logger.error('API Request Failed', { 
        url: response.url, 
        status: response.status, 
        message: errorMessage 
    });
    throw error;
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return null as T;
  }

  try {
    return await response.json() as T;
  } catch (e) {
    throw new Error('Failed to parse JSON response');
  }
}

export const apiClient = {
  get: async <T>(endpoint: string, options: FetchOptions = {}): Promise<T> => {
    const url = `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      method: 'GET',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    return handleResponse<T>(response);
  },

  post: async <T>(endpoint: string, body: any, options: FetchOptions = {}): Promise<T> => {
    const url = `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      method: 'POST',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(body),
    });
    return handleResponse<T>(response);
  },

  put: async <T>(endpoint: string, body: any, options: FetchOptions = {}): Promise<T> => {
    const url = `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      method: 'PUT',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(body),
    });
    return handleResponse<T>(response);
  },

  delete: async <T>(endpoint: string, options: FetchOptions = {}): Promise<T> => {
    const url = `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      method: 'DELETE',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    return handleResponse<T>(response);
  },
};
