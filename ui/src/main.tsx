import './i18n';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { ConfigProvider } from '@/components/ConfigProvider';
import { PluginThemeWrapper } from '../../plugins/themes/components/PluginThemeWrapper';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider>
      <PluginThemeWrapper>
        <RouterProvider router={router} />
      </PluginThemeWrapper>
    </ConfigProvider>
  </StrictMode>,
)
