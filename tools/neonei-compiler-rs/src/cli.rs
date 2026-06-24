use clap::{Parser, Subcommand, ValueEnum};
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(name = "neonei-compiler")]
#[command(about = "NeoNEI/Elysium runtime data compiler", long_about = None)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Subcommand, Debug)]
pub enum Command {
    /// Read a Raw Export and emit a deterministic baseline report.
    Baseline {
        #[arg(long)]
        input: PathBuf,
        #[arg(long)]
        report: PathBuf,
        #[arg(long)]
        threads: Option<usize>,
        #[arg(long, default_value_t = false)]
        strict: bool,
    },
    /// Compile raw-export data into NeoNEI/Elysium runtime packs.
    Compile {
        #[arg(long)]
        input: PathBuf,
        #[arg(long)]
        output: PathBuf,
        #[arg(long)]
        report: PathBuf,
        #[arg(long, value_enum, default_value_t = CompileScope::All)]
        scope: CompileScope,
        #[arg(long)]
        threads: Option<usize>,
        #[arg(long, default_value_t = false)]
        strict: bool,
        /// Emit large JSON debug packs next to binary runtime packs.
        #[arg(long, default_value_t = false)]
        debug_json: bool,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
pub enum CompileScope {
    All,
    NativeUi,
    Search,
    Browser,
    Recipes,
    Ui,
    Textures,
}

impl CompileScope {
    pub fn as_str(self) -> &'static str {
        match self {
            CompileScope::All => "all",
            CompileScope::NativeUi => "native-ui",
            CompileScope::Search => "search",
            CompileScope::Browser => "browser",
            CompileScope::Recipes => "recipes",
            CompileScope::Ui => "ui",
            CompileScope::Textures => "textures",
        }
    }
}
