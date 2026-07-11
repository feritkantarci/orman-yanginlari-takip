export const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' 
  ? `http://${window.location.hostname}:8000/api` 
  : 'http://localhost:8000/api');

export function getToken() {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('token');
  }
  return null;
}

export async function fetchCustomStats(type: string, name: string) {
  return fetchAPI('/summary/custom-stats', {
    method: 'POST',
    body: JSON.stringify({ type, name })
  });
}

export async function updateDashboardPreferences(preferencesStr: string) {
  return fetchAPI('/users/me/dashboard-preferences', {
    method: 'PUT',
    body: JSON.stringify({ dashboard_preferences: preferencesStr })
  });
}
export async function getUsers() {
  return fetchAPI('/users');
}

export async function createUser(data: any) {
  return fetchAPI('/users', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function updateUser(username: string, data: any) {
  return fetchAPI(`/users/${username}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

export async function deleteUser(username: string) {
  return fetchAPI(`/users/${username}`, {
    method: 'DELETE'
  });
}

export async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const token = getToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      if (typeof window !== 'undefined') {
        alert("API returned 401! Endpoint: " + endpoint);
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
    }
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'API Error');
  }

  return response.json();
}
