import './i18n';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { ConfigProvider } from '@/components/ConfigProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider>
      <RouterProvider router={router} />
    </ConfigProvider>
  </StrictMode>,
)
