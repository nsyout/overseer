use thiserror::Error;

use crate::id::{LearningId, TaskId};
use crate::vcs::VcsError;

#[derive(Error, Debug)]
pub enum OsError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Task not found: {0}")]
    TaskNotFound(TaskId),

    #[error("Parent task not found: {0}")]
    ParentNotFound(TaskId),

    #[error("Blocker task not found: {0}")]
    BlockerNotFound(TaskId),

    #[error("Learning not found: {0}")]
    LearningNotFound(LearningId),

    #[error("Maximum depth exceeded: subtasks cannot have children")]
    MaxDepthExceeded,

    #[error("Cycle detected in parent chain")]
    ParentCycle,

    #[error("Cycle detected in blocker chain")]
    BlockerCycle,

    #[error("Cannot complete task with pending children")]
    PendingChildren,

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("VCS error: {0}")]
    Vcs(#[from] VcsError),
}

pub type Result<T> = std::result::Result<T, OsError>;
