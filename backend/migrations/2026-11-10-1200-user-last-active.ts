import { Knex } from "knex";

/**
 * Add "last_active" to users: when they last signed in or reconnected,
 * in UTC. Null until their next sign-in.
 * @param {Knex} knex Knex instance
 * @returns {Promise<void>}
 */
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable("user", (table) => {
        table.datetime("last_active").nullable().defaultTo(null);
    });
}

/**
 * Remove "last_active"
 * @param {Knex} knex Knex instance
 * @returns {Promise<void>}
 */
export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable("user", (table) => {
        table.dropColumn("last_active");
    });
}
