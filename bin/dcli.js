#!/usr/bin/env node

const { Command } = require("commander");
const minimist = require("minimist");

const program = new Command();

const packageJson = require("../package.json");
const { init } = require("../src/lib/cicd");

program.name("dcli").description("cli tools for nodejs fullstack").version(packageJson.version);

program
    .command("cicd")
    .description("execute build and deploy workflow")
    .option("-c, --ci-mode", "execute ci mode", false)
    .action((options) => {
        init(options);
    });

program.parse();
