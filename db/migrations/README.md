# One-off migrations

`npm run db:sync` builds and extends the schema from `db/tables`, `db/logic` and `db/seeds` (see `db/schema.ts`).
It never drops or rewrites anything, so changes it cannot express go here as numbered SQL files
(`0013_drop_old_column.sql`, ...), applied once each, in order, by `npm run db:migrate`:

- removing or renaming a column or table
- changing a column's type or nullability
- adding a constraint to a table that already exists
- fixing existing data

When you add a migration, also update the matching `db/tables` file so a brand-new database ends up the same.

`archive/` holds the first twelve migrations, kept for history only. Their final state is what `db/tables` describes,
and they are not run any more (an existing database still lists them in `_migrations`, which is harmless).
