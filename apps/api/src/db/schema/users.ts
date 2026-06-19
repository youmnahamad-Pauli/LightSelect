import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const userRoles = ['admin', 'specifier', 'coordinator', 'reviewer'] as const;
export type UserRole = (typeof userRoles)[number];

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  full_name: text('full_name').notNull(),
  email: text('email').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  role: text('role').$type<UserRole>().notNull().default('specifier'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
