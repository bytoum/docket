import { Knex } from "knex";

/**
 * Add the "webhook" table: one deploy webhook per stack. Only the SHA-256
 * hash of the token is stored.
 * @param {Knex} knex Knex instance
 * @returns {Promise<void>}
 */
export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable("webhook", (table) => {
        table.increments("id");
        table.string("stack_name", 255).notNullable().unique();
        table.string("token_hash", 64).notNullable().unique();
        table.datetime("created_date").notNullable().defaultTo(knex.fn.now());
        table.datetime("last_triggered").nullable().defaultTo(null);
        table.string("last_result", 20).nullable().defaultTo(null);
    });
}

/**
 * Remove the "webhook" table
 * @param {Knex} knex Knex instance
 * @returns {Promise<void>}
 */
export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable("webhook");
}
