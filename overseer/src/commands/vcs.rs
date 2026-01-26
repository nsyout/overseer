use clap::{Args, Subcommand};

use crate::error::Result;
use crate::vcs::{self, CommitResult, DiffEntry, LogEntry, VcsInfo, VcsStatus};

#[derive(Subcommand)]
pub enum VcsCommand {
    Detect,
    Status,
    Log(LogArgs),
    Diff(DiffArgs),
    Commit(CommitArgs),
}

#[derive(Args)]
pub struct LogArgs {
    #[arg(long, default_value = "10")]
    pub limit: usize,
}

#[derive(Args)]
pub struct DiffArgs {
    pub base: Option<String>,
}

#[derive(Args)]
pub struct CommitArgs {
    #[arg(short, long)]
    pub message: String,
}

pub enum VcsResult {
    Info(VcsInfo),
    Status(VcsStatus),
    Log(Vec<LogEntry>),
    Diff(Vec<DiffEntry>),
    Commit(CommitResult),
}

pub fn handle(cmd: VcsCommand) -> Result<VcsResult> {
    let cwd = std::env::current_dir()?;

    match cmd {
        VcsCommand::Detect => {
            let info = vcs::detect(&cwd);
            Ok(VcsResult::Info(info))
        }

        VcsCommand::Status => {
            let backend = vcs::get_backend(&cwd)?;
            let status = backend.status()?;
            Ok(VcsResult::Status(status))
        }

        VcsCommand::Log(args) => {
            let backend = vcs::get_backend(&cwd)?;
            let log = backend.log(args.limit)?;
            Ok(VcsResult::Log(log))
        }

        VcsCommand::Diff(args) => {
            let backend = vcs::get_backend(&cwd)?;
            let diff = backend.diff(args.base.as_deref())?;
            Ok(VcsResult::Diff(diff))
        }

        VcsCommand::Commit(args) => {
            let backend = vcs::get_backend(&cwd)?;
            let result = backend.commit(&args.message)?;
            Ok(VcsResult::Commit(result))
        }
    }
}
