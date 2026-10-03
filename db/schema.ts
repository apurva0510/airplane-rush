import { integer, sqliteTable, text, index, primaryKey } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable("rooms", {
  code: text("code").primaryKey(),
  state: text("state").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(), name: text("name").notNull().default("New crew"),
  coins: integer("coins").notNull().default(0), score: integer("score").notNull().default(0),
  best: integer("best").notNull().default(0), flights: integer("flights").notNull().default(0),
  wins: integer("wins").notNull().default(0), served: integer("served").notNull().default(0),
  owned: text("owned").notNull().default('["coral"]'), equipped: text("equipped").notNull().default("coral"),
}, (table) => [index("idx_profiles_score").on(table.score)]);

export const rewards = sqliteTable("rewards", {
  profileId: text("profile_id").notNull(), roundId: text("round_id").notNull(),
  coins: integer("coins").notNull(), score: integer("score").notNull(),
}, (table) => [primaryKey({ columns: [table.profileId, table.roundId] })]);
