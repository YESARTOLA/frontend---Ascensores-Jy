# Ascensores Jy — Frontend

React 18 + Vite + Tailwind 3 + React Router 6.

## Comandos

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run preview
```

## Variables de entorno

`.env`:
```
VITE_API_BASE=/api
VITE_API_PROXY=http://localhost:4000   # solo dev
```

En producción (Railway, Vercel, etc.) define `VITE_API_BASE` apuntando al backend desplegado, por ejemplo `https://api.ascensoresjy.com/api`.

## Manejo de fechas/horas

- Todas las fechas se formatean con zona horaria `America/Lima` mediante `Intl.DateTimeFormat`.
- Los inputs `<input type="date">` envían fechas ISO que el backend interpreta correctamente.
- Esto evita desfases entre máquinas locales (UTC-5) y Railway (UTC).

## Estructura

```
src/
  components/   # layout, common
  features/auth # AuthContext y permisos
  pages/        # vistas por ruta
  routes/       # protección de rutas
  services/     # axios + endpoints
  styles/       # tailwind.css
  utils/        # formatters
```

## Roles

- super_admin · admin · coordinador · tecnico · contabilidad
- Sidebar y menús se adaptan al rol del usuario logueado.
- Precios solo visibles para super_admin, admin, contabilidad.
