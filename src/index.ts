import { Command } from "commander";

import { cmdExport } from "./lib/export";

export * from './lib/export';

if (require.main === module) {
    const program = new Command();
    program
        .version("0.0.1")
        .command("export")
        .description("")
        .action(cmdExport);

    program.parse(process.argv);
}