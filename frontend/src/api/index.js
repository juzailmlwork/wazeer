import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // The server ends a session the moment the account is deleted, so say why rather than
      // bouncing someone to the login page for no visible reason. Read and cleared by Login.
      const reason = err.response?.data?.message;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (reason && reason !== 'No token provided') {
        try {
          localStorage.setItem('signedOutReason', reason);
        } catch {
          // Private browsing, or storage full. Not worth failing the sign-out over.
        }
      }
      window.location.reload();
    }
    return Promise.reject(err);
  }
);

export default api;
