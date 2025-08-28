import { MissionControlAPI } from '@/lib/missionControlAPI';

// Custom hook pentru a folosi MissionControlAPI în componentele React
export function useMissionControlAPI() {
  const missionControlAPI = new MissionControlAPI();
  
  return missionControlAPI;
}