import { Knex } from "knex";

/**
 * Container webhooks: a webhook can target one service of a stack.
 * "service_name" is "" for a whole-stack webhook, so existing rows keep
 * working. A stack can have one webhook per service plus its own.
 * @param {Knex} knex Knex instance
 * @returns {Promise<void>}
 */
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable("webhook", (table) => {
        table.string("service_name", 255).notNullable().defaultTo("");
    });
    await knex.schema.alterTable("webhook", (table) => {
        table.dropUnique([ "stack_name" ]);
        table.unique([ "stack_name", "service_name" ]);
    });
}

/**
 * Back to one webhook per stack. Container webhooks are deleted.
 * @param {Knex} knex Knex instance
 * @returns {Promise<void>}
 */
export async function down(knex: Knex): Promise<void> {
    await knex("webhook").whereNot("service_name", "").delete();
    await knex.schema.alterTable("webhook", (table) => {
        table.dropUnique([ "stack_name", "service_name" ]);
        table.unique([ "stack_name" ]);
    });
    await knex.schema.alterTable("webhook", (table) => {
        table.dropColumn("service_name");
    });
}
