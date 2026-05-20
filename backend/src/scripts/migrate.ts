import { connectToPostgres, getPgPool } from "../db/postgres.js";

try {
  await connectToPostgres();
  console.log("Migrations applied.");
} finally {
  await getPgPool().end();
}
