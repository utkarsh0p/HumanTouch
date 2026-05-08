import { connectToPostgres } from "../db/postgres.js";

await connectToPostgres();
console.log("Migrations applied.");
