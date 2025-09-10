interface MissionControlNavigatorConfig {
  targetElementId?: string;
  renderInModal?: boolean;
  replaceMainContent?: boolean;
}

class MissionControlNavigator {
  private initialized = false;
  private config: MissionControlNavigatorConfig;

  constructor(config: MissionControlNavigatorConfig = {}) {
    this.config = {
      targetElementId: 'root',
      renderInModal: false,
      replaceMainContent: true,
      ...config
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      console.log('[MissionControlNavigator] Initializing simple event-based navigation...');
      
      // Listen for analytics events
      document.addEventListener('open-mission-control', this.handleOpenMissionControl.bind(this));
      document.addEventListener('close-mission-control', this.handleCloseMissionControl.bind(this));

      this.initialized = true;
      console.log('[MissionControlNavigator] Initialized successfully');
    } catch (error) {
      console.error('[MissionControlNavigator] Failed to initialize:', error);
    }
  }

  private async handleOpenMissionControl(): Promise<void> {
    console.log('[MissionControlNavigator] Opening Mission Control - App.tsx will handle tab switching');
    // App.tsx will handle the tab switching via event listener
  }

  private async handleCloseMissionControl(): Promise<void> {
    console.log('[MissionControlNavigator] Closing Mission Control - App.tsx will handle tab switching');
    // App.tsx will handle the tab switching via event listener
  }

  public destroy(): void {
    document.removeEventListener('open-mission-control', this.handleOpenMissionControl.bind(this));
    document.removeEventListener('close-mission-control', this.handleCloseMissionControl.bind(this));
    this.initialized = false;
  }
}

// Initialize the navigator when the module is loaded
let missionControlNavigator: MissionControlNavigator | null = null;

// Export initialization function
export const initializeMissionControlNavigator = (config?: MissionControlNavigatorConfig) => {
  if (!missionControlNavigator) {
    missionControlNavigator = new MissionControlNavigator(config);
  }
  return missionControlNavigator.initialize();
};

// Export destroy function
export const destroyMissionControlNavigator = () => {
  if (missionControlNavigator) {
    missionControlNavigator.destroy();
    missionControlNavigator = null;
  }
};

// Auto-initialize if running in browser
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[MissionControlNavigator] Auto-initializing...');
    initializeMissionControlNavigator();
  });

  // Also initialize immediately if DOM is already loaded
  if (document.readyState === 'loading') {
    // DOM is still loading
  } else {
    // DOM is already loaded
    console.log('[MissionControlNavigator] DOM already loaded, initializing immediately...');
    initializeMissionControlNavigator();
  }
}
