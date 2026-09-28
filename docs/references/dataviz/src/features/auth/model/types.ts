export interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  groups?: string[];
  clientAccess?: Array<{ clientId: string; routeOverrides?: string[] | null }>;
  createdAt: string;
}
