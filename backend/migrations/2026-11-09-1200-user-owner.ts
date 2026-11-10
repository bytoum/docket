import { Knex } from "knex";

/**
 * Add the "is_owner" flag to users. The owner is the only user who can add,
 * disable and delete other users. On an existing install, the first user
 * (the one created at setup) becomes the owner.
 * @param {Knex} knex Knex instance
 * @returns {Promise<void>}
 */
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable("user", (table) => {
        table.boolean("is_owner").notNullable().defaultTo(false);
    });

    const first = await knex("user").orderBy("id").first("id");
    if (first) {
        await knex("user").where("id", first.id).update({ is_owner: true });
    }
}

/**
 * Remove the "is_owner" flag
 * @param {Knex} knex Knex instance
 * @returns {Promise<void>}
 */
export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable("user", (table) => {
        table.dropColumn("is_owner");
    });
}
