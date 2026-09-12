// lib/api/client.ts
// Базовый HTTP-клиент для взаимодействия с локальным FastAPI BFF

export const API_BASE_URL = "http://127.0.0.1:8000"

export async function handleApiResponse<T>(response: Response, defaultErrorMessage: string): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.detail || errorData.error || `${defaultErrorMessage}: ${response.statusText}`)
  }
  return response.json()
}