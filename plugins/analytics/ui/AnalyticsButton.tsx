import { useEffect } from 'react';

/**
 * Analytics Plugin UI Component
 * Self-contained component that adds analytics button to topbar
 */
export function AnalyticsButton() {
  // Initialize mission control navigator when component mounts
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    
    // Import and initialize the navigator
    import('./missionControlNavigator.ts').then(async (module) => {
      console.log('📊 AnalyticsButton: Mission Control Navigator module loaded');
      await module.initializeMissionControlNavigator();
      cleanup = module.destroyMissionControlNavigator;
    }).catch(error => {
      console.warn('📊 AnalyticsButton: Failed to load Mission Control Navigator', error);
    });
    
    // Cleanup function
    return () => {
      if (cleanup) {
        cleanup();
      }
    };
  }, []);
  useEffect(() => {
    // Function to add analytics button to topbar with retry mechanism
    const addAnalyticsButtonToTopbar = (retryCount = 0) => {
      console.log('🔍 Analytics plugin UI: Attempting to add button to topbar, retry:', retryCount);
      
      // Check if button already exists
      const existingButton = document.querySelector('[data-analytics-plugin-button="true"]');
      if (existingButton) {
        console.log('🔍 Analytics plugin UI: Button already exists in topbar');
        return;
      }
      
      // Find the topbar header
      const header = document.querySelector('header.flex.h-16.items-center.justify-between.border-b.bg-white.px-6') || 
                     document.querySelector('header');
      console.log('🔍 Analytics plugin UI: Header element found:', header);
      
      if (!header) {
        // Retry mechanism - wait a bit and try again
        if (retryCount < 5) {
          console.log('🔍 Analytics plugin UI: Header not found, retrying in 100ms...');
          setTimeout(() => addAnalyticsButtonToTopbar(retryCount + 1), 100);
        } else {
          console.warn('Could not find header element for analytics button after multiple retries');
        }
        return;
      }
      
      // Find header actions container
      const headerActions = header.querySelector('div.flex.items-center.gap-2');
      console.log('🔍 Analytics plugin UI: Header actions container found:', headerActions);
      
      if (!headerActions) {
        console.warn('Could not find header actions container');
        return;
      }
      
      console.log('🔍 Analytics plugin UI: Creating analytics button');
      
      // Create analytics button - made consistent with other toolbar buttons
      const analyticsButton = document.createElement('button');
      analyticsButton.className = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 w-10 px-0 relative group transition-all-ease hover:scale-110';
      analyticsButton.setAttribute('data-analytics-plugin-button', 'true');
      analyticsButton.setAttribute('title', 'Analytics Dashboard');
      analyticsButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bar-chart-3 h-5 w-5">
          <path d="M3 3v18h18"/>
          <path d="M18 17V9"/>
          <path d="M13 17V5"/>
          <path d="M8 17v-3"/>
        </svg>
        <span class="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-green-500 animate-pulse group-hover:animate-none"></span>
      `;
      
      // Add click handler to navigate to analytics
      analyticsButton.addEventListener('click', () => {
        console.log('📊 Analytics button clicked - dispatching mission control event');
        
        // Dispatch a simple, clear event that the plugin system can listen to
        const event = new CustomEvent('open-mission-control', {
          detail: {
            source: 'analytics-button',
            timestamp: Date.now()
          }
        });
        
        document.dispatchEvent(event);
        console.log('📊 Analytics button: Dispatched open-mission-control event');
      });
      
      // Insert button in header actions (before settings button)
      headerActions.insertBefore(analyticsButton, headerActions.firstChild);
      console.log('✅ Analytics plugin UI: Button added to topbar');
    };
    
    // Function to remove analytics button from topbar
    const removeAnalyticsButtonFromTopbar = () => {
      const analyticsButton = document.querySelector('[data-analytics-plugin-button="true"]');
      if (analyticsButton) {
        analyticsButton.remove();
        console.log('🗑️ Analytics plugin UI: Button removed from topbar');
      }
    };
    
    // FIXED: Check analytics state with server state as authoritative source
    const isAnalyticsActive = async (): Promise<boolean> => {
      // Check server state first (authoritative)
      try {
        const response = await fetch('/api/plugins/getState');
        if (response.ok) {
          const serverState = await response.json();
          if (serverState.analytics?.enabled !== undefined) {
            return serverState.analytics.enabled;
          }
        }
      } catch (error) {
        console.warn('Failed to fetch server plugin state:', error);
      }
      
      // Fallback to localStorage (backwards compatibility)
      const localStorageValue = localStorage.getItem('analytics-enabled');
      if (localStorageValue === 'true') {
        return true;
      }
      
      // Check config from server (legacy)
      try {
        const configStr = localStorage.getItem('app-config') || '{}';
        const config = JSON.parse(configStr);
        return config.plugins?.analytics?.enabled === true;
      } catch (e) {
        return false;
      }
    };
    
    // FIXED: Initialize analytics button with async state check
    const initializeAnalyticsButton = async () => {
      const isActive = await isAnalyticsActive();
      console.log('🔍 Analytics plugin UI: Initializing button, analytics active:', isActive);
      
      if (isActive) {
        // Small delay to ensure DOM is ready, then try to add button with retry mechanism
        setTimeout(() => addAnalyticsButtonToTopbar(), 100);
      } else {
        removeAnalyticsButtonFromTopbar();
      }
    };
    
    // Initialize on component mount (async)
    initializeAnalyticsButton().catch(error => {
      console.warn('Failed to initialize analytics button:', error);
    });
    
    // Listen for config changes
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'analytics-enabled' || event.key === 'app-config') {
        console.log('🔄 Analytics plugin UI: Config changed via storage event, updating button visibility');
        setTimeout(initializeAnalyticsButton, 100);
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // FIXED: Handle analytics toggle events with async state check
    const handleAnalyticsToggle = () => {
      console.log('🔄 Analytics plugin UI: Received toggle change event, updating button visibility');
      setTimeout(() => {
        initializeAnalyticsButton().catch(error => {
          console.warn('Failed to handle analytics toggle:', error);
        });
      }, 100);
    };
    
    window.addEventListener('analytics-toggle-changed', handleAnalyticsToggle);
    window.addEventListener('analytics-config-changed', handleAnalyticsToggle);
    
    // Cleanup
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('analytics-toggle-changed', handleAnalyticsToggle);
      window.removeEventListener('analytics-config-changed', handleAnalyticsToggle);
      removeAnalyticsButtonFromTopbar();
    };
  }, []);
  
  return null; // This component doesn't render anything visible
}

export default AnalyticsButton;