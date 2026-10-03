export const COSMETICS = [
  { id: "coral", name: "Cabin classic", color: "#ff6b4a", cost: 0 },
  { id: "ocean", name: "Ocean crew", color: "#09a6a6", cost: 60 },
  { id: "violet", name: "First-class violet", color: "#7657d6", cost: 100 },
  { id: "gold", name: "Golden captain", color: "#bd8100", cost: 180 },
  { id: "rose", name: "Sunset service", color: "#e85791", cost: 120 },
  { id: "sky", name: "Sky squad", color: "#3974d4", cost: 80 },
] as const;
export type Profile = { name: string; coins: number; score: number; best: number; flights: number; wins: number; served: number; owned: string[]; equipped: string };
export type Ranking = Pick<Profile, "name" | "score" | "flights" | "wins" | "served">;
export function flightReward(served: number, won: boolean, level = 1) {
  level = Number.isInteger(level) && level > 0 ? level : 1;
  return { coins: 10 + served * 5 + (won ? 20 : 0), score: served * 100 + (won ? 500 : 0) + level * 50 };
}
