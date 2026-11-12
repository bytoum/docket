import { Knex } from "knex";

/**
 * Keep the raw webhook token, so the URL can be shown again. Existing rows
 * only have the hash and stay null until they are regenerated.
 * @param {Knex} knex Knex instance
 * @returns {Promise<void>}
 */
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable("webhook", (table) => {
        table.string("token", 255).nullable();
    });
}

/**
 * Drop the raw tokens. Webhooks keep working through their hash.
 * @param {Knex} knex Knex instance
 * @returns {Promise<void>}
 */
export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable("webhook", (table) => {
        table.dropColumn("token");
    });
}
