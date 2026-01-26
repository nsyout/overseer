use clap::{Args, Subcommand};
use rusqlite::Connection;

use crate::db::{learning_repo, task_repo, Learning};
use crate::error::{OsError, Result};
use crate::id::{LearningId, TaskId};

/// Parse TaskId from CLI string (requires prefix)
fn parse_task_id(s: &str) -> std::result::Result<TaskId, String> {
    s.parse().map_err(|e| format!("{e}"))
}

/// Parse LearningId from CLI string (requires prefix)
fn parse_learning_id(s: &str) -> std::result::Result<LearningId, String> {
    s.parse().map_err(|e| format!("{e}"))
}

#[derive(Subcommand)]
pub enum LearningCommand {
    Add(AddArgs),
    List {
        #[arg(value_parser = parse_task_id)]
        task_id: TaskId,
    },
    Delete {
        #[arg(value_parser = parse_learning_id)]
        id: LearningId,
    },
}

#[derive(Args)]
pub struct AddArgs {
    #[arg(value_parser = parse_task_id)]
    pub task_id: TaskId,
    pub content: String,

    #[arg(long, value_parser = parse_task_id)]
    pub source: Option<TaskId>,
}

pub enum LearningResult {
    One(Learning),
    Many(Vec<Learning>),
    Deleted,
}

pub fn handle(conn: &Connection, cmd: LearningCommand) -> Result<LearningResult> {
    match cmd {
        LearningCommand::Add(args) => {
            if !task_repo::task_exists(conn, &args.task_id)? {
                return Err(OsError::TaskNotFound(args.task_id));
            }
            if let Some(ref source) = args.source {
                if !task_repo::task_exists(conn, source)? {
                    return Err(OsError::TaskNotFound(source.clone()));
                }
            }
            let learning = learning_repo::add_learning(
                conn,
                &args.task_id,
                &args.content,
                args.source.as_ref(),
            )?;
            Ok(LearningResult::One(learning))
        }

        LearningCommand::List { task_id } => {
            if !task_repo::task_exists(conn, &task_id)? {
                return Err(OsError::TaskNotFound(task_id));
            }
            let learnings = learning_repo::list_learnings(conn, &task_id)?;
            Ok(LearningResult::Many(learnings))
        }

        LearningCommand::Delete { id } => {
            learning_repo::delete_learning(conn, &id)?;
            Ok(LearningResult::Deleted)
        }
    }
}
