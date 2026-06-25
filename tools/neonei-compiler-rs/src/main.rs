use anyhow::Result;
use clap::Parser;
use neonei_compiler::cli::Cli;
use neonei_compiler::commands::run_command;

fn main() -> Result<()> {
    run_command(Cli::parse())
}
