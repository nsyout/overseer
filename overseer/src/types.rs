// Allow unreachable_patterns for serde rename conflict (context vs context_chain)
#![allow(unreachable_patterns)]

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::db::learning_repo::Learning;
use crate::id::TaskId;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskContext {
    pub own: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub milestone: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InheritedLearnings {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub milestone: Vec<Learning>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub parent: Vec<Learning>,
}

/// Task struct with dual-purpose context fields:
/// - `context`: raw string stored in DB (never serialized)
/// - `context_chain`: structured chain for JSON output (serializes as "context")
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: TaskId,
    pub parent_id: Option<TaskId>,
    pub description: String,
    #[serde(default, skip_serializing)]
    pub context: String,
    #[serde(rename = "context", skip_serializing_if = "Option::is_none")]
    pub context_chain: Option<TaskContext>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub learnings: Option<InheritedLearnings>,
    pub result: Option<String>,
    pub priority: i32,
    pub completed: bool,
    pub completed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub commit_sha: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bookmark: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_commit: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub depth: Option<i32>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub blocked_by: Vec<TaskId>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub blocks: Vec<TaskId>,
    /// Computed field: true if task or any ancestor has incomplete blockers
    #[serde(default)]
    pub effectively_blocked: bool,
}

#[derive(Debug, Clone, Default)]
pub struct CreateTaskInput {
    pub description: String,
    pub context: Option<String>,
    pub parent_id: Option<TaskId>,
    pub priority: Option<i32>,
    pub blocked_by: Vec<TaskId>,
}

#[derive(Debug, Clone, Default)]
pub struct UpdateTaskInput {
    pub description: Option<String>,
    pub context: Option<String>,
    pub priority: Option<i32>,
    pub parent_id: Option<TaskId>,
}

#[derive(Debug, Clone, Default)]
pub struct ListTasksFilter {
    pub parent_id: Option<TaskId>,
    pub ready: bool,
    pub completed: Option<bool>,
    /// Filter by task depth: 0=milestones, 1=tasks, 2=subtasks
    pub depth: Option<i32>,
}
