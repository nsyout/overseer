use clap::Subcommand;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::db::{learning_repo, task_repo, Learning};
use crate::error::Result;
use crate::id::TaskId;

#[derive(Subcommand, Clone)]
pub enum DataCommand {
    /// Export all tasks and learnings to JSON file
    Export {
        /// Output file path (default: overseer-export.json)
        #[arg(short, long)]
        output: Option<PathBuf>,
    },

    /// Import tasks and learnings from JSON file
    Import {
        /// Input file path
        file: PathBuf,

        /// Clear existing data before import
        #[arg(long)]
        clear: bool,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportTask {
    pub id: TaskId,
    pub parent_id: Option<TaskId>,
    pub description: String,
    pub context: String,
    pub result: Option<String>,
    pub priority: i32,
    pub completed: bool,
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub started_at: Option<chrono::DateTime<chrono::Utc>>,
    pub commit_sha: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportData {
    pub version: String,
    pub exported_at: String,
    pub tasks: Vec<ExportTask>,
    pub learnings: Vec<Learning>,
    pub blockers: Vec<BlockerRelation>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockerRelation {
    pub task_id: TaskId,
    pub blocker_id: TaskId,
}

pub enum DataResult {
    Exported {
        path: String,
        tasks: usize,
        learnings: usize,
    },
    Imported {
        tasks: usize,
        learnings: usize,
    },
}

pub fn handle(conn: &Connection, cmd: DataCommand) -> Result<DataResult> {
    match cmd {
        DataCommand::Export { output } => export_data(conn, output),
        DataCommand::Import { file, clear } => import_data(conn, &file, clear),
    }
}

fn calculate_depth(tasks: &[ExportTask], task_id: &TaskId) -> i32 {
    let task = tasks.iter().find(|t| &t.id == task_id);
    match task.and_then(|t| t.parent_id.as_ref()) {
        None => 0,
        Some(parent_id) => 1 + calculate_depth(tasks, parent_id),
    }
}

pub(crate) fn export_data(conn: &Connection, output: Option<PathBuf>) -> Result<DataResult> {
    let output_path = output.unwrap_or_else(|| PathBuf::from("overseer-export.json"));

    // Get all tasks with full context
    let tasks = task_repo::list_tasks(conn, &Default::default())?;
    let export_tasks: Vec<ExportTask> = tasks
        .iter()
        .filter_map(|t| {
            task_repo::get_task(conn, &t.id)
                .ok()
                .flatten()
                .map(|full_task| ExportTask {
                    id: full_task.id,
                    parent_id: full_task.parent_id,
                    description: full_task.description,
                    context: full_task.context,
                    result: full_task.result,
                    priority: full_task.priority,
                    completed: full_task.completed,
                    completed_at: full_task.completed_at,
                    created_at: full_task.created_at,
                    updated_at: full_task.updated_at,
                    started_at: full_task.started_at,
                    commit_sha: full_task.commit_sha,
                })
        })
        .collect();

    // Get all learnings
    let mut all_learnings = Vec::new();
    for task in &tasks {
        let learnings = learning_repo::list_learnings(conn, &task.id)?;
        all_learnings.extend(learnings);
    }

    // Get all blocker relations
    let mut blockers = Vec::new();
    for task in &export_tasks {
        if let Some(full_task) = task_repo::get_task(conn, &task.id)? {
            for blocker_id in &full_task.blocked_by {
                blockers.push(BlockerRelation {
                    task_id: task.id.clone(),
                    blocker_id: blocker_id.clone(),
                });
            }
        }
    }

    let export = ExportData {
        version: "1.0.0".to_string(),
        exported_at: chrono::Utc::now().to_rfc3339(),
        tasks: export_tasks.clone(),
        learnings: all_learnings.clone(),
        blockers,
    };

    let json = serde_json::to_string_pretty(&export)?;
    fs::write(&output_path, json)?;

    Ok(DataResult::Exported {
        path: output_path.display().to_string(),
        tasks: export_tasks.len(),
        learnings: all_learnings.len(),
    })
}

pub(crate) fn import_data(conn: &Connection, file: &PathBuf, clear: bool) -> Result<DataResult> {
    let json = fs::read_to_string(file)?;
    let import: ExportData = serde_json::from_str(&json)?;

    // Wrap all operations in a savepoint to prevent partial imports
    // Using savepoint since we have an immutable connection reference
    conn.execute("SAVEPOINT import_data", [])?;

    let result = (|| -> Result<DataResult> {
        if clear {
            // Clear existing data
            conn.execute("DELETE FROM task_blockers", [])?;
            conn.execute("DELETE FROM learnings", [])?;
            conn.execute("DELETE FROM tasks", [])?;
        }

        // Import tasks in order: parents before children (depth-first)
        // First, collect tasks by depth level
        let mut tasks_by_depth: std::collections::BTreeMap<i32, Vec<&ExportTask>> =
            std::collections::BTreeMap::new();
        for task in &import.tasks {
            let depth = calculate_depth(&import.tasks, &task.id);
            tasks_by_depth.entry(depth).or_default().push(task);
        }

        // Import tasks level by level (depth 0, then 1, then 2)
        for (_depth, tasks) in tasks_by_depth {
            for task in tasks {
                let now_str = task.created_at.to_rfc3339();
                let updated_str = task.updated_at.to_rfc3339();

                conn.execute(
                    r#"
                    INSERT OR REPLACE INTO tasks 
                    (id, parent_id, description, context, result, priority, completed, 
                     completed_at, created_at, updated_at, started_at, commit_sha)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                    "#,
                    rusqlite::params![
                        &task.id,
                        task.parent_id.as_ref(),
                        &task.description,
                        &task.context,
                        task.result.as_ref(),
                        task.priority,
                        if task.completed { 1 } else { 0 },
                        task.completed_at.as_ref().map(|dt| dt.to_rfc3339()),
                        now_str,
                        updated_str,
                        task.started_at.as_ref().map(|dt| dt.to_rfc3339()),
                        task.commit_sha.as_ref(),
                    ],
                )?;
            }
        }

        // Import learnings
        for learning in &import.learnings {
            let created_str = learning.created_at.to_rfc3339();

            conn.execute(
                r#"
                INSERT OR REPLACE INTO learnings 
                (id, task_id, content, source_task_id, created_at)
                VALUES (?1, ?2, ?3, ?4, ?5)
                "#,
                rusqlite::params![
                    &learning.id,
                    &learning.task_id,
                    &learning.content,
                    learning.source_task_id.as_ref(),
                    created_str,
                ],
            )?;
        }

        // Import blockers
        for blocker in &import.blockers {
            conn.execute(
                "INSERT OR REPLACE INTO task_blockers (task_id, blocker_id) VALUES (?1, ?2)",
                rusqlite::params![&blocker.task_id, &blocker.blocker_id],
            )?;
        }

        Ok(DataResult::Imported {
            tasks: import.tasks.len(),
            learnings: import.learnings.len(),
        })
    })();

    match result {
        Ok(data) => {
            // Release savepoint - all operations succeeded
            conn.execute("RELEASE import_data", [])?;
            Ok(data)
        }
        Err(e) => {
            // Rollback savepoint on any error
            let _ = conn.execute("ROLLBACK TO import_data", []);
            let _ = conn.execute("RELEASE import_data", []);
            Err(e)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::task_service::TaskService;
    use crate::db::{self, learning_repo};
    use rusqlite::Connection;
    use std::fs;
    use tempfile::TempDir;

    fn setup_test_db() -> (Connection, TempDir) {
        let tmp_dir = TempDir::new().unwrap();
        let db_path = tmp_dir.path().join("test.db");
        let conn = db::open_db(&db_path).unwrap();
        (conn, tmp_dir)
    }

    #[test]
    fn test_export_empty_database() {
        let (conn, tmp_dir) = setup_test_db();
        let output_path = tmp_dir.path().join("export.json");

        let result = export_data(&conn, Some(output_path.clone()));
        assert!(result.is_ok());

        match result.unwrap() {
            DataResult::Exported {
                tasks, learnings, ..
            } => {
                assert_eq!(tasks, 0);
                assert_eq!(learnings, 0);
            }
            _ => panic!("Expected Exported result"),
        }

        // Verify file exists
        assert!(output_path.exists());

        // Verify content
        let content = fs::read_to_string(&output_path).unwrap();
        let export: ExportData = serde_json::from_str(&content).unwrap();
        assert_eq!(export.version, "1.0.0");
        assert_eq!(export.tasks.len(), 0);
        assert_eq!(export.learnings.len(), 0);
        assert_eq!(export.blockers.len(), 0);
    }

    #[test]
    fn test_export_import_roundtrip() {
        let (conn, tmp_dir) = setup_test_db();
        let task_service = TaskService::new(&conn);

        // Create test data
        let task1 = task_service
            .create(&crate::types::CreateTaskInput {
                description: "Task 1".to_string(),
                context: Some("Context 1".to_string()),
                parent_id: None,
                priority: Some(5),
                blocked_by: vec![],
            })
            .unwrap();

        let task2 = task_service
            .create(&crate::types::CreateTaskInput {
                description: "Task 2".to_string(),
                context: Some("Context 2".to_string()),
                parent_id: Some(task1.id.clone()),
                priority: Some(3),
                blocked_by: vec![],
            })
            .unwrap();

        learning_repo::add_learning(&conn, &task1.id, "Learning 1", None).unwrap();
        learning_repo::add_learning(&conn, &task2.id, "Learning 2", Some(&task1.id)).unwrap();

        // Export
        let export_path = tmp_dir.path().join("export.json");
        let export_result = export_data(&conn, Some(export_path.clone())).unwrap();

        match export_result {
            DataResult::Exported {
                tasks, learnings, ..
            } => {
                assert_eq!(tasks, 2);
                assert_eq!(learnings, 2);
            }
            _ => panic!("Expected Exported result"),
        }

        // Create new database
        let (conn2, _tmp_dir2) = setup_test_db();
        let task_service2 = TaskService::new(&conn2);

        // Import
        let import_result = import_data(&conn2, &export_path, false).unwrap();

        match import_result {
            DataResult::Imported { tasks, learnings } => {
                assert_eq!(tasks, 2);
                assert_eq!(learnings, 2);
            }
            _ => panic!("Expected Imported result"),
        }

        // Verify imported data
        let imported_task1 = task_service2.get(&task1.id).unwrap();
        assert_eq!(imported_task1.description, "Task 1");
        // Context is stored but retrieved via context_chain
        assert!(imported_task1.context_chain.is_some());
        assert_eq!(imported_task1.context_chain.unwrap().own, "Context 1");
        assert_eq!(imported_task1.priority, 5);

        let imported_task2 = task_service2.get(&task2.id).unwrap();
        assert_eq!(imported_task2.description, "Task 2");
        assert_eq!(imported_task2.parent_id, Some(task1.id.clone()));

        let imported_learnings = learning_repo::list_learnings(&conn2, &task1.id).unwrap();
        assert_eq!(imported_learnings.len(), 1);
        assert_eq!(imported_learnings[0].content, "Learning 1");
    }

    #[test]
    fn test_import_with_clear() {
        let (conn, _tmp_dir) = setup_test_db();
        let task_service = TaskService::new(&conn);

        // Create initial data
        task_service
            .create(&crate::types::CreateTaskInput {
                description: "Old task".to_string(),
                context: None,
                parent_id: None,
                priority: None,
                blocked_by: vec![],
            })
            .unwrap();

        // Create export with different data
        let (conn2, tmp_dir2) = setup_test_db();
        let task_service2 = TaskService::new(&conn2);
        task_service2
            .create(&crate::types::CreateTaskInput {
                description: "New task".to_string(),
                context: None,
                parent_id: None,
                priority: None,
                blocked_by: vec![],
            })
            .unwrap();

        let export_path = tmp_dir2.path().join("export.json");
        export_data(&conn2, Some(export_path.clone())).unwrap();

        // Import with clear
        import_data(&conn, &export_path, true).unwrap();

        // Verify only new data exists
        let all_tasks = task_service.list(&Default::default()).unwrap();
        assert_eq!(all_tasks.len(), 1);
        assert_eq!(all_tasks[0].description, "New task");
    }

    #[test]
    fn test_export_with_blockers() {
        let (conn, tmp_dir) = setup_test_db();
        let task_service = TaskService::new(&conn);

        let task1 = task_service
            .create(&crate::types::CreateTaskInput {
                description: "Task 1".to_string(),
                context: None,
                parent_id: None,
                priority: None,
                blocked_by: vec![],
            })
            .unwrap();

        let task2 = task_service
            .create(&crate::types::CreateTaskInput {
                description: "Task 2".to_string(),
                context: None,
                parent_id: None,
                priority: None,
                blocked_by: vec![task1.id.clone()],
            })
            .unwrap();

        // Export
        let export_path = tmp_dir.path().join("export.json");
        export_data(&conn, Some(export_path.clone())).unwrap();

        // Verify blockers in export
        let content = fs::read_to_string(&export_path).unwrap();
        let export: ExportData = serde_json::from_str(&content).unwrap();
        assert_eq!(export.blockers.len(), 1);
        assert_eq!(export.blockers[0].task_id, task2.id);
        assert_eq!(export.blockers[0].blocker_id, task1.id);

        // Import to new database
        let (conn2, _tmp_dir2) = setup_test_db();
        let task_service2 = TaskService::new(&conn2);
        import_data(&conn2, &export_path, false).unwrap();

        // Verify blockers imported
        let imported_task2 = task_service2.get(&task2.id).unwrap();
        assert_eq!(imported_task2.blocked_by.len(), 1);
        assert_eq!(imported_task2.blocked_by[0], task1.id);
    }
}
