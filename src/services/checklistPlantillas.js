import api from './apiClient';

export const checklistPlantillasService = {
  list: () => api.get('/checklist-plantillas').then(r => r.data?.data ?? r.data),
  get: (categoria) => api.get(`/checklist-plantillas/${categoria}`).then(r => r.data?.data ?? r.data),
  guardar: (categoria, payload) => api.put(`/checklist-plantillas/${categoria}`, payload).then(r => r.data?.data ?? r.data)
};
