
import { DeskPolicy } from '../types';
import { apiClient } from '../utils/apiClient';

export async function getCurrentPolicy(): Promise<DeskPolicy> {
  return apiClient.get<DeskPolicy>('/api/desk/policy/current');
}

export async function generatePolicy(): Promise<DeskPolicy> {
  return apiClient.post<DeskPolicy>('/api/desk/policy/generate', {});
}

export async function updatePolicy(updates: Partial<DeskPolicy>): Promise<DeskPolicy> {
  return apiClient.post<DeskPolicy>('/api/desk/policy/update', updates);
}
